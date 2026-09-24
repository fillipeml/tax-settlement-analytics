/** Parsers for the e-CAC documents (Brazilian federal revenue service). Besides the Regularize
 *  report, the simulator's importer reads the "My debts and pending items" statements and the
 *  Fiscal Status Report.
 *
 *  Formats covered (text extracted by pdf.js, items joined by spaces):
 *  - "Débito do Processo Fiscal": debts per fiscal proceeding, components itemised (fine /
 *    interest / original amount); suspended items come WITHOUT fine and interest and with an
 *    infraction notice number;
 *  - "Dívida DCTFWeb" and "Dívida PGDAS-D": same block grammar;
 *  - "Relatório de Situação Fiscal" (support information for certificate issuance): a
 *    "Pendência - Débito (SIEF)" table with components, plus lists WITHOUT amounts (fiscal
 *    proceedings and PGFN registrations) used for cross-checking the other documents.
 *
 *  All deterministic and 100 % in the browser: the client's data never leaves the lawyer's
 *  machine. Regexes match the Portuguese labels printed in the documents.
 */
import type { Components } from "./rules";

const parseBR = (s: string): number => parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export type EcacKind = "fiscal-proceeding" | "dctfweb" | "pgdas" | "fiscal-status";

export type DebtNature = "general" | "social_security";

export interface DebtItem {
  tax: string;
  nature: DebtNature;
  period: string; // assessment period
  dueDate: string; // dd/mm/yyyy
  components: Components; // charges = 0 in the revenue-service phase (legal charges belong to the registration)
  consolidated: number;
  suspended: boolean;
  revenueCode?: string;
  infractionNotice?: string;
  /** deduplication key across documents (the same debt appears in the specific statement AND
   *  in the Fiscal Status Report) */
  key: string;
}

export interface ListedProceeding {
  number: string;
  suspended: boolean;
}

export interface EcacResult {
  kind: EcacKind;
  items: DebtItem[];
  name?: string;
  taxId?: string;
  /** "Débito do Processo Fiscal": number and status of the document's proceeding */
  proceeding?: ListedProceeding;
  /** Fiscal Status: fiscal proceedings listed (without amounts) */
  listedProceedings: ListedProceeding[];
  /** Fiscal Status: number of PGFN registrations listed (without amounts) */
  pgfnEntries: number;
  /** Fiscal Status: registered size ("DEMAIS" -> general; ME/EPP -> small) */
  suggestedSizeClass?: "general" | "small";
}

/** pdf.js breaks ligatures ("fi scal", "Re fi s"), duplicates spaces and injects icon glyphs
 *  (private-use Unicode) into page headers and footers. */
export function normalisePdfText(t: string): string {
  return t
    .replace(/[-]/g, " ")
    .replace(/\bfi\s+(?=[a-zà-ü])/g, "fi")
    .replace(/(?<=[a-zà-ü])\s+fi\b/g, "fi")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectEcacKind(normalisedText: string): EcacKind | null {
  const t = normalisedText.slice(0, 400);
  if (t.includes("Débito do Processo Fiscal")) return "fiscal-proceeding";
  if (t.includes("Dívida DCTFWeb")) return "dctfweb";
  if (t.includes("Dívida PGDAS-D")) return "pgdas";
  if (normalisedText.includes("INFORMAÇÕES DE APOIO PARA EMISSÃO DE CERTIDÃO")) return "fiscal-status";
  return null;
}

/** Social security contributions go to the "social_security" group (60-month cap, art. 195,
 *  §11 of the Constitution); everything else (IRPJ/CSLL/PIS/COFINS/IRRF/Simples...) is "general". */
export function natureOf(tax: string): DebtNature {
  return /PREVID|INSS|SEGURADOS|EMPREGADOR|CPRB|\bCP\b/i.test(tax) ? "social_security" : "general";
}

const keyOf = (tax: string, dueDate: string, consolidated: number) =>
  `${tax.toUpperCase().replace(/\s+/g, " ")}|${dueDate}|${consolidated.toFixed(2)}`;

/* ----- "My debts" statements (fiscal proceeding / DCTFWeb / PGDAS-D) ----- */

/** Between an item's header and its "Tributo ..." block there may be page-break noise
 *  (breadcrumbs, column titles, footer). The tolerant gap is bounded and forbidden from crossing
 *  another item (the lookahead rejects Devedor/Suspenso). */
const ITEM_RE =
  /(\d{2}\/\d{4}|\dº\s?trimestre\/\d{4})\s(\d{2}\/\d{2}\/\d{4})\s([\d.,]+)(?:\s([\d.,]+))?(?:\s(\d{4}-\d{2}))?\s(Devedor|Suspenso)\s(?:(?!Devedor|Suspenso|Tributo).){0,400}?Tributo\s(.+?)(?:\sMulta \(R\$\)\s([\d.,]+)\sJuros \(R\$\)\s([\d.,]+))?\sValor original \(R\$\)\s([\d.,]+)(?:\sAuto de infração\s([\d.\/-]+))?/g;

export function parseMyDebts(text: string): EcacResult {
  const t = normalisePdfText(text);
  const kind = detectEcacKind(t) ?? "fiscal-proceeding";

  const items: DebtItem[] = [];
  for (const m of t.matchAll(ITEM_RE)) {
    const [, period, dueDate, balance, cons, revenueCode, status, tax, fine, interest, original, notice] = m;
    const suspended = status === "Suspenso";
    const fineValue = parseBR(fine ?? "0");
    const interestValue = parseBR(interest ?? "0");
    // Owing: principal = outstanding balance (1st number); consolidated = 2nd number.
    // Suspended: only the original amount is shown (no fine/interest/consolidated).
    let principal = suspended ? parseBR(original) : parseBR(balance);
    const consolidated = cons ? parseBR(cons) : principal + fineValue + interestValue;
    if (!suspended && Math.abs(consolidated - (principal + fineValue + interestValue)) > 0.02) {
      principal = consolidated - fineValue - interestValue; // defence against layout variation
    }
    items.push({
      tax: tax.trim(),
      nature: natureOf(tax),
      period,
      dueDate,
      components: { principal, fine: fineValue, interest: interestValue, charges: 0 },
      consolidated,
      suspended,
      revenueCode: revenueCode || undefined,
      infractionNotice: notice || undefined,
      key: keyOf(tax, dueDate, consolidated),
    });
  }

  const proceedingMatch = t.match(/Processo\s(\d{5}\.\d{3}\.\d{3}\/\d{4}-\d{2})\sSituação\s(.+?)\sLocalização/);
  return {
    kind,
    items,
    name: t.match(/Razão Social\s(.+?)\s(?:Selecione|Processo\s\d)/)?.[1]?.trim(),
    taxId: t.match(/CNPJ \(matriz\)\s([\d.]+\/\d{4}-\d{2})/)?.[1],
    proceeding: proceedingMatch ? { number: proceedingMatch[1], suspended: /suspenso/i.test(proceedingMatch[2]) } : undefined,
    listedProceedings: [],
    pgfnEntries: 0,
  };
}

/* ----- Fiscal Status Report ----- */

const SIEF_RE =
  /(?:(\d{4}-\d{2})\s-\s)?([A-ZÀ-Ü][A-ZÀ-Ü .]*?)\s(\d{2}\/\d{4})\s(\d{2}\/\d{2}\/\d{4})\s([\d.,]+)\s([\d.,]+)\s([\d.,]+)\s([\d.,]+)\s([\d.,]+)\sDEVEDOR/g;

export function parseFiscalStatus(text: string): EcacResult {
  const t = normalisePdfText(text);

  const slice = (start: RegExp, end: RegExp): string => {
    const i = t.search(start);
    if (i < 0) return "";
    const rest = t.slice(i);
    const j = rest.slice(20).search(end);
    return j < 0 ? rest : rest.slice(0, j + 20);
  };

  // "Pendência - Débito (SIEF)" table: original, outstanding, fine, interest, consolidated
  const items: DebtItem[] = [];
  const siefSlice = slice(/Pendência\s+-\s+Débito \(SIEF\)/, /Pendência|Diagnóstico Fiscal na Procuradoria/);
  for (const m of siefSlice.matchAll(SIEF_RE)) {
    const [, revenueCode, tax, period, dueDate, , outstanding, fine, interest, cons] = m;
    const components: Components = { principal: parseBR(outstanding), fine: parseBR(fine), interest: parseBR(interest), charges: 0 };
    items.push({
      tax: tax.trim(),
      nature: natureOf(tax),
      period,
      dueDate,
      components,
      consolidated: parseBR(cons),
      suspended: false,
      revenueCode: revenueCode || undefined,
      key: keyOf(tax, dueDate, parseBR(cons)),
    });
  }

  // Fiscal proceedings listed (without amounts), for cross-checking
  const listedProceedings: ListedProceeding[] = [];
  const procSlice = slice(/Pendência\s+-\s+Processo Fiscal \(SIEF\)/, /Pendência\s+[–-]\s+Parcelamento|Diagnóstico Fiscal na Procuradoria/);
  for (const m of procSlice.matchAll(/(\d{5}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s(DEVEDOR|SUSPENSO\S*)/g)) {
    listedProceedings.push({ number: m[1], suspended: m[2].startsWith("SUSPENSO") });
  }

  const sidaSlice = t.slice(Math.max(t.search(/Inscrição \(SIDA\)/), 0));
  const pgfnEntries =
    t.search(/Inscrição \(SIDA\)/) < 0
      ? 0
      : new Set([...sidaSlice.matchAll(/\b\d{2}\.\d\.\d{2}\.\d{6}-\d{2}\b/g)].map((m) => m[0])).size;

  const sizeText = t.match(/Porte da Empresa:\s*([A-ZÀ-Ü]+)/)?.[1];

  return {
    kind: "fiscal-status",
    items,
    name: t.match(/CNPJ:\s*[\d.]+\s*-\s*(.+?)\s*Dados Cadastrais/)?.[1]?.trim(),
    taxId: t.match(/CNPJ:\s*([\d.]+\/\d{4}-\d{2})/)?.[1],
    listedProceedings,
    pgfnEntries,
    suggestedSizeClass: sizeText === "DEMAIS" ? "general" : sizeText && /ME|EPP/.test(sizeText) ? "small" : undefined,
  };
}

export function parseEcac(text: string): EcacResult | null {
  const t = normalisePdfText(text);
  const kind = detectEcacKind(t);
  if (!kind) return null;
  return kind === "fiscal-status" ? parseFiscalStatus(t) : parseMyDebts(t);
}
