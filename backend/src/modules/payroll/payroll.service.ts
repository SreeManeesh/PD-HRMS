import { prisma } from "../../lib/prisma";
import { Prisma, type SalaryStructure } from "@prisma/client";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import minioClient, { MINIO_BUCKET } from "../../config/minio";
import {
  serializePayrollRunList,
  serializePayslipList,
  runPublicId,
  buildPayslipAmounts,
  periodLabel,
} from "../../serializers/payroll.serializer";
import { round2, toNumber } from "../../serializers/helpers";
import { generatePayslipPdf, buildSections, type ComponentRow } from "../payslip/lib/payslip.pdf";
import { computePayroll } from "../payslip/payslip.service";
import type { Blueprint, BlueprintComponent } from "../payslip/lib/types";
import { reconcileEmployee } from "./reconciliation.service";
import { buildPayslipStatement, loadPayslipStatementAssets } from "./payslipStatement";

const RUN_INCLUDE = { approvedByEmployee: { select: { employeeCode: true } } };
const SLIP_INCLUDE = {
  employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } }, designation: { select: { title: true } } } },
  payrollRun: true,
};

/** Overtime compensating factor: time-and-a-half of the basic hourly rate. */
const OT_MULTIPLIER = 1.5;

// Statutory employer-side rates (aligned with the designer's country catalog).
const EPF_EMPLOYER_RATE = 0.13; // 12% EPF+EPS + 0.5% EDLI + admin charges
const ESI_EMPLOYER_RATE = 0.0325; // 3.25% of gross wages (ESI-eligible salaried)
const GRATUITY_RATE = 0.0481; // 4.81% of basic per month (Payment of Gratuity Act)
const ESI_GROSS_CEILING = 21000; // monthly gross wages ceiling for ESI coverage

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

  // Build the PDF rows from the STORED (approved) payslip amounts — they are
  // authoritative and reflect exactly what was paid after LOP/OT proration.
  // The blueprint contributes labels + display order + theme so the export
  // stays dynamic per project while never drifting from the paid slip.
  const synonyms: Record<string, string[]> = {
    basicSalary: ["basic", "basic_salary"],
    hra: ["hra"],
    conveyanceAllowance: ["conveyance", "conveyance_allowance"],
    medicalAllowance: ["medical", "medical_allowance", "medical_allowances"],
    performanceBonus: ["performance_bonus"],
    otherAllowances: ["other", "other_allowances", "special_allowance"],
    overtime: ["overtime", "ot"],
    providentFund: ["provident_fund", "epf_employee", "pf"],
    professionalTax: ["professional_tax", "pt"],
    incomeTax: ["income_tax", "tds"],
    healthInsurance: ["health_insurance", "esi_employee"],
  };

  // ── Authoritative amount per blueprint component ──
  // Stored (approved) slip values win for every component they map to; any
  // designer-added component not present on the slip resolves through the
  // calculation engine over the stored base, so the export always reflects
  // what was actually paid while still showing the designer's full component
  // set, labels and nesting groups.
  const mergedStored = { ...(earnings as Record<string, number>), ...(deductions as Record<string, number>) };
  const valueById: Record<string, number> = {};
  for (const [storedKey, ids] of Object.entries(synonyms)) {
    const v = Number(mergedStored[storedKey]);
    if (!isFinite(v)) continue;
    for (const id of ids) valueById[id.toLowerCase()] = v;
  }
  const employerStore = (slip.employerContributions ?? {}) as Record<string, number>;
  const employerIds: Record<string, string> = { epf_employer: "providentFund", esi_employer: "esi", gratuity: "gratuity" };
  for (const [id, key] of Object.entries(employerIds)) {
    const v = Number(employerStore[key]);
    if (isFinite(v) && v > 0) valueById[id.toLowerCase()] = v;
  }
  for (const c of blueprint.components) {
    const id = c.id.toLowerCase();
    if (valueById[id] === undefined) {
      const direct = Number(mergedStored[id]);
      if (isFinite(direct)) valueById[id] = direct;
    }
  }

  const engineBase: Record<string, number> = {};
  for (const c of blueprint.components) {
    const v = valueById[c.id.toLowerCase()];
    if (v !== undefined) engineBase[c.id.toLowerCase()] = v;
  }
  // Strip literals on fixed components that have a stored override so the
  // stored amount always wins over the blueprint's frozen value.
  const calcComponents = blueprint.components.map((c) => {
    if (c.logic?.type === "fixed" && valueById[c.id.toLowerCase()] !== undefined) {
      return { ...c, logic: { ...c.logic, value: undefined } };
    }
    return c;
  });
  const computed = calcComponents.length
    ? computePayroll({ ...blueprint, components: calcComponents }, engineBase, {})
    : null;
  const amountFor = (c: BlueprintComponent): number => {
    const v = valueById[c.id.toLowerCase()];
    if (v !== undefined) return v;
    return computed?.results?.[c.id.toLowerCase()]?.final ?? 0;
  };

  const compRows: ComponentRow[] = blueprint.components
    .filter((c) => c.visible !== false)
    .map((c) => ({
      label: c.label,
      amount: amountFor(c),
      kind: c.kind,
      nestId: c.nestId ?? null,
      priority: c.logic.calculationPriority ?? 999,
    }));
  const sections = buildSections(blueprint, compRows);

  // ── Summary rows (stored-driven so totals match the approved slip) ──
  const earningsRows = compRows
    .filter((r) => (r.kind === "earning" || r.kind === "reimbursement") && r.amount > 0)
    .sort((a, b) => a.priority - b.priority)
    .map(({ label, amount }) => ({ label, amount }));
  let deductionsRows = compRows
    .filter((r) => r.kind === "deduction" && r.amount > 0)
    .sort((a, b) => a.priority - b.priority)
    .map(({ label, amount }) => ({ label, amount }));

  // Stored totals are authoritative (they embed the net-protection cap: when
  // the computed deductions exceed earnings, the withheld total is floored to
  // the earned amount). When the itemized lines no longer reconcile with the
  // stored total (capped), collapse them to a single total line so the PDF
  // never over-states what was actually withheld.
  const storedDedTotal = Number(deductions.total ?? 0);
  const lineSum = deductionsRows.reduce((s, d) => s + d.amount, 0);
  if (storedDedTotal <= 0) {
    // Full net-protection cap — nothing was withheld (e.g. a zero-pay month).
    deductionsRows = [];
  } else if (Math.abs(lineSum - storedDedTotal) > 0.5) {
    // Partial cap — per-line allocation no longer reconciles; show total only.
    deductionsRows = [{ label: "Total Deductions", amount: storedDedTotal }];
  }

  // Employer-side costs: persisted contribution amounts (authoritative).
  const employerRows = Object.entries(employerStore)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => ({ label: employerLabel(blueprint, k), amount: Number(v) }));

  const grossTotal = Math.round(Number(earnings.total ?? 0) || earningsRows.reduce((s, e) => s + e.amount, 0));
  const deductionsTotal = Math.round(storedDedTotal || deductionsRows.reduce((s, d) => s + d.amount, 0));
  const net = Math.round(Number(slip.netPay) || Math.max(grossTotal - deductionsTotal, 0));

  // Attendance summary from the reconciliation stored on the slip (Step 2/4).
  const att = (slip.attendanceSummary ?? {}) as Record<string, unknown>;
  const attendanceRows =
    slip.attendanceSummary && Object.keys(slip.attendanceSummary as object).length
      ? [
          { label: "Working Days", value: String(att.workingDays ?? 0) },
          { label: "Present Days", value: String(att.presentDays ?? 0) },
          { label: "Late Days", value: String(att.lateDays ?? 0) },
          { label: "Paid Leave Days", value: String(att.paidLeaveDays ?? 0) },
          { label: "Unpaid (LOP) Days", value: String(att.unpaidLeaveDays ?? 0) },
          { label: "Overtime Hours", value: String(att.overtimeHours ?? 0) },
          { label: "Attendance %", value: att.ratio !== undefined ? `${Math.round(Number(att.ratio) * 100)}%` : "—" },
        ]
      : undefined;

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
    attendance: attendanceRows,
    sections,
  });

  return { buffer, filename: `payslip_${employeeCode.toLowerCase()}_${year}-${String(month).padStart(2, "0")}.pdf` };
}

/** Load a stored company asset (logo/signature) as a data URI for PDF embedding.
 *  Uses a presigned MinIO URL + HTTP fetch (fast, avoids stream backpressure).
 *  SVGs are returned null (pdfkit can't rasterize them); raster types embed. */
async function fetchStoredImageDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const match = /^\/uploads\/company\/(logo|signature)\/([^/]+)$/.exec(url);
  if (!match) return null;
  const objectName = `company/${match[1]}/${match[2]}`;
  try {
    const stat = await minioClient.statObject(MINIO_BUCKET, objectName);
    const contentType = stat.metaData?.["content-type"] ?? "";
    if (!contentType.startsWith("image/") || contentType.includes("svg")) return null;
    const signedUrl = await minioClient.presignedGetObject(MINIO_BUCKET, objectName);
    const resp = await fetch(signedUrl);
    if (!resp.ok) return null;
    const bytes = Buffer.from(await resp.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function defaultReferenceBlueprint(): Blueprint {
  return {
    name: "Payslip",
    country: "India",
    state: null,
    financialYear: new Date().getFullYear(),
    theme: {
      primaryColor: "#16a34a",
      secondaryColor: "#1f2937",
      accentColor: "#16a34a",
      font: "Helvetica",
      pageSize: "A4",
      orientation: "portrait",
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
    },
    nests: [],
    components: [],
    taxConfig: { defaultRegime: "NEW", employeeChoiceAllowed: true, regimes: ["OLD", "NEW"] },
    settings: { companyName: "HRMS" },
  };
}

interface StatementPayroll {
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  netPayInWords: string;
  periodLabel: string;
  periodFull: string;
  country: string;
  taxRegime: string;
  tax: { annualTax: number; monthlyTax: number };
  workingDays: number;
  presentDays: number;
  lateDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  holidayDays: number;
  weeklyOffDays: number;
  overtimeHours: number;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  employerContributions: { name: string; amount: number }[];
}

/** Production payslip PDF — reference corporate A4 layout, brand-driven. */
export async function getReferencePayslipPdf(id: string, access?: { role?: string; employeeCode?: string }) {
  const { run, employee } = await loadPayslipStatementAssets(id);
  const statement = (await buildPayslipStatement(id, access)).data;
  const p = statement.payroll as unknown as StatementPayroll;
  const company = statement.company;

  const [logoData, sigData] = await Promise.all([
    fetchStoredImageDataUri(company.logoUrl),
    fetchStoredImageDataUri(company.signatureUrl),
  ]);

  const buffer = await generatePayslipPdf(defaultReferenceBlueprint(), {
    employee: {
      name: statement.employee.name,
      employeeId: statement.employee.id,
      department: statement.employee.department,
      designation: statement.employee.designation,
      period: p.periodLabel,
      location: statement.employee.location,
      taxRegime: p.taxRegime,
      pan: statement.employee.pan,
      dateOfJoining: statement.employee.dateOfJoining,
    },
    payroll: { gross: p.totalEarnings, net: p.netPay },
    earnings: p.earnings.map((r) => ({ label: r.name, amount: r.amount })),
    deductions: p.deductions.map((r) => ({ label: r.name, amount: r.amount })),
    employer: p.employerContributions.map((r) => ({ label: r.name, amount: r.amount })),
    tax: { regime: p.taxRegime, annualTax: p.tax.annualTax, monthlyTax: p.tax.monthlyTax },
    company: {
      name: company.name ?? "HRMS",
      tagline: company.tagline ?? undefined,
      website: company.website ?? undefined,
      address: company.address ?? undefined,
      logoDataUri: logoData ?? undefined,
      signatoryName: company.signatoryName ?? undefined,
      signatoryDesignation: company.signatoryDesignation ?? undefined,
      signatureDataUri: sigData ?? undefined,
    },
    generatedOn: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    netInWords: p.netPayInWords,
    payPeriodLabel: p.periodFull,
    countryLabel: p.country,
    attNumbers: {
      workingDays: p.workingDays,
      presentDays: p.presentDays,
      lateDays: p.lateDays,
      paidLeaveDays: p.paidLeaveDays,
      unpaidLeaveDays: p.unpaidLeaveDays,
      holidayDays: p.holidayDays,
      weeklyOffDays: p.weeklyOffDays,
      overtimeHours: p.overtimeHours,
    },
  });

  return {
    buffer,
    filename: `payslip_${employee.employeeCode.toLowerCase()}_${run.year}-${String(run.month).padStart(2, "0")}.pdf`,
  };
}

/** Map a stored employer-contribution key onto a blueprint employer component
 *  label so the PDF section matches the designer's terminology. */
function employerLabel(blueprint: Blueprint, key: string): string {
  const hint: Record<string, string> = {
    providentFund: "epf_employer",
    esi: "esi_employer",
    gratuity: "gratuity",
  };
  const fallback: Record<string, string> = {
    providentFund: "EPF (Employer)",
    esi: "ESI (Employer)",
    gratuity: "Gratuity",
  };
  const target = hint[key];
  const comp = target ? blueprint.components.find((c) => c.id.toLowerCase() === target) : undefined;
  return comp?.label ?? fallback[key] ?? key;
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
    ["overtime", "Overtime", "earning", 7],
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
 * Single source of truth for computing one employee's monthly payslip from
 * their salary structure + attendance reconciliation. Used by BOTH payroll
 * processing (persists the slip) and the "Employee Payroll" preview panel
 * (recalcs on the fly) so the two never drift apart.
 */
async function computeEmployeePayslip(
  employee: { id: string },
  structure: {
    id: string;
    basicSalary: unknown; hra: unknown; conveyanceAllowance: unknown; medicalAllowance: unknown;
    performanceBonus: unknown; otherAllowances: unknown; providentFund: unknown; professionalTax: unknown;
    incomeTax: unknown; healthInsurance: unknown;
    employee?: { annualSalary?: unknown } | null;
  },
  year: number,
  month: number,
) {
  const amounts = buildPayslipAmounts(structure as SalaryStructure);
  const { summary, shiftHours } = await reconcileEmployee(employee.id, year, month);

  // Prorate against calendar working days: LOP / unpaid days reduce pay.
  const workingDays = Math.max(summary.workingDays, 1);
  const payableDays = Math.max(workingDays - summary.unpaidLeaveDays, 0);
  const ratio = payableDays / workingDays;

  const earnings: Record<string, number> = {
    basicSalary: round2(amounts.earnings.basicSalary * ratio),
    hra: round2(amounts.earnings.hra * ratio),
    conveyanceAllowance: round2(amounts.earnings.conveyanceAllowance * ratio),
    medicalAllowance: round2(amounts.earnings.medicalAllowance * ratio),
    performanceBonus: round2(amounts.earnings.performanceBonus * ratio),
    otherAllowances: round2(amounts.earnings.otherAllowances * ratio),
    total: 0,
  };
  // Overtime at time-and-a-half of the basic hourly rate (not LOP-prorated —
  // it is genuinely extra time worked beyond the scheduled shift end).
  const shiftDayHours = Math.max(shiftHours || 9, 1);
  const hourlyBasic = toNumber(structure.basicSalary) / (workingDays * shiftDayHours);
  earnings.overtime = round2(summary.overtimeHours * hourlyBasic * OT_MULTIPLIER);
  earnings.total = Math.round(Object.values(earnings).reduce((s, v) => s + v, 0));

  // PF scales with prorated earnings; statutory flat items stay monthly-fixed.
  const withholding: Record<string, number> = {
    providentFund: round2(amounts.deductions.providentFund * ratio),
    professionalTax: amounts.deductions.professionalTax,
    incomeTax: amounts.deductions.incomeTax,
    healthInsurance: amounts.deductions.healthInsurance,
    total: 0,
  };
  withholding.total = Math.round(
    withholding.providentFund + withholding.professionalTax + withholding.incomeTax + withholding.healthInsurance
  );
  // Never deduct more than the earnings actually earned (net stays >= 0),
  // e.g. full-month absence yields gross 0 -> take-home 0.
  withholding.total = Math.min(withholding.total, Math.max(earnings.total, 0));

  const slipNet = earnings.total - withholding.total;

  // Employer-side statutory costs (PF, ESI, gratuity) — tracked on the slip
  // for reporting (Form 12A, PF/ESI returns) but not subtracted from net pay.
  const monthlySalary = toNumber(structure.employee?.annualSalary) / 12;
  const proratedBasic = Number(earnings.basicSalary ?? 0);
  const esiEligible = monthlySalary > 0 && monthlySalary <= ESI_GROSS_CEILING;
  const employerContributions: Record<string, number> = {
    providentFund: round2(proratedBasic * EPF_EMPLOYER_RATE),
    esi: esiEligible ? round2(earnings.total * ESI_EMPLOYER_RATE) : 0,
    gratuity: round2(proratedBasic * GRATUITY_RATE),
  };

  return {
    earnings,
    deductions: withholding,
    employerContributions,
    netPay: slipNet,
    fullGross: amounts.earnings.total,
    summary,
    ratio,
  };
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
      include: { employee: { select: { id: true, status: true, annualSalary: true } } },
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

  const slipData: Array<{
    employeeId: string;
    salaryStructureId: string;
    earnings: Record<string, number>;
    deductions: Record<string, number>;
    employerContributions: Record<string, number>;
    netPay: number;
    attendanceSummary: Record<string, unknown>;
  }> = [];
  for (const emp of employees) {
    const structure = structureByEmployee.get(emp.id);
    if (!structure) continue;
    const comp = await computeEmployeePayslip(emp, structure, parsed.year, parsed.month);

    gross += comp.earnings.total;
    deductions += comp.deductions.total;
    net += comp.netPay;

    slipData.push({
      employeeId: emp.id,
      salaryStructureId: structure.id,
      earnings: comp.earnings,
      deductions: comp.deductions,
      employerContributions: comp.employerContributions,
      netPay: comp.netPay,
      attendanceSummary: { ...comp.summary, ratio: Math.round(comp.ratio * 100) / 100 },
    });
  }

  const valid = slipData;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
    for (const slip of valid) {
      await tx.payslip.create({
        data: {
          payrollRunId: run.id,
          period: `${run.period}`,
          employeeId: slip.employeeId,
          salaryStructureId: slip.salaryStructureId,
          earnings: slip.earnings as unknown as Prisma.InputJsonValue,
          deductions: slip.deductions as unknown as Prisma.InputJsonValue,
          employerContributions: slip.employerContributions as unknown as Prisma.InputJsonValue,
          attendanceSummary: slip.attendanceSummary as Prisma.InputJsonValue,
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

  await writeAuditLog({
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
export async function approvePayrollRun(id: string, approverEmployeeId: string, actorUserId?: string) {
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

  await writeAuditLog({
    action: "APPROVE",
    entityType: "PayrollRun",
    entityId: run.id,
    actorUserId: actorUserId ?? approverEmployeeId ?? undefined,
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

/**
 * Computed per-employee payroll for a month, with salary adjusted for unpaid
 * leave days ("Leave Without Pay"). Uses the exact same reconciliation-driven
 * computation as payroll processing, so the "Employee Payroll" panel always
 * matches the actual (approved) payslip.
 */
export async function getEmployeePayrollSummary(employeeCode: string, month: number, year: number) {
  const emp = await prisma.employee.findUnique({
    where: { employeeCode },
    include: {
      salaryStructures: {
        where: { isActive: true },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        include: { employee: { select: { annualSalary: true } } },
      },
    },
  });
  if (!emp) throw AppError.notFound("Employee not found");
  const structure = emp.salaryStructures[0];
  if (!structure) throw AppError.badRequest("No active salary structure for this employee");

  const run = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } });

  const comp = await computeEmployeePayslip(emp, structure, year, month);
  // LOP impact in rupees — the value clawed back for unpaid/present days that
  // was removed from the full-month gross (shown for transparency; gross is
  // already the prorated, actually-paid figure).
  const leaveDeduction = Math.max(comp.fullGross - comp.earnings.total, 0);

  return {
    data: {
      period: periodLabel({ month, year }),
      month,
      year,
      status: run?.status ?? "Not Processed",
      employeeId: emp.employeeCode,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      gross: comp.earnings.total,
      leaveDays: comp.summary.unpaidLeaveDays,
      workingDays: comp.summary.workingDays,
      leaveDeduction,
      deductions: {
        providentFund: comp.deductions.providentFund,
        professionalTax: comp.deductions.professionalTax,
        incomeTax: comp.deductions.incomeTax,
        healthInsurance: comp.deductions.healthInsurance,
        leaveDeduction,
        total: comp.deductions.total,
      },
      netPay: comp.netPay,
    },
  };
}
