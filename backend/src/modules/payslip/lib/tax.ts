/**
 * Tax engine — config-driven old/new regime calculation.
 *
 * Tax data lives in the DB (TaxRule table) or a built-in baseline, with
 * effective dates + versions. The engine returns a full explainable breakdown.
 * No legal values are buried in the UI.
 */

export interface TaxRuleRow {
  regime: "OLD" | "NEW";
  ruleType: "SLAB" | "EXEMPTION" | "DEDUCTION_LIMIT" | "REBATE" | "CESS" | "SURCHARGE" | "STD_DEDUCTION";
  name: string;
  slabOrder?: number;
  slabMin?: number;
  slabMax?: number;
  rate?: number;
  amount?: number;
  limitValue?: number;
  section?: string;
  formula?: string;
}

export interface TaxInput {
  grossAnnual: number; // taxable gross annual (all taxable earnings)
  employee?: {
    age?: number;
    gender?: string;
    isDisability?: boolean;
  };
  rules: Record<TaxRuleRow["regime"], TaxRuleRow[]>;
  exemptions?: { hra?: number; lta?: number; others?: number }; // for OLD
  deductions?: { section80C?: number; section80D?: number; section24b?: number; professionalTax?: number };
}

export interface TaxBreakdownStatement {
  grossIncome: number;
  exemptions: number;
  deductions: number;
  taxableIncome: number;
  taxBeforeRebate: number;
  rebate: number;
  cess: number;
  surcharge: number;
  annualTax: number;
  monthlyTax: number;
  slabLines: { slab: string; amount: number; rate: number; tax: number }[];
  regime: "OLD" | "NEW";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateTax(
  input: TaxInput,
  regime: "OLD" | "NEW"
): TaxBreakdownStatement {
  const rules = input.rules[regime] || [];
  const slabs = rules
    .filter((r) => r.ruleType === "SLAB")
    .sort((a, b) => (a.slabMin ?? 0) - (b.slabMin ?? 0));
  const cessRule = rules.find((r) => r.ruleType === "CESS");
  const rebateRule = rules.find((r) => r.ruleType === "REBATE");
  const surchargeRule = rules.find((r) => r.ruleType === "SURCHARGE");
  const stdDed = rules.find((r) => r.ruleType === "STD_DEDUCTION");

  let taxable = input.grossAnnual;

  if (regime === "OLD") {
    // Old regime: std deduction 50k (config) + exemptions (HRA/LTA) + deductions (80C etc.)
    const std = stdDed?.amount ?? 50000;
    taxable -= std;
    const ex = input.exemptions?.hra ?? 0;
    taxable -= ex;
    taxable -= input.exemptions?.lta ?? 0;
    taxable -= input.exemptions?.others ?? 0;
    const d80c = Math.min(input.deductions?.section80C ?? 0, limitFor(rules, "DEDUCTION_LIMIT", "80C") ?? 150000);
    const d80d = Math.min(input.deductions?.section80D ?? 0, limitFor(rules, "DEDUCTION_LIMIT", "80D") ?? 25000);
    const d24b = input.deductions?.section24b ?? 0;
    const pt = input.deductions?.professionalTax ?? 0;
    taxable -= d80c + d80d + d24b + pt;
  } else {
    // New regime: only std deduction (config) — no exemptions / 80C
    const std = stdDed?.amount ?? 75000;
    taxable -= std;
  }

  taxable = Math.max(0, taxable);
  let tax = 0;
  const slabLines: { slab: string; amount: number; rate: number; tax: number }[] = [];
  let remaining = taxable;
  for (const s of slabs) {
    const from = s.slabMin ?? 0;
    const to = s.slabMax ?? Infinity;
    const band = Math.max(0, Math.min(remaining, to - from));
    const lineTax = band * ((s.rate ?? 0) / 100);
    tax += lineTax;
    slabLines.push({ slab: `${from}-${to === Infinity ? "∞" : to}`, amount: band, rate: s.rate ?? 0, tax: lineTax });
    remaining -= band;
    if (remaining <= 0) break;
  }

  let taxBeforeRebate = tax;
  let rebate = 0;
  if (rebateRule && taxable <= (rebateRule.slabMax ?? (regime === "NEW" ? 1200000 : 500000))) {
    rebate = Math.min(rebateRule.amount ?? (regime === "NEW" ? 60000 : 12500), tax);
    tax -= rebate;
  }

  let surcharge = 0;
  if (surchargeRule && taxable > (surchargeRule.slabMin ?? 5000000)) {
    surcharge = tax * ((surchargeRule.rate ?? 10) / 100);
  }

  const cess = tax * ((cessRule?.rate ?? 4) / 100);
  const annualTax = tax + cess + surcharge;

  return {
    grossIncome: round2(input.grossAnnual),
    exemptions: regime === "OLD" ? round2((input.exemptions?.hra ?? 0) + (input.exemptions?.lta ?? 0) + (input.exemptions?.others ?? 0)) : 0,
    deductions: round2(input.grossAnnual - taxable - (regime === "OLD" ? round2((input.exemptions?.hra ?? 0) + (input.exemptions?.lta ?? 0) + (input.exemptions?.others ?? 0)) : 0)),
    taxableIncome: round2(taxable),
    taxBeforeRebate: round2(taxBeforeRebate),
    rebate: round2(rebate),
    cess: round2(cess),
    surcharge: round2(surcharge),
    annualTax: round2(annualTax),
    monthlyTax: round2(annualTax / 12),
    slabLines,
    regime,
  };
}

function limitFor(rules: TaxRuleRow[], type: TaxRuleRow["ruleType"], section: string): number | undefined {
  const r = rules.find((x) => x.ruleType === type && x.section === section);
  return r?.limitValue;
}

export function compareRegimes(input: TaxInput): {
  old: TaxBreakdownStatement;
  newTax: TaxBreakdownStatement;
  difference: number;
  recommended: "OLD" | "NEW";
} {
  const old = calculateTax(input, "OLD");
  const newTax = calculateTax(input, "NEW");
  const difference = round2(old.annualTax - newTax.annualTax);
  return { old, newTax, difference, recommended: difference > 0 ? "NEW" : "OLD" };
}

/**
 * Baseline India tax slabs (FY 2025-26 / FY 2026-27 New Tax Regime Section 115BAC)
 * Standard Deduction: ₹75,000 | Sec 87A Rebate: up to ₹12,00,000 taxable income (Net tax Nil)
 */
export const INDIA_TAX_URL_BASELINE: Record<"OLD" | "NEW", TaxRuleRow[]> = {
  OLD: [
    { regime: "OLD", ruleType: "SLAB", name: "0-2.5L", slabOrder: 1, slabMin: 0, slabMax: 250000, rate: 0 },
    { regime: "OLD", ruleType: "SLAB", name: "2.5-5L", slabOrder: 2, slabMin: 250000, slabMax: 500000, rate: 5 },
    { regime: "OLD", ruleType: "SLAB", name: "5-10L", slabOrder: 3, slabMin: 500000, slabMax: 1000000, rate: 20 },
    { regime: "OLD", ruleType: "SLAB", name: ">10L", slabOrder: 4, slabMin: 1000000, rate: 30 },
    { regime: "OLD", ruleType: "STD_DEDUCTION", name: "Standard Deduction", amount: 50000 },
    { regime: "OLD", ruleType: "DEDUCTION_LIMIT", name: "80C", section: "80C", limitValue: 150000 },
    { regime: "OLD", ruleType: "DEDUCTION_LIMIT", name: "80D", section: "80D", limitValue: 25000 },
    { regime: "OLD", ruleType: "REBATE", name: "87A Rebate", slabMax: 500000, amount: 12500 },
    { regime: "OLD", ruleType: "CESS", name: "Health & Edu Cess", rate: 4 },
    { regime: "OLD", ruleType: "SURCHARGE", name: "Surcharge", slabMin: 5000000, rate: 10 },
  ],
  NEW: [
    { regime: "NEW", ruleType: "SLAB", name: "0-4L", slabOrder: 1, slabMin: 0, slabMax: 400000, rate: 0 },
    { regime: "NEW", ruleType: "SLAB", name: "4-8L", slabOrder: 2, slabMin: 400000, slabMax: 800000, rate: 5 },
    { regime: "NEW", ruleType: "SLAB", name: "8-12L", slabOrder: 3, slabMin: 800000, slabMax: 1200000, rate: 10 },
    { regime: "NEW", ruleType: "SLAB", name: "12-16L", slabOrder: 4, slabMin: 1200000, slabMax: 1600000, rate: 15 },
    { regime: "NEW", ruleType: "SLAB", name: "16-20L", slabOrder: 5, slabMin: 1600000, slabMax: 2000000, rate: 20 },
    { regime: "NEW", ruleType: "SLAB", name: "20-24L", slabOrder: 6, slabMin: 2000000, slabMax: 2400000, rate: 25 },
    { regime: "NEW", ruleType: "SLAB", name: ">24L", slabOrder: 7, slabMin: 2400000, rate: 30 },
    { regime: "NEW", ruleType: "STD_DEDUCTION", name: "Standard Deduction", amount: 75000 },
    { regime: "NEW", ruleType: "REBATE", name: "87A Rebate", slabMax: 1200000, amount: 60000 },
    { regime: "NEW", ruleType: "CESS", name: "Health & Edu Cess", rate: 4 },
    { regime: "NEW", ruleType: "SURCHARGE", name: "Surcharge", slabMin: 5000000, rate: 15 },
  ],
};