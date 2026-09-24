"use client";

import { useMemo, useState } from "react";
import Frame from "@/components/Frame";
import { fmtMoney, fmtPct } from "@/lib/format";
import { SAMPLE_SIZE, validationSample } from "@/lib/sample";
import type { Term } from "@/lib/types";
import { useTerms } from "@/lib/useTerms";

/** Prioritised review queue. The pilot showed the most fragile field is the discount, and
 *  there are discounts above the legal cap (impossible values) that must be checked first.
 *  Secondary fields (sector etc.) generate no useful work, so they are collapsed by default. */

const KEY_FIELDS = ["consolidated_amount", "total_discount_pct", "installments"] as const;
const LEGAL_CAP = 70; // %: general cap (art. 11, §2, II, Law 13,988/2020)

const LABEL: Record<string, string> = {
  consolidated_amount: "amount",
  total_discount_pct: "discount",
  installments: "instalments",
  down_payment_pct: "down payment",
  "discounts.fine_pct": "fine disc.",
  "discounts.interest_pct": "interest disc.",
  "discounts.charges_pct": "charges disc.",
  judicial_recovery: "recovery",
  approval_date: "date",
  sector: "sector",
  guarantees: "guarantees",
  modality: "modality",
  taxpayer: "taxpayer",
};

function labelOf(field: string): string {
  if (field.startsWith("document_")) return field.replace("document_", "doc. ").replace(/_/g, " ");
  return LABEL[field] ?? field.replace(/_/g, " ");
}

interface Analysed {
  t: Term;
  priority: 1 | 2 | 3;
  lowKey: string[];
  suspectDiscount: boolean;
  amountConfidence: number;
}

function analyse(t: Term): Analysed {
  const conf = t.confidence ?? {};
  const disc = t.total_discount_pct;
  const suspectDiscount = disc != null && disc > LEGAL_CAP;
  const lowKey = KEY_FIELDS.filter((f) => t[f] != null && (conf[f] ?? 0) < 0.7);
  const priority: 1 | 2 | 3 = suspectDiscount ? 1 : lowKey.length ? 2 : 3;
  return { t, priority, lowKey, suspectDiscount, amountConfidence: conf.consolidated_amount ?? 0 };
}

const BADGE: Record<1 | 2 | 3, { text: string; style: React.CSSProperties }> = {
  1: { text: "Discount > cap", style: { background: "#fceeee", color: "#7a1f1f", borderColor: "#e8b0b0" } },
  2: { text: "Key field uncertain", style: { background: "#fdf4de", color: "#6b4a00", borderColor: "#e8cc88" } },
  3: { text: "Secondary only", style: { background: "var(--surface-2)", color: "var(--muted)", borderColor: "var(--line)" } },
};

const AMBER: React.CSSProperties = { color: "#6b4a00", fontWeight: 600 };

export default function Review() {
  const { dataset } = useTerms();
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<"sample" | "queue">("sample");

  const analysed = useMemo(() => {
    const arr = (dataset?.terms ?? [])
      .filter((t) => t.review_fields?.length || (t.total_discount_pct != null && t.total_discount_pct > LEGAL_CAP))
      .map(analyse);
    arr.sort((a, b) => a.priority - b.priority || a.amountConfidence - b.amountConfidence);
    return arr;
  }, [dataset]);

  /** Sampling plan: 60 terms x 3 key fields = 180 checks; at most 4 errors certify the >= 95 %
   *  target with 95 % confidence (exact binomial). Discounts above the legal cap (P1) are
   *  mandatory and come ON TOP of the sample. */
  const sample = useMemo(() => {
    const p1 = analysed.filter((a) => a.priority === 1);
    const p1Ids = new Set(p1.map((a) => a.t.id));
    const drawn = validationSample(dataset?.terms ?? [])
      .filter((t) => !p1Ids.has(t.id))
      .map(analyse);
    return [...p1, ...drawn];
  }, [dataset, analysed]);

  const count = useMemo(
    () => ({
      p1: analysed.filter((a) => a.priority === 1).length,
      p2: analysed.filter((a) => a.priority === 2).length,
      p3: analysed.filter((a) => a.priority === 3).length,
    }),
    [analysed],
  );

  const visible = mode === "sample" ? sample : showAll ? analysed : analysed.filter((a) => a.priority <= 2);

  return (
    <Frame
      title="Extraction review"
      description="Sampled human validation: discounts above the legal cap are mandatory; the drawn sample certifies the >= 95 % accuracy target with 95 % confidence."
    >
      <div className="no-print mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: "var(--line)" }}>
          {(
            [
              ["sample", `Validation sample (${count.p1} + ${SAMPLE_SIZE})`],
              ["queue", "Full queue by confidence"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-3 py-1.5 font-semibold"
              style={mode === m ? { background: "var(--ink)", color: "#fff" } : { background: "var(--surface)", color: "var(--ink-2)" }}
            >
              {label}
            </button>
          ))}
        </span>
        <span className="rounded-full border px-3 py-1 font-semibold" style={BADGE[1].style}>
          {count.p1} discount &gt; legal cap
        </span>
        {mode === "queue" && (
          <>
            <span className="rounded-full border px-3 py-1 font-semibold" style={BADGE[2].style}>
              {count.p2} key field uncertain
            </span>
            <span className="rounded-full border px-3 py-1" style={BADGE[3].style}>
              {count.p3} secondary fields only
            </span>
            <button onClick={() => setShowAll((v) => !v)} className="btn-outline ml-auto rounded-md px-3 py-1.5 font-medium">
              {showAll ? "Hide secondary" : "Show all"}
            </button>
          </>
        )}
      </div>
      {mode === "sample" && (
        <p className="no-print mb-3 rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink-2)" }}>
          How to review: open the PDF and check <strong>consolidated amount, discount and instalments</strong> against the
          row (missing in the panel means it must be missing in the PDF too). <strong>Discounts above the legal cap are
          mandatory</strong>; of the drawn terms, review as many as you can. Each checked term raises the confidence, and
          with all {SAMPLE_SIZE} done and at most 4 errors the &gt;= 95 % target is formally certified. The sample is fixed
          (deterministic draw: everyone sees the same terms). Errors found go back to the extraction; many errors mean a
          systematic problem, fixed by adjusting the prompt and re-extracting rather than by more manual work.
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-3 py-2 font-semibold">Priority</th>
              <th className="px-3 py-2 font-semibold">Taxpayer</th>
              <th className="px-3 py-2 font-semibold">Region</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 text-right font-semibold">Discount</th>
              <th className="px-3 py-2 text-right font-semibold">Instalments</th>
              <th className="px-3 py-2 font-semibold">Fields to review</th>
              <th className="px-3 py-2 font-semibold">PDF</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ t, priority, lowKey, suspectDiscount }, i) => (
              <tr key={t.id} className="border-t align-top" style={{ borderColor: "var(--line)", background: i % 2 ? "var(--surface-2)" : "var(--surface)" }}>
                <td className="px-3 py-2">
                  <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={BADGE[priority].style}>
                    {BADGE[priority].text}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--ink)" }}>
                  {t.taxpayer}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{t.region}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular" style={lowKey.includes("consolidated_amount") ? AMBER : undefined}>
                  {t.consolidated_amount != null ? fmtMoney(t.consolidated_amount) : "—"}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-2 text-right tabular"
                  style={suspectDiscount ? { color: "#7a1f1f", fontWeight: 700 } : lowKey.includes("total_discount_pct") ? AMBER : undefined}
                >
                  {t.total_discount_pct != null ? fmtPct(t.total_discount_pct, 1) : "—"}
                  {suspectDiscount && <span className="ml-1 text-[10px]">⚠</span>}
                </td>
                <td className="px-3 py-2 text-right tabular" style={lowKey.includes("installments") ? AMBER : undefined}>
                  {t.installments ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--ink-2)" }}>
                  {(t.review_fields ?? []).map((f) => {
                    const key = (KEY_FIELDS as readonly string[]).includes(f);
                    return (
                      <span key={f} className="mr-1 inline-block" style={key ? AMBER : { color: "var(--muted)" }}>
                        {labelOf(f)}
                      </span>
                    );
                  })}
                </td>
                <td className="px-3 py-2">
                  <a href={t.pdf_url ?? t.source_url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--s1)" }}>
                    open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--ink-2)" }}>
            Nothing in the queue.
          </p>
        )}
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
        {mode === "sample"
          ? `${visible.length} terms in the sample (${count.p1} mandatory + ${visible.length - count.p1} drawn)`
          : `${visible.length} of ${analysed.length} terms shown`}{" "}
        · key fields highlighted in amber · the discount was the least reliable field in the pilot validation (~89 %).
      </p>
    </Frame>
  );
}
