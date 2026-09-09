/**
 * Monthly salary-structure breakdown derived from an annual salary.
 * Mirrors the seed baseline so payroll amounts reconcile with the
 * "Yearly Salary Package" an employee is registered with.
 */
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

export function salaryStructureBreakdown(annualSalary?: number | null): SalaryBreakdown {
  const monthly = Math.max(Number(annualSalary) || 0, 0) / 12;
  const basic = Math.round((monthly * 0.5) / 10) * 10;
  const hra = Math.round((monthly * 0.2) / 10) * 10;
  const conveyance = 400;
  const medical = 250;
  const other = Math.max(0, Math.round((monthly - basic - hra - conveyance - medical) / 10) * 10);
  return {
    basicSalary: basic,
    hra,
    conveyanceAllowance: conveyance,
    medicalAllowance: medical,
    performanceBonus: 0,
    otherAllowances: other,
    providentFund: Math.round((basic * 0.12) / 10) * 10,
    professionalTax: 200,
    incomeTax: Math.round((monthly * 0.05) / 10) * 10,
    healthInsurance: 180,
  };
}

/** Monthly gross produced by an annual salary (annual ÷ 12, rounded). */
export function monthlyGross(annualSalary?: number | null): number {
  const b = salaryStructureBreakdown(annualSalary);
  return b.basicSalary + b.hra + b.conveyanceAllowance + b.medicalAllowance + b.performanceBonus + b.otherAllowances;
}