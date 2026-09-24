/** Full validation of the TI/TIS rules engine.
 *  Every scenario was computed by hand from the legislation: Law 13,988/2020 (art. 11), PGFN
 *  Ordinance 6,757/2022 (arts. 8, 15, 17, 24, 35-39, 46, 61-63), Law 10,522/2002 art. 10-C
 *  (judicial recovery) and the Constitution, art. 195, §11. */
import { calculate, effectiveRules, modalityAlerts, parseBR, simulate, type CalculationInput, type Components } from "../lib/rules.ts";
import { check, done, near, section } from "./harness.mts";

const comp = (principal: number, fine: number, interest: number, charges: number): Components => ({ principal, fine, interest, charges });
const ZERO = comp(0, 0, 0, 0);

function params(p: Partial<CalculationInput>): CalculationInput {
  return {
    modality: "ti",
    sizeClass: "general",
    capag: "D",
    judicialRecovery: false,
    useTaxLossOffset: false,
    taxLossAvailable: 0,
    general: ZERO,
    socialSecurity: ZERO,
    ...p,
  };
}

section("1. discount: cap by size class and CAPAG (art. 15 Ordinance with art. 11 Law 13,988)");
{
  // General/D: surcharges 60 of total 100 -> full discount of the surcharges (60 < cap 65)
  const r = calculate(params({ general: comp(40, 25, 30, 5) }));
  check("general D, surcharges below the cap: discount = surcharges (60)", near(r.discount, 60) && near(r.discountPct, 60));
  // General/D: surcharges 80 of total 100 -> capped at 65 % of the total
  const r2 = calculate(params({ general: comp(20, 30, 40, 10) }));
  check("general D, surcharges above the cap: discount capped at 65", near(r2.discount, 65) && r2.withinCap);
  check("principal untouchable: payable = 100 - 65 = 35", near(r2.payable, 35));
  // Small business: 70 % cap
  const r3 = calculate(params({ sizeClass: "small", general: comp(20, 30, 40, 10) }));
  check("small business D: cap rises to 70 (art. 15, §1)", near(r3.discount, 70));
  // CAPAG A/B: no discount
  const r4 = calculate(params({ capag: "AB", general: comp(20, 30, 40, 10) }));
  check("CAPAG A/B: zero discount (art. 8, I with art. 24)", near(r4.discount, 0) && near(r4.payable, 100));
  // CAPAG C = D
  const r5 = calculate(params({ capag: "C", general: comp(20, 30, 40, 10) }));
  check("CAPAG C: same treatment as D", near(r5.discount, 65));
}

section("2. independent groups (general vs social security)");
{
  // General: total 100, surcharges 80 -> cap 65. Social: total 50, surcharges 10 -> 10 (< 35 cap)
  const r = calculate(params({ general: comp(20, 40, 30, 10), socialSecurity: comp(40, 4, 5, 1) }));
  check("caps applied per group: 65 + 10 = 75", near(r.discount, 75));
  check("pct over the combined total: 75/150 = 50 %", near(r.discountPct, 50));
  check("withinCap evaluates the whole (50 % <= 65 %)", r.withinCap);
}

section("3. judicial recovery (art. 10-C, Law 10,522/2002 with Law 13,988/2020)");
{
  const ef = effectiveRules("general", true);
  check("general in recovery: cap KEPT at 65 % (art. 11, §2, II: 'under Law 13,988')", near(ef.cap, 0.65));
  check("general in recovery: 120-month term", ef.taxTermMonths === 120);
  const efSmall = effectiveRules("small", true);
  check("small business in recovery: keeps 145 months (art. 10-C, I with art. 11, §3)", efSmall.taxTermMonths === 145);
  check("small business in recovery: 70 % cap (§3 list)", near(efSmall.cap, 0.7));
  // CAPAG presumed irrecoverable (art. 11, §5, Law 13,988): discount even with A/B
  const r = calculate(params({ judicialRecovery: true, capag: "AB", general: comp(20, 30, 40, 10) }));
  check("recovery + CAPAG A/B: discount unlocked, capped at the size-class cap (65)", near(r.discount, 65));
  const noRecovery = effectiveRules("general", false);
  check("without recovery: general rule intact (65 % / 120 months)", near(noRecovery.cap, 0.65) && noRecovery.taxTermMonths === 120);
}

section("4. tax-loss offset (arts. 35 to 39, Ordinance 6,757/2022)");
{
  // TI, balance after discount 35 -> 70 % limit = 24.5; available 100 -> uses 24.5
  const r = calculate(params({ useTaxLossOffset: true, taxLossAvailable: 100, general: comp(20, 30, 40, 10) }));
  check("limit of 70 % of the remaining balance", r.taxLossOffset !== null && near(r.taxLossOffset.limit, 24.5));
  check("uses the minimum between available and limit", r.taxLossOffset !== null && near(r.taxLossOffset.used, 24.5));
  check("final payable = 35 - 24.5 = 10.5", near(r.payable, 10.5));
  // available lower than the limit
  const r2 = calculate(params({ useTaxLossOffset: true, taxLossAvailable: 10, general: comp(20, 30, 40, 10) }));
  check("available < limit: uses the available", r2.taxLossOffset !== null && near(r2.taxLossOffset.used, 10) && near(r2.payable, 25));
  // TIS without recovery: forbidden (art. 37)
  const r3 = calculate(params({ modality: "tis", useTaxLossOffset: true, taxLossAvailable: 100, general: comp(20, 30, 40, 10) }));
  check("TIS without recovery: offset ignored (art. 37)", r3.taxLossOffset === null && near(r3.payable, 35));
  // TIS with recovery: allowed (art. 37, sole paragraph)
  const r4 = calculate(params({ modality: "tis", judicialRecovery: true, useTaxLossOffset: true, taxLossAvailable: 100, general: comp(20, 30, 40, 10) }));
  check("TIS in recovery: offset allowed (art. 37, sole paragraph)", r4.taxLossOffset !== null);
}

section("5. payment simulation (down payment + instalments)");
{
  const p = params({ general: comp(20, 30, 40, 10) }); // total 100, payable 35
  const r = calculate(p);
  const s = simulate(r, p, 10, 10, 100, 60); // down payment 10 % = 10, in 10x
  check("down payment = 10 % of the consolidated total", near(s.downPaymentTotal, 10));
  check("down-payment instalment = 1/month", near(s.downPaymentMonthly, 1));
  check("general balance = 35 - 10 = 25 (everything general)", near(s.generalBalance, 25));
  check("general instalment = 25/100 = 0.25", near(s.generalInstalment, 0.25));
  check("conservation: down payment + balances = payable", near(s.downPaymentTotal + s.generalBalance + s.socialSecurityBalance, r.payable));
  // proportional split between general and social security
  const p2 = params({ general: comp(20, 30, 40, 10), socialSecurity: comp(40, 4, 5, 1) }); // payable: general 35 + social 40 = 75
  const r2 = calculate(p2);
  const s2 = simulate(r2, p2, 10, 10, 120, 60); // down payment 15 (10 % of 150)
  check("split: generalBalance = 35 - 15 * (35/75) = 28", near(s2.generalBalance, 28));
  check("split: socialSecurityBalance = 40 - 15 * (40/75) = 32", near(s2.socialSecurityBalance, 32));
  check("conservation with two groups", near(s2.downPaymentTotal + s2.generalBalance + s2.socialSecurityBalance, r2.payable));
  // edge: down payment larger than the payable balance (high discount)
  const p3 = params({ sizeClass: "small", general: comp(10, 40, 40, 10) }); // total 100, discount 70, payable 30
  const r3 = calculate(p3);
  const s3 = simulate(r3, p3, 30, 12, 100, 60); // down payment 30 = payable 30
  check("edge: down payment consumes the balance, instalments go to zero", near(s3.generalInstalment, 0) && near(s3.generalBalance, 0));
}

section("6. modality alerts and signatures (arts. 46 and 61-63)");
{
  const kinds = (m: "ti" | "tis", total: number, offset = false, recovery = false) => modalityAlerts(m, total, offset, recovery).map((a) => a.kind).join(",");
  check("TI below the threshold (9.99M) -> warn", kinds("ti", 9_999_999) === "warn");
  check("TI at the exact threshold (10M) -> ok", kinds("ti", 10_000_000) === "ok");
  check("TI 100M -> ok + warn regional signature (art. 61)", kinds("ti", 100_000_000) === "ok,warn");
  check("TI 250M -> ok + warn Coordinator-General (art. 62)", kinds("ti", 250_000_000) === "ok,warn");
  check("TI 500M -> ok + err Deputy Attorney-General (art. 63)", kinds("ti", 500_000_000) === "ok,err");
  check("TI 50M with offset -> warn signature (art. 62)", kinds("ti", 50_000_000, true) === "ok,warn");
  check("TIS below 1M -> warn (adhesion only)", kinds("tis", 1_000_000) === "warn");
  check("TIS in range (5M) -> ok", kinds("tis", 5_000_000) === "ok");
  check("TIS above 10M -> err (TI applies)", kinds("tis", 10_000_000) === "err");
  check("TI in recovery, 2M -> ok (no threshold, art. 10-C)", kinds("ti", 2_000_000, false, true) === "ok");
  check("TI in recovery, 300M -> ok + warn signature kept", kinds("ti", 300_000_000, false, true) === "ok,warn");
}

section("7. parseBR (Brazilian number format)");
{
  check("1.234.567,89", near(parseBR("1.234.567,89"), 1234567.89));
  check("0,00", near(parseBR("0,00"), 0));
  check("garbage becomes 0", near(parseBR("abc"), 0));
}

done();
