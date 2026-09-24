/** Selection of comparables from the corpus for the simulator. */
import { adherenceOf, comparables, quantile } from "../lib/comparables.ts";
import type { Term } from "../lib/types.ts";
import { check, done, section } from "./harness.mts";

/** Synthetic term factory with safe defaults. */
let seq = 0;
function term(p: Partial<Term>): Term {
  seq++;
  return {
    id: `t${seq}`,
    title: `Term ${seq}`,
    taxpayer: `Company ${seq}`,
    region: "Region 1",
    approval_date: "2024-01-01",
    consolidated_amount: 20_000_000,
    modality: "Transação Individual",
    total_discount_pct: 50,
    discounts: { fine_pct: null, interest_pct: null, charges_pct: null },
    installments: 100,
    down_payment_pct: null,
    guarantees: [],
    judicial_recovery: false,
    obligations: [],
    special_clauses: [],
    sector: "Manufacturing",
    confidence: {},
    source_excerpts: {},
    review_fields: [],
    source_url: "https://example.invalid",
    pdf_url: null,
    simulated: false,
    ...p,
  } as Term;
}

section("quantile");
check("odd median", quantile([10, 20, 30], 0.5) === 20);
check("even median interpolates", quantile([10, 20], 0.5) === 15);
check("p25 of 5 values", quantile([0, 10, 20, 30, 40], 0.25) === 10);
check("empty list -> null", quantile([], 0.5) === null);

section("exact level: band + recovery with enough base");
// 12 terms in the 10-50M band, not in recovery (discounts 40..62) + noise in another band / in recovery
const corpus1: Term[] = [
  ...Array.from({ length: 12 }, (_, i) => term({ consolidated_amount: 15_000_000 + i * 1_000_000, total_discount_pct: 40 + i * 2, judicial_recovery: false })),
  ...Array.from({ length: 6 }, () => term({ consolidated_amount: 200_000_000, judicial_recovery: true, total_discount_pct: 70 })),
];
const c1 = comparables(corpus1, 20_000_000, false);
check("uses the band+recovery cut", c1.level === "band+recovery");
check("n = 12 (only the right band, not in recovery)", c1.n === 12);
check("median is right (51)", c1.medianDiscount === 51);
check("closest limited to 5", c1.closest.length === 5);
check("closest sorted by proximity in amount", c1.closest[0].consolidated_amount === 20_000_000);

section("relaxation: few in the band -> recovery level; few in recovery -> whole corpus");
const corpus2: Term[] = [
  term({ consolidated_amount: 600_000_000, judicial_recovery: true, total_discount_pct: 68 }),
  ...Array.from({ length: 11 }, (_, i) => term({ consolidated_amount: 5_000_000 + i * 100_000, judicial_recovery: true, total_discount_pct: 60 + (i % 5) })),
];
const c2 = comparables(corpus2, 600_000_000, true); // only 1 in the > 500M band
check("relaxes to 'recovery'", c2.level === "recovery");
check("n = 12 (all in recovery)", c2.n === 12);
const c3 = comparables(corpus2.slice(0, 3), 600_000_000, false); // nobody outside recovery
check("no base outside recovery -> whole corpus", c3.level === "all");
check("whole corpus is the last resort even with n < minimum", c3.n === 3);

section("exclusions: amendments and simulated terms never enter");
const corpus3: Term[] = [
  ...Array.from({ length: 10 }, () => term({ total_discount_pct: 50 })),
  term({ modality: "Transação Individual (3º Termo Aditivo)", total_discount_pct: 99 }),
  term({ title: "Primeiro Termo Aditivo — X", total_discount_pct: 99 }),
  term({ simulated: true, total_discount_pct: 99 }),
];
const c4 = comparables(corpus3, 20_000_000, false);
check("amendments (modality and title) and simulated excluded", c4.n === 10);
check("median not contaminated by the 99 %", c4.medianDiscount === 50);

section("null fields: statistics tolerate missing discount / instalments");
const corpus4: Term[] = [
  ...Array.from({ length: 8 }, () => term({ total_discount_pct: 60, installments: 120 })),
  ...Array.from({ length: 4 }, () => term({ total_discount_pct: null, installments: null, consolidated_amount: null })),
];
const c5 = comparables(corpus4, 20_000_000, false);
check("n counts everyone in the cut", c5.n >= 8);
check("discount denominator = informed only", c5.withDiscount === 8);
check("null amount never enters the closest list", c5.closest.every((x) => x.consolidated_amount != null));

section("adherence: scenario vs acceptance pattern");
// 10 terms: discounts 10,20,...,100 · instalments 12,24,...,120 · down payment 1..10 %
const corpusAd: Term[] = Array.from({ length: 10 }, (_, i) => term({ total_discount_pct: (i + 1) * 10, installments: (i + 1) * 12, down_payment_pct: i + 1 }));
const ad1 = adherenceOf(corpusAd, { discountPct: 55, instalments: 60, downPaymentPct: 5 });
check("discount: 5 of 10 accepted >= 55 %", ad1.discount.pct === 50);
check("instalments: 6 of 10 >= 60", ad1.instalments.pct === 60);
check("down payment: 5 of 10 <= 5 %", ad1.downPayment.pct === 50);
check("index = mean of the 3 dimensions", ad1.index != null && Math.abs(ad1.index - (50 + 60 + 50) / 3) < 1e-9);
check("medium band (30-60)", ad1.band === "medium");

const ad2 = adherenceOf(corpusAd, { discountPct: 5, instalments: 6, downPaymentPct: 20 });
check("conservative scenario -> 100 % in the 3 dimensions", ad2.discount.pct === 100 && ad2.instalments.pct === 100 && ad2.downPayment.pct === 100);
check("high band", ad2.band === "high");

const ad3 = adherenceOf(corpusAd, { discountPct: 99, instalments: 121, downPaymentPct: 0 });
check("aggressive scenario -> low band", ad3.band === "low");

// insufficient base: only 3 terms with a stated down payment
const sparse: Term[] = [...Array.from({ length: 10 }, () => term({ down_payment_pct: null })), ...Array.from({ length: 3 }, () => term({ down_payment_pct: 5 }))];
const ad4 = adherenceOf(sparse, { discountPct: 40, instalments: 60, downPaymentPct: 5 });
check("down payment with n < 8 does not score (pct null)", ad4.downPayment.pct === null && ad4.downPayment.n === 3);
check("index ignores the dimension without base", ad4.index != null && ad4.discount.pct != null);

const ad5 = adherenceOf([], { discountPct: 40, instalments: 60, downPaymentPct: 5 });
check("empty corpus -> null index and band", ad5.index === null && ad5.band === null);

// integration: comparables() with a scenario returns the adherence of the chosen cut
const c6 = comparables(corpus1, 20_000_000, false, undefined, undefined, { discountPct: 50, instalments: 60, downPaymentPct: 5 });
check("comparables() propagates adherence", c6.adherence != null && c6.adherence.discount.n === 12);
check("no scenario -> adherence null", comparables(corpus1, 20_000_000, false).adherence === null);

done();
