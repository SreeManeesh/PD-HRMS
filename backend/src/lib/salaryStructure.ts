/**
 * Monthly salary-structure breakdown derived from an annual salary.
 * Mirrors the seed baseline so payroll amounts reconcile with the
 * "Yearly Salary Package" an employee is registered with.
 *
 * Allocation factors/amounts are config-driven: consumers pass the active
 * company config (lib/companyConfig) and the built-in defaults are used when
 * none is supplied, so the system stays deterministic out of the box.
 */
import { COMPANY_CONFIG_DEFAULTS } from "./companyConfig";

export interface SalaryBreakdown {
  basicSalary: number;
  hra: number;
  conveyanceAllowance: number;
  medicalAllowance: number;
  performanceBonus: number;
  otherAllowances: number;
  providentFund: number;
  professionalTax: number;
  incomeTax: number;
  healthInsurance: number;
}

export interface SalaryBreakdownOptions {
  basicSalaryFactor?: number;
  hraFactor?: number;
  conveyanceAllowance?: number;
  medicalAllowance?: number;
  providentFundRate?: number;
  professionalTax?: number;
  incomeTaxRate?: number;
  healthInsurance?: number;
}

export function salaryStructureBreakdown(
  annualSalary?: number | null,
  options?: SalaryBreakdownOptions,
): SalaryBreakdown {
  const cfg = { ...COMPANY_CONFIG_DEFAULTS, ...(options ?? {}) };
  // Rupee-exact split: monthly is rounded ONCE, then basic/hra are rounded to
  // the rupee and `other` absorbs the remainder so that
  // basic+hra+conveyance+medical+bonus+other === monthly EXACTLY.
  // (Previously every leg was rounded to the nearest ₹10, so the parts could
  // sum to monthly±₹5 and annualised figures drifted, e.g. ₹5,00,000 →
  // ₹5,00,040.)
  const monthly = Math.round(Math.max(Number(annualSalary) || 0, 0) / 12);
  const basic = Math.round(monthly * cfg.basicSalaryFactor);
  const hra = Math.round(monthly * cfg.hraFactor);
  const conveyance = Math.round(cfg.conveyanceAllowance);
  const medical = Math.round(cfg.medicalAllowance);
  const other = Math.max(0, monthly - basic - hra - conveyance - medical);
  return {
    basicSalary: basic,
    hra,
    conveyanceAllowance: conveyance,
    medicalAllowance: medical,
    performanceBonus: 0,
    otherAllowances: other,
    providentFund: Math.round(basic * cfg.providentFundRate),
    professionalTax: Math.round(cfg.professionalTax),
    incomeTax: Math.round(monthly * cfg.incomeTaxRate),
    healthInsurance: Math.round(cfg.healthInsurance),
  };
}

/** Monthly gross produced by an annual salary (annual ÷ 12, rounded). */
export function monthlyGross(annualSalary?: number | null): number {
  const b = salaryStructureBreakdown(annualSalary);
  return b.basicSalary + b.hra + b.conveyanceAllowance + b.medicalAllowance + b.performanceBonus + b.otherAllowances;
}