export interface Term {
  id: string;
  title: string;
  taxpayer: string;
  region: string;
  approval_date: string;
  consolidated_amount: number | null;
  modality: string;
  total_discount_pct: number | null;
  discounts: {
    fine_pct: number | null;
    interest_pct: number | null;
    charges_pct: number | null;
  };
  installments: number | null;
  down_payment_pct: number | null;
  guarantees: string[];
  judicial_recovery: boolean | null;
  obligations: string[];
  special_clauses: string[];
  sector: string;
  confidence: Record<string, number>;
  source_excerpts: Record<string, string>;
  review_fields: string[];
  source_url: string;
  pdf_url: string | null;
  simulated: boolean;
  mirror_urls?: string[];
}

export interface Dataset {
  updated_at: string;
  total: number;
  contains_simulated: boolean;
  terms: Term[];
}

export const NOT_IDENTIFIED = "Not identified";

export const DEBT_BANDS = [
  { label: "Up to BRL 10M", min: 0, max: 10_000_000 },
  { label: "BRL 10–50M", min: 10_000_000, max: 50_000_000 },
  { label: "BRL 50–100M", min: 50_000_000, max: 100_000_000 },
  { label: "BRL 100–500M", min: 100_000_000, max: 500_000_000 },
  { label: "Above BRL 500M", min: 500_000_000, max: Infinity },
] as const;

export function debtBandOf(amount: number | null): string {
  if (amount == null) return NOT_IDENTIFIED;
  const band = DEBT_BANDS.find((b) => amount >= b.min && amount < b.max);
  return band ? band.label : NOT_IDENTIFIED;
}

export function yearOf(t: Term): string {
  const m = /^(\d{4})/.exec(t.approval_date);
  return m ? m[1] : "N/A";
}
