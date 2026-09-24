"use client";

import { useMemo, useState } from "react";
import Filters from "@/components/Filters";
import Frame from "@/components/Frame";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { useTerms } from "@/lib/useTerms";

const PAGE_SIZE = 25;

export default function Terms() {
  const { terms } = useTerms();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter(
      (t) => t.taxpayer.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.sector.toLowerCase().includes(q),
    );
  }, [terms, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Frame
      title="Term explorer"
      description="Every row links to the original PDF published by the PGFN: each figure is auditable at the source."
    >
      <Filters />
      <input
        type="search"
        placeholder="Search taxpayer or sector…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
        className="card mb-3 w-full max-w-md px-3 py-2 text-sm"
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-3 py-2 font-semibold">Taxpayer</th>
              <th className="px-3 py-2 font-semibold">Region</th>
              <th className="px-3 py-2 font-semibold">Approval</th>
              <th className="px-3 py-2 text-right font-semibold">Debt</th>
              <th className="px-3 py-2 text-right font-semibold">Discount</th>
              <th className="px-3 py-2 text-right font-semibold">Instalments</th>
              <th className="px-3 py-2 font-semibold">Recovery</th>
              <th className="px-3 py-2 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t, i) => (
              <tr key={t.id} className="border-t" style={{ borderColor: "var(--line)", background: i % 2 ? "var(--surface-2)" : "var(--surface)" }}>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--ink)" }}>
                  {t.taxpayer}
                  <span className="block text-xs font-normal" style={{ color: "var(--muted)" }}>
                    {t.sector}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2">{t.region}</td>
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(t.approval_date)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular">{fmtMoney(t.consolidated_amount)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular" style={{ color: "var(--accent)" }}>
                  {fmtPct(t.total_discount_pct)}
                </td>
                <td className="px-3 py-2 text-right tabular">{fmtNum(t.installments)}</td>
                <td className="px-3 py-2">{t.judicial_recovery === true ? "Yes" : t.judicial_recovery === false ? "No" : "N/A"}</td>
                <td className="px-3 py-2">
                  <a href={t.pdf_url ?? t.source_url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--s1)" }}>
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm" style={{ color: "var(--ink-2)" }}>
        <span>
          {fmtNum(filtered.length)} terms · page {page + 1} of {pages}
        </span>
        <span className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn-outline rounded-md px-3 py-1 disabled:opacity-40">
            Previous
          </button>
          <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="btn-outline rounded-md px-3 py-1 disabled:opacity-40">
            Next
          </button>
        </span>
      </div>
    </Frame>
  );
}
