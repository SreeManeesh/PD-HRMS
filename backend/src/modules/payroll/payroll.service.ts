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
import { generatePayslipPdf, resolveComponentValues } from "../payslip/lib/payslip.pdf";
import { computePayroll } from "../payslip/payslip.service";
import type { Blueprint } from "../payslip/lib/types";

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
  const netPay = Number(slip.netPay ?? 0);

  // Use the active Smart Payslip Designer template so the PDF layout, theme,
  // labels and logo always match what the admin configured. Fall back to a
  // minimal built-in blueprint if no template is published yet.
  let template = await prisma.payslipTemplate.findFirst({
    where: { isActive: true, status: "Published" },
    orderBy: { updatedAt: "desc" },
    include: { versions: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1 } },
  });
  let blueprint: Blueprint;
  if (template) {
    blueprint = template.versions[0]?.blueprint as unknown as Blueprint;
  } else {
    blueprint = {
      name: "Default",
      country: "India",
      state: null,
      financialYear: year,
      theme: {
        primaryColor: "#0f766e",
        secondaryColor: "#0d1b2a",
        accentColor: "#0891b2",
        font: "Helvetica",
        pageSize: "A4",
        orientation: "portrait",
        margins: { top: 40, right: 40, bottom: 40, left: 40 },
      },
      nests: [],
      components: fallbackComponents(),
      taxConfig: { defaultRegime: "NEW", employeeChoiceAllowed: true, regimes: ["OLD", "NEW"] },
      settings: { companyName: "Proteccio HRMS" },
    };
  }

  // Build a base context from the employee's active salary structure so the
  // blueprint's components (fixed-from-base, percentage, formula) compute
  // dynamically — exactly like the designer. Stored payslip amounts act as an
  // authoritative override for any component pre-dating the template.
  const structure = await prisma.salaryStructure.findFirst({
    where: { employeeId: employee.id, isActive: true },
    orderBy: { effectiveFrom: "desc" },
  });

  const base: Record<string, number> = {};
  if (structure) {
    base.basic = toNumber(structure.basicSalary);
    base.hra = toNumber(structure.hra);
    base.conveyance = toNumber(structure.conveyanceAllowance);
    base.medical = toNumber(structure.medicalAllowance);
    base.performance_bonus = toNumber(structure.performanceBonus);
    base.other = toNumber(structure.otherAllowances);
    base.provident_fund = toNumber(structure.providentFund);
    base.professional_tax = toNumber(structure.professionalTax);
    base.income_tax = toNumber(structure.incomeTax);
    base.health_insurance = toNumber(structure.healthInsurance);
  }

  // Overlay the actually-paid amounts so the PDF always reflects the approved
  // payslip, even if the salary structure changed since processing. Map each
  // stored key onto the blueprint component ids it corresponds to, so no
  // component (e.g. `tds` for income tax, `epf_employee` for provident fund)
  // is left out.
  const synonyms: Record<string, string[]> = {
    basicSalary: ["basic", "basic_salary"],
    hra: ["hra"],
    conveyanceAllowance: ["conveyance", "conveyance_allowance"],
    medicalAllowance: ["medical", "medical_allowance", "medical_allowances"],
    performanceBonus: ["performance_bonus"],
    otherAllowances: ["other", "other_allowances", "special_allowance"],
    providentFund: ["provident_fund", "epf_employee", "pf"],
    professionalTax: ["professional_tax", "pt"],
    incomeTax: ["income_tax", "tds"],
    healthInsurance: ["health_insurance", "esi_employee"],
  };
  // stored key -> normalized base key (used when no blueprint component matches)
  const baseKey: Record<string, string> = {
    basicSalary: "basic",
    hra: "hra",
    conveyanceAllowance: "conveyance",
    medicalAllowance: "medical",
    performanceBonus: "performance_bonus",
    otherAllowances: "other",
    providentFund: "provident_fund",
    professionalTax: "professional_tax",
    incomeTax: "income_tax",
    healthInsurance: "health_insurance",
  };
  const overlay = (rec: Record<string, number>) => {
    for (const [k, v] of Object.entries(rec)) {
      if (k === "total") continue;
      const value = Number(v);
      // Seed any blueprint component whose id matches a synonym for this key.
      const ids = synonyms[k];
      if (ids) {
        for (const c of blueprint.components) {
          if (ids.includes(c.id.toLowerCase())) base[c.id.toLowerCase()] = value;
        }
      }
      // Also keep the normalized base key for formulas/percentages referencing it.
      base[baseKey[k] ?? k] = value;
      base[k] = value;
    }
  };
  overlay(earnings);
  overlay(deductions);

  // Compute through the engine so blueprint components (with business logic,
  // thresholds, balancing) resolve dynamically from the base above.
  const computed = blueprint.components.length ? computePayroll(blueprint, base, {}) : null;
  const rows = resolveComponentValues(blueprint as Blueprint, (computed?.results ?? {}) as Record<string, { final: number }>);

  const earningsRows = [...rows.earnings];
  const deductionsRows = [...rows.deductions];
  const employerRows = [...rows.employer];

  const grossTotal = computed
    ? Math.round(computed.earningsTotal)
    : Math.round(earningsRows.reduce((s, e) => s + e.amount, 0));
  const deductionsTotal = computed
    ? Math.round(computed.deductionsTotal)
    : Math.round(deductionsRows.reduce((s, d) => s + d.amount, 0));
  const net = computed ? Math.round(computed.net) : Math.round(netPay);

  const buffer = await generatePayslipPdf(blueprint, {
    employee: {
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      employeeId: employee.employeeCode,
      department: employee.department?.name ?? "—",
      designation: employee.designation?.title ?? "—",
      period: periodLabel({ month, year }),
      companyName: blueprint.settings?.companyName ?? "Proteccio HRMS",
    },
    payroll: { gross: grossTotal, net },
    earnings: earningsRows,
    deductions: deductionsRows,
    employer: employerRows,
  });

  return { buffer, filename: `payslip_${employeeCode.toLowerCase()}_${year}-${String(month).padStart(2, "0")}.pdf` };
}

const FALLBACK_UI = { x: 0, y: 0, w: 60, h: 24 };

function fallbackComponents() {
  const defs: [string, string, "earning" | "deduction", number][] = [
    ["basic", "Basic Salary", "earning", 1],
    ["hra", "HRA", "earning", 2],
    ["conveyance", "Conveyance", "earning", 3],
    ["medical", "Medical Allowance", "earning", 4],
    ["performance_bonus", "Performance Bonus", "earning", 5],
    ["other_allowances", "Other Allowances", "earning", 6],
    ["provident_fund", "Provident Fund", "deduction", 40],
    ["professional_tax", "Professional Tax", "deduction", 41],
    ["income_tax", "Income Tax", "deduction", 42],
    ["health_insurance", "Health Insurance", "deduction", 43],
  ];
  return defs.map(([id, label, kind, calculationPriority]) => ({
    id,
    label,
    kind,
    logic: { type: "fixed" as const, value: 0, calculationPriority },
    ui: { ...FALLBACK_UI },
  }));
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
