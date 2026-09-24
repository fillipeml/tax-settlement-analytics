"""Pydantic schema of a settlement term: the data dictionary of the whole project.

Rule: a field absent from the document is "Not identified" (text) or null (number).
Nothing is ever inferred. Every relevant number carries a 0-1 confidence and the literal
excerpt of the PDF that supports it, so a reviewer can audit the extraction.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

NOT_IDENTIFIED = "Not identified"


class DiscountBreakdown(BaseModel):
    fine_pct: float | None = Field(None, description="Discount on fines, in % (0-100)")
    interest_pct: float | None = Field(None, description="Discount on interest, in % (0-100)")
    charges_pct: float | None = Field(None, description="Discount on legal charges, in % (0-100)")


class SettlementTerm(BaseModel):
    taxpayer: str = Field(
        NOT_IDENTIFIED,
        description="Taxpayer or economic group as published (redacted data = 'Not identified')",
    )
    approval_date: str = Field(
        NOT_IDENTIFIED, description="Signature/approval date as YYYY-MM-DD, or 'Not identified'"
    )
    consolidated_amount: float | None = Field(
        None, description="Consolidated amount of the settled debt, in BRL"
    )
    modality: str = Field(
        NOT_IDENTIFIED,
        description="Settlement modality (e.g. individual settlement, judicial recovery, exceptional)",
    )
    total_discount_pct: float | None = Field(
        None, description="Effective total discount over the consolidated amount, in % (0-100)"
    )
    discounts: DiscountBreakdown = Field(default_factory=DiscountBreakdown)
    installments: int | None = Field(None, description="Number of instalments")
    down_payment_pct: float | None = Field(
        None, description="Required down payment, in % of the amount"
    )
    guarantees: list[str] = Field(
        default_factory=list,
        description="Guarantees required (e.g. real estate, surety, bond insurance). Empty if none identified",
    )
    judicial_recovery: bool | None = Field(
        None, description="Taxpayer under judicial recovery? null if not identifiable"
    )
    obligations: list[str] = Field(
        default_factory=list, description="Ancillary obligations assumed by the taxpayer"
    )
    special_clauses: list[str] = Field(
        default_factory=list, description="Atypical or negotiated clauses (e.g. relaxed guarantees)"
    )
    sector: str = Field(
        NOT_IDENTIFIED,
        description="Economic sector inferred from the taxpayer (e.g. agribusiness, education, sports)",
    )
    confidence: dict[str, float] = Field(
        default_factory=dict, description="0-1 confidence per extracted field"
    )
    source_excerpts: dict[str, str] = Field(
        default_factory=dict,
        description="Literal excerpt of the PDF supporting each amount, discount and term field",
    )
    review_fields: list[str] = Field(
        default_factory=list, description="Fields with confidence below 0.7, for human review"
    )


class FullTerm(SettlementTerm):
    """Extracted term plus crawler metadata: what the dashboard consumes."""

    id: str
    title: str
    region: str
    source_url: str
    pdf_url: str | None = None
    sha256: str | None = None
    extracted_at: str | None = None
    simulated: bool = False
    mirror_urls: list[str] = Field(default_factory=list)
