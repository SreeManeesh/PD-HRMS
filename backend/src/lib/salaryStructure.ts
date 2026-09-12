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
  const monthly = Math.max(Number(annualSalary) || 0, 0) / 12;
  const basic = Math.round((monthly * cfg.basicSalaryFactor) / 10) * 10;
  const hra = Math.round((monthly * cfg.hraFactor) / 10) * 10;
  const conveyance = cfg.conveyanceAllowance;
  const medical = cfg.medicalAllowance;
  const other = Math.max(0, Math.round((monthly - basic - hra - conveyance - medical) / 10) * 10);
  return {
    basicSalary: basic,
    hra,
    conveyanceAllowance: conveyance,
    medicalAllowance: medical,
    performanceBonus: 0,
    otherAllowances: other,
    providentFund: Math.round((basic * cfg.providentFundRate) / 10) * 10,
    professionalTax: cfg.professionalTax,
    incomeTax: Math.round((monthly * cfg.incomeTaxRate) / 10) * 10,
    healthInsurance: cfg.healthInsurance,
  };
}

/** Monthly gross produced by an annual salary (annual ÷ 12, rounded). */
export function monthlyGross(annualSalary?: number | null): number {
  const b = salaryStructureBreakdown(annualSalary);
  return b.basicSalary + b.hra + b.conveyanceAllowance + b.medicalAllowance + b.performanceBonus + b.otherAllowances;
}