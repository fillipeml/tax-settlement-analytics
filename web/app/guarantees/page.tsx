"use client";

import Filters from "@/components/Filters";
import { Bars } from "@/components/Charts";
import Frame from "@/components/Frame";
import Kpi from "@/components/Kpi";
import { categoriseClause, categoriseGuarantee, countByCategory } from "@/lib/categories";
import { fmtNum, fmtPct, mean } from "@/lib/format";
import { useTerms } from "@/lib/useTerms";

const NO_GUARANTEE = "No guarantee identified";

export default function Guarantees() {
  const { terms } = useTerms();

  // Free-text guarantees are reduced to canonical groups; count in how many terms each kind
  // appears, plus the terms with no identified guarantee.
  const withoutGuarantee = terms.filter((t) => !t.guarantees?.length).length;
  const guarantees = [
    ...countByCategory(terms, (t) => t.guarantees, categoriseGuarantee),
    ...(withoutGuarantee ? [{ label: NO_GUARANTEE, value: withoutGuarantee }] : []),
  ]
    .map((d) => ({ ...d, highlight: d.label === NO_GUARANTEE }))
    .sort((a, b) => b.value - a.value);

  const inRecovery = terms.filter((t) => t.judicial_recovery === true);
  const notInRecovery = terms.filter((t) => t.judicial_recovery === false);

  const recoveryByRegion = Array.from(
    terms.reduce((m, t) => {
      const cur = m.get(t.region) ?? { rj: 0, total: 0 };
      m.set(t.region, { rj: cur.rj + (t.judicial_recovery === true ? 1 : 0), total: cur.total + 1 });
      return m;
    }, new Map<string, { rj: number; total: number }>()),
    ([label, { rj, total }]) => ({ label, value: total ? (100 * rj) / total : 0 }),
  ).sort((a, b) => a.label.localeCompare(b.label, "en"));

  const topClauses = countByCategory(terms, (t) => t.special_clauses, categoriseClause).slice(0, 8);

  return (
    <Frame
      title="Guarantees & judicial recovery"
      description="Guarantee patterns required by the PGFN and the treatment given to taxpayers under judicial recovery."
    >
      <Filters />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Terms in recovery"
          value={fmtNum(inRecovery.length)}
          detail={fmtPct(terms.length ? (100 * inRecovery.length) / terms.length : null) + " of this cut"}
        />
        <Kpi label="Mean discount: in recovery" value={fmtPct(mean(inRecovery.map((t) => t.total_discount_pct)))} highlight />
        <Kpi label="Mean discount: not in recovery" value={fmtPct(mean(notInRecovery.map((t) => t.total_discount_pct)))} />
        <Kpi label="Terms without an identified guarantee" value={fmtNum(withoutGuarantee)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Bars title="Guarantees required (occurrences)" data={guarantees} formatter={fmtNum} horizontal height={300} />
        <Bars title="% of terms in judicial recovery, by region" data={recoveryByRegion} formatter={(v) => fmtPct(v)} />
      </div>
      {topClauses.length > 0 && (
        <div className="mt-4">
          <Bars title="Most recurrent special clauses" data={topClauses} formatter={fmtNum} horizontal height={300} />
        </div>
      )}
    </Frame>
  );
}
