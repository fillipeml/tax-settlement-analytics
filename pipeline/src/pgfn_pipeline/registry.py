"""The crawler's master registry: JSON state versioned in the repository.

Each entry is keyed by the document URL on the PGFN site:

    "<url>": {
        "title": str,
        "region": str,
        "pdf_url": str | null,        # effective download URL
        "sha256": str | null,         # hash of the downloaded PDF (idempotency)
        "file": str | null,           # local PDF file name
        "discovered_at": iso8601,
        "downloaded_at": iso8601 | null,
        "extracted_at": iso8601 | null,
        "error": str | null
    }
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from .config import REGISTRY


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def new_entry(title: str, region: str) -> dict:
    return {
        "title": title,
        "region": region,
        "pdf_url": None,
        "sha256": None,
        "file": None,
        "discovered_at": now(),
        "downloaded_at": None,
        "extracted_at": None,
        "error": None,
    }


def load(path: Path = REGISTRY) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save(registry: dict, path: Path = REGISTRY) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(registry, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )
