/**
 * Country / State auto-configuration engine.
 *
 * Config-driven: resolves which components are attached to a template for a
 * given (country, state, company size, employee eligibility). Rules live in
 * the database (CountryRule, StateRule) or a built-in seed set for India.
 * Produces auto-attached components with an auditable `autoReason`.
 */

import type { BlueprintComponent } from "./types";
import type { PayComponent } from "./calc";

export interface AutoConfigContext {
  country: string;
  state?: string | null;
  companyEmployees?: number;
  grossMonthly?: number;
  annualSalary?: number;
  employeeType?: string;
  isFemale?: boolean;
  isDisability?: boolean;
}

export interface ComponentDefinition extends PayComponent {
  defaultNestId?: string;
  autoReasons?: string[];
  apply?: (ctx: AutoConfigContext) => boolean;
  config?: { label?: string };
}

/**
 * Built-in India catalog. This is configuration data (kept here as the seed
 * baseline) — legal thresholds themselves live in TaxRule/CountryRule DB rows.
 * The engine is generic; the catalog can be swapped per country.
 */
export const COMPONENT_CATALOG: ComponentDefinition[] = [
  { id: "basic", label: "Basic Salary", kind: "earning", defaultNestId: "fixed_pay", logic: { type: "fixed", calculationPriority: 1, isBalancing: false } },
  { id: "hra", label: "HRA", kind: "earning", defaultNestId: "fixed_pay", logic: { type: "percentage", sourceField: "basic", pct: 50, calculationPriority: 2 } },
  { id: "conveyance", label: "Conveyance", kind: "earning", defaultNestId: "fixed_pay", logic: { type: "fixed", value: 1600, calculationPriority: 3 } },
  { id: "medical", label: "Medical Allowance", kind: "earning", defaultNestId: "fixed_pay", logic: { type: "fixed", value: 1250, calculationPriority: 4 } },
  { id: "special_allowance", label: "Special Allowance", kind: "earning", defaultNestId: "fixed_pay", logic: { type: "formula", formula: "0", calculationPriority: 99, isBalancing: true } },
  { id: "performance_bonus", label: "Performance Bonus", kind: "earning", defaultNestId: "variable_pay", logic: { type: "fixed", value: 0, calculationPriority: 20 } },
  { id: "overtime", label: "Overtime", kind: "earning", defaultNestId: "variable_pay", logic: { type: "fixed", value: 0, calculationPriority: 21 } },
  { id: "shift_allowance", label: "Shift Allowance", kind: "earning", defaultNestId: "variable_pay", logic: { type: "fixed", value: 0, calculationPriority: 22 } },
  { id: "lta", label: "LTA", kind: "reimbursement", defaultNestId: "benefits", logic: { type: "fixed", value: 0, calculationPriority: 30 } },
  { id: "meal_coupons", label: "Meal Coupons", kind: "reimbursement", defaultNestId: "benefits", logic: { type: "fixed", value: 0, calculationPriority: 31 } },
  { id: "epf_employee", label: "EPF (Employee)", kind: "deduction", defaultNestId: "statutory_deductions", logic: { type: "percentage", sourceField: "basic", pct: 12, calculationPriority: 40 } },
  { id: "esi_employee", label: "ESI (Employee)", kind: "deduction", defaultNestId: "statutory_deductions", logic: { type: "fixed", value: 0, calculationPriority: 41 } },
  { id: "tds", label: "TDS", kind: "deduction", defaultNestId: "statutory_deductions", logic: { type: "fixed", value: 0, calculationPriority: 42 } },
  { id: "professional_tax", label: "Professional Tax", kind: "deduction", defaultNestId: "state_specific", logic: { type: "fixed", value: 200, calculationPriority: 43 }, apply: (c) => c.country === "India" && c.state === "Maharashtra" },
  { id: "lwf", label: "LWF", kind: "deduction", defaultNestId: "state_specific", logic: { type: "fixed", value: 0, calculationPriority: 44 }, apply: (c) => c.state === "Maharashtra" },
  { id: "epf_employer", label: "EPF (Employer)", kind: "employer", defaultNestId: "employer_contributions", logic: { type: "percentage", sourceField: "basic", pct: 13, calculationPriority: 50 }, apply: (c) => (c.companyEmployees ?? 0) >= 20 },
  { id: "esi_employer", label: "ESI (Employer)", kind: "employer", defaultNestId: "employer_contributions", logic: { type: "fixed", value: 0, calculationPriority: 51 } },
  { id: "gratuity", label: "Gratuity", kind: "employer", defaultNestId: "employer_contributions", logic: { type: "formula", formula: "basic * 0.0481", calculationPriority: 52 }, apply: (c) => (c.companyEmployees ?? 0) >= 10 },
  { id: "edli", label: "EDLI", kind: "employer", defaultNestId: "employer_contributions", logic: { type: "fixed", value: 0, calculationPriority: 53 } },
];

/** Pure resolution of which catalog components apply for a context. */
export function resolveApplicableComponents(
  catalog: ComponentDefinition[],
  ctx: AutoConfigContext
): ComponentDefinition[] {
  const seen = new Map<string, ComponentDefinition>();
  for (const c of catalog) {
    const applies = c.apply ? c.apply(ctx) : true;
    // AsiaPay country baseline: most components apply for India
    const countryApplies = ctx.country === "India" ? true : ctx.country === c.id ? true : false;
    if (applies && countryApplies) {
      // deduplicate by id — keep first, merge reasons
      if (!seen.has(c.id)) seen.set(c.id, c);
    }
  }
  return [...seen.values()];
}

export function buildAutoComponents(ctx: AutoConfigContext): BlueprintComponent[] {
  const defs = resolveApplicableComponents(COMPONENT_CATALOG, ctx);
  return defs.map((d, i) => {
    const reasons: string[] = [];
    if (ctx.country === "India") reasons.push("Country: India");
    if (d.apply) {
      if (d.defaultNestId === "state_specific") reasons.push(`State: ${ctx.state ?? "—"}`);
      if (d.id === "epf_employer" || d.id === "gratuity") reasons.push(`Company Employees: ${ctx.companyEmployees ?? "—"}`);
    }
    return {
      id: d.id,
      label: d.config?.label ?? d.label,
      kind: d.kind,
      logic: {
        ...d.logic,
        calculationPriority: d.logic.calculationPriority,
      },
      ui: { x: 20, y: 10 + i * 12, w: 60, h: 5 },
      nestId: d.defaultNestId ?? null,
      displayOrder: i,
      autoAssigned: true,
      autoReason: reasons.join("; ") || "Baseline",
      visible: true,
    };
  });
}