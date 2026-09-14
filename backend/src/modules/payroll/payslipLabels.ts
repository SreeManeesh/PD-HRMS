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
  attendanceAllowance: "Attendance Allowance",
  attendance_allowance: "Attendance Allowance",
  attendanceBonus: "Attendance Bonus",
  attendance_bonus: "Attendance Bonus",
  ATT_BONUS: "Attendance Bonus",
  NIGHT_ALLOW: "Night Shift Allowance",
  PROD_INC: "Production Incentive",
  FOOD_ALLOW: "Food Allowance",
  TRANSPORT_ALLOW: "Transport Allowance",
  uniformAllowance: "Uniform Allowance",
  uniform_allowance: "Uniform Allowance",
  shiftAllowance: "Shift Allowance",
  shift_allowance: "Shift Allowance",
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
  canteenDeduction: "Canteen Deduction",
  canteen_deduction: "Canteen Deduction",
  safetyGearDeduction: "Safety Gear Deduction",
  safety_gear_deduction: "Safety Gear Deduction",
  labourWelfareFund: "Labour Welfare Fund",
  labour_welfare_fund: "Labour Welfare Fund",
  transportDeduction: "Transport Deduction",
  transport_deduction: "Transport Deduction",
  salaryAdvanceRecovery: "Salary Advance Recovery",
  advanceRecovery: "Salary Advance Recovery",
  advance_recovery: "Salary Advance Recovery",
  lossOfPay: "Loss of Pay (LOP)",
  lop: "Loss of Pay (LOP)",
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
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (s) => s.toUpperCase())
    .trim();
}

/** Whether a leave-type code represents unpaid leave (LOP). */
export function isUnpaidLeaveCode(code: string): boolean {
  return code.toUpperCase() === "LT07" || /without pay|unpaid|lwp/i.test(code);
}