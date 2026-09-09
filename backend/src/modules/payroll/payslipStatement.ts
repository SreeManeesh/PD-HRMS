/**
 * Payslip "statement" — the structured, display-only payload consumed by the
 * frontend PayslipTemplate (and reflected in the A4 PDF). All calculation and
 * authorization happens here; the frontend only renders.
 *
 * Shape (mirrors the reusable-template data contract):
 *   { company, employee, payroll }
 */
import { prisma } from "../../lib/prisma";
import { Prisma } from "@prisma/client";
import { AppError } from "../../lib/errors";
import { rupeesInWords } from "../../lib/numberToWords";
import { getEmployeeTaxSelection } from "../payslip/payslip.service";
import { labelForStoredKey } from "./payslipLabels";

const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface Identity {
  employeeCode: string;
  firstName: string;
  lastName: string;
  department?: { name: string } | null;
  designation?: { title: string } | null;
  location?: { name: string; address?: string | null } | null;
  dateOfJoining: Date;
}

export interface StatementAccess {
  role?: string;
  employeeCode?: string;
  isAdminOrHr?: boolean;
}

const EARNINGS_ORDER: Record<string, number> = {
  basicsalary: 1, basic_salary: 1, basic: 1,
  hra: 2,
  conveyanceallowance: 3, conveyance: 3,
  medicalallowance: 4, medical: 4,
  performancebonus: 5, performance_bonus: 5,
  otherallowances: 6, other: 6, special_allowance: 6,
  overtime: 7, ot: 7,
};
const DEDUCTION_ORDER: Record<string, number> = {
  providentfund: 1, pf: 1, epf_employee: 1,
  esi: 2, esi_employee: 2,
  lwf: 3,
  professionaltax: 4, professional_tax: 4, pt: 4,
  incometax: 5, income_tax: 5, tds: 5,
  healthinsurance: 6, health_insurance: 6,
};
const EMPLOYER_ORDER: Record<string, number> = { providentfund: 1, esi: 2, gratuity: 3, edli: 4 };

type RowSpec = { code: string; name: string; amount: number };

export function buildPayrollStatement(slipData: {
  run: { month: number; year: number; status: string; processedOn?: Date | null };
  slip: {
    earnings: unknown;
    deductions: unknown;
    employerContributions: unknown;
    attendanceSummary: unknown;
    netPay?: number | string | Prisma.Decimal | null;
  };
  employee: Identity;
}): {
  company: Record<string, string | null>;
  employee: Record<string, string>;
  payroll: Record<string, unknown>;
} {
  const { run, slip, employee } = slipData;
  const earnings = (slip.earnings as Record<string, number>) || {};
  const deductions = (slip.deductions as Record<string, number>) || {};
  const employer = (slip.employerContributions as Record<string, number>) || {};
  const att = (slip.attendanceSummary as Record<string, unknown>) || {};

  const toRows = (rec: Record<string, number>, order: Record<string, number>, employer = false): RowSpec[] =>
    Object.entries(rec)
      .filter(([k, v]) => k !== "total" && Number(v) > 0)
      .map(([k, v]) => ({
        code: k.toUpperCase(),
        name: labelForStoredKey(k, employer),
        amount: Number(v),
        idx: order[k.toLowerCase()] ?? 999,
      }))
      .sort((a, b) => a.idx - b.idx)
      .map(({ code, name, amount }) => ({ code, name, amount }));

  const earningsRows = toRows(earnings, EARNINGS_ORDER);
  let deductionsRows = toRows(deductions, DEDUCTION_ORDER);
  const employerRows = toRows(employer, EMPLOYER_ORDER, true);

  // Totals are authoritative from the stored slip (they embed the
  // net-protection cap: nothing can be deducted beyond what was earned).
  const earnTotalStored = (earnings as Record<string, number | undefined>)?.total;
  const dedTotalStored = (deductions as Record<string, number | undefined>)?.total;
  const totalEarnings = earnTotalStored !== undefined && earnTotalStored !== null
    ? Math.round(Number(earnTotalStored))
    : Math.round(earningsRows.reduce((s, r) => s + r.amount, 0));
  const totalDeductions = dedTotalStored !== undefined && dedTotalStored !== null
    ? Math.round(Number(dedTotalStored))
    : Math.round(deductionsRows.reduce((s, r) => s + r.amount, 0));
  // When the cap zeroed the withheld total, don't show statutory rows that were
  // never actually deducted (keeps "no fake zero-value rows").
  if (totalDeductions <= 0) deductionsRows = [];
  const netPay = slip.netPay !== undefined && slip.netPay !== null
    ? Math.round(Number(slip.netPay))
    : Math.max(totalEarnings - totalDeductions, 0);
  const totalEmployerContributions = Math.round(employerRows.reduce((s, r) => s + r.amount, 0));

  const monthlyTax = Number(deductions.incomeTax ?? deductions.tds ?? 0);
  const country = "India";

  const company = {
    name: "HRMS",
    website: null,
    tagline: null,
    address: null,
    logoUrl: null,
    signatoryName: null,
    signatoryDesignation: null,
    signatureUrl: null,
  };

  const employeeOut = {
    id: employee.employeeCode,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    department: employee.department?.name ?? "—",
    designation: employee.designation?.title ?? "—",
    location: employee.location
      ? [employee.location.name, employee.location.address].filter(Boolean).join(", ")
      : "—",
    dateOfJoining: `${String(employee.dateOfJoining.getUTCFullYear()).padStart(4, "0")}-${String(employee.dateOfJoining.getUTCMonth() + 1).padStart(2, "0")}-${String(employee.dateOfJoining.getUTCDate()).padStart(2, "0")}`,
    pan: "—",
    taxRegime: "NEW",
  };

  const payroll = {
    month: MONTHS_FULL[run.month - 1],
    year: run.year,
    monthShort: MONTHS_SHORT[run.month - 1],
    periodLabel: `${MONTHS_SHORT[run.month - 1]} ${run.year}`,
    periodFull: `${MONTHS_FULL[run.month - 1].toUpperCase()} ${run.year}`,
    country,
    status: run.status,
    approved: run.status === "Paid",
    generatedOn: run.processedOn ? run.processedOn.toISOString().slice(0, 16).replace("T", " ") : null,
    workingDays: Number(att.workingDays ?? 0),
    presentDays: Number(att.presentDays ?? 0),
    lateDays: Number(att.lateDays ?? 0),
    paidLeaveDays: Number(att.paidLeaveDays ?? 0),
    unpaidLeaveDays: Number(att.unpaidLeaveDays ?? 0),
    lOPDays: Number(att.unpaidLeaveDays ?? 0),
    absentDays: Number(att.unpaidLeaveDays ?? 0),
    overtimeHours: Number(att.overtimeHours ?? 0),
    weeklyOffDays: Number(att.weekendDays ?? 0),
    holidayDays: Number(att.holidayDays ?? 0),
    presentPct: att.ratio !== undefined ? Math.round(Number(att.ratio) * 100) : null,
    earnings: earningsRows,
    deductions: deductionsRows,
    employerContributions: employerRows,
    tax: {
      annualTax: monthlyTax * 12,
      monthlyTax,
    },
    totalEarnings,
    totalDeductions,
    netPay,
    totalEmployerContributions,
    netPayInWords: rupeesInWords(netPay),
    overtimeAmount: Number(earnings.overtime ?? 0),
  };

  return { company, employee: employeeOut, payroll };
}

export async function loadPayslipStatementAssets(id: string) {
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
    include: {
      department: { select: { name: true } },
      designation: { select: { title: true } },
      location: { select: { name: true, address: true } },
    },
  });
  if (!run || !employee) throw AppError.notFound("Payslip not found");
  const slip = await prisma.payslip.findUnique({
    where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: employee.id } },
    select: {
      earnings: true,
      deductions: true,
      employerContributions: true,
      attendanceSummary: true,
      netPay: true,
    },
  });
  if (!slip) throw AppError.notFound("Payslip not found");
  return { run, employee, slip };
}

export async function buildPayslipStatement(id: string, access?: StatementAccess) {
  const { run, employee, slip } = await loadPayslipStatementAssets(id);

  // Employees can only read their own payslip.
  const isAdminOrHr = access?.role === "ADMIN" || access?.role === "HR";
  if (!isAdminOrHr && access?.employeeCode && access.employeeCode !== employee.employeeCode) {
    throw AppError.forbidden("Employees can only view their own payslip");
  }

  const [company, savedRegime] = await Promise.all([
    prisma.company.findFirst({ where: { isActive: true } }),
    getEmployeeTaxSelection(employee.employeeCode, run.year),
  ]);

  const statement = buildPayrollStatement({ run, slip, employee });
  const taxRegime = savedRegime === "OLD" ? "OLD" : savedRegime === "NEW" ? "NEW" : "NEW";
  statement.employee.taxRegime = taxRegime;
  statement.payroll.taxRegime = taxRegime;

  if (company) {
    statement.company = {
      name: company.name ?? "HRMS",
      website: company.website,
      tagline: company.tagline,
      address: company.address,
      logoUrl: company.logoUrl,
      signatoryName: company.signatoryName,
      signatoryDesignation: company.signatoryDesignation,
      signatureUrl: company.signatureUrl,
    };
  }

  return { data: statement };
}