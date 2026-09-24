"use client";

import { useTerms } from "@/lib/useTerms";

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--ink-2)" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="card min-w-32 px-2 py-1.5 text-sm"
        style={{ color: "var(--ink)" }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Filters() {
  const { filters, setFilter, clear, options, terms } = useTerms();
  const anyActive = Object.values(filters).some(Boolean);

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <Select label="Region" value={filters.region} onChange={(v) => setFilter("region", v)} options={options.regions} />
      <Select label="Year" value={filters.year} onChange={(v) => setFilter("year", v)} options={options.years} />
      <Select label="Sector" value={filters.sector} onChange={(v) => setFilter("sector", v)} options={options.sectors} />
      <Select label="Debt band" value={filters.band} onChange={(v) => setFilter("band", v)} options={options.bands} />
      <Select label="Term kind" value={filters.kind} onChange={(v) => setFilter("kind", v)} options={options.kinds} />
      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--ink-2)" }}>
        Judicial recovery
        <select
          value={filters.recovery}
          onChange={(e) => setFilter("recovery", e.target.value)}
          className="card min-w-32 px-2 py-1.5 text-sm"
          style={{ color: "var(--ink)" }}
        >
          <option value="">All</option>
          <option value="yes">In recovery</option>
          <option value="no">Not in recovery</option>
        </select>
      </label>
      {anyActive && (
        <button onClick={clear} className="btn-primary rounded-md px-3 py-1.5 text-sm font-medium">
          Clear filters
        </button>
      )}
      <span className="ml-auto self-center text-xs" style={{ color: "var(--muted)" }}>
        {terms.length} terms in this cut
      </span>
    </div>
  );
}
