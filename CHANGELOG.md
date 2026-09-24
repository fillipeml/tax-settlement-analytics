# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-24

### Added

- Pipeline: crawler for the five PGFN regional listings with an idempotent JSON registry;
  structured extraction with a forced tool and a literal quotation per number; Files API plus
  Message Batches runner for the backlog; dataset build with SHA-256 de-duplication.
- Dataset: 1,134 unique individual settlement terms (2020 to 2025), English field names, records
  identifying natural persons removed.
- Web: market dashboards (overview, discounts, guarantees and judicial recovery, term explorer);
  TI/TIS simulator with a deterministic rules engine; multi-document importer for Regularize and
  e-CAC statements parsed in the browser; comparables from the corpus with an adherence index;
  self-contained HTML export; extraction review queue with a deterministic validation sample;
  signed-cookie sessions with a demo mode.
- Tests: 179 web checks on Node's native type stripping and 10 pipeline tests; CI with typecheck,
  tests, production build, lint, dataset rebuild and secret scanning.
