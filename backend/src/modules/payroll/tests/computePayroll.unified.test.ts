/**
 * Regression tests for the unified-config payroll columns doctrine:
 * Annual/Monthly payroll columns come from PayrollComponentConfig
 * (Earnings / Deductions tabs) + wage rates. Static salary-structure /
 * company-config legs apply ONLY when no component covers them.
 *
 * Exercises computeEmployeePayslip directly — the same function
 * runPayrollForSkillGroup / processPayrollRun call — with injected
 * reconciliation + company config so no DB is needed.
 *
 * Run with: npx tsx src/modules/payroll/tests/computePayroll.unified.test.ts
 */

import assert from "node:assert";
import { computeEmployeePayslip } from "../payroll.service";
import { salaryStructureBreakdown } from "../../../lib/salaryStructure";
import type { EmployeeReconciliation } from "../reconciliation.service";

let passed = 0;
function test(name: string, fn: () => Promise<void> | void) {
  return (async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ✔ ${name}`);
    } catch (e) {
      console.error(`  ✖ ${name}\n    ${(e as Error).message}`);
      process.exitCode = 1;
    }
  })();
}

const MONTH = 9;
const YEAR = 2026;

const cfg = {
  basicSalaryFactor: 0.5,
  hraFactor: 0.2,
  conveyanceAllowance: 400,
  medicalAllowance: 250,
  providentFundRate: 0.12,
  professionalTax: 200,
  incomeTaxRate: 0,
  healthInsurance: 0,
  overtimeMultiplier: 1.5,
  weeklyOffOtMultiplier: 2.0,
  holidayOtMultiplier: 2.0,
  nightOtMultiplier: 2.0,
  weeklyOffWorkedMultiplier: 2.0,
  holidayWorkedMultiplier: 2.0,
  nightShiftAllowance: 100,
  esiGrossCeiling: 21000,
  epfEmployerRate: 0.12,
  esiEmployerRate: 0.0325,
  gratuityRate: 0.0481,
} as any;

const wageRates = [
  { skillCategory: "Skilled", dailyRate: 920, hourlyRate: 115, state: "Maharashtra", locationId: null, contractorId: null },
  { skillCategory: "Skilled", dailyRate: 900, hourlyRate: 112.5, state: "All States (Default)", locationId: null, contractorId: null },
] as any;

function monthlyEmp() {
  return {
    id: "emp-test-1",
    employeeCode: "EMP001",
    annualSalary: 720000,
    skillType: "Skilled",
    salaryType: "Monthly",
    dailyWageRate: null,
    locationId: null,
    contractorId: null,
    dateOfJoining: null,
    dateOfExit: null,
    state: "Maharashtra",
    gender: "M",
  } as any;
}

function monthlyStructure() {
  const b = salaryStructureBreakdown(720000, cfg);
  return { id: "ss-1", ...b, employee: { annualSalary: 720000 } } as any;
}

function fullMonthRecon(): EmployeeReconciliation {
  return {
    employeeId: "emp-test-1",
    employeeCode: "EMP001",
    year: YEAR,
    month: MONTH,
    periodStart: new Date(Date.UTC(YEAR, MONTH - 1, 1)),
    periodEnd: new Date(Date.UTC(YEAR, MONTH, 0)),
    hiredWithinPeriod: false,
    shiftHours: 8,
    summary: {
      workingDays: 26,
      hasAttendanceData: true,
      presentDays: 26,
      halfDays: 0,
      lateDays: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      holidayDays: 0,
      weekendDays: 4,
      weeklyOffWorkedDays: 0,
      holidayWorkedDays: 0,
      nightShiftCount: 0,
      overtimeHours: 0,
      normalOtHours: 0,
      weeklyOffOtHours: 0,
      holidayOtHours: 0,
      nightOtHours: 0,
      payableDays: 26,
    },
    daily: [],
  };
}

const earningConfigs = [
  { code: "HRA", name: "House Rent Allowance (HRA)", kind: "earning", calcType: "percentage", pct: 50, value: null, maxCap: null, sourceField: "ctc", percentageFrom: "Monthly gross", applicableCategory: "ALL", locationId: null, contractorId: null, priority: 2, isActive: true },
  { code: "TRANSPORT_ALLOW", name: "Transport Allowance", kind: "earning", calcType: "fixed", pct: null, value: 1500, maxCap: 1500, sourceField: null, percentageFrom: null, applicableCategory: "ALL", locationId: null, contractorId: null, priority: 3, isActive: true },
  { code: "FOOD_ALLOW", name: "Food Allowance", kind: "earning", calcType: "fixed", pct: null, value: 1000, maxCap: 1000, sourceField: null, percentageFrom: null, applicableCategory: "Skilled", locationId: null, contractorId: null, priority: 4, isActive: true },
] as any;

const deductionConfigs = [
  { code: "EPF", name: "Provident Fund (EPF)", kind: "deduction", calcType: "percentage", pct: 12, value: null, maxCap: 1800, sourceField: "ctc", percentageFrom: "Monthly gross", applicableCategory: "ALL", locationId: null, contractorId: null, priority: 1, isActive: true },
  { code: "ESIC", name: "Employee State Insurance (ESIC)", kind: "deduction", calcType: "percentage", pct: 0.75, value: null, maxCap: null, sourceField: "ctc", percentageFrom: "Monthly gross", applicableCategory: "ALL", locationId: null, contractorId: null, priority: 2, isActive: true },
  { code: "PT", name: "Professional Tax (PT)", kind: "deduction", calcType: "fixed", pct: null, value: 200, maxCap: 200, sourceField: null, percentageFrom: null, applicableCategory: "ALL", locationId: null, contractorId: null, priority: 3, isActive: true },
  { code: "LWF", name: "Labour Welfare Fund (LWF)", kind: "deduction", calcType: "fixed", pct: null, value: 20, maxCap: 20, sourceField: null, percentageFrom: null, applicableCategory: "ALL", locationId: null, contractorId: null, priority: 5, isActive: true },
  { code: "TDS", name: "Income Tax / TDS (Sec 115BAC)", kind: "deduction", calcType: "percentage", pct: 0, value: null, maxCap: null, sourceField: "ctc", percentageFrom: "Annual Taxable Income", applicableCategory: "ALL", locationId: null, contractorId: null, priority: 4, isActive: true },
  { code: "LOP", name: "Loss of Pay (Unpaid Leave)", kind: "deduction", calcType: "percentage", pct: 100, value: null, maxCap: null, sourceField: null, percentageFrom: "Daily Salary Rate", applicableCategory: "ALL", locationId: null, contractorId: null, priority: 7, isActive: true },
  { code: "ADVANCE_RECOVERY", name: "Salary Advance EMI Recovery", kind: "deduction", calcType: "fixed", pct: null, value: 2000, maxCap: null, sourceField: null, percentageFrom: null, applicableCategory: "ALL", locationId: null, contractorId: null, priority: 6, isActive: true },
] as any;

async function main() {
  console.log("\n── Unified-config payroll columns ──");

  await test("Configured run: Basic locked to Maharashtra wage (920×26), no static medical/conveyance, no LOP nuke", async () => {
    const comp = await computeEmployeePayslip(
      monthlyEmp(),
      monthlyStructure(),
      YEAR,
      MONTH,
      fullMonthRecon(),
      cfg,
      null,
      { wageRates, customComponents: [...earningConfigs, ...deductionConfigs], advances: [], productionUnits: 0 } as any,
    );
    // Monthly package 720000/12 = 60000; Basic locked: 920 × 26 statutory days
    assert.equal(Math.round(comp.earnings.basicSalary), 23920);
    // Envelope holds: gross === monthly package (60000 ≥ 23920 + 50% HRA + fixed, so compliant)
    assert.equal(Math.round(comp.earnings.total), 60000);
    // No fabricated static legs
    assert.ok(!("medicalAllowance" in comp.earnings), "static medical leg must be absent");
    assert.ok(!("conveyanceAllowance" in comp.earnings), "static conveyance leg must be absent");
    // Configured allowances present: HRA 50% of 60000, transport/food fixed
    assert.equal((comp.earnings as any).HRA, 30000);
    assert.equal((comp.earnings as any).TRANSPORT_ALLOW, 1500);
    assert.equal((comp.earnings as any).FOOD_ALLOW, 1000);
    // Deductions: configured keys only — no stacked static legs
    const d = comp.deductions as any;
    assert.equal(d.EPF, 1800, "EPF capped at 1800");
    assert.equal(d.ESIC, 450, "ESIC 0.75% of 60000");
    assert.equal(d.PT, 200);
    assert.equal(d.LWF, 20);
    assert.equal(d.ADVANCE_RECOVERY, 2000);
    assert.ok(!("providentFund" in d), "static providentFund must not stack on EPF");
    assert.ok(!("professionalTax" in d), "static professionalTax must not stack on PT");
    assert.ok(!("healthInsurance" in d) || d.healthInsurance === 0, "static ESIC leg must not stack");
    assert.ok(!("incomeTax" in d) || d.incomeTax === 0, "TDS 0% owns incomeTax — no static leg");
    assert.ok(!("LOP" in d), "LOP rule must be skipped (attendance mechanism owns LOP)");
    assert.equal(d.total, 1800 + 450 + 200 + 20 + 2000);
    assert.equal(comp.netPay, 60000 - d.total);
  });

  await test("Legacy run (no components): static config legs preserved (config-only fallback)", async () => {
    const comp = await computeEmployeePayslip(
      monthlyEmp(),
      monthlyStructure(),
      YEAR,
      MONTH,
      fullMonthRecon(),
      cfg,
      null,
      { wageRates, customComponents: [], advances: [], productionUnits: 0 } as any,
    );
    assert.equal(Math.round(comp.earnings.total), 60000);
    assert.ok((comp.earnings as any).medicalAllowance > 0, "legacy medical leg retained");
    const d = comp.deductions as any;
    assert.ok(d.providentFund > 0, "legacy PF retained");
    assert.equal(d.lwf, 20, "legacy Maharashtra LWF retained");
  });

  await test("LOP month with configs: % deductions prorated, net protected", async () => {
    const recon = fullMonthRecon();
    recon.summary.presentDays = 23;
    recon.summary.payableDays = 23;
    recon.summary.unpaidLeaveDays = 3;
    const comp = await computeEmployeePayslip(
      monthlyEmp(),
      monthlyStructure(),
      YEAR,
      MONTH,
      recon,
      cfg,
      null,
      { wageRates, customComponents: [...earningConfigs, ...deductionConfigs], advances: [], productionUnits: 0 } as any,
    );
    // 60000 − 3×(60000/30) = 54000 payable
    assert.equal(Math.round(comp.earnings.total), 54000);
    assert.equal(Math.round(comp.earnings.basicSalary), Math.round(23920 * 0.9));
    const d = comp.deductions as any;
    assert.ok(d.EPF <= 1800, "EPF capped");
    assert.equal(d.ESIC, Math.round(60000 * 0.0075 * 0.9), "ESIC prorated by pay factor");
    assert.ok(comp.netPay >= 0, "net protected");
    assert.equal(comp.netPay, Math.round(comp.earnings.total) - d.total);
  });

  console.log(`\n  ${passed} unified-config tests passed\n`);
}

main();
