"use client";

import Filters from "@/components/Filters";
import { Bars } from "@/components/Charts";
import Frame from "@/components/Frame";
import Kpi from "@/components/Kpi";
import { fmtNum, fmtPct, highlightMax, mean, median } from "@/lib/format";
import { DEBT_BANDS, debtBandOf } from "@/lib/types";
import { useTerms } from "@/lib/useTerms";

export default function Discounts() {
  const { terms } = useTerms();
  const withDiscount = terms.filter((t) => t.total_discount_pct != null);

  const histogram = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}–${i * 10 + 10}%`,
    value: withDiscount.filter((t) => t.total_discount_pct! >= i * 10 && t.total_discount_pct! < i * 10 + 10).length,
  }));

  const byRegion = meanByGroup(withDiscount, (t) => t.region);
  const byBand = DEBT_BANDS.map((b) => ({
    label: b.label,
    value: mean(withDiscount.filter((t) => debtBandOf(t.consolidated_amount) === b.label).map((t) => t.total_discount_pct)) ?? 0,
  })).filter((d) => d.value > 0);

  const components = [
    { label: "Fine", value: mean(terms.map((t) => t.discounts?.fine_pct)) ?? 0 },
    { label: "Interest", value: mean(terms.map((t) => t.discounts?.interest_pct)) ?? 0 },
    { label: "Charges", value: mean(terms.map((t) => t.discounts?.charges_pct)) ?? 0 },
  ];

  return (
    <Frame
      title="Discount analysis"
      description="Percentages the PGFN has actually accepted: the reference for calibrating a settlement proposal."
    >
      <Filters />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Mean discount" value={fmtPct(mean(withDiscount.map((t) => t.total_discount_pct)))} highlight />
        <Kpi label="Median discount" value={fmtPct(median(withDiscount.map((t) => t.total_discount_pct)))} />
        <Kpi label="Largest discount" value={fmtPct(Math.max(0, ...withDiscount.map((t) => t.total_discount_pct!)))} />
        <Kpi label="Terms with a stated discount" value={fmtNum(withDiscount.length)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Bars title="Distribution of the discounts granted" data={highlightMax(histogram)} formatter={fmtNum} />
        <Bars title="Mean discount by region" data={highlightMax(byRegion)} formatter={(v) => fmtPct(v)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Bars title="Mean discount by debt band" data={highlightMax(byBand)} formatter={(v) => fmtPct(v)} horizontal />
        <Bars title="Mean discount by component" data={highlightMax(components)} formatter={(v) => fmtPct(v)} />
      </div>
    </Frame>
  );
}

function meanByGroup<T extends { total_discount_pct: number | null }>(terms: T[], key: (t: T) => string) {
  const groups = new Map<string, (number | null)[]>();
  for (const t of terms) {
    const k = key(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t.total_discount_pct);
  }
  return Array.from(groups, ([label, values]) => ({ label, value: mean(values) ?? 0 })).sort((a, b) =>
    a.label.localeCompare(b.label, "en"),
  );
}
