# pgfn-settlement-pipeline

Python side of [tax-settlement-analytics](../README.md): crawls the PGFN listings, extracts each settlement term with Claude into a typed schema, and consolidates the corpus into the JSON the dashboard serves. See the root README for the full picture and `uv run pgfn-crawl --help`, `pgfn-extract --help`, `pgfn-extract-batch --help`, `pgfn-build --help` for the commands.
