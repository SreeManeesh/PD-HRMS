import { prisma } from "../lib/prisma";
import { reconcileEmployees } from "../modules/payroll/reconciliation.service";
import { getEmployeePayrollSummary } from "../modules/payroll/payroll.service";

async function testRec() {
  console.log("=== CHECKING ALL 4 SCENARIO EMPLOYEES ===");
  const empCodes = ["EMP017", "EMP014", "EMP016", "EMP020"];
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
      grossPayableSalary: sum.data.grossPayableSalary,
      gross: sum.data.gross,
      deductions: sum.data.deductions,
      netPay: sum.data.netPay,
    });
  }
}

testRec()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

