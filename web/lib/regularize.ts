/** Extraction of the "Consolidated Debt Report" from the PGFN's Regularize portal, 100 % in
 *  the browser: the client's data never leaves the lawyer's machine.
 *
 *  Accepted formats:
 *  - PDF (pdf.js): the detailed report, with components (principal / fine / interest / charges);
 *  - CSV spreadsheet exported by Regularize (named ".csv.xls"; ";" separator, UTF-8 with BOM):
 *    one row per registration, WITHOUT components. Totals per nature are booked as principal
 *    and the lawyer redistributes them. Carries the debtor's name and tax id.
 *  - Real binary Excel (.xls OLE / .xlsx zip) is not supported: Regularize does not export it;
 *    if it shows up, the user is told to save as CSV.
 *
 *  Regexes match the Portuguese labels printed in the documents.
 */
import type { Components } from "./rules";

// duplicated from rules.parseBR so this module stays importable under Node (tests)
const parseBR = (s: string): number => parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;

type Nature = "general" | "social_security";

const SECTIONS: Record<string, Nature> = {
  Previdenciária: "social_security",
  Tributária: "general",
  "Simples Nacional": "general",
  "Não Tributária": "general",
  FGTS: "general",
};

export interface RegularizeResult {
  general: Components;
  socialSecurity: Components;
  entries: number | null;
  totalFound: number;
  /** true when the source itemises principal / fine / interest / charges (PDF) */
  componentsItemised: boolean;
  name?: string;
  taxId?: string;
}

const zero = (): Components => ({ principal: 0, fine: 0, interest: 0, charges: 0 });

/* ----- PDF (detailed report, with components) ----- */

async function extractPdf(buf: ArrayBuffer): Promise<RegularizeResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return parsePdfText(text);
}

/** Pure core (testable): takes the text extracted from the detailed Regularize PDF. */
export function parsePdfText(text: string): RegularizeResult {
  const acc: Record<Nature, Components> = { general: zero(), social_security: zero() };
  const headers = [...text.matchAll(/(Previdenciária|Tributária|Simples Nacional|Não Tributária|FGTS)\s*\(\s*\d+\s*\)/g)];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index!;
    const end = i + 1 < headers.length ? headers[i + 1].index! : text.length;
    const chunk = text.slice(start, end);
    const nature = SECTIONS[headers[i][1]] ?? "general";
    const sumField = (label: string) => {
      const re = new RegExp(label + "\\s*R\\$\\s*([\\d\\.,]+)", "g");
      let m: RegExpExecArray | null;
      let total = 0;
      while ((m = re.exec(chunk)) !== null) total += parseBR(m[1]);
      return total;
    };
    acc[nature].principal += sumField("Principal");
    acc[nature].fine += sumField("Multa");
    acc[nature].interest += sumField("Juros de mora");
    acc[nature].charges += sumField("Encargo legal");
  }

  const entriesMatch = text.match(/Total de inscrições\s*ativas\s*:\s*(\d+)/i);
  const sum = (c: Components) => c.principal + c.fine + c.interest + c.charges;
  const totalFound = sum(acc.general) + sum(acc.social_security);

  // Debtor identification (report header). In pdf.js the page text comes as one line: the
  // name ends where "CPF/CNPJ" begins.
  const name =
    text.match(/Devedor:\s*(.+?)\s*CPF\/CNPJ/)?.[1]?.trim() || text.match(/Devedor:\s*([^\n]{2,80})/)?.[1]?.trim();
  const taxId = text.match(/CPF\/CNPJ:\s*([\d.\/-]+)/)?.[1];

  return {
    general: acc.general,
    socialSecurity: acc.social_security,
    entries: entriesMatch ? parseInt(entriesMatch[1]) : null,
    totalFound,
    componentsItemised: true,
    name,
    taxId,
  };
}

/* ----- Regularize CSV spreadsheet (one row per registration) ----- */

/** Pure core (testable): takes the CSV text and aggregates by nature. */
export function parseRegularizeTable(text: string): RegularizeResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => /^Inscrição\s*;/i.test(l.trim()));
  const acc: Record<Nature, Components> = { general: zero(), social_security: zero() };
  let entries = 0;
  let name: string | undefined;
  let taxId: string | undefined;

  if (headerIndex >= 0) {
    for (const line of lines.slice(headerIndex + 1)) {
      const c = line.split(";").map((x) => x.trim());
      // data row: [0] registration, [1] consolidated amount, [2] nature, [5] debtor, [6] tax id
      if (c.length < 3 || !c[0] || !c[1]) continue;
      const amount = parseBR(c[1]);
      if (!amount) continue;
      const nature = SECTIONS[c[2]] ?? "general";
      acc[nature].principal += amount; // no components in the spreadsheet: the total goes to principal
      entries++;
      if (!name && c[5]) name = c[5];
      if (!taxId && c[6]) taxId = c[6];
    }
  }

  return {
    general: acc.general,
    socialSecurity: acc.social_security,
    entries: entries || null,
    totalFound: acc.general.principal + acc.social_security.principal,
    componentsItemised: false,
    name,
    taxId,
  };
}

/* ----- Dispatcher by content (never trusts the extension) ----- */

export async function extractRegularize(file: File): Promise<RegularizeResult> {
  const buf = await file.arrayBuffer();
  const magic = new Uint8Array(buf.slice(0, 8));
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => magic[i] === b);

  if (startsWith(0x25, 0x50, 0x44, 0x46)) return extractPdf(buf); // %PDF
  if (startsWith(0x50, 0x4b) || startsWith(0xd0, 0xcf, 0x11, 0xe0)) {
    // .xlsx (zip) or binary .xls (OLE): Regularize does not export these formats
    throw new Error(
      "This is a binary Excel file. Use the file exported by Regularize (a CSV spreadsheet, even with an .xls extension) or save it as CSV and try again.",
    );
  }
  // text: Regularize CSV spreadsheet
  return parseRegularizeTable(new TextDecoder("utf-8").decode(buf));
}
