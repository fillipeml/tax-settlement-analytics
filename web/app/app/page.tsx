"use client";

import Link from "next/link";
import { fmtNum } from "@/lib/format";
import { useTerms } from "@/lib/useTerms";

function Card({
  href,
  title,
  description,
  detail,
  highlight = false,
}: {
  href: string;
  title: string;
  description: string;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group card flex flex-col p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
      style={highlight ? { borderColor: "var(--accent)", borderWidth: 2 } : undefined}
    >
      <span className="marker mb-4" style={{ width: 26, height: 26 }} aria-hidden />
      <h2 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
        {title}
      </h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {description}
      </p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
        {detail} →
      </p>
    </Link>
  );
}

export default function Hub() {
  const { dataset } = useTerms();
  const total = dataset ? fmtNum(dataset.total) : "…";

  return (
    <main>
      <section style={{ background: "var(--ink)" }} className="no-print">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <p className="font-display text-3xl text-white">Practitioner workspace</p>
          <p className="mt-1 text-sm" style={{ color: "#a9a4bd" }}>
            Pick a tool: the whole market, or one client&apos;s case.
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            href="/overview"
            title="Market view"
            description={`What the PGFN accepts in individual settlements: ${total} approved terms across the 5 regions, with discounts, terms, guarantees and judicial recovery.`}
            detail="Explore the market"
          />
          <Card
            href="/app/simulator"
            title="Settlement simulator"
            description="Build a TI/TIS simulation for one client: import the Regularize report, adjust the down payment and instalments and see the economic benefit inside the legal limits."
            detail="Simulate a client"
            highlight
          />
          <Card
            href="/app/review"
            title="Review queue"
            description="Fields extracted by the model with low confidence, waiting for a sampled check against the original PDF: the quality control of the corpus."
            detail="Review extractions"
          />
        </div>
        <p className="mt-6 text-xs" style={{ color: "var(--muted)" }}>
          The simulator processes client data exclusively in your browser. Nothing is sent to or stored on a server.
        </p>
      </div>
    </main>
  );
}
