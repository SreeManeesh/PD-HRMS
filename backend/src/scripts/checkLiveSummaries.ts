import { prisma } from "../lib/prisma";
import { reconcileEmployees } from "../modules/payroll/reconciliation.service";
import { getEmployeePayrollSummary } from "../modules/payroll/payroll.service";

async function testRec() {
  console.log("=== CHECKING ALL SCENARIO EMPLOYEES VIA getEmployeePayrollSummary ===");
  const empCodes = ["EMP017", "EMP014", "EMP016", "EMP020", "EMP018"];
  for (const code of empCodes) {
    const sum = await getEmployeePayrollSummary(code, 9, 2026);
    console.log(`\n--- ${code} (${sum.data.employeeName}) ---`);
    console.log({
      salaryType: sum.data.salaryType,
      fixedMonthlySalary: sum.data.fixedMonthlySalary,
      dailySalaryRate: sum.data.dailySalaryRate,
      calendarDaysInMonth: sum.data.calendarDaysInMonth,
      presentDays: sum.data.presentDays,
      paidLeaveDays: sum.data.paidLeaveDays,
      lopDays: sum.data.lopDays,
      lopDeduction: sum.data.lopDeduction,
      days: sum.data.days,
      overtimeHours: sum.data.overtimeHours,
      overtime: sum.data.overtime,
      attendanceBonus: sum.data.attendanceBonus,
      nightShiftCount: sum.data.nightShiftCount,
      nightShiftAllowance: sum.data.nightShiftAllowance,
      productionUnits: sum.data.productionUnits,
      productionIncentive: sum.data.productionIncentive,
      grossPayableSalary: sum.data.grossPayableSalary,
      gross: sum.data.gross,
      deductions: sum.data.deductions,
      netPay: sum.data.netPay,
      earnings: sum.data.earnings,
    });
  }

  console.log("\n=== CHECKING BATCH getEmployeePayrollSummaries(9, 2026) ===");
  const { getEmployeePayrollSummaries } = await import("../modules/payroll/payroll.service");
  const batch = await getEmployeePayrollSummaries(9, 2026);
  const targets = batch.data.filter((r: any) => empCodes.includes(r.employeeId));
  for (const r of targets) {
    console.log(`Batch ${r.employeeId} (${r.employeeName}): days=${r.days}, ot=${r.overtime}, attBonus=${r.attendanceBonus}, nightShifts=${r.nightShiftCount}, nightAllow=${r.nightShiftAllowance}, prodUnits=${r.productionUnits}, prodInc=${r.productionIncentive}, grossPayable=${r.grossPayableSalary}`);
  }
}

testRec()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

