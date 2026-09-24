# Glossary

Brazilian legal and tax terms that appear in the code, the data or the interface. Data values
(taxpayer names, guarantee descriptions, document labels) stay in Portuguese because they are
quotations from public documents; identifiers and UI text are English.

| Term | Meaning |
|---|---|
| **PGFN** (Procuradoria-Geral da Fazenda Nacional) | The National Treasury Attorney's Office: the federal body that collects registered federal debt and signs tax settlements. Organised in five regional offices ("Region 1" to "Region 5" in the dataset). |
| **RFB** (Receita Federal do Brasil) | The federal revenue service. Collects taxes before a debt is registered with the PGFN. |
| **Dívida ativa / inscrição** | Registered federal debt. A debt becomes "registered" (inscrita) when the RFB hands it to the PGFN. Only registered debts are reachable by a PGFN settlement. |
| **Transação tributária** | Tax settlement: a negotiated agreement on registered debt under Law 13,988/2020. |
| **TI** (Transação Individual) | Individual Settlement: negotiated case by case, for consolidated debts of BRL 10 million or more (art. 46, PGFN Ordinance 6,757/2022). |
| **TIS** (Transação Individual Simplificada) | Simplified Individual Settlement: electronic, for debts between BRL 1 million and BRL 10 million; no approval by higher authorities. |
| **Termo de transação** | Settlement term: the signed document. **Termo aditivo** is an amendment; **repactuação** a renegotiation. Both are excluded from the comparables because they are not a fresh discount concession. |
| **Homologação** | Approval / formalisation of the agreement. `approval_date` in the dataset. |
| **CAPAG** (Capacidade de Pagamento) | Payment-capacity rating assigned by the PGFN: A/B (sufficient), C (hard to recover), D (irrecoverable). Discounts apply to C and D. |
| **Recuperação judicial (RJ)** | Judicial recovery, the Brazilian reorganisation procedure. Debtors in recovery have their credits presumed irrecoverable and a specific settlement regime (art. 10-C, Law 10,522/2002). |
| **Principal, multa, juros de mora, encargo legal** | The components of a registered debt: principal, fine, default interest and legal charges. Discounts never touch the principal. |
| **Prejuízo fiscal / BCN** (base de cálculo negativa da CSLL) | Tax losses and the negative base of the social contribution on profit, usable to amortise up to 70 % of the balance in TI (arts. 35 to 39). `taxLossOffset` in the code. |
| **Contribuições previdenciárias** | Social security contributions: capped at 60 instalments by the Constitution (art. 195, §11). The `socialSecurity` group in the simulator. |
| **Simples Nacional** | Simplified tax regime for small businesses. Treated with the non-social-security ("general") group. |
| **FGTS** | Employees' severance fund. Its debts appear in the Regularize report and are booked as general. |
| **Regularize** | The PGFN's taxpayer portal. Exports the "Relatório Consolidado da Dívida" (consolidated debt report) as PDF or as a `.csv.xls` spreadsheet. |
| **e-CAC** | The RFB's online service centre. Source of the "Débito do Processo Fiscal", "Dívida DCTFWeb", "Dívida PGDAS-D" statements and of the "Relatório de Situação Fiscal" (fiscal status report). |
| **DCTFWeb / PGDAS-D** | Tax returns (payroll-related contributions / Simples Nacional) whose declared but unpaid amounts appear as debts. |
| **Processo fiscal / auto de infração** | Fiscal proceeding / infraction notice. A proceeding "with suspended enforceability" is under challenge and cannot be settled without waiving the defence. |
| **DARF** | Federal tax payment slip. The TIS is formalised by paying the first instalment through one. |
| **Selic** | The central bank's policy rate, used to adjust instalments monthly. |
| **CNPJ / CPF** | Corporate / individual taxpayer ids. Both have mod-11 check digits; placeholders in tests are invalid by construction. Records identified by a CPF were removed from the dataset. |
| **Porte** (size class) | Company size for the purpose of discount caps and terms: companies in general (65 %, 120 months) versus the art. 15, §1 list (small businesses, charity hospitals, cooperatives, civil society organisations, educational institutions: 70 %, 145 months). |
