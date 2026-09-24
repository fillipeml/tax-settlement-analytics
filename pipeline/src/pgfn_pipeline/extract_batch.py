"""Extraction of the whole corpus through the Files API and Message Batches (half the price).

Why the Files API: inlining PDFs as base64 made every batch heavy (a 150 MB upload dropped
the connection). Here each PDF is uploaded ONCE (small, individually retryable) and the
batches reference only the file_id, so request bodies are tiny.

Resumable flow:
    pgfn-extract-batch --upload      # upload pending PDFs (data/file_ids.json)
    pgfn-extract-batch --submit      # build batches from the file ids and send them
    pgfn-extract-batch --status      # progress of the batches
    pgfn-extract-batch --collect     # store the results of finished batches

State: data/file_ids.json (term id -> file_id) and data/batches.json.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import pathlib
import sys
import time

import anthropic

from . import registry as reg
from .config import (
    DATA,
    EXTRACTION_MODEL,
    MAX_TOKENS_EXTRACTION,
    PDFS,
    REGIONS_IN_SCOPE,
    ensure_dirs,
)
from .extract import EXTRACTION_PROMPT, TOOL, term_id, write_extraction
from .schema import SettlementTerm

for _stream in (sys.stdout, sys.stderr):
    with contextlib.suppress(AttributeError, ValueError):
        _stream.reconfigure(encoding="utf-8", errors="replace")

FILE_IDS = DATA / "file_ids.json"
BATCHES = DATA / "batches.json"
MAX_REQUESTS_PER_BATCH = 100


def _read_json(path: pathlib.Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def _write_json(path: pathlib.Path, payload) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def with_retry(fn, attempts: int = 4, base: float = 3.0):
    for i in range(attempts):
        try:
            return fn()
        except (
            anthropic.APIConnectionError,
            anthropic.InternalServerError,
            anthropic.RateLimitError,
        ) as exc:
            if i == attempts - 1:
                raise
            wait = base * (2**i)
            print(f"    (retry in {wait:.0f}s: {type(exc).__name__})", flush=True)
            time.sleep(wait)


def upload() -> None:
    ensure_dirs()
    registry = reg.load()
    ids = _read_json(FILE_IDS, {})
    client = anthropic.Anthropic()
    pending = [
        (u, m)
        for u, m in registry.items()
        if m["extracted_at"] is None
        and m["downloaded_at"] is not None
        and m["region"] in REGIONS_IN_SCOPE
        and term_id(u) not in ids
        and m.get("file")
        and (PDFS / m["file"]).exists()
    ]
    print(f"{len(pending)} PDFs to upload (Files API)...", flush=True)
    ok = errors = 0
    for i, (url, meta) in enumerate(pending, 1):
        tid = term_id(url)
        try:
            data = (PDFS / meta["file"]).read_bytes()
            uploaded = with_retry(
                lambda name=meta["file"], payload=data: client.files.upload(
                    file=(name, io.BytesIO(payload), "application/pdf")
                )
            )
            ids[tid] = uploaded.id
            ok += 1
        except Exception as exc:  # noqa: BLE001
            errors += 1
            print(f"  ERROR upload {meta['title'][:40]}: {str(exc)[:100]}", flush=True)
        if i % 25 == 0 or i == len(pending):
            _write_json(FILE_IDS, ids)
            print(f"  {i}/{len(pending)} uploaded ({ok} ok, {errors} errors)", flush=True)
    _write_json(FILE_IDS, ids)
    print(f"upload done: {ok} ok, {errors} errors. file ids: {len(ids)}", flush=True)


def request_for(tid: str, file_id: str) -> dict:
    return {
        "custom_id": tid,
        "params": {
            "model": EXTRACTION_MODEL,
            "max_tokens": MAX_TOKENS_EXTRACTION,
            "tools": [TOOL],
            "tool_choice": {"type": "tool", "name": "record_term"},
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "document", "source": {"type": "file", "file_id": file_id}},
                        {"type": "text", "text": EXTRACTION_PROMPT},
                    ],
                }
            ],
        },
    }


def submit() -> None:
    registry = reg.load()
    ids = _read_json(FILE_IDS, {})
    state = _read_json(BATCHES, {"batches": []})
    # Block only what sits in an ACTIVE (uncollected) batch; errors from collected batches
    # become eligible again, and successes are excluded by the "extracted" filter below.
    in_flight = {
        tid for batch in state["batches"] if not batch["collected"] for tid in batch["custom_ids"]
    }
    extracted = {term_id(u) for u, m in registry.items() if m["extracted_at"]}
    targets = [
        (tid, fid) for tid, fid in ids.items() if tid not in in_flight and tid not in extracted
    ]
    if not targets:
        print("nothing to submit (everything is in flight or extracted)")
        return
    client = anthropic.Anthropic()
    count = 0
    for i in range(0, len(targets), MAX_REQUESTS_PER_BATCH):
        chunk = targets[i : i + MAX_REQUESTS_PER_BATCH]
        requests = [request_for(tid, fid) for tid, fid in chunk]
        batch = with_retry(lambda reqs=requests: client.messages.batches.create(requests=reqs))
        state["batches"].append(
            {
                "id": batch.id,
                "custom_ids": [t for t, _ in chunk],
                "status": batch.processing_status,
                "collected": False,
            }
        )
        _write_json(BATCHES, state)
        count += 1
        print(f"  batch {batch.id}: {len(chunk)} docs ({batch.processing_status})", flush=True)
    print(f"done: {count} batches submitted", flush=True)


def status() -> None:
    state = _read_json(BATCHES, {"batches": []})
    if not state["batches"]:
        print("no batch submitted")
        return
    client = anthropic.Anthropic()
    total = ready = 0
    for batch in state["batches"]:
        b = with_retry(lambda bid=batch["id"]: client.messages.batches.retrieve(bid))
        batch["status"] = b.processing_status
        counts = b.request_counts
        n = len(batch["custom_ids"])
        total += n
        if b.processing_status == "ended" and not batch["collected"]:
            ready += n
        mark = "collected" if batch["collected"] else b.processing_status
        print(
            f"  {batch['id']}  {n:>3}  [{mark}]  ok={counts.succeeded} err={counts.errored} proc={counts.processing}",
            flush=True,
        )
    _write_json(BATCHES, state)
    print(f"total: {total} docs | ready to collect: {ready}", flush=True)


def collect() -> None:
    registry = reg.load()
    state = _read_json(BATCHES, {"batches": []})
    client = anthropic.Anthropic()
    by_tid = {term_id(u): (u, m) for u, m in registry.items()}
    ok = errors = 0
    for batch in state["batches"]:
        if batch["collected"]:
            continue
        b = with_retry(lambda bid=batch["id"]: client.messages.batches.retrieve(bid))
        if b.processing_status != "ended":
            print(f"  {batch['id']}: {b.processing_status}, skipping", flush=True)
            continue
        print(f"  {batch['id']}: collecting...", flush=True)
        for result in client.messages.batches.results(batch["id"]):
            tid = result.custom_id
            if result.result.type != "succeeded":
                errors += 1
                if tid in by_tid:
                    by_tid[tid][1]["error"] = f"batch: {result.result.type}"
                continue
            try:
                block = next(bl for bl in result.result.message.content if bl.type == "tool_use")
                term = SettlementTerm.model_validate(block.input)
                url, meta = by_tid[tid]
                out = write_extraction(term, tid, url, meta, simulated=False)
                meta["extracted_at"] = out["extracted_at"]
                meta["error"] = None
                ok += 1
            except Exception as exc:  # noqa: BLE001
                errors += 1
                if tid in by_tid:
                    by_tid[tid][1]["error"] = f"batch-parse: {exc}"
        batch["collected"] = True
        reg.save(registry)
        _write_json(BATCHES, state)
    print(f"collect: {ok} stored, {errors} with errors", flush=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--upload", action="store_true")
    parser.add_argument("--submit", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--collect", action="store_true")
    args = parser.parse_args(argv)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY missing.", file=sys.stderr)
        return 2
    if args.upload:
        upload()
    if args.submit:
        submit()
    if args.status:
        status()
    if args.collect:
        collect()
    if not (args.upload or args.submit or args.status or args.collect):
        parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
