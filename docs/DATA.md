# The dataset

`web/public/data/terms.json` is the analytical dataset the dashboard reads. It is rebuilt by
`pgfn-build` from one JSON file per extracted document in `pipeline/data/extractions/`, and it is
committed on purpose: the repository is the database (the "git scraping" pattern), every rebuild
is a diff, and the dashboard needs no backend.

## Source

The PGFN publishes every individual settlement term it signs, as a PDF, on five regional pages of
gov.br (transparency portal, "Termos de transação individual"). The crawler lists the five pages,
downloads new PDFs idempotently and keeps an inventory in `pipeline/data/registry.json` (title,
region, URL, SHA-256 of the file, timestamps). The data is public information published by the
Brazilian federal government about agreements with legal entities.

| Figure | Value |
|---|---|
| Listings found on the five regional pages | 1,210 |
| Documents extracted | 1,202 (8 could not be downloaded or parsed) |
| Documents kept | 1,198 |
| Unique terms after de-duplication | 1,134 (the same PDF is often listed twice on gov.br; duplicates are collapsed by SHA-256 and the extra URLs kept as `mirror_urls`) |
| Approval years | 2020 to 2025 (111 terms without a parseable date) |
| Regions | Region 3: 440 · Region 5: 253 · Region 4: 211 · Region 2: 130 · Region 1: 100 |

## What was removed before publication

Four records whose taxpayer is a natural person identified by a CPF (individual taxpayer id) were
excluded. The remaining records concern companies identified by CNPJ, published as such by the
government. Nothing else was altered in the extracted values; field names, region labels and the
"Not identified" sentinel were translated during the migration to this repository.

## Schema (one record per term)

| Field | Type | Notes |
|---|---|---|
| `id` | string | 12 hex chars, derived from the source URL |
| `title`, `region`, `source_url`, `pdf_url`, `sha256`, `extracted_at` | | inventory data from the crawler |
| `taxpayer` | string | as printed in the term |
| `approval_date` | ISO date or "Not identified" | |
| `consolidated_amount` | number or null | BRL |
| `modality` | string | free text; `termKindOf()` reduces it to original vs amendment |
| `total_discount_pct` | number or null | over the consolidated amount |
| `discounts.{fine,interest,charges}_pct` | number or null | per component |
| `installments`, `down_payment_pct` | number or null | |
| `guarantees`, `obligations`, `special_clauses` | string[] | free text, categorised by keyword in the UI |
| `judicial_recovery` | boolean or null | |
| `sector` | string | free text (699 distinct values), categorised in the UI |
| `confidence` | object | 0 to 1 per field, self-reported by the model |
| `source_excerpts` | object | a literal quotation from the document for every number |
| `review_fields` | string[] | fields the model flagged as uncertain, plus document-level flags (`document_unreadable`, `document_truncated`, ...) |
| `simulated` | boolean | true only for placeholder records produced by `pgfn-extract --simulated` |

## Coverage and quality

| Field | Filled |
|---|---|
| `installments` | 86 % |
| `total_discount_pct` | 66 % |
| `consolidated_amount` | 57 % |
| `judicial_recovery` (explicitly stated) | 40 % |
| `down_payment_pct` | 13 % |

Empty fields are mostly genuine: many terms state instalments and guarantees but no percentage, or
state discounts per annex without a consolidated figure. The extraction prompt forbids inventing a
number that cannot be quoted, and the excerpt requirement is what makes the gaps auditable.

Document-level flags in the corpus: 4 image-only PDFs (`document_unreadable`), 4 incomplete
documents, 1 truncated (a 658-page PDF, first 100 pages read), 1 partly unreadable, 1 whose content
does not match its listing.

**Human validation plan.** The pilot showed the discount to be the least reliable field (about 89 %
correct on the pilot sample). The review queue in the app orders the work: the 12 terms with a
discount above the 70 % legal cap (impossible values) come first, then the 432 terms whose discount
confidence is below 0.7. The certification sample is 60 terms drawn deterministically (hash of the
id) times 3 key fields = 180 checks; with at most 4 errors, the lower bound of the exact binomial
95 % interval stays above 95 %. Terms beyond that threshold mean a systematic problem, fixed by
changing the prompt and re-extracting rather than by more manual review.

## Rebuilding

```bash
cd pipeline
uv sync
uv run pgfn-build          # extractions -> web/public/data/terms.json (+ terms.csv)
```

Extending the corpus needs an Anthropic API key: `pgfn-crawl --download` fetches new PDFs,
`pgfn-extract-batch --upload / --submit / --status / --collect` extracts them through the Files
API and Message Batches, and `pgfn-build` rebuilds the dataset. Downloaded PDFs and the batch state
files are git-ignored.
