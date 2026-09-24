"use client";

import { type ReactNode } from "react";
import { fmtDate } from "@/lib/format";
import { useTerms } from "@/lib/useTerms";

const SOURCE_URL =
  "https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/painel-dos-parcelamentos/termos-de-transacao-individual";

/** Common page frame: demo banner, title and the "updated at" footer line. */
export default function Frame({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { dataset, loading } = useTerms();

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {dataset?.contains_simulated && (
        <div
          className="mb-4 rounded-md border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--warn)", background: "var(--warn-soft)", color: "#6b4a00" }}
        >
          Demonstration data: real PGFN inventory ({dataset.total} terms) with simulated values until the
          extraction has run.
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
            {title}
          </h1>
          {description && (
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {description}
            </p>
          )}
        </div>
        {dataset && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Updated {fmtDate(dataset.updated_at)} · {dataset.total} terms ·{" "}
            <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="underline">
              source: PGFN
            </a>
          </p>
        )}
      </div>
      {loading ? (
        <p className="py-20 text-center text-sm" style={{ color: "var(--ink-2)" }}>
          Loading data…
        </p>
      ) : (
        children
      )}
    </main>
  );
}
