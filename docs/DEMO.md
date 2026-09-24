# Demo walkthrough (about three minutes)

Everything below runs offline on the committed dataset. No API key, no account.

## 1. Start the web app in demo mode

```bash
cd web
npm ci
DEMO_MODE=true npm run dev
```

Open http://localhost:3000. In demo mode the middleware signs you in as "Demo user" on the first
request, so there is no login screen. (Without `DEMO_MODE`, `/sign-in` asks for the credentials
configured through `APP_USERS` or `SHARED_USER` / `SHARED_PASSWORD`; see `web/.env.example`.)

## 2. The market view (public corpus)

- **Overview** (`/overview`): approved terms, total debt settled, mean discount, median number of
  instalments, share of taxpayers under judicial recovery. Filter by region, year, sector, debt
  band, term kind and recovery status; every chart recomputes.
- **Discounts** (`/discounts`): distribution of the discounts the PGFN actually granted, by region,
  by debt band and by component (fine, interest, charges).
- **Guarantees & recovery** (`/guarantees`): guarantee types required, share of terms in judicial
  recovery per region, most recurrent special clauses.
- **Terms** (`/terms`): the explorer. Every row links to the original PDF on gov.br, so any figure
  can be audited at the source.

## 3. The simulator (one client's case)

Go to `/app/simulator`.

1. Leave the defaults (Individual Settlement, company in general, CAPAG D) and type amounts in the
   "Non-social-security debts" row, for example principal `10.000.000,00`, fine `2.000.000,00`,
   interest `6.000.000,00`, charges `1.000.000,00` (Brazilian number format, as printed in the
   documents). Optionally add a social-security row.
2. Watch the modality alert: BRL 19 million is inside the TI range. Switch the modality to TIS and
   the alert turns into an error (above the TIS ceiling). Tick "judicial recovery": the CAPAG
   field is disabled, the discount is unlocked regardless of CAPAG and the term changes.
3. Click **Generate dashboard**. The hero shows the economic benefit (surcharges removed), the
   discount percentage and the amount payable, checked against the legal cap of the size class.
4. Move the sliders (down payment, instalments). The phase table and the monthly flow update. Push
   the discount above the cap and the alert turns red.
5. Read **Comparables from the PGFN corpus**: the real terms closest to this case (same debt band
   and recovery status when there are enough of them), the median discount the PGFN accepted, and
   an *adherence* index that says how much the simulated scenario resembles already-accepted
   conditions. It is not a probability of success: the PGFN publishes only the agreements it
   signed.
6. Click **Export for the client (HTML)**. A self-contained HTML file downloads, with the charts
   serialised as SVG, the legal bases and the comparables, ready to send.

### Importing documents

The dropzone accepts the PGFN Regularize report (PDF or the `.csv.xls` spreadsheet) and the
e-CAC statements (fiscal proceeding debt, DCTFWeb, PGDAS-D, fiscal status report). Files are
parsed inside the browser with pdf.js; nothing is uploaded. Debts repeated across documents are
counted once; suspended items are listed but excluded; the fiscal status report is cross-checked
against the attached statements and the missing pieces are named.

The repository ships no sample client documents (they would contain real taxpayer data). The
parsers are exercised by the synthetic cases in `web/tests/ecac.test.mts` and
`web/tests/regularize.test.mts`.

## 4. The review queue

`/app/review` lists the extractions that need a human look: discounts above the legal cap first
(impossible values), then key fields with low model confidence. The "validation sample" tab draws
60 terms deterministically (same sample on every machine) for the accuracy certification described
in `docs/DATA.md`.

## 5. The pipeline, without an API key

```bash
cd pipeline
uv sync
uv run pgfn-crawl --inventory                 # lists the five regional pages (network)
uv run pgfn-extract --simulated --limit 3     # writes clearly flagged placeholder extractions
uv run pgfn-build                             # rebuilds web/public/data/terms.json
uv run pytest -q
```

Delete the simulated extraction files afterwards (they are named after the term id and carry
`"simulated": true`) or the dashboard shows the demo-data banner.

With `ANTHROPIC_API_KEY` set, `pgfn-extract --limit 5` runs the real extraction synchronously and
`pgfn-extract-batch --upload / --submit / --status / --collect` runs the whole backlog through the
Files API and Message Batches.
