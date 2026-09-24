"use client";

import Filters from "@/components/Filters";
import { Bars, LineSeries } from "@/components/Charts";
import Frame from "@/components/Frame";
import Kpi from "@/components/Kpi";
import { categoriseSector, NOT_IDENTIFIED_LABEL } from "@/lib/categories";
import { fmtMoney, fmtNum, fmtPct, highlightMax, mean, median } from "@/lib/format";
import { yearOf } from "@/lib/types";
import { useTerms } from "@/lib/useTerms";

export default function Overview() {
  const { terms } = useTerms();

  const totalAmount = terms.reduce((s, t) => s + (t.consolidated_amount ?? 0), 0);
  const meanDiscount = mean(terms.map((t) => t.total_discount_pct));
  const medianInstalments = median(terms.map((t) => t.installments));
  const pctRecovery = terms.length ? (100 * terms.filter((t) => t.judicial_recovery === true).length) / terms.length : null;

  const byRegion = group(terms.map((t) => t.region));
  const byYear = group(terms.map(yearOf).filter((y) => y !== "N/A"));
  const bySector = group(terms.map((t) => categoriseSector(t.sector)).filter((s) => s !== NOT_IDENTIFIED_LABEL))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  return (
    <Frame
      title="Overview"
      description="What the PGFN actually accepts in individual settlements: a consolidated view of the public corpus."
    >
      <Filters />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Approved terms" value={fmtNum(terms.length)} detail="corpus in this cut" />
        <Kpi label="Debt settled" value={fmtMoney(totalAmount)} detail="sum of consolidated amounts" />
        <Kpi label="Mean discount" value={fmtPct(meanDiscount)} highlight detail="over the consolidated amount" />
        <Kpi label="Instalments (median)" value={fmtNum(medianInstalments)} detail="term accepted by the PGFN" />
        <Kpi label="In judicial recovery" value={fmtPct(pctRecovery)} detail="of the terms in this cut" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Bars title="Terms by PGFN region" data={highlightMax(byRegion)} formatter={fmtNum} />
        <LineSeries title="Approvals per year" data={byYear} formatter={fmtNum} />
      </div>
      <div className="mt-4">
        <Bars title="Most frequent sectors" data={highlightMax(bySector)} formatter={fmtNum} horizontal height={300} />
      </div>
    </Frame>
  );
}

function group(keys: string[]) {
  const map = new Map<string, number>();
  for (const k of keys) map.set(k, (map.get(k) ?? 0) + 1);
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label, "en"));
}
