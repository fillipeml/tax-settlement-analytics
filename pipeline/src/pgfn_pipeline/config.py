"""Pipeline settings. Paths are relative to the `pipeline/` folder, whatever the working directory."""

from __future__ import annotations

import os
from pathlib import Path

BASE_URL = (
    "https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/"
    "painel-dos-parcelamentos/termos-de-transacao"
)

# The PGFN publishes one listing per regional office. Labels are the dataset's region values.
REGIONS: dict[str, str] = {
    "Region 1": f"{BASE_URL}/1a-regiao",
    "Region 2": f"{BASE_URL}/2a-regiao",
    "Region 3": f"{BASE_URL}/3a-regiao",
    "Region 4": f"{BASE_URL}/4a-regiao",
    "Region 5": f"{BASE_URL}/5a-regiao",
}
# Remove a region here to restrict the extraction scope (the inventory still lists all five).
REGIONS_IN_SCOPE: set[str] = set(REGIONS)

# gov.br answers 403 to non-browser agents and appreciates a pause between requests.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
REQUEST_INTERVAL_S = 1.5
TIMEOUT_S = 45
MAX_RETRIES = 3

ROOT = Path(__file__).resolve().parents[2]  # .../pipeline
DATA = ROOT / "data"
PDFS = DATA / "pdfs"  # git-ignored; PDFs are re-downloaded when missing
EXTRACTIONS = DATA / "extractions"  # one JSON per term, versioned
REGISTRY = DATA / "registry.json"  # crawler state, versioned
WEB_DATA = ROOT.parent / "web" / "public" / "data"

# The published dataset was extracted with this model; override with ANTHROPIC_MODEL.
EXTRACTION_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
MAX_TOKENS_EXTRACTION = 2500


def ensure_dirs() -> None:
    for d in (DATA, PDFS, EXTRACTIONS, WEB_DATA):
        d.mkdir(parents=True, exist_ok=True)
