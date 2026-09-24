"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = { fill: "var(--ink-2)", fontSize: 11 };
const GRID = "var(--grid)";

function TooltipBox({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  formatter: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold" style={{ color: "var(--ink)" }}>
        {label}
      </p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: "var(--ink)" }}>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: p.color ?? "var(--s1)" }} />
          {formatter(p.value)}
        </p>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  children,
  height = 280,
}: {
  title: string;
  children: React.ReactElement;
  height?: number;
}) {
  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </h2>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export interface BarPoint {
  label: string;
  value: number;
  highlight?: boolean;
}

/** Bars: magnitude in a single hue; the accent is reserved for the one highlighted point. */
export function Bars({
  data,
  formatter,
  horizontal = false,
  height,
  title,
}: {
  data: BarPoint[];
  formatter: (v: number) => string;
  horizontal?: boolean;
  height?: number;
  title: string;
}) {
  const chart = horizontal ? (
    <BarChart data={data} layout="vertical" margin={{ left: 24, right: 16 }}>
      <CartesianGrid horizontal={false} stroke={GRID} />
      <XAxis type="number" tick={AXIS} tickFormatter={formatter} axisLine={false} tickLine={false} />
      <YAxis
        type="category"
        dataKey="label"
        tick={AXIS}
        width={160}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v: string) => (v.length > 26 ? v.slice(0, 25) + "…" : v)}
      />
      <Tooltip content={<TooltipBox formatter={formatter} />} cursor={{ fill: "rgba(23,24,28,0.05)" }} />
      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
        {data.map((d) => (
          <Cell key={d.label} fill={d.highlight ? "var(--s2)" : "var(--s1)"} />
        ))}
      </Bar>
    </BarChart>
  ) : (
    <BarChart data={data} margin={{ right: 8 }}>
      <CartesianGrid vertical={false} stroke={GRID} />
      <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
      <YAxis tick={AXIS} tickFormatter={formatter} axisLine={false} tickLine={false} width={56} />
      <Tooltip content={<TooltipBox formatter={formatter} />} cursor={{ fill: "rgba(23,24,28,0.05)" }} />
      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
        {data.map((d) => (
          <Cell key={d.label} fill={d.highlight ? "var(--s2)" : "var(--s1)"} />
        ))}
      </Bar>
    </BarChart>
  );
  return (
    <ChartCard title={title} height={height}>
      {chart}
    </ChartCard>
  );
}

/** Time series: a single line, no legend (the title names the series). */
export function LineSeries({
  data,
  formatter,
  title,
}: {
  data: { label: string; value: number }[];
  formatter: (v: number) => string;
  title: string;
}) {
  return (
    <ChartCard title={title}>
      <LineChart data={data} margin={{ right: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} tickFormatter={formatter} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<TooltipBox formatter={formatter} />} />
        <Line type="monotone" dataKey="value" stroke="var(--s1)" strokeWidth={2} dot={{ r: 3, fill: "var(--s1)" }} activeDot={{ r: 5 }} />
      </LineChart>
    </ChartCard>
  );
}
