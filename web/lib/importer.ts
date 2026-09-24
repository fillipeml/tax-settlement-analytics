/** Multi-document importer for the simulator.
 *
 *  The lawyer drops AS MANY files as needed: Regularize (PGFN) plus e-CAC statements (fiscal
 *  proceeding, DCTFWeb, PGDAS-D, fiscal status report). This module detects the kind by
 *  CONTENT (never by extension), aggregates the debts with deduplication (the same debt appears
 *  in the specific statement and in the fiscal status report) and produces the cross-check
 *  notices.
 *
 *  Everything in the browser: client data never leaves the machine (privacy by architecture).
 */
import { parseEcac, type DebtItem, type EcacKind, type EcacResult, type ListedProceeding } from "./ecac.ts";
import { parsePdfText, parseRegularizeTable, type RegularizeResult } from "./regularize.ts";
import type { Alert, Components } from "./rules";

export type DocumentKind = EcacKind | "regularize-pdf" | "regularize-sheet";

export const KIND_LABEL: Record<DocumentKind, string> = {
  "regularize-pdf": "Regularize (PGFN): detailed report",
  "regularize-sheet": "Regularize (PGFN): spreadsheet",
  "fiscal-proceeding": "e-CAC: fiscal proceeding debt",
  dctfweb: "e-CAC: DCTFWeb debt",
  pgdas: "e-CAC: PGDAS-D debt",
  "fiscal-status": "e-CAC: fiscal status report",
};

export interface ImportedDocument {
  file: string;
  kind: DocumentKind;
  /** pgfn = registered debt (reachable by the PGFN individual settlement);
   *  rfb = debt still being collected by the revenue service (NOT registered yet) */
  origin: "pgfn" | "rfb";
  items: DebtItem[]; // empty for Regularize (which only brings aggregates)
  regularize?: RegularizeResult;
  name?: string;
  taxId?: string;
  proceeding?: ListedProceeding;
  listedProceedings: ListedProceeding[];
  pgfnEntries: number;
  suggestedSizeClass?: "general" | "small";
  totalIncluded: number;
  totalSuspended: number;
}

const sumComponents = (c: Components) => c.principal + c.fine + c.interest + c.charges;

function fromEcac(file: string, r: EcacResult): ImportedDocument {
  const included = r.items.filter((i) => !i.suspended);
  const suspended = r.items.filter((i) => i.suspended);
  return {
    file,
    kind: r.kind,
    origin: "rfb",
    items: r.items,
    name: r.name,
    taxId: r.taxId,
    proceeding: r.proceeding,
    listedProceedings: r.listedProceedings,
    pgfnEntries: r.pgfnEntries,
    suggestedSizeClass: r.suggestedSizeClass,
    totalIncluded: included.reduce((s, i) => s + i.consolidated, 0),
    totalSuspended: suspended.reduce((s, i) => s + i.consolidated, 0),
  };
}

function fromRegularize(file: string, kind: DocumentKind, r: RegularizeResult): ImportedDocument {
  return {
    file,
    kind,
    origin: "pgfn",
    items: [],
    regularize: r,
    name: r.name,
    taxId: r.taxId,
    listedProceedings: [],
    pgfnEntries: 0,
    totalIncluded: sumComponents(r.general) + sumComponents(r.socialSecurity),
    totalSuspended: 0,
  };
}

/** Reads ONE file (PDF or spreadsheet) and classifies it by content. */
export async function importFile(file: File): Promise<ImportedDocument> {
  const buf = await file.arrayBuffer();
  const magic = new Uint8Array(buf.slice(0, 8));
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => magic[i] === b);

  if (startsWith(0x25, 0x50, 0x44, 0x46)) {
    const text = await extractPdfText(buf);
    const ecac = parseEcac(text);
    if (ecac) {
      if (ecac.kind !== "fiscal-status" && ecac.items.length === 0) {
        throw new Error(`"${file.name}": recognised as ${KIND_LABEL[ecac.kind]}, but no debt was found in the document.`);
      }
      return fromEcac(file.name, ecac);
    }
    const reg = parsePdfText(text);
    if (reg.totalFound > 0) return fromRegularize(file.name, "regularize-pdf", reg);
    throw new Error(
      `"${file.name}": format not recognised. Accepted: the Regularize (PGFN) report and e-CAC statements (fiscal proceeding debt, DCTFWeb debt, PGDAS-D debt, fiscal status report).`,
    );
  }
  if (startsWith(0x50, 0x4b) || startsWith(0xd0, 0xcf, 0x11, 0xe0)) {
    throw new Error(`"${file.name}" is a binary Excel file. Use the file exported by Regularize (a CSV spreadsheet, even with an .xls extension) or save it as CSV.`);
  }
  const reg = parseRegularizeTable(new TextDecoder("utf-8").decode(buf));
  if (reg.totalFound > 0) return fromRegularize(file.name, "regularize-sheet", reg);
  throw new Error(`"${file.name}": no amounts could be extracted. Fill in the fields manually.`);
}

async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return text;
}

/* ----- aggregation ----- */

export interface Aggregate {
  general: Components;
  socialSecurity: Components;
  /** number of debts / registrations added (for the "registrations" field) */
  count: number;
  totalIncluded: number;
  totalSuspended: number;
  totalRfb: number; // part of the included total that is NOT registered yet (revenue-service phase)
  duplicates: number;
  componentsItemised: boolean;
  name?: string;
  taxId?: string;
  suggestedSizeClass?: "general" | "small";
  notices: Alert[];
}

const zero = (): Components => ({ principal: 0, fine: 0, interest: 0, charges: 0 });
const addInto = (a: Components, b: Components): void => {
  a.principal += b.principal;
  a.fine += b.fine;
  a.interest += b.interest;
  a.charges += b.charges;
};

const fmtBRL = (v: number) => v.toLocaleString("en-GB", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function aggregateDocuments(docs: ImportedDocument[]): Aggregate {
  const general = zero();
  const socialSecurity = zero();
  let count = 0;
  let totalSuspended = 0;
  let totalRfb = 0;
  let duplicates = 0;
  let sheetWithoutComponents = false;
  const seen = new Set<string>();

  for (const d of docs) {
    if (d.regularize) {
      addInto(general, d.regularize.general);
      addInto(socialSecurity, d.regularize.socialSecurity);
      count += d.regularize.entries ?? 0;
      if (!d.regularize.componentsItemised) sheetWithoutComponents = true;
      continue;
    }
    for (const item of d.items) {
      if (seen.has(item.key)) {
        duplicates++;
        continue;
      }
      seen.add(item.key);
      if (item.suspended) {
        totalSuspended += item.consolidated;
        continue;
      }
      addInto(item.nature === "social_security" ? socialSecurity : general, item.components);
      totalRfb += item.consolidated;
      count++;
    }
  }

  const totalIncluded = sumComponents(general) + sumComponents(socialSecurity);

  // ----- cross-checks and notices -----
  const notices: Alert[] = [];
  const names = docs.map((d) => d.file);
  if (docs.length) {
    notices.push({
      kind: "ok",
      text: `${docs.length} document(s) imported (${names.join(" · ")}): ${count} debts/registrations totalling ${fmtBRL(totalIncluded)}.${duplicates ? ` ${duplicates} debt(s) repeated across documents were counted once.` : ""}`,
    });
  }

  if (totalRfb > 0) {
    notices.push({
      kind: "warn",
      text: `${fmtBRL(totalRfb)} come from e-CAC statements and are NOT registered as active debt yet (still collected by the revenue service). The PGFN individual settlement only reaches registered debts; for these amounts the routes are the administrative-litigation settlement, an instalment plan at the revenue service, or waiting for registration. Kept in the simulation for a view of the total liability; remove the document to simulate registered debt only.`,
    });
  }

  if (totalSuspended > 0) {
    notices.push({
      kind: "warn",
      text: `${fmtBRL(totalSuspended)} with suspended enforceability (challenge under review) were NOT added: including them in a settlement requires withdrawing the defence (art. 3, Law 13,988/2020). They are listed in the document details.`,
    });
  }

  // The fiscal status report lists proceedings and registrations WITHOUT amounts: point out what is missing
  const status = docs.find((d) => d.kind === "fiscal-status");
  if (status) {
    const attached = new Set(docs.map((d) => d.proceeding?.number).filter(Boolean));
    const missing = status.listedProceedings.filter((p) => !p.suspended && !attached.has(p.number));
    if (missing.length) {
      notices.push({
        kind: "warn",
        text: `The fiscal status report lists ${missing.length} fiscal proceeding(s) with debt whose amounts are not in the report: ${missing.map((p) => p.number).join(", ")}. Attach the "fiscal proceeding debt" PDF of each one (e-CAC, my debts and pending items) to include them.`,
      });
    }
    const hasRegularize = docs.some((d) => d.origin === "pgfn");
    if (status.pgfnEntries > 0 && !hasRegularize) {
      notices.push({
        kind: "warn",
        text: `The fiscal status report lists ${status.pgfnEntries} active-debt registration(s) at the PGFN, but without amounts. Attach the Regularize report to bring them in: they are exactly the debts the individual settlement reaches.`,
      });
    }
  }

  if (sheetWithoutComponents) {
    notices.push({
      kind: "warn",
      text: `The Regularize spreadsheet does not itemise fine, interest and charges: its totals were booked as principal. Import the detailed Regularize PDF (or redistribute manually): the legal discount applies only to the surcharges.`,
    });
  }

  return {
    general,
    socialSecurity,
    count,
    totalIncluded,
    totalSuspended,
    totalRfb,
    duplicates,
    componentsItemised: !sheetWithoutComponents,
    name: docs.map((d) => d.name).find(Boolean),
    taxId: docs.map((d) => d.taxId).find(Boolean),
    suggestedSizeClass: docs.map((d) => d.suggestedSizeClass).find(Boolean),
    notices,
  };
}
