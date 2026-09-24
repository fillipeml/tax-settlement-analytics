# CLAUDE.md

Working rules for AI-assisted changes in this repository. They mirror the README; the README wins on conflict.

## Non-negotiable rules

1. **Legal rules are deterministic.** Everything in `web/lib/rules.ts` (discount caps, terms, thresholds, signature alerts, tax-loss offset) is plain code with a hand-computed test for each scenario in `web/tests/rules.test.mts`. No legal rule goes through a language model. A change to a rule needs the article reference in the code comment and a test.
2. **Client data stays in the browser.** The simulator's importer (`web/lib/importer.ts`, `ecac.ts`, `regularize.ts`) parses PDFs and spreadsheets client-side. Do not add a server route that receives client documents.
3. **The corpus is public data, but no natural persons.** Records whose taxpayer is an individual identified by a CPF were removed before publication and must stay out. The dataset is rebuilt only from `pipeline/data/extractions/` through `pgfn-build`.
4. **Extraction cites the document.** The extraction tool schema requires a literal quotation for every number (`source_excerpts`). Keep that requirement; it is what makes the corpus auditable.

## Conventions

- Web: Next.js 15, React 19, TypeScript strict, Tailwind v4, no test framework (Node's native type stripping runs `web/tests/*.test.mts` through `tests/run.mjs`). Pipeline: Python 3.12, `uv`, `ruff`, `pytest`.
- Portuguese stays only where it is data or matches a document: taxpayer names, document labels matched by regex, sector keywords. Everything else, including identifiers and UI text, is English. Terms kept in Portuguese are explained in `docs/GLOSSARY.md`.
- Demo mode (`DEMO_MODE=true`) is read only in `web/lib/session.ts` and `web/middleware.ts`.
- Test inputs are synthetic. Identifiers in tests use placeholder check digits that fail validation.
- Never commit `.env`, downloaded PDFs (`pipeline/data/pdfs/`) or the Files API / batch id state files.
- Commits: English, Conventional Commits, one logical change each, no AI attribution trailers.
