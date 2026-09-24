export default function Kpi({
  label,
  value,
  detail,
  highlight = false,
}: {
  label: string;
  value: string;
  detail?: string;
  highlight?: boolean;
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold leading-tight tabular" style={{ color: highlight ? "var(--accent)" : "var(--ink)" }}>
        {value}
      </p>
      {detail && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}
