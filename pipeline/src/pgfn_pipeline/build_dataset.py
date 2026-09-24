"""Consolidate the extractions into web/public/data/terms.json (plus an internal CSV).

The JSON file is the dashboard's only "database": the site is static and committing this
file triggers the redeploy. This is the git-scraping pattern.
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from .config import DATA, EXTRACTIONS, WEB_DATA, ensure_dirs

CSV_FIELDS = [
    "id",
    "taxpayer",
    "region",
    "approval_date",
    "consolidated_amount",
    "modality",
    "total_discount_pct",
    "installments",
    "down_payment_pct",
    "judicial_recovery",
    "sector",
    "guarantees",
    "source_url",
    "simulated",
]


def deduplicate(terms: list[dict]) -> list[dict]:
    """gov.br lists the SAME PDF under several URLs (measured 2026-08-06: 55 repeated files,
    64 surplus entries, one company five times). Because a term's id derives from the URL,
    every listing became a term, inflating counts and the review queue. Terms are consolidated
    by the PDF's sha256: the first occurrence (stable order by id) is the reference and the
    other URLs go to `mirror_urls`, so auditability is preserved. Terms without a sha256
    (old simulated ones) pass through untouched."""
    by_sha: dict[str, dict] = {}
    unique: list[dict] = []
    for term in terms:
        sha = term.get("sha256")
        if not sha:
            unique.append(term)
            continue
        if sha in by_sha:
            by_sha[sha].setdefault("mirror_urls", []).append(term.get("source_url"))
        else:
            by_sha[sha] = term
            unique.append(term)
    return unique


def build(
    extractions_dir: Path = EXTRACTIONS, web_data: Path = WEB_DATA, data: Path = DATA
) -> dict:
    raw = [
        json.loads(f.read_text(encoding="utf-8")) for f in sorted(extractions_dir.glob("*.json"))
    ]
    terms = deduplicate(raw)
    if len(terms) != len(raw):
        repeated = len(raw) - len(terms)
        print(
            f"dedupe: {len(raw)} extractions -> {len(terms)} unique terms "
            f"({repeated} repeated gov.br listings)"
        )
    package = {
        "updated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "total": len(terms),
        "contains_simulated": any(t.get("simulated") for t in terms),
        "terms": terms,
    }
    web_data.mkdir(parents=True, exist_ok=True)
    target = web_data / "terms.json"
    target.write_text(json.dumps(package, ensure_ascii=False), encoding="utf-8")

    data.mkdir(parents=True, exist_ok=True)
    with (data / "terms.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS, delimiter=";")
        writer.writeheader()
        for t in terms:
            writer.writerow(
                {c: (", ".join(t[c]) if c == "guarantees" else t.get(c)) for c in CSV_FIELDS}
            )

    print(f"{len(terms)} terms -> {target} ({target.stat().st_size // 1024} KB)")
    return package


def main(argv: list[str] | None = None) -> int:
    ensure_dirs()
    build()
    return 0


if __name__ == "__main__":
    sys.exit(main())
