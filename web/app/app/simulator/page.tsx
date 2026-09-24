"use client";

import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { comparables, MIN_DIMENSION_N, type Adherence, type Comparables } from "@/lib/comparables";
import { buildExportHtml, downloadHtml } from "@/lib/export";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { aggregateDocuments, importFile, KIND_LABEL, type ImportedDocument } from "@/lib/importer";
import {
  calculate,
  effectiveRules,
  formatBR,
  legalBases,
  MODALITIES,
  modalityAlerts,
  parseBR,
  simulate,
  SIZE_CLASSES,
  type Alert,
  type Capag,
  type Components,
  type Modality,
  type SizeClass,
} from "@/lib/rules";
import { useTerms } from "@/lib/useTerms";

/* ----- UI blocks ----- */

const ALERT_STYLE: Record<Alert["kind"], React.CSSProperties> = {
  ok: { background: "#e8f5ee", color: "#145c38", borderColor: "#a8d8bc" },
  warn: { background: "#fdf4de", color: "#6b4a00", borderColor: "#e8cc88" },
  err: { background: "#fceeee", color: "#7a1f1f", borderColor: "#e8b0b0" },
};

function Notice({ a }: { a: Alert }) {
  return (
    <div className="mt-2 rounded-md border px-3 py-2 text-xs leading-relaxed" style={ALERT_STYLE[a.kind]}>
      {a.kind === "ok" ? "✓ " : a.kind === "err" ? "✕ " : "⚠ "}
      {a.text}
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-2)" }}>
        <span className="marker" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function AmountField({
  label,
  value,
  onChange,
  placeholder = "0,00",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <input
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        className="w-full rounded-md border px-3 py-2 text-sm font-medium tabular"
        style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}
      />
    </label>
  );
}

function Slider({
  label,
  sub,
  min,
  max,
  step = 1,
  value,
  onChange,
  output,
  disabled = false,
}: {
  label: string;
  sub: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  output: string;
  disabled?: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1" style={disabled ? { opacity: 0.45 } : undefined}>
      <div className="min-w-36 flex-1 text-xs leading-tight sm:flex-none" style={{ color: "var(--ink-2)" }}>
        {label}
        <span className="block text-[10px]" style={{ color: "var(--muted)" }}>
          {sub}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="min-w-32 flex-1 basis-full sm:basis-auto"
        style={{ accentColor: "var(--accent)" }}
      />
      <span className="min-w-24 text-right text-xs font-semibold tabular" style={{ color: "var(--ink)" }}>
        {output}
      </span>
    </div>
  );
}

/* ----- page ----- */

const FIELDS: { key: keyof Components; label: string }[] = [
  { key: "principal", label: "Principal (BRL)" },
  { key: "fine", label: "Fine (BRL)" },
  { key: "interest", label: "Default interest (BRL)" },
  { key: "charges", label: "Legal charges (BRL)" },
];

type Group = Record<keyof Components, string>;
const EMPTY_GROUP: Group = { principal: "", fine: "", interest: "", charges: "" };

/* ----- Comparables from the corpus ----- */

const ADHERENCE_BAND: Record<NonNullable<Adherence["band"]>, { label: string; style: React.CSSProperties }> = {
  high: { label: "High adherence", style: ALERT_STYLE.ok },
  medium: { label: "Medium adherence", style: ALERT_STYLE.warn },
  low: { label: "Low adherence", style: ALERT_STYLE.err },
};

function AdherenceGauge({ label, sub, d }: { label: string; sub: string; d: { n: number; pct: number | null } }) {
  return (
    <div className="rounded-md border px-3 py-2" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          {label}
        </p>
        <p className="text-sm font-bold tabular" style={{ color: d.pct == null ? "var(--muted)" : "var(--ink)" }}>
          {d.pct == null ? "—" : fmtPct(d.pct, 0)}
        </p>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        {d.pct != null && (
          <div
            className="h-full rounded-full"
            style={{ width: `${d.pct}%`, background: d.pct >= 60 ? "#145c38" : d.pct >= 30 ? "#c98a00" : "#7a1f1f" }}
          />
        )}
      </div>
      <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
        {d.pct == null ? `insufficient base (${d.n} of min. ${MIN_DIMENSION_N} informed)` : `${sub} · base: ${d.n} terms`}
      </p>
    </div>
  );
}

function CorpusComparables({
  c,
  simulatedPct,
  instalments,
  downPaymentPct,
}: {
  c: Comparables | null;
  simulatedPct: number;
  instalments: number;
  downPaymentPct: number;
}) {
  if (!c) {
    return (
      <Panel title="Comparables from the PGFN corpus" className="mb-4">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Loading the corpus…
        </p>
      </Panel>
    );
  }

  const aboveMedian = c.medianDiscount != null && simulatedPct > c.medianDiscount;
  const comparison: Alert | null =
    c.medianDiscount == null || simulatedPct <= 0
      ? null
      : aboveMedian
        ? {
            kind: "warn",
            text: `The simulated discount (${fmtPct(simulatedPct, 1)}) is ABOVE the median accepted by the PGFN in similar cases (${fmtPct(c.medianDiscount, 1)}): strengthen the case (CAPAG, guarantees, payment capacity).`,
          }
        : {
            kind: "ok",
            text: `The simulated discount (${fmtPct(simulatedPct, 1)}) is within the pattern accepted by the PGFN in similar cases (median ${fmtPct(c.medianDiscount, 1)}).`,
          };

  return (
    <Panel title={`Comparables from the PGFN corpus: ${c.label}`} className="mb-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Comparable terms", value: fmtNum(c.n), sub: "original terms, no amendments" },
          { label: "Median discount", value: fmtPct(c.medianDiscount, 1), sub: `${c.withDiscount} terms with a stated discount`, colour: "var(--accent)" },
          {
            label: "Typical range (P25–P75)",
            value: c.discountP25 != null && c.discountP75 != null ? `${fmtPct(c.discountP25, 0)}–${fmtPct(c.discountP75, 0)}` : "—",
            sub: "middle half of the discounts",
          },
          { label: "Instalments (median)", value: fmtNum(c.medianInstalments), sub: c.pctWithGuarantee != null ? `${fmtPct(c.pctWithGuarantee, 0)} with a guarantee` : "" },
        ].map((k) => (
          <div key={k.label} className="rounded-md border px-3 py-2" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {k.label}
            </p>
            <p className="mt-0.5 text-lg font-bold tabular" style={{ color: k.colour ?? "var(--ink)" }}>
              {k.value}
            </p>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              {k.sub}
            </p>
          </div>
        ))}
      </div>
      {comparison && <Notice a={comparison} />}

      {/* Adherence of the scenario to the acceptance pattern. NOT a "chance of winning": the
          corpus only holds approved proposals, rejections are never published. */}
      {c.adherence && (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-2)" }}>
              Adherence of the scenario to the acceptance pattern
            </p>
            {c.adherence.band && (
              <span className="rounded-full border px-3 py-0.5 text-[11px] font-bold" style={ADHERENCE_BAND[c.adherence.band].style}>
                {ADHERENCE_BAND[c.adherence.band].label}
                {c.adherence.index != null && ` · ${fmtPct(c.adherence.index, 0)}`}
              </span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <AdherenceGauge label={`Discount ${fmtPct(simulatedPct, 1)}`} sub="of comparables received a discount >= simulated" d={c.adherence.discount} />
            <AdherenceGauge label={`Term ${instalments}x`} sub="of comparables obtained a term >= simulated" d={c.adherence.instalments} />
            <AdherenceGauge label={`Down payment ${downPaymentPct}%`} sub="of comparables paid a down payment <= simulated" d={c.adherence.downPayment} />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--muted)" }}>
            Measures how much the scenario resembles what the PGFN has already accepted in similar cases: the higher, the
            more favourable precedents. <strong>Not a probability of success:</strong> the PGFN publishes only approved
            terms, so rejected proposals are not in the base.
          </p>
        </div>
      )}

      {c.closest.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left" style={{ background: "var(--ink)", color: "#fff" }}>
                {["Closest term by amount", "Approval", "Debt", "Discount", "Instalments", "Recovery", "Source"].map((h) => (
                  <th key={h} className="px-2 py-1.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.closest.map((t, i) => (
                <tr key={t.id} className="border-t" style={{ borderColor: "var(--line)", background: i % 2 ? "var(--surface-2)" : "var(--surface)" }}>
                  <td className="px-2 py-1.5 font-medium" style={{ color: "var(--ink)" }}>
                    {t.taxpayer}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(t.approval_date)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular">{fmtMoney(t.consolidated_amount)}</td>
                  <td className="px-2 py-1.5 font-semibold tabular" style={{ color: "var(--accent)" }}>
                    {fmtPct(t.total_discount_pct, 1)}
                  </td>
                  <td className="px-2 py-1.5 tabular">{fmtNum(t.installments)}</td>
                  <td className="px-2 py-1.5">{t.judicial_recovery === true ? "Yes" : t.judicial_recovery === false ? "No" : "N/A"}</td>
                  <td className="px-2 py-1.5">
                    <a href={t.pdf_url ?? t.source_url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--s1)" }}>
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>
        Public PGFN data (Ordinance 6,757/2022) · included in the material exported to the client · statistics over
        original terms (amendments excluded).
      </p>
    </Panel>
  );
}

export default function Simulator() {
  const [step, setStep] = useState<"input" | "dashboard">("input");
  const [modality, setModality] = useState<Modality>("ti");
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [sizeClass, setSizeClass] = useState<SizeClass>("general");
  const [capag, setCapag] = useState<Capag>("D");
  const [recovery, setRecovery] = useState(false);
  const [useOffset, setUseOffset] = useState(false);
  const [offsetAvailable, setOffsetAvailable] = useState("");
  const [general, setGeneral] = useState<Group>({ ...EMPTY_GROUP });
  const [socialSecurity, setSocialSecurity] = useState<Group>({ ...EMPTY_GROUP });
  const [entries, setEntries] = useState("1");
  const [importStatus, setImportStatus] = useState<Alert[]>([]);
  const [importedDocs, setImportedDocs] = useState<ImportedDocument[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [downPaymentPct, setDownPaymentPct] = useState(5);
  const [downPaymentInstalments, setDownPaymentInstalments] = useState(12);
  const [generalInstalments, setGeneralInstalments] = useState(120);
  const [socialInstalments, setSocialInstalments] = useState(60);

  const sizeRules = SIZE_CLASSES[sizeClass];
  const effective = effectiveRules(sizeClass, recovery);
  const offsetAllowed = MODALITIES[modality].allowsTaxLossOffset || recovery;
  const generalN = Math.min(generalInstalments, effective.taxTermMonths);
  // Down payment 0 % = NO down-payment phase: the balance starts in month 1.
  const downN = downPaymentPct === 0 ? 0 : downPaymentInstalments;

  const toComponents = (g: Group): Components => ({
    principal: parseBR(g.principal),
    fine: parseBR(g.fine),
    interest: parseBR(g.interest),
    charges: parseBR(g.charges),
  });

  const params = useMemo(
    () => ({
      modality,
      sizeClass,
      capag,
      judicialRecovery: recovery,
      useTaxLossOffset: useOffset && offsetAllowed,
      taxLossAvailable: parseBR(offsetAvailable),
      general: toComponents(general),
      socialSecurity: toComponents(socialSecurity),
    }),
    [modality, sizeClass, capag, recovery, useOffset, offsetAllowed, offsetAvailable, general, socialSecurity],
  );

  const r = useMemo(() => calculate(params), [params]);
  const sim = useMemo(
    () => simulate(r, params, downPaymentPct, downN, generalN, socialInstalments),
    [r, params, downPaymentPct, downN, generalN, socialInstalments],
  );
  const alerts = useMemo(
    () => modalityAlerts(modality, r.total, params.useTaxLossOffset, recovery),
    [modality, r.total, params.useTaxLossOffset, recovery],
  );
  const bases = useMemo(() => legalBases(sizeClass, modality, recovery), [sizeClass, modality, recovery]);

  // Comparables are computed here (not inside the panel) because the client export also uses them.
  const { dataset } = useTerms();
  const comp = useMemo(
    () =>
      dataset
        ? comparables(dataset.terms, r.total, recovery, undefined, undefined, {
            discountPct: r.discountPct,
            instalments: generalN,
            downPaymentPct,
          })
        : null,
    [dataset, r.total, recovery, r.discountPct, generalN, downPaymentPct],
  );

  /** Recomputes the fields from the set of imported documents (several files aggregated with dedupe). */
  function applyDocuments(docs: ImportedDocument[], errors: Alert[]) {
    setImportedDocs(docs);
    const toGroup = (c: Components): Group => ({
      principal: formatBR(c.principal),
      fine: formatBR(c.fine),
      interest: formatBR(c.interest),
      charges: formatBR(c.charges),
    });
    if (docs.length === 0) {
      setImportStatus(errors);
      return;
    }
    const agg = aggregateDocuments(docs);
    setGeneral(toGroup(agg.general));
    setSocialSecurity(toGroup(agg.socialSecurity));
    if (agg.count) setEntries(String(agg.count));
    if (agg.name && !name.trim()) setName(agg.name);
    if (agg.taxId && !taxId.trim()) setTaxId(agg.taxId);
    if (agg.suggestedSizeClass) setSizeClass(agg.suggestedSizeClass);
    setImportStatus([...errors, ...agg.notices]);
  }

  async function processFiles(list: Iterable<File>) {
    // snapshot BEFORE any await: a FileList is live and empties when the input is reset
    const files = [...list];
    setImportStatus([{ kind: "warn", text: `Reading ${files.length} file(s) in the browser…` }]);
    const docs = [...importedDocs];
    const errors: Alert[] = [];
    for (const file of files) {
      try {
        const d = await importFile(file);
        const i = docs.findIndex((x) => x.file === d.file);
        if (i >= 0) docs[i] = d; // re-importing the same file replaces it
        else docs.push(d);
      } catch (err) {
        errors.push({ kind: "err", text: String(err instanceof Error ? err.message : err) });
      }
    }
    applyDocuments(docs, errors);
  }

  function removeDocument(file: string) {
    applyDocuments(
      importedDocs.filter((d) => d.file !== file),
      [],
    );
  }

  function exportForClient() {
    const svgDonut = document.querySelector(".chart-donut svg")?.outerHTML ?? "";
    const svgFlow = document.querySelector(".chart-flow svg")?.outerHTML ?? "";
    const lawyer = document.cookie.match(/(?:^|;\s*)tsa_name=([^;]+)/)?.[1];
    const html = buildExportHtml({
      clientName: name,
      taxId,
      lawyer: lawyer ? decodeURIComponent(lawyer) : "",
      modality,
      sizeClass,
      capag,
      judicialRecovery: recovery,
      entries,
      result: r,
      simulation: sim,
      downPaymentPct,
      downPaymentInstalments: downN,
      generalInstalments: generalN,
      socialSecurityInstalments: socialInstalments,
      svgDonut,
      donutLegend: donut,
      svgFlow,
      bases,
      phases: phaseRows(),
      comparables: comp,
    });
    const slug = (name || "client")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, 40);
    const date = new Date().toISOString().slice(0, 10);
    downloadHtml(html, `Settlement-${modality.toUpperCase()}-${slug}-${date}.html`);
  }

  const donut = [
    { name: "Principal", value: r.principal, colour: "var(--s1)" },
    { name: "Default interest", value: r.interest, colour: "var(--s4)" },
    { name: "Fine", value: r.fine, colour: "var(--s7)" },
    { name: "Legal charges", value: r.charges, colour: "var(--s6)" },
  ].filter((d) => d.value > 0);

  const flow = useMemo(() => {
    const months = Math.min(downN + 18, 28);
    return Array.from({ length: months }, (_, i) => ({
      month: `M${i + 1}`,
      "Down payment": i < downN ? sim.downPaymentMonthly : 0,
      General: i >= downN && i < downN + generalN ? sim.generalInstalment : 0,
      "Social security": i >= downN && i < downN + socialInstalments ? sim.socialSecurityInstalment : 0,
    }));
  }, [downN, generalN, socialInstalments, sim]);

  const totalDuration = downN + Math.max(generalN, socialInstalments);
  const monthsTogether = Math.min(generalN, socialInstalments);
  const monthsRest = Math.abs(generalN - socialInstalments);

  function phaseRows(): string[][] {
    const rows: string[][] = [];
    if (downN > 0) {
      rows.push([`Down payment (${downN} monthly)`, `Months 1 to ${downN}`, fmtMoney(sim.downPaymentMonthly, false), "—", "—", fmtMoney(sim.downPaymentMonthly, false)]);
    }
    rows.push([
      "General + social security",
      `Months ${downN + 1} to ${downN + monthsTogether}`,
      "—",
      fmtMoney(sim.generalInstalment, false),
      fmtMoney(sim.socialSecurityInstalment, false),
      fmtMoney(sim.monthlyTotal, false),
    ]);
    if (monthsRest > 0) {
      const onlyGeneral = generalN > socialInstalments;
      rows.push([
        onlyGeneral ? "General only" : "Social security only",
        `Months ${downN + monthsTogether + 1} to ${downN + Math.max(generalN, socialInstalments)}`,
        "—",
        onlyGeneral ? fmtMoney(sim.generalInstalment, false) : "—",
        onlyGeneral ? "—" : fmtMoney(sim.socialSecurityInstalment, false),
        fmtMoney(onlyGeneral ? sim.generalInstalment : sim.socialSecurityInstalment, false),
      ]);
    }
    rows.push([
      "Total paid at the end",
      `${downN > 0 ? `${downN}+` : ""}${Math.max(generalN, socialInstalments)} months`,
      fmtMoney(sim.downPaymentTotal, false),
      fmtMoney(sim.generalBalance, false),
      fmtMoney(sim.socialSecurityBalance, false),
      fmtMoney(r.payable, false),
    ]);
    return rows;
  }

  const discountAlert: Alert | null =
    capag === "AB" && !recovery
      ? { kind: "warn", text: "CAPAG A/B: discounts apply only to CAPAG C or D (art. 8, I with art. 24, Ordinance 6,757/2022)." }
      : !r.withinCap
        ? { kind: "err", text: `Discount of ${fmtPct(r.discountPct, 1)} exceeds the cap of ${effective.capLabel}: adjustment needed.` }
        : r.discount > 0
          ? { kind: "ok", text: `Discount of ${fmtPct(r.discountPct, 1)}: within the cap of ${effective.capLabel}.` }
          : null;

  /* ----- STEP 1: INPUT ----- */

  if (step === "input") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="font-display text-3xl" style={{ color: "var(--ink)" }}>
            Individual settlement simulator
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>
            Step 1 of 2: client and debt data · Law 13,988/2020 · PGFN Ordinance 6,757/2022
          </p>
        </div>

        <Panel title="Client and classification" className="mb-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
                Company / taxpayer name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="[Client name]"
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
                Tax id (CNPJ / CPF)
              </span>
              <input
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--line)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--accent)" }}>
                Modality
              </span>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as Modality)}
                className="w-full rounded-md border px-2 py-2 text-sm font-medium"
                style={{ borderColor: "var(--accent)" }}
              >
                <option value="ti">Individual Settlement (TI)</option>
                <option value="tis">Simplified Individual Settlement (TIS)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
                Size class / category
              </span>
              <select
                value={sizeClass}
                onChange={(e) => setSizeClass(e.target.value as SizeClass)}
                className="w-full rounded-md border px-2 py-2 text-sm"
                style={{ borderColor: "var(--line)" }}
              >
                {Object.entries(SIZE_CLASSES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
                CAPAG-P{recovery ? " (presumed irrecoverable: judicial recovery)" : ""}
              </span>
              <select
                value={capag}
                onChange={(e) => setCapag(e.target.value as Capag)}
                disabled={recovery}
                className="w-full rounded-md border px-2 py-2 text-sm disabled:opacity-50"
                style={{ borderColor: "var(--line)" }}
              >
                <option value="AB">A / B: normal payment</option>
                <option value="C">C: hard to recover</option>
                <option value="D">D: irrecoverable</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm lg:col-span-2" style={{ color: "var(--ink)" }}>
              <input type="checkbox" checked={recovery} onChange={(e) => setRecovery(e.target.checked)} />
              Company under judicial or extrajudicial recovery
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
            {recovery && (
              <span className="rounded-full border px-3 py-1 font-semibold" style={ALERT_STYLE.ok}>
                ✓ Judicial recovery: CAPAG presumed irrecoverable (art. 11, §5, Law 13,988/2020), TI without a minimum
                amount and a term of up to {effective.taxTermMonths} months (art. 10-C, Law 10,522/2002); the size-class
                discount cap is kept: {Math.round(effective.cap * 100)}%
              </span>
            )}
            {sizeRules.art15 ? (
              <span className="rounded-full border px-3 py-1 font-semibold" style={ALERT_STYLE.ok}>
                ✓ Art. 15, §1 applies (item {sizeRules.item}): 70% cap and 145-month term
              </span>
            ) : !recovery ? (
              <span className="rounded-full border px-3 py-1 font-semibold" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                General rule: 65% cap and 120-month term (art. 15, II and III)
              </span>
            ) : null}
          </div>
        </Panel>

        {/* Multi-document dropzone */}
        <Panel title="Import the debt documents (recommended)" className="mb-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files?.length) processFiles([...e.dataTransfer.files]);
            }}
            onClick={() => fileInput.current?.click()}
            role="button"
            className={`dropzone flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center ${dragging ? "dropzone-active" : ""}`}
          >
            <span className="marker" style={{ width: 34, height: 34 }} aria-hidden />
            <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
              Drop the debt documents here, one or several at once
            </p>
            <p className="max-w-xl text-xs" style={{ color: "var(--muted)" }}>
              Accepted: <strong>Regularize / PGFN</strong> (consolidated debt report, PDF or .csv/.xls spreadsheet) and{" "}
              <strong>e-CAC / revenue service</strong> (fiscal proceeding debt · DCTFWeb debt · PGDAS-D debt · fiscal status
              report). Debts repeated across documents are counted once.
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              or{" "}
              <span className="underline" style={{ color: "var(--accent)" }}>
                click to choose the files
              </span>
            </p>
            <p className="max-w-md text-[11px]" style={{ color: "var(--muted)" }}>
              Files are read inside your browser. No client data is sent to or stored on a server.
            </p>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) processFiles([...e.target.files]);
                e.target.value = "";
              }}
            />
          </div>

          {importedDocs.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {importedDocs.map((d) => (
                <li key={d.file} className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                  <span
                    className="mt-0.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold"
                    style={d.origin === "pgfn" ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "#d6c6f5" } : ALERT_STYLE.warn}
                  >
                    {d.origin === "pgfn" ? "PGFN · registered" : "RFB · not registered"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" style={{ color: "var(--ink)" }} title={d.file}>
                      {d.file}
                    </span>
                    <span style={{ color: "var(--muted)" }}>
                      {KIND_LABEL[d.kind]}
                      {d.proceeding ? ` · proc. ${d.proceeding.number}` : ""} · {fmtMoney(d.totalIncluded)}
                      {d.totalSuspended > 0 ? ` (+ ${fmtMoney(d.totalSuspended)} suspended)` : ""}
                    </span>
                  </span>
                  <button
                    onClick={() => removeDocument(d.file)}
                    className="rounded px-1.5 font-bold hover:opacity-70"
                    style={{ color: "#7a1f1f" }}
                    title="Remove this document and recompute"
                    aria-label={`Remove ${d.file}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {importStatus.map((a, i) => (
            <Notice key={i} a={a} />
          ))}
        </Panel>

        <Panel title="Debt amounts: check or fill in manually" className="mb-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--s1)" }}>
            Non-social-security debts (taxes, Simples Nacional, others)
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FIELDS.map((f) => (
              <AmountField key={f.key} label={f.label} value={general[f.key]} onChange={(v) => setGeneral({ ...general, [f.key]: v })} />
            ))}
          </div>
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6b4a00" }}>
            Social security debts{" "}
            <span className="font-normal normal-case" style={{ color: "var(--muted)" }}>
              (max. 60 months: art. 195, §11, Constitution)
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FIELDS.map((f) => (
              <AmountField key={f.key} label={f.label} value={socialSecurity[f.key]} onChange={(v) => setSocialSecurity({ ...socialSecurity, [f.key]: v })} />
            ))}
          </div>
          <div className="mt-3 max-w-56">
            <AmountField label="Number of registrations (total)" value={entries} onChange={setEntries} placeholder="1" />
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
            Amounts use the Brazilian number format (1.234.567,89), as printed in the source documents.
          </p>
          {alerts.map((a, i) => (
            <Notice key={i} a={a} />
          ))}
        </Panel>

        <Panel title="Tax losses and negative CSLL base (arts. 35 to 39)" className="mb-6">
          <label className="flex items-center gap-2 text-sm" style={{ color: offsetAllowed ? "var(--ink)" : "var(--muted)" }}>
            <input type="checkbox" checked={useOffset && offsetAllowed} disabled={!offsetAllowed} onChange={(e) => setUseOffset(e.target.checked)} />
            The client holds tax-loss / negative-base credits available for use
            {!offsetAllowed && (
              <span className="text-xs font-semibold" style={{ color: "#7a1f1f" }}>
                (not allowed in TIS, art. 37, except under judicial recovery)
              </span>
            )}
          </label>
          {useOffset && offsetAllowed && (
            <div className="mt-3 max-w-64">
              <AmountField label="Available credits (BRL)" value={offsetAvailable} onChange={setOffsetAvailable} />
            </div>
          )}
        </Panel>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {r.total === 0 && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Enter the debt amounts (or import a document) to generate the dashboard.
            </span>
          )}
          <button
            onClick={() => {
              setStep("dashboard");
              window.scrollTo({ top: 0 });
            }}
            disabled={r.total === 0}
            className="btn-primary rounded-md px-6 py-3 text-sm font-semibold disabled:opacity-40"
          >
            Generate dashboard →
          </button>
        </div>
      </main>
    );
  }

  /* ----- STEP 2: DASHBOARD ----- */

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl" style={{ color: "var(--ink)" }}>
            {name || "Settlement simulation"}
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>
            {taxId && `${taxId} · `}
            {MODALITIES[modality].label} · {sizeRules.label} · CAPAG-P {capag}
            {recovery && " · judicial recovery"}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <button onClick={() => setStep("input")} className="btn-outline rounded-md px-3 py-2 text-xs font-medium">
            ← Edit data
          </button>
          <button onClick={exportForClient} className="btn-primary rounded-md px-4 py-2 text-xs font-semibold">
            Export for the client (HTML)
          </button>
          <button onClick={() => window.print()} className="btn-outline rounded-md px-3 py-2 text-xs font-medium">
            Print / PDF
          </button>
        </div>
      </div>
      <p className="no-print mb-4">
        <span className="rounded-full border px-3 py-1 text-[11px] font-semibold" style={ALERT_STYLE.warn}>
          Legal rules subject to review by a tax lawyer · estimate, not legal advice
        </span>
      </p>

      {alerts.map((a, i) => (
        <Notice key={i} a={a} />
      ))}
      {useOffset && offsetAllowed && r.taxLossOffset && (
        <div className="mt-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          Tax-loss offset: limit {fmtMoney(r.taxLossOffset.limit, false)} (70% of the balance) · used {fmtMoney(r.taxLossOffset.used, false)}
          {recovery ? " · under recovery it may also amortise the principal (art. 36, sole paragraph)" : " · does not amortise the principal"}
        </div>
      )}

      {/* Benefit hero (print-safe through classes) */}
      <section className="hero card mb-4 mt-4 flex flex-wrap items-stretch gap-6 p-6">
        <div className="min-w-52 flex-1">
          <p className="hero-label flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="marker" aria-hidden />
            Total economic benefit
          </p>
          <p className="hero-num font-display mt-1 text-3xl tabular sm:text-5xl">{fmtMoney(r.discount, false)}</p>
          <p className="mt-1 text-xs">Surcharges removed by the settlement: the amount that stops being charged</p>
          <p className="mt-2 text-xs">
            {r.withinCap ? (
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={ALERT_STYLE.ok}>
                ✓ Within the {Math.round(effective.cap * 100)}% limit for {sizeRules.label.toLowerCase()}
                {recovery ? " under judicial recovery" : ""}
              </span>
            ) : (
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={ALERT_STYLE.err}>
                ⚠ Exceeds the {Math.round(effective.cap * 100)}% limit: adjustment needed
              </span>
            )}
          </p>
        </div>
        <div className="hero-sep hidden w-px sm:block" />
        <div className="flex min-w-32 flex-col items-center justify-center">
          <p className="hero-pct font-display text-4xl tabular sm:text-6xl">{fmtPct(r.discountPct, 1)}</p>
          <p className="hero-label text-[11px]">reduction over the total debt</p>
        </div>
        <div className="hero-sep hidden w-px sm:block" />
        <div className="flex min-w-48 flex-1 flex-col justify-center text-sm">
          <div className="flex justify-between border-b py-1.5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
            <span>Original debt</span>
            <span className="hero-label line-through tabular">{fmtMoney(r.total, false)}</span>
          </div>
          <div className="flex justify-between border-b py-1.5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
            <span>Total discount</span>
            <strong className="hero-pct tabular">− {fmtMoney(r.discount, false)}</strong>
          </div>
          <div className="flex justify-between py-1.5">
            <span>Amount payable</span>
            <strong className="hero-pay tabular">{fmtMoney(r.payable, false)}</strong>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Registered total", value: fmtMoney(r.total), sub: `${entries || "—"} registrations` },
          { label: "Surcharges", value: fmtMoney(r.surcharges), sub: "fine + interest + charges", colour: "#7a1f1f" },
          { label: "Principal payable", value: fmtMoney(r.principal), sub: "untouchable: art. 11, §2, I", colour: "#145c38" },
          { label: "Discount applied", value: fmtPct(r.discountPct, 1), sub: `legal cap: ${Math.round(effective.cap * 100)}%`, colour: "var(--accent)" },
          { label: "Max. general term", value: `${effective.taxTermMonths} months`, sub: effective.termLabel },
          { label: "Max. social-security term", value: "60 months", sub: "art. 195, §11, Constitution" },
        ].map((k) => (
          <div key={k.label} className="card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {k.label}
            </p>
            <p className="mt-1 text-lg font-bold tabular" style={{ color: k.colour ?? "var(--ink)" }}>
              {k.value}
            </p>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              {k.sub}
            </p>
          </div>
        ))}
      </div>

      {/* What the PGFN accepted in similar cases */}
      <CorpusComparables c={comp} simulatedPct={r.discountPct} instalments={generalN} downPaymentPct={downPaymentPct} />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* Composition */}
        <Panel title="Composition of the consolidated debt">
          <div className="chart-donut h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" strokeWidth={2} stroke="#fff">
                  {donut.map((d) => (
                    <Cell key={d.name} fill={d.colour} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [`${fmtMoney(v, false)} (${fmtPct(r.total > 0 ? (v / r.total) * 100 : 0, 1)})`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center gap-2 border-b py-1 text-xs last:border-0" style={{ borderColor: "var(--line)" }}>
                <span className="h-2 w-2 rounded-sm" style={{ background: d.colour }} />
                <span className="flex-1" style={{ color: "var(--ink-2)" }}>
                  {d.name}
                </span>
                <strong className="tabular">{fmtMoney(d.value)}</strong>
                <span className="min-w-11 text-right tabular" style={{ color: "var(--muted)" }}>
                  {fmtPct(r.total > 0 ? (d.value / r.total) * 100 : 0, 1)}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Conditions */}
        <Panel title="Adjust conditions: down payment and instalments">
          <p className="mb-2 border-b pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", borderColor: "var(--line)" }}>
            Down payment
          </p>
          <Slider
            label="Down payment"
            sub="% of the total: art. 11, §1, Law 13,988/2020"
            min={0}
            max={30}
            value={downPaymentPct}
            onChange={setDownPaymentPct}
            output={`${downPaymentPct}% · ${fmtMoney(sim.downPaymentTotal)}`}
          />
          <Slider
            label="Down-payment instalments"
            sub={downPaymentPct === 0 ? "no down payment: the balance starts in month 1" : "no minimum set by Ordinance 6,757/2022"}
            min={1}
            max={24}
            value={downPaymentInstalments}
            disabled={downPaymentPct === 0}
            onChange={setDownPaymentInstalments}
            output={downPaymentPct === 0 ? "—" : `${downPaymentInstalments}x`}
          />
          <p className="mb-2 mt-4 border-b pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", borderColor: "var(--line)" }}>
            Balance instalments
          </p>
          <Slider label="General instalments" sub={`max. ${effective.taxTermMonths} months`} min={6} max={effective.taxTermMonths} value={generalN} onChange={setGeneralInstalments} output={`${generalN}x`} />
          <Slider
            label="Social-security instalments"
            sub="max. 60 months: art. 195, §11, Constitution"
            min={6}
            max={60}
            step={6}
            value={socialInstalments}
            onChange={setSocialInstalments}
            output={`${socialInstalments}x`}
          />
          {discountAlert && <Notice a={discountAlert} />}
          <div className="mt-3 rounded-md border px-4 py-3 text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            {[
              ["Total down payment", fmtMoney(sim.downPaymentTotal, false)],
              ["Each down-payment instalment", `${fmtMoney(sim.downPaymentMonthly, false)}/month`],
              ["General instalment (after the down payment)", `${fmtMoney(sim.generalInstalment, false)}/month`],
              ["Social-security instalment", `${fmtMoney(sim.socialSecurityInstalment, false)}/month`],
            ].map(([a, b]) => (
              <div key={a} className="flex justify-between border-b py-1.5 last:border-0" style={{ borderColor: "var(--line)" }}>
                <span style={{ color: "var(--ink-2)" }}>{a}</span>
                <strong className="tabular">{b}</strong>
              </div>
            ))}
            <div className="flex justify-between pt-2">
              <strong>Monthly total after the down payment</strong>
              <strong className="tabular" style={{ color: "#145c38" }}>
                {fmtMoney(sim.monthlyTotal, false)}/month
              </strong>
            </div>
          </div>
        </Panel>
      </div>

      {/* Monthly flow */}
      <Panel title="Monthly payment flow" className="mb-4">
        <div className="chart-flow h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flow} margin={{ right: 8 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} tickFormatter={(v) => fmtMoney(v)} axisLine={false} tickLine={false} width={70} />
              <Tooltip formatter={(v: number, n: string) => [fmtMoney(v, false), n]} />
              <Bar dataKey="Down payment" stackId="a" fill="var(--s1)" />
              <Bar dataKey="General" stackId="a" fill="var(--s3)" />
              <Bar dataKey="Social security" stackId="a" fill="var(--s7)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-[11px]" style={{ color: "var(--ink-2)" }}>
          {[
            ["var(--s1)", "Down payment"],
            ["var(--s3)", "General principal"],
            ["var(--s7)", "Social-security principal"],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
        <p className="mb-1 mt-4 text-[11px]" style={{ color: "var(--muted)" }}>
          Agreement timeline (proportional): {totalDuration} months
        </p>
        <div className="flex h-6 overflow-hidden rounded" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          {downN > 0 && (
            <div className="flex items-center justify-center text-[10px] font-semibold text-white" style={{ width: `${(downN / totalDuration) * 100}%`, background: "var(--s1)" }}>
              {downN}m
            </div>
          )}
          <div className="flex items-center justify-center text-[10px] font-semibold text-white" style={{ width: `${(monthsTogether / totalDuration) * 100}%`, background: "var(--s3)" }}>
            {monthsTogether}m
          </div>
          {monthsRest > 0 && (
            <div className="flex items-center justify-center text-[10px] font-semibold text-white" style={{ width: `${(monthsRest / totalDuration) * 100}%`, background: "var(--s5)" }}>
              {monthsRest}m
            </div>
          )}
        </div>
      </Panel>

      {/* Phases */}
      <Panel title="Payments by phase" className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ background: "var(--ink)", color: "#fff" }}>
                {["Phase", "Period", "Down payment/month", "General/month", "Social security/month", "Monthly total"].map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {phaseRows().map((row, i, arr) => (
                <tr
                  key={i}
                  className="border-t"
                  style={{
                    borderColor: "var(--line)",
                    background: i === arr.length - 1 ? "var(--accent-soft)" : i % 2 ? "var(--surface-2)" : "var(--surface)",
                    fontWeight: i === arr.length - 1 ? 600 : undefined,
                  }}
                >
                  {row.map((c, j) => (
                    <td key={j} className="px-3 py-2 tabular">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Legal bases */}
      <Panel title="Applicable legal bases">
        <div className="grid gap-2 md:grid-cols-2">
          {bases.map((b) => (
            <div key={b.title} className="border-l-2 pl-3 text-xs leading-relaxed" style={{ borderColor: "var(--accent)", color: "var(--ink-2)" }}>
              <strong className="block" style={{ color: "var(--ink)" }}>
                {b.title}
              </strong>
              {b.text}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "var(--muted)" }}>
          This simulation is an estimate prepared to guide the client. It is not a formal settlement proposal. Final
          conditions are negotiated with the responsible National Treasury Attorney and formalised in the settlement
          term, after the assessment of the CAPAG-P and of the required documentation (arts. 47 to 49, Ordinance
          6,757/2022). Principal instalments are adjusted monthly by the Selic rate plus 1 % in the month of payment
          (art. 12, sole paragraph, Ordinance 6,757/2022).
        </p>
      </Panel>
    </main>
  );
}
