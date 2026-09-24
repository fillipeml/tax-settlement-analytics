/** Comparables from the PGFN corpus for the simulator.
 *
 *  Given the client's case (consolidated amount and recovery status), selects the most similar
 *  real terms and summarises the Attorney's acceptance pattern (median discount, spread, term)
 *  so the lawyer can calibrate the proposal. Progressive narrowing: if the exact filter returns
 *  too few terms, it relaxes until there is a statistical base, always saying which cut it used.
 *
 *  Only ORIGINAL terms enter (amendments and renegotiations are not a new discount concession,
 *  see termKindOf) and never simulated data.
 */

// Explicit extensions so this module also runs under Node (test suite).
import { termKindOf } from "./categories.ts";
import { debtBandOf, type Term } from "./types.ts";

export interface Comparables {
  level: "band+recovery" | "recovery" | "all";
  label: string; // human description of the cut used
  n: number;
  medianDiscount: number | null;
  discountP25: number | null;
  discountP75: number | null;
  withDiscount: number; // denominator of the discount statistics
  medianInstalments: number | null;
  pctWithGuarantee: number | null; // % of the cut's terms with an identified guarantee
  closest: Term[]; // up to `maxClosest` terms nearest in amount
  adherence: Adherence | null; // filled when a scenario is given
}

/** Simulated scenario to confront with the acceptance pattern of the cut. */
export interface Scenario {
  discountPct: number; // intended discount, %
  instalments: number; // instalments of the general / Simples balance
  downPaymentPct: number; // down payment, %
}

export interface AdherenceDimension {
  n: number; // comparables with the field informed
  /** % of comparables where the PGFN accepted a condition EQUAL OR MORE FAVOURABLE to the
   *  taxpayer than the simulated one (null when the base is insufficient). */
  pct: number | null;
}

/** IMPORTANT, what this is NOT: the corpus only contains APPROVED proposals (rejections are not
 *  published by the PGFN), so there is no denominator for a real "chance of success". The index
 *  measures ADHERENCE to the already-accepted pattern: the higher, the more the simulated
 *  scenario resembles what the PGFN demonstrably accepts in similar cases. */
export interface Adherence {
  discount: AdherenceDimension;
  instalments: AdherenceDimension;
  downPayment: AdherenceDimension;
  index: number | null; // mean of the dimensions with enough base
  band: "high" | "medium" | "low" | null;
}

/** Minimum number of informed comparables for a dimension to score. */
export const MIN_DIMENSION_N = 8;

export function adherenceOf(items: Term[], scenario: Scenario): Adherence {
  // favourable to the taxpayer = accepted discount/term >= simulated; accepted down payment <= simulated
  const dim = (values: number[], favourable: (v: number) => boolean): AdherenceDimension => ({
    n: values.length,
    pct: values.length >= MIN_DIMENSION_N ? (100 * values.filter(favourable).length) / values.length : null,
  });

  const discount = dim(
    items.map((t) => t.total_discount_pct).filter((v): v is number => v != null),
    (v) => v >= scenario.discountPct,
  );
  const instalments = dim(
    items.map((t) => t.installments).filter((v): v is number => v != null),
    (v) => v >= scenario.instalments,
  );
  const downPayment = dim(
    items.map((t) => t.down_payment_pct).filter((v): v is number => v != null),
    (v) => v <= scenario.downPaymentPct,
  );

  const valid = [discount, instalments, downPayment].filter((d) => d.pct != null) as { n: number; pct: number }[];
  const index = valid.length ? valid.reduce((s, d) => s + d.pct, 0) / valid.length : null;
  const band = index == null ? null : index >= 60 ? "high" : index >= 30 ? "medium" : "low";

  return { discount, instalments, downPayment, index, band };
}

/** Quantile by linear interpolation over values already filtered of null. */
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

const inRecovery = (t: Term) => t.judicial_recovery === true;

export function comparables(
  terms: Term[],
  totalAmount: number,
  judicialRecovery: boolean,
  minimum = 10,
  maxClosest = 5,
  scenario?: Scenario,
): Comparables {
  const base = terms.filter((t) => !t.simulated && termKindOf(t.modality, t.title) === "Original term");
  const band = debtBandOf(totalAmount);
  const situation = judicialRecovery ? "under judicial recovery" : "not under judicial recovery";

  const levels: { level: Comparables["level"]; label: string; items: Term[] }[] = [
    {
      level: "band+recovery",
      label: `debt ${band.toLowerCase()}, ${situation}`,
      items: base.filter((t) => debtBandOf(t.consolidated_amount) === band && inRecovery(t) === judicialRecovery),
    },
    {
      level: "recovery",
      label: `all debt bands, ${situation}`,
      items: base.filter((t) => inRecovery(t) === judicialRecovery),
    },
    { level: "all", label: "whole corpus (original terms)", items: base },
  ];

  const chosen = levels.find((l) => l.items.length >= minimum) ?? levels[levels.length - 1];
  const items = chosen.items;

  const discounts = items.map((t) => t.total_discount_pct).filter((d): d is number => d != null);
  const instalments = items.map((t) => t.installments).filter((p): p is number => p != null);

  const closest = items
    .filter((t) => t.consolidated_amount != null)
    .sort(
      (a, b) =>
        Math.abs((a.consolidated_amount as number) - totalAmount) - Math.abs((b.consolidated_amount as number) - totalAmount),
    )
    .slice(0, maxClosest);

  return {
    level: chosen.level,
    label: chosen.label,
    n: items.length,
    medianDiscount: quantile(discounts, 0.5),
    discountP25: quantile(discounts, 0.25),
    discountP75: quantile(discounts, 0.75),
    withDiscount: discounts.length,
    medianInstalments: quantile(instalments, 0.5),
    pctWithGuarantee: items.length ? (100 * items.filter((t) => t.guarantees?.length).length) / items.length : null,
    closest,
    adherence: scenario ? adherenceOf(items, scenario) : null,
  };
}
