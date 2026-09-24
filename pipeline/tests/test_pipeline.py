import json
from pathlib import Path

from pgfn_pipeline import registry
from pgfn_pipeline.build_dataset import build, deduplicate
from pgfn_pipeline.crawler import list_region, needs_download, slugify
from pgfn_pipeline.extract import simulate, term_id
from pgfn_pipeline.schema import NOT_IDENTIFIED, FullTerm, SettlementTerm

# ------------------------------------------------------------------ schema


def test_schema_defaults_never_invent():
    term = SettlementTerm()
    assert term.taxpayer == NOT_IDENTIFIED and term.consolidated_amount is None
    assert term.discounts.fine_pct is None and term.guarantees == []


def test_schema_accepts_a_real_shaped_record():
    term = SettlementTerm.model_validate(
        {
            "taxpayer": "ALFA LTDA.",
            "approval_date": "2024-05-10",
            "consolidated_amount": 12_000_000.5,
            "modality": "Individual settlement",
            "total_discount_pct": 60,
            "discounts": {"fine_pct": 100, "interest_pct": 60, "charges_pct": None},
            "installments": 120,
            "guarantees": ["Real estate"],
            "judicial_recovery": True,
            "sector": "Agribusiness",
            "confidence": {"consolidated_amount": 0.9},
            "source_excerpts": {"consolidated_amount": "R$ 12.000.000,50"},
            "review_fields": ["sector"],
        }
    )
    assert term.installments == 120 and term.discounts.interest_pct == 60


def test_tool_schema_has_no_required_fields():
    """Every field has a default, so a partially readable PDF still validates."""
    schema = SettlementTerm.model_json_schema()
    assert "required" not in schema or schema["required"] == []


def test_full_term_carries_metadata():
    term = FullTerm(id="abc", title="T", region="Region 1", source_url="https://example.org/t")
    assert term.simulated is False and term.mirror_urls == []


# ------------------------------------------------------------------ registry


def test_registry_roundtrip_and_new_entry(tmp_path):
    path = tmp_path / "registry.json"
    assert registry.load(path) == {}
    entry = registry.new_entry("Alfa term", "Region 2")
    registry.save({"https://example.org/a": entry}, path)
    loaded = registry.load(path)
    assert loaded["https://example.org/a"]["region"] == "Region 2"
    assert loaded["https://example.org/a"]["downloaded_at"] is None


# ------------------------------------------------------------------ crawler


PAGE_1 = """
<div id="content">
  <a href="https://example.org/terms/region-1/alfa/view">Alfa Ltda. settlement</a>
  <a href="https://example.org/terms/region-1/beta?x=1">Beta S.A. settlement</a>
  <a href="https://example.org/terms/region-1/alfa">Alfa Ltda. settlement</a>
  <a href="https://example.org/elsewhere/gamma">Not a term</a>
  <a href="https://example.org/terms/region-1/empty"></a>
</div>
"""


def test_list_region_walks_pagination_and_dedupes():
    pages = {
        "https://example.org/terms/region-1": PAGE_1,
        "https://example.org/terms/region-1?b_start:int=20": "<div id='content'></div>",
    }
    items = list_region(
        "Region 1", "https://example.org/terms/region-1", fetch=lambda url: pages[url], pause=0
    )
    assert [i["url"] for i in items] == [
        "https://example.org/terms/region-1/alfa",
        "https://example.org/terms/region-1/beta",
    ]
    assert items[0]["title"] == "Alfa Ltda. settlement" and items[0]["region"] == "Region 1"


def test_slugify_and_needs_download(tmp_path):
    assert (
        slugify("Termo de Transação Individual - Alfa Ltda.")
        == "termo-de-transacao-individual-alfa-ltda"
    )
    assert needs_download({"downloaded_at": None, "extracted_at": None, "file": None})
    assert not needs_download({"downloaded_at": "x", "extracted_at": "y", "file": "gone.pdf"})
    assert needs_download(
        {"downloaded_at": "x", "extracted_at": None, "file": "gone.pdf"}
    )  # ephemeral runner lost the PDF


# ------------------------------------------------------------------ extraction helpers


def test_simulated_terms_are_deterministic_and_flagged():
    meta = {"title": "Termo de Transação Individual - Alfa Ltda."}
    a, b = simulate("https://example.org/a", meta), simulate("https://example.org/a", meta)
    assert a == b and a.taxpayer == "Alfa Ltda." and a.review_fields == ["all: simulated data"]
    assert (
        term_id("https://example.org/a") == term_id("https://example.org/a")
        and len(term_id("x")) == 12
    )


# ------------------------------------------------------------------ dataset build


def _term(tid: str, sha: str | None, url: str) -> dict:
    return {
        **SettlementTerm(taxpayer=f"Taxpayer {tid}").model_dump(),
        "id": tid,
        "title": tid,
        "region": "Region 1",
        "source_url": url,
        "pdf_url": url,
        "sha256": sha,
        "extracted_at": "2026-01-01T00:00:00+00:00",
        "simulated": False,
    }


def test_deduplicate_by_pdf_hash_keeps_mirror_urls():
    terms = [
        _term("a", "s1", "u1"),
        _term("b", "s1", "u2"),
        _term("c", "s2", "u3"),
        _term("d", None, "u4"),
    ]
    unique = deduplicate(terms)
    assert [t["id"] for t in unique] == ["a", "c", "d"]
    assert unique[0]["mirror_urls"] == ["u2"]


def test_build_writes_package_and_csv(tmp_path):
    extractions = tmp_path / "extractions"
    extractions.mkdir()
    for t in (_term("a", "s1", "u1"), _term("b", "s1", "u2"), _term("c", "s2", "u3")):
        (extractions / f"{t['id']}.json").write_text(json.dumps(t), encoding="utf-8")
    package = build(extractions_dir=extractions, web_data=tmp_path / "web", data=tmp_path / "data")
    assert package["total"] == 2 and package["contains_simulated"] is False
    written = json.loads((tmp_path / "web" / "terms.json").read_text(encoding="utf-8"))
    assert [t["id"] for t in written["terms"]] == ["a", "c"]
    csv_text = (tmp_path / "data" / "terms.csv").read_text(encoding="utf-8-sig")
    assert csv_text.splitlines()[0].startswith("id;taxpayer;region")
    assert Path(tmp_path / "data" / "terms.csv").exists()
