/**
 * Friendly display labels for stored payslip component keys (earnings,
 * deductions, employer contributions). Kept here so both the statement API
 * and the PDF renderer use identical terminology.
 */

const EARNINGS_LABELS: Record<string, string> = {
  basicSalary: "Basic Salary",
  hra: "HRA",
  conveyanceAllowance: "Conveyance",
  medicalAllowance: "Medical Allowance",
  performanceBonus: "Performance Bonus",
  otherAllowances: "Other Allowances",
  overtime: "Overtime",
};

const DEDUCTION_LABELS: Record<string, string> = {
  providentFund: "Provident Fund",
  professionalTax: "Professional Tax",
  incomeTax: "Income Tax",
  tds: "Income Tax / TDS",
  healthInsurance: "ESI (Employee)",
  esi_employee: "ESI (Employee)",
  lwf: "LWF",
  esi: "ESI (Employee)",
};

const EMPLOYER_LABELS: Record<string, string> = {
  providentFund: "EPF (Employer)",
  esi: "ESI (Employer)",
  gratuity: "Gratuity",
  edli: "EDLI",
};

/** Human-friendly label for a stored payslip component key. */
export function labelForStoredKey(key: string, employer = false): string {
  if (employer) return EMPLOYER_LABELS[key] ?? humanize(key);
  return EARNINGS_LABELS[key] ?? DEDUCTION_LABELS[key] ?? humanize(key);
}

export function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/** Whether a leave-type code represents unpaid leave (LOP). */
export function isUnpaidLeaveCode(code: string): boolean {
  return code.toUpperCase() === "LT07" || /without pay|unpaid|lwp/i.test(code);
}