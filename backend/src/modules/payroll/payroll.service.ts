import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import {
  serializePayrollRunList,
  serializePayslipList,
  runPublicId,
  buildPayslipAmounts,
  periodLabel,
} from "../../serializers/payroll.serializer";
import { countWeekdays, toNumber } from "../../serializers/helpers";
import { generatePayslipPdf } from "./payslip.pdf";

const RUN_INCLUDE = { approvedByEmployee: { select: { employeeCode: true } } };
const SLIP_INCLUDE = {
  employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } }, designation: { select: { title: true } } } },
  payrollRun: true,
};

export async function listPayrollRuns() {
  const runs = await prisma.payrollRun.findMany({
    include: RUN_INCLUDE,
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return { data: serializePayrollRunList(runs) };
}

export async function getPayrollRun(id: string) {
  const parsed = parseRunPublicId(id);
  const run = await prisma.payrollRun.findUnique({
    where: { month_year: { month: parsed.month, year: parsed.year } },
    include: RUN_INCLUDE,
  });
  if (!run) throw AppError.notFound("Payroll run not found");
  return { data: serializePayrollRunList([run])[0] };
}

export async function listPayslips(employeeId?: string) {
  const where = employeeId ? { employee: { employeeCode: employeeId } } : {};
  const slips = await prisma.payslip.findMany({
    where,
    include: SLIP_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return { data: serializePayslipList(slips) };
}

export async function getPayslip(id: string) {
  // Public payslip id format: PS-YYYY-MM-EMPCODE
  const parts = id.split("-");
  if (parts.length < 4 || parts[0] !== "PS" || !/^\d{4}$/.test(parts[1]) || !/^\d{2}$/.test(parts[2])) {
    throw AppError.badRequest("Invalid payslip id");
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const employeeCode = parts.slice(3).join("-");

  const run = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } });
  const employee = await prisma.employee.findUnique({ where: { employeeCode }, select: { id: true } });
  if (!run || !employee) throw AppError.notFound("Payslip not found");

  const slip = await prisma.payslip.findUnique({
    where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: employee.id } },
    include: SLIP_INCLUDE,
  });
  if (!slip) throw AppError.notFound("Payslip not found");
  return { data: serializePayslipList([slip])[0] };
}

/** Load a payslip and render it as a rupee-formatted PDF. */
export async function getPayslipPdf(id: string) {
  const parts = id.split("-");
  if (parts.length < 4 || parts[0] !== "PS" || !/^\d{4}$/.test(parts[1]) || !/^\d{2}$/.test(parts[2])) {
    throw AppError.badRequest("Invalid payslip id");
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const employeeCode = parts.slice(3).join("-");

  const run = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } });
  const employee = await prisma.employee.findUnique({
    where: { employeeCode },
    include: { department: { select: { name: true } }, designation: { select: { title: true } } },
  });
  if (!run || !employee) throw AppError.notFound("Payslip not found");

  const slip = await prisma.payslip.findUnique({
    where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: employee.id } },
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } }, payrollRun: true },
  });
  if (!slip) throw AppError.notFound("Payslip not found");

  const earnings = slip.earnings as Record<string, number>;
  const deductions = slip.deductions as Record<string, number>;
  const gross = Number(earnings?.total ?? 0);
  const netPay = Number(slip.netPay ?? 0);

  const buffer = await generatePayslipPdf({
    companyName: "Proteccio HRMS",
    employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    employeeId: employee.employeeCode,
    department: employee.department?.name,
    designation: employee.designation?.title,
    period: `${periodLabel({ month, year })}`,
    paidOn: slip.paidOn ? slip.paidOn.toISOString().slice(0, 10) : null,
    paymentMode: slip.paymentMode,
    earnings,
    deductions,
    netPay,
    gross,
  });

  return { buffer, filename: `payslip_${employeeCode.toLowerCase()}_${year}-${String(month).padStart(2, "0")}.pdf` };
}

/**
 * Process a payroll run: validate it's in Draft, generate payslips for all
 * active employees from their active salary structure, and move to Processing.
 * High-impact action — requires payroll:write + four-eyes via approve.
 */
export async function processPayrollRun(id: string, actorEmployeeId?: string) {
  const parsed = parseRunPublicId(id);
  const run = await prisma.payrollRun.findUnique({
    where: { month_year: { month: parsed.month, year: parsed.year } },
  });
  if (!run) throw AppError.notFound("Payroll run not found");
  if (run.status !== "Draft") {
    throw AppError.conflict(`Only Draft runs can be processed (current: ${run.status})`);
  }

  const [employees, structures] = await Promise.all([
    prisma.employee.findMany({ where: { status: "Active" }, select: { id: true, employeeCode: true } }),
    prisma.salaryStructure.findMany({
      where: { isActive: true },
      include: { employee: { select: { id: true, status: true } } },
    }),
  ]);

  const activeEmployeeIds = new Set(employees.map((e) => e.id));
  const structureByEmployee = new Map<string, (typeof structures)[number]>();
  for (const s of structures) {
    if (activeEmployeeIds.has(s.employeeId)) structureByEmployee.set(s.employeeId, s);
  }

  let gross = 0;
  let deductions = 0;
  let net = 0;

  const slipData = employees.map((emp) => {
    const structure = structureByEmployee.get(emp.id);
    if (!structure) return null;
    const amounts = buildPayslipAmounts(structure);
    gross += amounts.earnings.total;
    deductions += amounts.deductions.total;
    net += amounts.netPay;
    return {
      employeeId: emp.id,
      salaryStructureId: structure.id,
      earnings: amounts.earnings,
      deductions: amounts.deductions,
      netPay: amounts.netPay,
    };
  });

  const valid = slipData.filter((s): s is NonNullable<typeof s> => s !== null);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
    for (const slip of valid) {
      await tx.payslip.create({
        data: {
          payrollRunId: run.id,
          period: `${run.period}`,
          employeeId: slip.employeeId,
          salaryStructureId: slip.salaryStructureId,
          earnings: slip.earnings,
          deductions: slip.deductions,
          netPay: slip.netPay,
        },
      });
    }
    return tx.payrollRun.update({
      where: { id: run.id },
      data: {
        status: "Processing",
        totalEmployees: valid.length,
        grossPayroll: Math.round(gross),
        totalDeductions: Math.round(deductions),
        netPayroll: Math.round(net),
      },
      include: RUN_INCLUDE,
    });
  });

  writeAuditLog({
    action: "UPDATE",
    entityType: "PayrollRun",
    entityId: run.id,
    actorUserId: actorEmployeeId ?? undefined,
    oldValue: { status: "Draft" },
    newValue: { status: "Processing", totalEmployees: valid.length, grossPayroll: gross, netPayroll: net },
  });

  return {
    data: { id: runPublicId(updated), status: updated.status, startedAt: new Date().toISOString() },
  };
}

/**
 * Approve a processed run (four-eyes / second-person approval). Requires
 * payroll:approve permission — enforced at route level.
 */
export async function approvePayrollRun(id: string, approverEmployeeId: string) {
  const parsed = parseRunPublicId(id);
  const run = await prisma.payrollRun.findUnique({
    where: { month_year: { month: parsed.month, year: parsed.year } },
  });
  if (!run) throw AppError.notFound("Payroll run not found");
  if (run.status !== "Processing") {
    throw AppError.conflict(`Only Processing runs can be approved (current: ${run.status})`);
  }

  const updated = await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      status: "Paid",
      processedOn: new Date(),
      approvedBy: approverEmployeeId,
    },
    include: RUN_INCLUDE,
  });

  await prisma.payslip.updateMany({
    where: { payrollRunId: run.id },
    data: { status: "Paid", paidOn: new Date(), paymentMode: "Bank Transfer" },
  });

  writeAuditLog({
    action: "APPROVE",
    entityType: "PayrollRun",
    entityId: run.id,
    actorUserId: approverEmployeeId ?? undefined,
    oldValue: { status: "Processing" },
    newValue: { status: "Paid" },
  });

  return { data: serializePayrollRunList([updated])[0] };
}

/** Parse a PR-YYYY-MM public id. */
export function parseRunPublicId(id: string): { year: number; month: number } {
  const match = /^PR-(\d{4})-(\d{2})$/.exec(id);
  if (!match) throw AppError.badRequest("Invalid payroll run id — expected PR-YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw AppError.badRequest("Invalid month in payroll run id");
  return { year, month };
}

function isUnpaidLeave(lt: { code: string; name: string }): boolean {
  return lt.code === "LT07" || /without pay|unpaid|lwp/i.test(lt.name);
}

/**
 * Computed per-employee payroll for a month, with salary adjusted for unpaid
 * leave days ("Leave Without Pay") taken in that month. Used by the
 * "Employee Payroll" panel — recalculates gross / deductions / net on the fly.
 */
export async function getEmployeePayrollSummary(employeeCode: string, month: number, year: number) {
  const emp = await prisma.employee.findUnique({
    where: { employeeCode },
    include: {
      salaryStructures: { where: { isActive: true }, orderBy: { effectiveFrom: "desc" }, take: 1 },
    },
  });
  if (!emp) throw AppError.notFound("Employee not found");
  const structure = emp.salaryStructures[0];
  if (!structure) throw AppError.badRequest("No active salary structure for this employee");

  const run = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } });

  const amounts = buildPayslipAmounts(structure);
  const gross = amounts.earnings.total;
  const standardDeductions = amounts.deductions.total;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const workingDays = countWeekdays(monthStart, monthEnd);

  // Approved leaves overlapping the month — only unpaid types reduce pay.
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      employeeId: emp.id,
      status: "Approved",
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
    include: { leaveType: true },
  });

  let leaveDays = 0;
  for (const l of leaves) {
    const st = l.startDate > monthStart ? l.startDate : monthStart;
    const en = l.endDate < monthEnd ? l.endDate : monthEnd;
    if (en < st) continue;
    if (isUnpaidLeave(l.leaveType)) leaveDays += countWeekdays(st, en);
  }

  const leaveDeduction = leaveDays > 0 ? Math.round((gross / workingDays) * leaveDays) : 0;
  const netPay = gross - leaveDeduction - standardDeductions;

  return {
    data: {
      period: periodLabel({ month, year }),
      month,
      year,
      status: run?.status ?? "Not Processed",
      employeeId: emp.employeeCode,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      gross,
      leaveDays,
      workingDays,
      leaveDeduction,
      deductions: {
        providentFund: toNumber(amounts.deductions.providentFund),
        professionalTax: toNumber(amounts.deductions.professionalTax),
        incomeTax: toNumber(amounts.deductions.incomeTax),
        healthInsurance: toNumber(amounts.deductions.healthInsurance),
        leaveDeduction,
        total: standardDeductions + leaveDeduction,
      },
      netPay,
    },
  };
}
