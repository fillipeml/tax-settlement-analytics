/** Rules engine for individual tax settlements (TI / TIS): Law 13,988/2020 and PGFN Ordinance
 *  6,757/2022. Ported from the tax team's spreadsheet template.
 *
 *  DETERMINISTIC on principle: no legal rule goes through an LLM. Legal wording is kept as in
 *  the template and remains subject to formal validation by a tax lawyer before any client use.
 */

export type Modality = "ti" | "tis";
export type SizeClass = "general" | "small" | "charity_hospital" | "cooperative" | "civil_society" | "education";
export type Capag = "AB" | "C" | "D";

export interface Components {
  principal: number;
  fine: number;
  interest: number;
  charges: number;
}

export const ZERO_COMPONENTS: Components = { principal: 0, fine: 0, interest: 0, charges: 0 };

export const MODALITIES: Record<
  Modality,
  {
    label: string;
    thresholdText: string;
    thresholdArticle: string;
    allowsTaxLossOffset: boolean;
    procedure: string;
    formalisation: string;
  }
> = {
  ti: {
    label: "Individual Settlement (TI)",
    thresholdText: "consolidated amount of BRL 10 million or more (federal debts) or BRL 1 million (FGTS)",
    thresholdArticle: "art. 46, caput, Ordinance 6,757/2022",
    allowsTaxLossOffset: true,
    procedure:
      "Formal proposal with full identification, an explanation of the economic and financial causes, a fiscal recovery plan and supporting documents (art. 50, Ordinance 6,757/2022). Additional financial statements may be required and an on-site inspection is possible (arts. 48 and 50, §1).",
    formalisation:
      "Settlement term signed by the National Treasury Attorney together with the Head Attorney for Active Debt (art. 60), with additional signatures escalating by amount (arts. 61 to 63).",
  },
  tis: {
    label: "Simplified Individual Settlement (TIS)",
    thresholdText: "consolidated amount above BRL 1 million and below BRL 10 million (federal debts)",
    thresholdArticle: "art. 46, §1, Ordinance 6,757/2022",
    allowsTaxLossOffset: false,
    procedure:
      "Simplified electronic form through REGULARIZE stating the down payment, term and scheduling, intended discount and guarantees (art. 64, §1, Ordinance 6,757/2022). Automated assessment of the payment capacity by the Attorney (art. 65).",
    formalisation:
      "Approval by the authorities of arts. 60 and following is waived (art. 66, §2). The agreement is formalised by paying the first instalment through a DARF issued by REGULARIZE (art. 66, §5).",
  },
};

export const SIZE_CLASSES: Record<
  SizeClass,
  {
    label: string;
    cap: number;
    taxTermMonths: number;
    termLabel: string;
    art15: boolean;
    item: string | null;
  }
> = {
  general: { label: "Company in general", cap: 0.65, taxTermMonths: 120, termLabel: "120 months (art. 15, II, Ordinance 6,757/2022)", art15: false, item: null },
  small: { label: "Individual / micro or small business", cap: 0.7, taxTermMonths: 145, termLabel: "145 months (art. 15, §1, Ordinance 6,757/2022)", art15: true, item: "I and II" },
  charity_hospital: { label: "Charity hospital (Santa Casa)", cap: 0.7, taxTermMonths: 145, termLabel: "145 months (art. 15, §1, Ordinance 6,757/2022)", art15: true, item: "III" },
  cooperative: { label: "Cooperative society", cap: 0.7, taxTermMonths: 145, termLabel: "145 months (art. 15, §1, Ordinance 6,757/2022)", art15: true, item: "IV" },
  civil_society: { label: "Civil society organisation", cap: 0.7, taxTermMonths: 145, termLabel: "145 months (art. 15, §1, Ordinance 6,757/2022)", art15: true, item: "V" },
  education: { label: "Educational institution", cap: 0.7, taxTermMonths: 145, termLabel: "145 months (art. 15, §1, Ordinance 6,757/2022)", art15: true, item: "VI" },
};

export const CAPAGS: Record<Capag, { description: string; maxDiscount: number }> = {
  AB: { description: "Sufficient payment capacity: instalments without discount (art. 10, Ordinance 6,757/2022). Discounts only for CAPAG C or D.", maxDiscount: 0 },
  C: { description: "CAPAG C: credits hard to recover. Up to 100 % discount on surcharges, limited to the size-class cap (art. 15, Ordinance 6,757/2022).", maxDiscount: 1 },
  D: { description: "CAPAG D: irrecoverable credits. Up to 100 % discount on surcharges, limited to the size-class cap (art. 15, Ordinance 6,757/2022).", maxDiscount: 1 },
};

/** Effective rules of the concrete case: size class combined with judicial recovery
 *  (art. 10-C, Law 10,522/2002, added by Law 14,112/2020).
 *
 *  Reading validated with the head of tax (July 2026): a company in recovery settles "under
 *  Law 13,988" (art. 10-C, caput), so the DISCOUNT CAP STAYS THE SIZE-CLASS ONE (65 % general /
 *  70 % for the §3 list); the "up to 70 %" of art. 10-C, II is the outer cap of the modality,
 *  not a general concession. What recovery changes: CAPAG presumed irrecoverable (art. 11, §5,
 *  Law 13,988), TI without a minimum amount (PGFN guidance) and a term of up to 120 months
 *  (art. 10-C, I; the §3 list keeps 145 "where applicable"). */
export interface EffectiveRules {
  cap: number;
  taxTermMonths: number;
  capLabel: string;
  termLabel: string;
  capagPresumed: boolean;
}

export function effectiveRules(sizeClass: SizeClass, judicialRecovery: boolean): EffectiveRules {
  const base = SIZE_CLASSES[sizeClass];
  if (!judicialRecovery) {
    return {
      cap: base.cap,
      taxTermMonths: base.taxTermMonths,
      capLabel: `${Math.round(base.cap * 100)}% (art. 15, ${base.art15 ? "§1" : "III"}, Ordinance 6,757/2022)`,
      termLabel: base.termLabel,
      capagPresumed: false,
    };
  }
  const taxTermMonths = Math.max(base.taxTermMonths, 120);
  return {
    cap: base.cap, // cap follows the size class: "under Law 13,988" (art. 10-C, caput)
    taxTermMonths,
    capLabel: base.art15
      ? "70% (art. 11, §3, Law 13,988/2020 with art. 10-C, Law 10,522/2002)"
      : "65% (art. 11, §2, II, Law 13,988/2020: size-class cap kept in judicial recovery)",
    termLabel:
      taxTermMonths > 120
        ? "145 months (art. 11, §3, Law 13,988/2020 with art. 10-C, I, Law 10,522/2002)"
        : "120 months (art. 10-C, I, Law 10,522/2002: judicial recovery)",
    capagPresumed: true,
  };
}

export interface LegalBasis {
  title: string;
  text: string;
}

const COMMON_BASES: LegalBasis[] = [
  { title: "Art. 46, caput, Ordinance 6,757/2022", text: "Individual Settlement (TI) available for registered debts with a consolidated amount of BRL 10 million or more." },
  { title: "Art. 11, §2, I, Law 13,988/2020", text: "No reduction of the principal. Discounts apply exclusively to fines, default interest and legal charges." },
  { title: "Arts. 35 to 39, Ordinance 6,757/2022", text: "Exceptional use of tax losses and negative CSLL base, exclusive to TI, limited to 70 % of the remaining balance, at the PGFN's discretion." },
  { title: "Art. 36, sole paragraph and art. 37, sole paragraph, Ordinance 6,757/2022", text: "Under judicial or extrajudicial recovery: tax-loss offset may also amortise the principal, and the prohibition of its use in adhesion modalities and TIS does not apply." },
  { title: "Art. 17, Ordinance 6,757/2022 with art. 195, §11, Federal Constitution", text: "Social security contributions: at most 60 instalments, not extendable." },
  { title: "Art. 61, Ordinance 6,757/2022", text: "Settlement terms of BRL 100 million or more require the additional signature of the Regional Attorney." },
  { title: "Arts. 62 and 63, Ordinance 6,757/2022", text: "Terms of BRL 250 million or more require the signature of the Coordinator-General; BRL 500 million or more, of the Deputy Attorney-General." },
  { title: "Art. 12, sole paragraph, Ordinance 6,757/2022", text: "Instalments of the remaining balance are adjusted monthly by the accumulated Selic rate plus 1 % in the month of payment." },
];

export function legalBases(sizeClass: SizeClass, modality: Modality, judicialRecovery = false): LegalBasis[] {
  const cap = SIZE_CLASSES[sizeClass].cap;
  const specific: LegalBasis =
    sizeClass === "general"
      ? { title: "Art. 11, §2, II, Law 13,988/2020 with art. 15, III, Ordinance 6,757/2022", text: "For companies in general: maximum discount of 65 % of the total amount of each registration." }
      : { title: "Art. 11, §3, Law 13,988/2020 with art. 15, §1, Ordinance 6,757/2022", text: `For ${SIZE_CLASSES[sizeClass].label.toLowerCase()}: maximum discount of ${Math.round(cap * 100)} % of the total amount of each registration.` };
  const term: LegalBasis = {
    title: sizeClass === "general" ? "Art. 15, II, Ordinance 6,757/2022" : "Art. 15, §1, Ordinance 6,757/2022",
    text: `Maximum term of ${SIZE_CLASSES[sizeClass].taxTermMonths} months for non-social-security credits: ${SIZE_CLASSES[sizeClass].label.toLowerCase()}.`,
  };
  let bases = [COMMON_BASES[0], COMMON_BASES[1], specific, ...COMMON_BASES.slice(2, 5), term, ...COMMON_BASES.slice(5)];
  if (modality === "tis") {
    bases = bases.filter((b) => !b.title.includes("Art. 61") && !b.title.includes("Arts. 62 and 63"));
    bases = bases.map((b) =>
      b.title.includes("35 to 39")
        ? { title: "Art. 37, Ordinance 6,757/2022", text: "Tax-loss offset is not allowed in TIS, except for debtors under judicial or extrajudicial recovery (sole paragraph)." }
        : b,
    );
    bases.push({ title: "Art. 66, §2, Ordinance 6,757/2022", text: "Approval by the authorities of arts. 60 and following is waived: direct formalisation by paying the first instalment through a DARF." });
  }
  if (judicialRecovery) {
    bases.unshift(
      {
        title: "Art. 10-C, Law 10,522/2002 (added by Law 14,112/2020)",
        text: "Debtor under judicial recovery: settlement under Law 13,988/2020, with a maximum term of 120 months (the art. 11, §3 list keeps 145, where applicable) and the debtor's size-class discount cap. Individual settlement admitted without a minimum amount (PGFN guidance).",
      },
      {
        title: "Art. 11, §5, Law 13,988/2020",
        text: "Credits owed by companies under judicial recovery, judicial or extrajudicial liquidation or bankruptcy are deemed irrecoverable or hard to recover: the discount is available regardless of the CAPAG rating.",
      },
    );
  }
  return bases;
}

export interface CalculationInput {
  modality: Modality;
  sizeClass: SizeClass;
  capag: Capag;
  judicialRecovery: boolean;
  useTaxLossOffset: boolean;
  taxLossAvailable: number;
  general: Components; // non-social-security debts (taxes, Simples Nacional, others)
  socialSecurity: Components; // social security contributions (60-month cap)
}

export interface CalculationResult {
  total: number;
  totalGeneral: number;
  totalSocialSecurity: number;
  principal: number;
  fine: number;
  interest: number;
  charges: number;
  surcharges: number;
  discount: number;
  discountPct: number; // 0-100
  balanceAfterDiscount: number;
  taxLossOffset: { limit: number; used: number } | null;
  payable: number;
  withinCap: boolean;
}

const sumOf = (c: Components) => c.principal + c.fine + c.interest + c.charges;
const surchargesOf = (c: Components) => c.fine + c.interest + c.charges;

export function calculate(p: CalculationInput): CalculationResult {
  const rules = effectiveRules(p.sizeClass, p.judicialRecovery);
  const cap = rules.cap;
  // Under judicial recovery the credits are presumed irrecoverable: the discount does not depend on the CAPAG
  const factor = p.judicialRecovery ? 1 : CAPAGS[p.capag].maxDiscount;
  const totalGeneral = sumOf(p.general);
  const totalSocialSecurity = sumOf(p.socialSecurity);
  const total = totalGeneral + totalSocialSecurity;
  const discountGeneral = factor > 0 ? Math.min(surchargesOf(p.general) * factor, totalGeneral * cap) : 0;
  const discountSocial = factor > 0 ? Math.min(surchargesOf(p.socialSecurity) * factor, totalSocialSecurity * cap) : 0;
  const discount = discountGeneral + discountSocial;
  const balanceAfterDiscount = total - discount;

  const offsetAllowed = MODALITIES[p.modality].allowsTaxLossOffset || p.judicialRecovery;
  let taxLossOffset: CalculationResult["taxLossOffset"] = null;
  let payable = balanceAfterDiscount;
  if (p.useTaxLossOffset && offsetAllowed) {
    const limit = balanceAfterDiscount * 0.7;
    const used = Math.min(p.taxLossAvailable, limit);
    taxLossOffset = { limit, used };
    payable = balanceAfterDiscount - used;
  }

  const discountPct = total > 0 ? (discount / total) * 100 : 0;
  return {
    total,
    totalGeneral,
    totalSocialSecurity,
    principal: p.general.principal + p.socialSecurity.principal,
    fine: p.general.fine + p.socialSecurity.fine,
    interest: p.general.interest + p.socialSecurity.interest,
    charges: p.general.charges + p.socialSecurity.charges,
    surcharges: surchargesOf(p.general) + surchargesOf(p.socialSecurity),
    discount,
    discountPct,
    balanceAfterDiscount,
    taxLossOffset,
    payable,
    withinCap: discountPct <= cap * 100 + 0.1,
  };
}

export interface Alert {
  kind: "ok" | "warn" | "err";
  text: string;
}

const SIGNATURE_ALERTS = (total: number, useTaxLossOffset: boolean): Alert[] => {
  const alerts: Alert[] = [];
  if (total >= 500_000_000) {
    alerts.push({ kind: "err", text: "Amount of BRL 500 million or more: the settlement term requires the signature of the Deputy Attorney-General for Active Debt Management (art. 63, Ordinance 6,757/2022)." });
  } else if (total >= 250_000_000) {
    alerts.push({ kind: "warn", text: "Amount of BRL 250 million or more: the settlement term requires the additional signature of the Coordinator-General of the Deputy Attorney-General's Office for Active Debt (art. 62, Ordinance 6,757/2022)." });
  } else if (total >= 100_000_000) {
    alerts.push({ kind: "warn", text: "Amount of BRL 100 million or more: the settlement term requires the additional signature of the Regional Attorney (art. 61, Ordinance 6,757/2022)." });
  }
  if (useTaxLossOffset && total < 250_000_000) {
    alerts.push({ kind: "warn", text: "Using tax losses or negative CSLL base to equalise the liability requires the additional signature of the Coordinator-General, regardless of the amount (art. 62, Ordinance 6,757/2022)." });
  }
  return alerts;
};

/** Alerts on modality thresholds and escalating signatures.
 *  Consistency fixed against the template: TI = amount >= BRL 10 million (art. 46, caput). */
export function modalityAlerts(modality: Modality, total: number, useTaxLossOffset: boolean, judicialRecovery = false): Alert[] {
  if (judicialRecovery && modality === "ti") {
    // Debtors in recovery: TI admitted without a minimum amount (PGFN guidance; art. 10-C, Law 10,522/2002)
    return [
      { kind: "ok", text: "Debtor under judicial recovery: individual settlement admitted without a minimum amount (art. 10-C, Law 10,522/2002; PGFN guidance for companies in recovery or bankruptcy)." },
      ...SIGNATURE_ALERTS(total, useTaxLossOffset),
    ];
  }
  if (modality === "tis") {
    if (total <= 1_000_000) {
      return [{ kind: "warn", text: "Consolidated amount of BRL 1 million or less: below the TIS threshold. Only adhesion to a current public notice applies (art. 46, §2, Ordinance 6,757/2022)." }];
    }
    if (total >= 10_000_000) {
      return [{ kind: "err", text: "Consolidated amount of BRL 10 million or more: above the TIS ceiling. The applicable modality is the full Individual Settlement (TI) (art. 46, caput, Ordinance 6,757/2022)." }];
    }
    return [{ kind: "ok", text: "Consolidated amount within the TIS range (between BRL 1 million and BRL 10 million). Approval by higher authorities is waived: direct formalisation through REGULARIZE (art. 66, §2, Ordinance 6,757/2022)." }];
  }
  if (total < 10_000_000) {
    return [{ kind: "warn", text: "Consolidated amount below BRL 10 million: under the TI threshold (art. 46, caput, Ordinance 6,757/2022). The applicable modality is the Simplified Individual Settlement (TIS)." }];
  }
  return [
    { kind: "ok", text: "Consolidated amount within the full Individual Settlement range (BRL 10 million or more)." },
    ...SIGNATURE_ALERTS(total, useTaxLossOffset),
  ];
}

export interface Simulation {
  downPaymentTotal: number;
  downPaymentMonthly: number;
  generalInstalment: number;
  socialSecurityInstalment: number;
  monthlyTotal: number;
  generalBalance: number;
  socialSecurityBalance: number;
}

export function simulate(
  r: CalculationResult,
  p: CalculationInput,
  downPaymentPct: number,
  downPaymentInstalments: number,
  generalInstalments: number,
  socialSecurityInstalments: number,
): Simulation {
  const cap = effectiveRules(p.sizeClass, p.judicialRecovery).cap;
  const factor = p.judicialRecovery ? 1 : CAPAGS[p.capag].maxDiscount;
  const payableGeneral = sumOf(p.general) - (factor > 0 ? Math.min(surchargesOf(p.general) * factor, sumOf(p.general) * cap) : 0);
  const payableSocial = sumOf(p.socialSecurity) - (factor > 0 ? Math.min(surchargesOf(p.socialSecurity) * factor, sumOf(p.socialSecurity) * cap) : 0);
  const base = payableGeneral + payableSocial;

  const downPaymentTotal = r.total * (downPaymentPct / 100);
  const downPaymentMonthly = downPaymentInstalments > 0 ? downPaymentTotal / downPaymentInstalments : downPaymentTotal;
  const generalShare = base > 0 ? payableGeneral / base : 1;
  const generalBalance = Math.max(payableGeneral - downPaymentTotal * generalShare, 0);
  const socialSecurityBalance = Math.max(payableSocial - downPaymentTotal * (1 - generalShare), 0);
  const generalInstalment = generalInstalments > 0 ? generalBalance / generalInstalments : 0;
  const socialSecurityInstalment = socialSecurityInstalments > 0 ? socialSecurityBalance / socialSecurityInstalments : 0;
  return {
    downPaymentTotal,
    downPaymentMonthly,
    generalInstalment,
    socialSecurityInstalment,
    monthlyTotal: generalInstalment + socialSecurityInstalment,
    generalBalance,
    socialSecurityBalance,
  };
}

/** Parses a number written the Brazilian way ("1.234.567,89"). */
export function parseBR(s: string): number {
  return parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;
}

/** Formats a number the Brazilian way, for the input fields that accept that format. */
export function formatBR(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
