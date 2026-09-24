/** e-CAC parsers and the multi-document aggregation. Synthetic inputs only, shaped like the
 *  text pdf.js extracts (items joined by spaces, ligatures broken). Identifiers are placeholders
 *  with invalid check digits. */
import { detectEcacKind, natureOf, normalisePdfText, parseEcac, parseFiscalStatus, parseMyDebts } from "../lib/ecac.ts";
import { aggregateDocuments, type ImportedDocument } from "../lib/importer.ts";
import { check, done, near, section } from "./harness.mts";

section("0. text normalisation and kind detection");
{
  check("broken ligature 'fi scal' is rejoined", normalisePdfText("Processo fi scal").includes("fiscal"));
  check("private-use glyphs and repeated spaces collapse", normalisePdfText("a   b") === "a b");
  check("kind: fiscal proceeding", detectEcacKind("Débito do Processo Fiscal ...") === "fiscal-proceeding");
  check("kind: DCTFWeb", detectEcacKind("Dívida DCTFWeb ...") === "dctfweb");
  check("kind: PGDAS-D", detectEcacKind("Dívida PGDAS-D ...") === "pgdas");
  check("kind: fiscal status anywhere in the text", detectEcacKind("x ".repeat(300) + "INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO") === "fiscal-status");
  check("unknown document -> null", detectEcacKind("Relatório qualquer") === null && parseEcac("Relatório qualquer") === null);
  check("nature: social security contributions", natureOf("CP-PATRONAL") === "social_security" && natureOf("CONTRIB PREVIDENCIARIA") === "social_security");
  check("nature: everything else is general", natureOf("PIS") === "general" && natureOf("CSLL") === "general");
}

section("1. 'my debts' statement: synthetic (owing, suspended, PGDAS without a revenue code)");
{
  const text = [
    "Débito do Processo Fiscal  CNPJ (matriz)  00.000.000/0001-00  Razão Social  Empresa Exemplo Ltda",
    "Processo 12345.678.901/2026-99  Situação  Devedor  Localização  Setor X  Débitos do processo fi scal",
    "3º trimestre/2024   31/10/2024   1.000,00   1.300,00   2372-01   Devedor  Tributo  CSLL  Multa (R$)  200,00  Juros (R$)  100,00  Valor original (R$)  1.000,00",
    "11/2024   24/12/2024   500,00   650,00   8109-02   Devedor  Tributo  PIS  Multa (R$)  100,00  Juros (R$)  50,00  Valor original (R$)  500,00",
    "2º trimestre/2020   31/07/2020   900,00   2973-01   Suspenso  Tributo  CSLL  Valor original (R$)  900,00  Auto de infração  0710300.2024.0000001",
  ].join("  ");
  const r = parseMyDebts(text);
  check("kind detected: fiscal-proceeding", r.kind === "fiscal-proceeding");
  check("3 items extracted", r.items.length === 3);
  check(
    "owing: principal / fine / interest / consolidated",
    near(r.items[0].components.principal, 1000) && near(r.items[0].components.fine, 200) && near(r.items[0].components.interest, 100) && near(r.items[0].consolidated, 1300),
  );
  check("suspended: no fine / interest, original amount becomes principal", r.items[2].suspended && near(r.items[2].components.principal, 900) && r.items[2].components.fine === 0);
  check("infraction notice captured", r.items[2].infractionNotice === "0710300.2024.0000001");
  check("proceeding + status from the header", r.proceeding?.number === "12345.678.901/2026-99" && r.proceeding?.suspended === false);
  check("name and tax id", r.name === "Empresa Exemplo Ltda" && r.taxId === "00.000.000/0001-00");
  check("revenue code kept", r.items[0].revenueCode === "2372-01");

  const pgdas = parseMyDebts(
    "Dívida PGDAS-D  CNPJ (matriz)  00.000.000/0001-00  Razão Social  Empresa Exemplo Ltda  Selecione os débitos de PGDAS-D  09/2018   22/10/2018   150,00   300,00   Devedor  Tributo  SIMPLES NAC.  Multa (R$)  50,00  Juros (R$)  100,00  Valor original (R$)  170,00",
  );
  check("PGDAS without a revenue-code column: item extracted", pgdas.kind === "pgdas" && pgdas.items.length === 1);
  check("PGDAS: principal = outstanding BALANCE (150), not the original amount (170)", near(pgdas.items[0].components.principal, 150));
}

section("2. fiscal status report: synthetic");
{
  const text = [
    "MINISTÉRIO DA FAZENDA  INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO  CNPJ:   11.111.111 - EMPRESA EXEMPLO LTDA  Dados Cadastrais da Matriz",
    "CNPJ: 11.111.111/0001-11  Porte da Empresa: DEMAIS",
    "Diagnóstico Fiscal na Receita Federal  Pendência   -   Débito (SIEF)  CNPJ: 11.111.111/0001-11",
    "Receita   PA/Exerc.   Dt. Vcto   Vl. Original   Sdo. Devedor   Multa   Juros   Sdo. Dev. Cons.   Situação",
    "6912-01 - PIS   04/2026   25/05/2026   100,00   100,00   20,00   10,00   130,00   DEVEDOR",
    "SIMPLES   NAC.   09/2018   22/10/2018   170,00   150,00   50,00   100,00   300,00   DEVEDOR",
    "Pendência   -   Processo Fiscal (SIEF)  CNPJ: 11.111.111/0001-11  Processo   Situação   Localização",
    "12345.678.901/2026-99   DEVEDOR   SETOR X  99999.888.777/2025-55   DEVEDOR   SETOR Y",
    "Processo   Fiscal   com Exigibilidade Suspensa (SIEF)  17227.000.000/2024-00   SUSPENSO-JULGAMENTO   DA IMPUGNACAO   DRJ",
    "Pendência   –   Parcelamento (SIEFPAR)  Parcelamento: 0211.0001",
    "Diagnóstico Fiscal na Procuradoria-Geral da   Fazenda   Nacional  Pendência - Inscrição (SIDA)",
    "10.2.24.003430-17   3551-IRPJ   21/05/2024   10136.219.175/2024-92   DEVEDOR PRINCIPAL  Situação: ATIVA A SER AJUIZADA",
    "10.4.20.006637-36   1507-SIMPLES NACIONAL   25/05/2020   12376.228.419/2020-05   DEVEDOR PRINCIPAL  Situação: ATIVA A SER AJUIZADA",
  ].join("  ");
  const r = parseFiscalStatus(text);
  check("2 SIEF debts", r.items.length === 2);
  check("SIEF: principal = outstanding balance (150), fine / interest / consolidated", near(r.items[1].components.principal, 150) && near(r.items[1].components.fine, 50) && near(r.items[1].consolidated, 300));
  check("tax name without the revenue code", r.items[0].tax === "PIS" && r.items[1].tax === "SIMPLES NAC.");
  check("3 proceedings listed (1 suspended)", r.listedProceedings.length === 3 && r.listedProceedings.filter((p) => p.suspended).length === 1);
  check("PGFN (SIDA) proceedings do not leak into the fiscal proceedings list", !r.listedProceedings.some((p) => p.number === "10136.219.175/2024-92"));
  check("2 PGFN registrations counted", r.pgfnEntries === 2);
  check("size DEMAIS -> general", r.suggestedSizeClass === "general");
  check("name and tax id from the header", r.name === "EMPRESA EXEMPLO LTDA" && r.taxId === "11.111.111/0001-11");
  check("parseEcac dispatches to the fiscal status parser", parseEcac(text)?.kind === "fiscal-status");
}

section("3. multi-document aggregation: dedupe, suspended items, cross-checks");
{
  const item = (key: string, cons: number, suspended = false, nature: "general" | "social_security" = "general") => ({
    tax: "PIS",
    nature,
    period: "04/2026",
    dueDate: "25/05/2026",
    components: { principal: cons * 0.8, fine: cons * 0.15, interest: cons * 0.05, charges: 0 },
    consolidated: cons,
    suspended,
    key,
  });
  const docBase = { listedProceedings: [], pgfnEntries: 0, totalIncluded: 0, totalSuspended: 0 };
  const dctf: ImportedDocument = { ...docBase, file: "dctf.pdf", kind: "dctfweb", origin: "rfb", items: [item("PIS|25/05/2026|130.00", 130), item("COFINS|x", 200, false)] };
  const status: ImportedDocument = {
    ...docBase,
    file: "status.pdf",
    kind: "fiscal-status",
    origin: "rfb",
    items: [item("PIS|25/05/2026|130.00", 130), item("SUSP|1", 900, true), item("CP|1", 70, false, "social_security")],
    listedProceedings: [{ number: "12345.678.901/2026-99", suspended: false }],
    pgfnEntries: 3,
  };
  const a = aggregateDocuments([dctf, status]);
  check("debt repeated across documents counts once", a.duplicates === 1 && a.count === 3);
  check("suspended item is not added", near(a.totalIncluded, 400) && near(a.totalSuspended, 900));
  check("everything here is RFB (not registered)", near(a.totalRfb, 400));
  check("social security contributions land in the social group", near(a.socialSecurity.principal, 56));
  check("notice about unregistered debts", a.notices.some((x) => x.text.includes("NOT registered")));
  check("notice about suspended items", a.notices.some((x) => x.text.includes("suspended enforceability")));
  check("notice: listed proceeding without an attached PDF", a.notices.some((x) => x.text.includes("12345.678.901/2026-99")));
  check("notice: PGFN registrations without Regularize", a.notices.some((x) => x.text.includes("3 active-debt registration(s)")));
  check("components itemised (no spreadsheet involved)", a.componentsItemised === true);

  const withProceeding: ImportedDocument = {
    ...docBase,
    file: "proc.pdf",
    kind: "fiscal-proceeding",
    origin: "rfb",
    items: [item("CSLL|y", 500)],
    proceeding: { number: "12345.678.901/2026-99", suspended: false },
  };
  const b = aggregateDocuments([dctf, status, withProceeding]);
  check("attached proceeding leaves the missing list", !b.notices.some((x) => x.text.includes("12345.678.901/2026-99")));

  const sheet: ImportedDocument = {
    ...docBase,
    file: "regularize.csv",
    kind: "regularize-sheet",
    origin: "pgfn",
    items: [],
    name: "EMPRESA Z",
    regularize: { general: { principal: 1000, fine: 0, interest: 0, charges: 0 }, socialSecurity: { principal: 0, fine: 0, interest: 0, charges: 0 }, entries: 4, totalFound: 1000, componentsItemised: false, name: "EMPRESA Z" },
  };
  const c = aggregateDocuments([sheet, status]);
  check("Regularize aggregates are added and counted by registrations", near(c.general.principal, 1000 + 130 * 0.8) && c.count === 4 + 2);
  check("spreadsheet without components triggers the redistribution notice", c.componentsItemised === false && c.notices.some((x) => x.text.includes("does not itemise")));
  check("with a Regularize document, the 'registrations without Regularize' notice disappears", !c.notices.some((x) => x.text.includes("active-debt registration(s)")));
  check("debtor name propagates from the first document that has one", c.name === "EMPRESA Z");
  check("empty input -> no notices, zero totals", aggregateDocuments([]).notices.length === 0 && aggregateDocuments([]).totalIncluded === 0);
}

done();
