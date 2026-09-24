"""Collect the individual settlement terms published by the PGFN (five regional listings).

pgfn-crawl --inventory              # list only, download nothing
pgfn-crawl --download               # download new PDFs (idempotent)
pgfn-crawl --download --region "Region 1" --limit 5
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
import time
import unicodedata
from collections.abc import Callable

import requests
from bs4 import BeautifulSoup

from . import registry as reg
from .config import (
    MAX_RETRIES,
    PDFS,
    REGIONS,
    REGIONS_IN_SCOPE,
    REQUEST_INTERVAL_S,
    TIMEOUT_S,
    USER_AGENT,
    ensure_dirs,
)

SESSION = requests.Session()
SESSION.headers["User-Agent"] = USER_AGENT

Fetcher = Callable[[str], str]


def get(url: str) -> requests.Response:
    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = SESSION.get(url, timeout=TIMEOUT_S)
            response.raise_for_status()
            return response
        except Exception as exc:  # noqa: BLE001 - broad retry with backoff on purpose
            last_error = exc
            time.sleep(REQUEST_INTERVAL_S * (2**attempt))
    raise RuntimeError(f"failed after {MAX_RETRIES} attempts at {url}: {last_error}")


def fetch_text(url: str) -> str:
    return get(url).text


def slugify(text: str) -> str:
    s = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:90] or "term"


def list_region(
    name: str, base_url: str, fetch: Fetcher = fetch_text, pause: float = REQUEST_INTERVAL_S
) -> list[dict]:
    """Walk the Plone pagination (?b_start:int=N) and return the region's items."""
    items: list[dict] = []
    seen: set[str] = set()
    start = 0
    while True:
        url = base_url if start == 0 else f"{base_url}?b_start:int={start}"
        soup = BeautifulSoup(fetch(url), "html.parser")
        new = 0
        for anchor in soup.select("#content a[href]"):
            href = (anchor.get("href") or "").split("?")[0].removesuffix("/view")
            title = anchor.get_text(strip=True)
            if base_url + "/" not in href or href in seen or not title:
                continue
            seen.add(href)
            items.append({"title": title, "url": href, "region": name})
            new += 1
        if new == 0:
            break
        start += 20
        if pause:
            time.sleep(pause)
    return items


def download_pdf(item_url: str) -> tuple[bytes, str]:
    """Download a Plone item's PDF, trying the direct URL and the @@download variant."""
    for candidate in (item_url, f"{item_url}/@@download/file"):
        response = get(candidate)
        content_type = response.headers.get("Content-Type", "")
        if "pdf" in content_type or response.content[:5] == b"%PDF-":
            return response.content, candidate
        time.sleep(REQUEST_INTERVAL_S)
    raise RuntimeError(f"no variant returned a PDF for {item_url}")


def inventory() -> dict:
    ensure_dirs()
    registry = reg.load()
    total_new = 0
    for name, base_url in REGIONS.items():
        try:
            items = list_region(name, base_url)
        except Exception as exc:  # noqa: BLE001 - one region must not stop the others
            print(f"[ERROR] {name}: {exc}", file=sys.stderr)
            continue
        new_items = [i for i in items if i["url"] not in registry]
        for item in new_items:
            registry[item["url"]] = reg.new_entry(item["title"], name)
        total_new += len(new_items)
        print(f"{name}: {len(items)} terms listed, {len(new_items)} new")
    reg.save(registry)
    print(f"inventory done: {len(registry)} terms in the registry ({total_new} new)")
    return registry


def needs_download(meta: dict) -> bool:
    if meta["downloaded_at"] is None:
        return True
    # The PDF is gone (ephemeral CI runner) and the extraction has not happened yet: fetch again.
    return meta["extracted_at"] is None and (not meta["file"] or not (PDFS / meta["file"]).exists())


def download(region: str | None, limit: int | None) -> None:
    ensure_dirs()
    registry = reg.load()
    scope = {region} if region else REGIONS_IN_SCOPE
    pending = [(u, m) for u, m in registry.items() if needs_download(m) and m["region"] in scope]
    if limit:
        pending = pending[:limit]
    print(f"{len(pending)} PDFs to download...")
    for url, meta in pending:
        try:
            content, pdf_url = download_pdf(url)
            sha = hashlib.sha256(content).hexdigest()
            file_name = f"{slugify(meta['title'])}-{sha[:8]}.pdf"
            (PDFS / file_name).write_bytes(content)
            meta.update(
                pdf_url=pdf_url, sha256=sha, file=file_name, downloaded_at=reg.now(), error=None
            )
            print(f"  ok  {file_name} ({len(content) // 1024} KB)")
        except Exception as exc:  # noqa: BLE001
            meta["error"] = str(exc)
            print(f"  ERROR {meta['title']}: {exc}", file=sys.stderr)
        reg.save(registry)
        time.sleep(REQUEST_INTERVAL_S)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--inventory", action="store_true")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--region")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args(argv)
    if args.inventory:
        inventory()
    if args.download:
        download(args.region, args.limit)
    if not (args.inventory or args.download):
        parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
