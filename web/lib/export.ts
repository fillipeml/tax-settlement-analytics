/** Builds the self-contained HTML snapshot of a simulation for the lawyer to send to the client.
 *  Everything is assembled in the browser; nothing goes to a server. Charts are the panel's own
 *  SVG, serialised. The scenario is frozen on purpose (no sliders): the lawyer controls what the
 *  client sees. */
import type { Comparables } from "./comparables";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "./format";
import { MODALITIES, SIZE_CLASSES, effectiveRules, type CalculationResult, type Modality, type Simulation, type SizeClass } from "./rules";

export interface ExportData {
  clientName: string;
  taxId: string;
  lawyer: string;
  modality: Modality;
  sizeClass: SizeClass;
  capag: string;
  judicialRecovery: boolean;
  entries: string;
  result: CalculationResult;
  simulation: Simulation;
  downPaymentPct: number;
  downPaymentInstalments: number;
  generalInstalments: number;
  socialSecurityInstalments: number;
  svgDonut: string;
  donutLegend: { name: string; value: number; colour: string }[];
  svgFlow: string;
  bases: { title: string; text: string }[];
  phases: string[][];
  /** Comparables from the PGFN corpus, included in the client material. */
  comparables?: Comparables | null;
}

/** The FL monogram, inline so the file has no external dependency. */
export const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="36" height="36" role="img" aria-label="mark"><rect width="64" height="64" rx="12" fill="#17181C"/><g fill="#FBFAF7"><rect x="13" y="16" width="6" height="32"/><rect x="13" y="16" width="19" height="6"/><rect x="13" y="29" width="15" height="6"/></g><g fill="#6D28D9"><rect x="37" y="16" width="6" height="32"/><rect x="37" y="42" width="15" height="6"/></g></svg>';

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "Similar cases" section of the export: a static version of the comparables panel, with the
 *  same non-probability caveat. */
function comparablesSection(d: ExportData): string {
  const c = d.comparables;
  if (!c || c.n === 0) return "";

  const chips = [
    ["Comparable terms", fmtNum(c.n), "approved agreements"],
    ["Median discount", fmtPct(c.medianDiscount, 1), `${c.withDiscount} with a stated discount`],
    ["Typical range (P25–P75)", c.discountP25 != null && c.discountP75 != null ? `${fmtPct(c.discountP25, 0)}–${fmtPct(c.discountP75, 0)}` : "—", "middle half of the discounts"],
    ["Instalments (median)", fmtNum(c.medianInstalments), c.pctWithGuarantee != null ? `${fmtPct(c.pctWithGuarantee, 0)} with a guarantee` : ""],
  ];

  const bar = (label: string, sub: string, dim: { n: number; pct: number | null }) => {
    if (dim.pct == null) return "";
    const colour = dim.pct >= 60 ? "var(--ok)" : dim.pct >= 30 ? "#c98a00" : "var(--danger)";
    return `<div style="flex:1;min-width:180px">
      <div style="display:flex;justify-content:space-between;font-size:11px"><b style="text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">${label}</b><b style="color:var(--ink)">${fmtPct(dim.pct, 0)}</b></div>
      <div style="height:6px;border-radius:3px;background:var(--bg);margin:4px 0;overflow:hidden"><div style="height:100%;width:${dim.pct}%;border-radius:3px;background:${colour}"></div></div>
      <div style="font-size:10px;color:var(--muted)">${sub} · base: ${dim.n} terms</div>
    </div>`;
  };

  const ad = c.adherence;
  const bandLabel = ad?.band === "high" ? "High adherence" : ad?.band === "medium" ? "Medium adherence" : ad?.band === "low" ? "Low adherence" : "";
  const bandStyle =
    ad?.band === "high"
      ? "background:#e8f5ee;color:#145c38;border:1px solid #a8d8bc"
      : ad?.band === "medium"
        ? "background:#fdf4de;color:#6b4a00;border:1px solid #e8cc88"
        : "background:#fceeee;color:#7a1f1f;border:1px solid #e8b0b0";

  return `
<div class="card">
  <div class="label">What the PGFN has accepted in similar cases: ${esc(c.label)}</div>
  <div class="kpis" style="margin-bottom:12px">
${chips.map(([a, b, s]) => `    <div class="kpi"><small style="text-transform:uppercase;letter-spacing:.08em;font-weight:700">${a}</small><b>${b}</b><small>${s}</small></div>`).join("\n")}
  </div>
  ${
    ad && ad.index != null
      ? `
  <div style="border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--bg)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <b style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2)">Adherence of the scenario to the acceptance pattern</b>
      <span style="border-radius:999px;padding:2px 12px;font-size:11px;font-weight:700;${bandStyle}">${bandLabel} · ${fmtPct(ad.index, 0)}</span>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      ${bar(`Discount ${fmtPct(d.result.discountPct, 1)}`, "of comparables received a discount >= simulated", ad.discount)}
      ${bar(`Term ${d.generalInstalments}x`, "of comparables obtained a term >= simulated", ad.instalments)}
      ${bar(`Down payment ${d.downPaymentPct}%`, "of comparables paid a down payment <= simulated", ad.downPayment)}
    </div>
  </div>`
      : ""
  }
  ${
    c.closest.length
      ? `
  <table style="margin-top:12px">
    <thead><tr><th>Approved agreement closest in amount</th><th>Approval</th><th>Debt</th><th>Discount</th><th>Instalments</th></tr></thead>
    <tbody>
${c.closest.map((t) => `      <tr><td>${esc(t.taxpayer)}</td><td>${fmtDate(t.approval_date)}</td><td>${fmtMoney(t.consolidated_amount)}</td><td style="color:var(--accent);font-weight:600">${fmtPct(t.total_discount_pct, 1)}</td><td>${fmtNum(t.installments)}</td></tr>`).join("\n")}
    </tbody>
  </table>`
      : ""
  }
  <p style="font-size:10px;color:var(--muted);line-height:1.6;margin-top:10px">
    References extracted from the individual settlement terms published by the PGFN (Ordinance 6,757/2022,
    public data), considering agreements in the same debt band and judicial-recovery situation. Adherence
    indicates how much the simulated scenario resembles conditions already accepted by the Attorney in
    comparable cases; <b>it is not a probability of success</b>: the PGFN publishes only the agreements it
    signed, and each negotiation depends on the analysis of the concrete case.
  </p>
</div>`;
}

export function buildExportHtml(d: ExportData): string {
  const today = new Date().toLocaleDateString("en-GB");
  const rules = effectiveRules(d.sizeClass, d.judicialRecovery);
  const kpis = [
    ["Registered total", fmtMoney(d.result.total, false), `${d.entries || "—"} registrations`],
    ["Surcharges", fmtMoney(d.result.surcharges, false), "fine + interest + charges"],
    ["Principal payable", fmtMoney(d.result.principal, false), "untouchable: art. 11, §2, I"],
    ["Discount applied", fmtPct(d.result.discountPct, 1), `legal cap: ${Math.round(rules.cap * 100)}%`],
    ["Simulated general term", `${d.generalInstalments} months`, `max. ${rules.taxTermMonths} months`],
    ["Simulated social-security term", `${d.socialSecurityInstalments} months`, "max. 60: art. 195, §11, Constitution"],
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Settlement simulation: ${esc(d.clientName || "Client")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--ink:#17181c;--ink-2:#4b4e55;--muted:#6b6f76;--bg:#fbfaf7;--line:#e4e3de;--accent:#6d28d9;--accent-strong:#a78bfa;
--ok:#047857;--danger:#b91c1c;--s1:#0a63b0;--s2:#6d28d9;--s3:#008a9e;--s4:#c2185b;--s5:#5c8a38;--s6:#946200;--s7:#64748b;}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--ink);font-size:14px;line-height:1.5;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.display{font-weight:600;letter-spacing:-.01em}
.page{max-width:1200px;margin:0 auto;padding:0 24px 48px}
.top{background:#fff;border-bottom:3px solid var(--ink);padding:20px 0;margin-bottom:20px}
.top-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:20px;margin-bottom:14px}
.label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:10px}
.hero{display:flex;gap:24px;flex-wrap:wrap;align-items:stretch;
  background:linear-gradient(135deg,#17181c 0%,#2a2438 100%);color:#d6d3e0;border:none;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.hero>div{flex:1;min-width:200px}
.hero .label{color:#a9a4bd}
.hero-num{color:#fff}
.hero-pct{color:var(--accent-strong)}
.hero-pay{color:#6ee7b7}
.hero .lin{border-color:rgba(255,255,255,.14)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px 14px}
.kpi b{display:block;font-size:16px;color:var(--ink);margin-top:4px}
.kpi small{color:var(--muted);font-size:10px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:var(--ink);color:#fff;text-align:left;padding:7px 10px;font-size:11px}
td{padding:7px 10px;border-bottom:1px solid var(--line)}
tr:last-child td{background:#f1ebfc;font-weight:600;border-bottom:none}
.basis{border-left:2px solid var(--accent);padding-left:10px;font-size:11px;color:var(--ink-2);margin-bottom:8px}
.basis b{display:block;color:var(--ink)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:640px){.grid2{grid-template-columns:1fr}}
svg{max-width:100%;height:auto}
.leg{display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0;border-bottom:1px solid var(--line)}
.leg:last-child{border-bottom:none}
.leg span:first-child{width:9px;height:9px;border-radius:2px;flex-shrink:0}
.note{font-size:10px;color:var(--muted);line-height:1.6;margin-top:16px}
@media print{body{background:#fff}.card{break-inside:avoid}}
</style>
</head>
<body>
<div class="top"><div class="top-inner">
  <div style="display:flex;align-items:center;gap:12px">${MARK_SVG}<b class="display">Tax Settlement Analytics</b></div>
  <div style="text-align:right">
    <div style="font-weight:700;color:var(--ink)">Tax settlement simulation: ${esc(MODALITIES[d.modality].label)}</div>
    <div style="font-size:11px;color:var(--ink-2)">Law 13,988/2020 · PGFN Ordinance 6,757/2022 · generated on ${today}${d.lawyer ? ` · ${esc(d.lawyer)}` : ""}</div>
  </div>
</div></div>
<div class="page">

<div class="card">
  <div class="label">Taxpayer</div>
  <div class="display" style="font-size:26px;color:var(--ink)">${esc(d.clientName || "Client")}</div>
  <div style="font-size:12px;color:var(--ink-2);margin-top:2px">
    ${esc(d.taxId || "")}${d.taxId ? " · " : ""}${esc(SIZE_CLASSES[d.sizeClass].label)}${d.judicialRecovery ? " · under judicial recovery (CAPAG presumed irrecoverable)" : ` · CAPAG-P ${esc(d.capag)}`}
  </div>
</div>

<div class="card hero">
  <div>
    <div class="label">Total economic benefit</div>
    <div class="display hero-num" style="font-size:44px">${fmtMoney(d.result.discount, false)}</div>
    <div style="font-size:12px;color:#d6d3e0">Surcharges removed by the settlement: the amount that stops being charged</div>
  </div>
  <div style="text-align:center;display:flex;flex-direction:column;justify-content:center;min-width:130px">
    <div class="display hero-pct" style="font-size:52px">${fmtPct(d.result.discountPct, 1)}</div>
    <div class="label" style="font-size:11px">reduction over the total debt</div>
  </div>
  <div style="display:flex;flex-direction:column;justify-content:center;font-size:13px;min-width:200px">
    <div class="lin" style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid"><span>Original debt</span><s class="label">${fmtMoney(d.result.total, false)}</s></div>
    <div class="lin" style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid"><span>Total discount</span><b class="hero-pct">− ${fmtMoney(d.result.discount, false)}</b></div>
    <div style="display:flex;justify-content:space-between;padding:5px 0"><span>Amount payable</span><b class="hero-pay">${fmtMoney(d.result.payable, false)}</b></div>
  </div>
</div>

<div class="kpis">
${kpis.map(([a, b, c]) => `  <div class="kpi"><small style="text-transform:uppercase;letter-spacing:.08em;font-weight:700">${a}</small><b>${b}</b><small>${c}</small></div>`).join("\n")}
</div>

<div class="grid2">
  <div class="card">
    <div class="label">Composition of the consolidated debt</div>
    <div style="display:flex;justify-content:center">${d.svgDonut}</div>
    ${d.donutLegend.map((l) => `<div class="leg"><span style="background:${l.colour}"></span><span style="flex:1;color:var(--ink-2)">${esc(l.name)}</span><b>${fmtMoney(l.value, false)}</b></div>`).join("")}
  </div>
  <div class="card">
    <div class="label">Simulated conditions</div>
    ${[
      ["Down payment", d.downPaymentPct === 0 ? "none: the balance is paid in instalments from month 1" : `${d.downPaymentPct}% · ${fmtMoney(d.simulation.downPaymentTotal, false)} in ${d.downPaymentInstalments}x of ${fmtMoney(d.simulation.downPaymentMonthly, false)}`],
      ["General instalments", `${d.generalInstalments}x of ${fmtMoney(d.simulation.generalInstalment, false)}`],
      ["Social-security instalments", `${d.socialSecurityInstalments}x of ${fmtMoney(d.simulation.socialSecurityInstalment, false)}`],
      ["Monthly total after the down payment", `<b style="color:var(--ok)">${fmtMoney(d.simulation.monthlyTotal, false)}/month</b>`],
    ]
      .map(([a, b]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px"><span style="color:var(--ink-2)">${a}</span><span style="text-align:right">${b}</span></div>`)
      .join("")}
    <p style="font-size:11px;color:var(--muted);margin-top:10px">Balance instalments are adjusted monthly by the Selic rate plus 1 % in the month of payment (art. 12, sole paragraph, Ordinance 6,757/2022).</p>
  </div>
</div>

<div class="card">
  <div class="label">Monthly payment flow</div>
  ${d.svgFlow}
</div>

<div class="card">
  <div class="label">Payments by phase</div>
  <table>
    <thead><tr><th>Phase</th><th>Period</th><th>Down payment/month</th><th>General/month</th><th>Social security/month</th><th>Monthly total</th></tr></thead>
    <tbody>
${d.phases.map((row) => `      <tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n")}
    </tbody>
  </table>
</div>

${comparablesSection(d)}

<div class="card">
  <div class="label">Applicable legal bases</div>
  ${d.bases.map((b) => `<div class="basis"><b>${esc(b.title)}</b>${esc(b.text)}</div>`).join("")}
</div>

<p class="note">
This simulation is an estimate prepared exclusively to guide the taxpayer identified above, based on the data
entered on the date of issue. It is neither a formal settlement proposal nor a guarantee of acceptance by the
PGFN. Final conditions depend on negotiation with the responsible National Treasury Attorney, on the assessment
of the payment capacity (CAPAG-P) and on the required documentation (arts. 47 to 49, PGFN Ordinance 6,757/2022).
</p>
</div>
</body>
</html>`;
}

export function downloadHtml(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
