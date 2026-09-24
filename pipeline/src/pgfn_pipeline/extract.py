"""Structured extraction of settlement terms with Claude: one call, forced tool, literal excerpts.

    pgfn-extract --simulated          # no key: deterministic demo data, clearly flagged
    pgfn-extract --limit 5            # synchronous extraction (pilot)
    pgfn-extract                      # everything pending, synchronously

Requires ANTHROPIC_API_KEY unless --simulated. For the whole corpus use `pgfn-extract-batch`
(Message Batches, half the price).
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import hashlib
import json
import os
import sys

from pydantic import ValidationError

from . import registry as reg
from .config import (
    EXTRACTION_MODEL,
    EXTRACTIONS,
    MAX_TOKENS_EXTRACTION,
    PDFS,
    REGIONS_IN_SCOPE,
    ensure_dirs,
)
from .schema import NOT_IDENTIFIED, SettlementTerm

# Windows consoles default to cp1252 and choke on titles with combining marks; force UTF-8.
for _stream in (sys.stdout, sys.stderr):
    with contextlib.suppress(AttributeError, ValueError):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# One call with the document attached and the tool forced. Requiring a LITERAL quotation for
# every number (source_excerpts) anchors the model: nothing that is not in the document can be
# cited. The "document_unreadable" marker keeps image-only pages from becoming invented data.
# No cache_control on the document: each PDF is sent once, and caching made the ingestion of
# scanned PDFs unstable in the pilot. The published dataset was extracted with the Portuguese
# version of this prompt; the wording below is its translation.
EXTRACTION_PROMPT = f"""You are a senior tax analyst. The attached document is an Individual Tax Settlement Term \
(Termo de Transação Individual) approved by Brazil's PGFN. It is a public document written in \
Portuguese; sensitive data may be redacted at the source. Read the WHOLE document, including \
pages that are scanned images, and fill in the `record_term` tool.

Absolute rules:
- Extract ONLY what is in the document. Absent, redacted or unreadable field: use null (numbers) \
or "{NOT_IDENTIFIED}" (text). NEVER deduce, estimate or invent.
- For consolidated_amount, total_discount_pct and installments, fill `source_excerpts` with the \
LITERAL quotation from the document that supports each number. If there is no literal quotation \
for one of these fields, that field itself must be null.
- Percentages on the 0-100 scale. Amounts in BRL as plain numbers (no symbol, no thousands separator).
- `confidence`: 0-1 per field, reflecting how explicit the datum is in the document.
- `review_fields`: list the fields with confidence below 0.7.
- If you CANNOT read the pages (the document is an image and the text could not be recognised), \
return every field as null / "{NOT_IDENTIFIED}" and add the marker "document_unreadable" to \
`review_fields`. When in doubt, prefer null over a guess."""

TOOL = {
    "name": "record_term",
    "description": "Records the structured fields of the settlement term.",
    "input_schema": SettlementTerm.model_json_schema(),
}


def make_client():
    import anthropic

    return anthropic.Anthropic()


def term_id(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:12]


def extract_one(client, pdf_bytes: bytes) -> tuple[SettlementTerm, dict]:
    """One call: PDF plus forced tool. Returns (term, token usage)."""
    document = {
        "type": "document",
        "source": {
            "type": "base64",
            "media_type": "application/pdf",
            "data": base64.standard_b64encode(pdf_bytes).decode(),
        },
    }
    response = client.messages.create(
        model=EXTRACTION_MODEL,
        max_tokens=MAX_TOKENS_EXTRACTION,
        tools=[TOOL],
        tool_choice={"type": "tool", "name": "record_term"},
        messages=[
            {"role": "user", "content": [document, {"type": "text", "text": EXTRACTION_PROMPT}]}
        ],
    )
    block = next(b for b in response.content if b.type == "tool_use")
    usage = {"input": response.usage.input_tokens, "output": response.usage.output_tokens}
    return SettlementTerm.model_validate(block.input), usage


def simulate(url: str, meta: dict) -> SettlementTerm:
    """Deterministic demo data (hash of the URL), clearly flagged.

    Only for developing the interface before a key exists; the front end shows a banner
    whenever any term has simulated=true.
    """
    h = int(hashlib.sha256(url.encode()).hexdigest(), 16)
    amount = 5_000_000 + (h % 495) * 1_000_000  # BRL 5M to 500M
    discount = 20 + (h >> 8) % 46  # 20 % to 65 %
    installments = [24, 36, 48, 60, 72, 84, 96, 120, 145][(h >> 16) % 9]
    recovery = ((h >> 24) % 10) < 3
    sectors = [
        "Agribusiness",
        "Manufacturing",
        "Retail",
        "Services",
        "Education",
        "Healthcare",
        "Construction",
        "Transport",
        "Entertainment",
    ]
    guarantee_options = [
        ["Real estate"],
        ["Bond insurance"],
        ["Bank guarantee"],
        ["Real estate", "Bank guarantee"],
        [],
    ]
    year = 2022 + (h >> 32) % 5
    month = 1 + (h >> 40) % 12
    taxpayer = meta["title"]
    for prefix in ("Termo de Transação Individual - ", "TERMO DE TRANSAÇÃO INDIVIDUAL - "):
        taxpayer = taxpayer.replace(prefix, "")
    return SettlementTerm(
        taxpayer=taxpayer,
        approval_date=f"{year}-{month:02d}-15",
        consolidated_amount=float(amount),
        modality="Individual settlement" + (" (judicial recovery)" if recovery else ""),
        total_discount_pct=float(discount),
        discounts={
            "fine_pct": min(100.0, discount + 20.0),
            "interest_pct": float(discount),
            "charges_pct": max(0.0, discount - 10.0),
        },
        installments=installments,
        down_payment_pct=float(1 + (h >> 48) % 10),
        guarantees=guarantee_options[(h >> 52) % 5],
        judicial_recovery=recovery,
        sector=sectors[(h >> 56) % 9],
        confidence={"consolidated_amount": 0.5, "total_discount_pct": 0.5},
        review_fields=["all: simulated data"],
    )


def write_extraction(term: SettlementTerm, tid: str, url: str, meta: dict, simulated: bool) -> dict:
    out = term.model_dump()
    out.update(
        id=tid,
        title=meta["title"],
        region=meta["region"],
        source_url=url,
        pdf_url=meta["pdf_url"],
        sha256=meta["sha256"],
        extracted_at=reg.now(),
        simulated=simulated,
    )
    (EXTRACTIONS / f"{tid}.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    return out


def run(simulated: bool, limit: int | None, region: str | None) -> int:
    ensure_dirs()
    registry = reg.load()
    scope = {region} if region else REGIONS_IN_SCOPE
    pending = [
        (u, m)
        for u, m in registry.items()
        if m["extracted_at"] is None
        and m["region"] in scope
        and (simulated or m["downloaded_at"] is not None)
    ]
    if limit:
        pending = pending[:limit]
    client = None if simulated else make_client()
    print(f"{len(pending)} terms to extract ({'SIMULATED' if simulated else EXTRACTION_MODEL})...")
    ok = errors = 0
    for url, meta in pending:
        tid = term_id(url)
        try:
            term = (
                simulate(url, meta)
                if simulated
                else extract_one(client, (PDFS / meta["file"]).read_bytes())[0]
            )
            out = write_extraction(term, tid, url, meta, simulated)
            # Only a REAL extraction stamps the registry: simulated terms stay "pending" so the
            # real run processes them once a key exists.
            if not simulated:
                meta["extracted_at"] = out["extracted_at"]
                meta["error"] = None
            ok += 1
        except (ValidationError, Exception) as exc:  # noqa: BLE001
            meta["error"] = f"extraction: {exc}"
            errors += 1
            print(f"  ERROR {meta['title']}: {exc}", file=sys.stderr)
        reg.save(registry)
    print(f"extraction done: {ok} ok, {errors} errors")
    return 1 if errors and not simulated else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--simulated", action="store_true", help="generate demo data (no API)")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--region")
    args = parser.parse_args(argv)
    if not args.simulated and not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY missing. Use --simulated for demo data.", file=sys.stderr)
        return 2
    return run(args.simulated, args.limit, args.region)


if __name__ == "__main__":
    sys.exit(main())
