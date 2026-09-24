/** Formatting helpers. Amounts are Brazilian reais (BRL); numbers use en-GB digit grouping. */

const compactCurrency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullCurrency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const plainNumber = new Intl.NumberFormat("en-GB");

export function fmtMoney(v: number | null | undefined, compact = true): string {
  if (v == null) return "N/A";
  return compact ? compactCurrency.format(v) : fullCurrency.format(v);
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v == null) return "N/A";
  return `${v.toLocaleString("en-GB", { maximumFractionDigits: digits })}%`;
}

export function fmtNum(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return plainNumber.format(v);
}

export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso || "N/A";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function mean(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Marks the largest bar as the highlight: the one point that answers a magnitude chart.
 *  One per chart, so the accent never turns into decoration. */
export function highlightMax<T extends { value: number; highlight?: boolean }>(data: T[]): T[] {
  if (!data.length) return data;
  let iMax = 0;
  for (let i = 1; i < data.length; i++) if (data[i].value > data[iMax].value) iMax = i;
  return data.map((d, i) => ({ ...d, highlight: i === iMax }));
}
