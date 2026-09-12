import { prisma } from "../../lib/prisma";
import { Prisma, type SalaryStructure } from "@prisma/client";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
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
import { assignComponentsToNests, type NestTree } from "../payslip/lib/nesting";
import { reconcileEmployee, reconcileEmployees, type EmployeeReconciliation } from "./reconciliation.service";
import { labelForStoredKey } from "./payslipLabels";
import { buildPayslipStatement, loadPayslipStatementAssets } from "./payslipStatement";
import { fetchStoredCompanyAssetDataUri } from "../payslip/lib/brandingAssets";
import { salaryStructureBreakdown } from "../../lib/salaryStructure";
import { getCompanyConfig, type CompanyConfigSnapshot } from "../../lib/companyConfig";

const RUN_INCLUDE = { approvedByEmployee: { select: { employeeCode: true } } };
const SLIP_INCLUDE = {
  employee: { select: { employeeCode: true, firstName: true, lastName: true, annualSalary: true, department: { select: { name: true } }, designation: { select: { title: true } } } },
  payrollRun: true,
};

/** Stored payslip keys → designer component id aliases (kept in sync with the
 *  PDF builder so labels, order and nest grouping never drift between views). */
const STORED_SYNONYMS: Record<string, string[]> = {
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

/** Case/separator-insensitive component id comparison (income_tax === incomeTax). */
const normalizeCompId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface PayrollGroup {
  id: string | null;
  name: string;
  kind: "earning" | "deduction";
  rows: { label: string; amount: number }[];
}

/** Load the active (published) Smart Payslip Designer blueprint, if any. */
async function loadActiveBlueprint(): Promise<Blueprint | null> {
  const template = await prisma.payslipTemplate.findFirst({
    where: { isActive: true, status: "Published" },
    orderBy: { updatedAt: "desc" },
    include: { versions: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1 } },
  });
  return (template?.versions?.[0]?.blueprint as unknown as Blueprint) ?? null;
}

/** Published active nesting templates indexed by their settings.skillType,
 *  plus an overall fallback (highest-priority active template). Payroll
 *  uses the template matching each employee's skill type. */
async function loadBlueprintsBySkillType(): Promise<{ bySkill: Map<string, Blueprint>; fallback: Blueprint | null }> {
  const templates = await prisma.payslipTemplate.findMany({
    where: { isActive: true, status: "Published" },
    orderBy: { updatedAt: "desc" },
    include: { versions: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1 } },
  });
  const fallback = templates[0]?.versions?.[0]?.blueprint as unknown as Blueprint | null ?? null;
  const bySkill = new Map<string, Blueprint>();
  for (const t of templates) {
    const bp = t.versions?.[0]?.blueprint as unknown as Blueprint | undefined;
    const sk = bp?.settings?.skillType;
    if (sk && !bySkill.has(sk)) bySkill.set(sk, bp);
  }
  return { bySkill, fallback };
}

/** Blueprint for a given employee skill type (matching nesting template or
 *  the active published fallback). */
function blueprintForSkill(
  maps: { bySkill: Map<string, Blueprint>; fallback: Blueprint | null },
  skillType?: string | null,
): Blueprint | null {
  return (skillType && maps.bySkill.get(skillType)) || maps.fallback;
}

/** Group stored earnings/deductions by the blueprint's nesting tree so the
 *  Employee Payroll panel shows the same groups (Fixed Pay, Variable Pay,
 *  Statutory Deductions…) as the designer. Falls back to a flat kind block
 *  (Earnings / Deductions) when no blueprint or nest is configured. */
function buildPayrollGroups(
  earnings: Record<string, number>,
  deductions: Record<string, number>,
  blueprint: Blueprint | null,
): { earningGroups: PayrollGroup[]; deductionGroups: PayrollGroup[] } {
  const visible = (blueprint?.components ?? []).filter((c) => c.visible !== false);
  const { tree } = assignComponentsToNests(blueprint?.nests ?? [], visible);
  const nestMeta = new Map<string, { name: string; order: number }>();
  const index = (arr: NestTree[]) => arr.forEach((n) => { nestMeta.set(n.id, { name: n.name, order: n.displayOrder ?? 0 }); index(n.children); });
  index(tree);

  const componentForStoredKey = (key: string) => {
    const cands = new Set([key, ...(STORED_SYNONYMS[key] ?? [])].map(normalizeCompId));
    return visible.find((c) => cands.has(normalizeCompId(c.id)));
  };

  const flatten = (groups: Map<string, { id: string; name: string; kind: "earning" | "deduction"; rows: { label: string; amount: number; order: number }[]; order: number }>, orphans: { label: string; amount: number; order: number }[], kind: "earning" | "deduction"): PayrollGroup[] => {
    const out: PayrollGroup[] = [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({
        id: g.id,
        name: g.name,
        kind: g.kind,
        rows: g.rows.sort((a, b) => a.order - b.order).map(({ order: _o, ...r }) => r),
      }));
    if (orphans.length) {
      out.push({
        id: null,
        name: kind === "earning" ? "Earnings" : "Deductions",
        kind,
        rows: orphans.sort((a, b) => a.order - b.order).map(({ order: _o, ...r }) => r),
      });
    }
    return out;
  };

  const build = (obj: Record<string, number>, kind: "earning" | "deduction"): PayrollGroup[] => {
    const groups = new Map<string, { id: string; name: string; kind: "earning" | "deduction"; rows: { label: string; amount: number; order: number }[]; order: number }>();
    const orphans: { label: string; amount: number; order: number }[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (key === "total" || Number(value) <= 0) continue;
      const comp = componentForStoredKey(key);
      const label = comp?.label ?? labelForStoredKey(key);
      const order = comp?.displayOrder ?? comp?.logic.calculationPriority ?? 999;
      if (comp?.nestId && nestMeta.has(comp.nestId)) {
        const meta = nestMeta.get(comp.nestId)!;
        let g = groups.get(comp.nestId);
        if (!g) {
          g = { id: comp.nestId, name: meta.name, kind, rows: [], order: meta.order };
          groups.set(comp.nestId, g);
        }
        g.rows.push({ label, amount: Number(value), order });
      } else {
        orphans.push({ label, amount: Number(value), order });
      }
    }
    return flatten(groups, orphans, kind);
  };

  return { earningGroups: build(earnings, "earning"), deductionGroups: build(deductions, "deduction") };
}

/** Create a Draft payroll run for a month/year (the entry point for a run to
 *  be processed, approved and then distributed end-to-end). */
export async function createPayrollRun(body: { month: number; year: number }, actorUserId?: string) {
  const { month, year } = body;
  const existing = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } });
  if (existing) throw AppError.conflict(`A payroll run for ${periodLabel({ month, year })} already exists (${existing.status})`);
  const run = await prisma.payrollRun.create({
    data: {
      period: `${month}/${year}`,
      month,
      year,
    },
    include: RUN_INCLUDE,
  });
  await writeAuditLog({
    action: "CREATE",
    entityType: "PayrollRun",
    entityId: run.id,
    actorUserId,
    newValue: { month, year, period: run.period, status: run.status },
  });
  return { data: serializePayrollRunList([run])[0] };
}

export async function listPayrollRuns() {
  const runs = await prisma.payrollRun.findMany({
    include: RUN_INCLUDE,
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return { data: serializePayrollRunList(runs) };
}

/** Distinct years with payroll or attendance data, newest first. Used by the
 *  frontend year dropdowns so annual/monthly payroll can be viewed for any
 *  year that has uploaded attendance even without a payroll run. */
export async function getPayrollYears() {
  const years = new Set<number>();
  const runs = await prisma.payrollRun.findMany({ select: { year: true } });
  for (const run of runs) years.add(run.year);
  const punchYears = await prisma.$queryRaw<{ y: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM punch_date)::int AS y FROM attendance_punches`;
  for (const row of punchYears) years.add(row.y);
  const leaveYears = await prisma.$queryRaw<{ y: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM start_date)::int AS y FROM leave_requests`;
  for (const row of leaveYears) years.add(row.y);
  const sorted = [...years].sort((a, b) => b - a);
  return { data: sorted };
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
  const isUuid = employeeId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId) : false;
  const where: Prisma.PayslipWhereInput = employeeId
    ? isUuid
      ? {
          OR: [
            { employeeId },
            { employee: { userId: employeeId } },
            { employee: { id: employeeId } },
          ],
        }
      : {
          OR: [
            { employee: { employeeCode: employeeId } },
            { employee: { personalEmail: employeeId } },
            { employee: { user: { email: employeeId } } },
          ],
        }
    : {};
  const slips = await prisma.payslip.findMany({
    where,
    include: SLIP_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return { data: serializePayslipList(slips) };
}

/** Payslips that belong to a specific payroll run (stored, authoritative). */
export async function listRunPayslips(id: string) {
  const parsed = parseRunPublicId(id);
  const run = await prisma.payrollRun.findUnique({
    where: { month_year: { month: parsed.month, year: parsed.year } },
  });
  if (!run) throw AppError.notFound("Payroll run not found");
  const slips = await prisma.payslip.findMany({
    where: { payrollRunId: run.id },
    include: SLIP_INCLUDE,
    orderBy: { createdAt: "asc" },
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

/** Load a payslip and render it as a rupee-formatted PDF from the ACTIVE Smart
 *  Payslip Designer template (the "generated payslip"), so PDFs everywhere —
 *  download, email attachments, portal — reflect what was actually designed. */
export async function getPayslipPdf(id: string, access?: { role?: string; employeeCode?: string }, templateId?: string) {
  const parts = id.split("-");
  if (parts.length < 4 || parts[0] !== "PS" || !/^\d{4}$/.test(parts[1]) || !/^\d{2}$/.test(parts[2])) {
    throw AppError.badRequest("Invalid payslip id");
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const employeeCode = parts.slice(3).join("-");

  // Employees can only render their own payslip.
  const isAdminOrHr = access?.role === "ADMIN" || access?.role === "HR";
  if (!isAdminOrHr && access?.employeeCode && access.employeeCode !== employeeCode) {
    throw AppError.forbidden("Employees can only view their own payslip");
  }

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
  const cfg = await getCompanyConfig();

  // Use the nesting template whose skill type matches the employee's skill
  // type, so each employee gets the layout/theme/components designed for their
  // skill group. When an explicit template is requested (e.g. a distribution
  // run) that template wins; otherwise we fall back to the active published
  // template, then to a minimal built-in blueprint.
  const templates2: Array<{ versions: { blueprint: unknown }[] } | null> = templateId
    ? [await prisma.payslipTemplate.findFirst({
        where: { id: templateId },
        include: { versions: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1 } },
      })]
    : await prisma.payslipTemplate.findMany({
        where: { isActive: true, status: "Published" },
        orderBy: { updatedAt: "desc" },
        include: { versions: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1 } },
      });
  const usable = templates2.filter((t): t is { versions: { blueprint: unknown }[] } => !!t);
  const empSkill = (employee as { skillType?: string | null }).skillType || "";
  const matched = usable.find((t) => {
    const bp = t.versions?.[0]?.blueprint as Blueprint | undefined;
    return !!empSkill && bp?.settings?.skillType === empSkill;
  });
  const template = matched || usable[0] || null;
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
      taxConfig: { defaultRegime: cfg.defaultTaxRegime === "OLD" ? "OLD" : "NEW", employeeChoiceAllowed: true, regimes: ["OLD", "NEW"] },
      settings: { companyName: "Proteccio HRMS" },
    };
  }

  // Build the PDF rows from the STORED (approved) payslip amounts — they are
  // authoritative and reflect exactly what was paid after LOP/OT proration.
  // The blueprint contributes labels + display order + theme so the export
  // stays dynamic per project while never drifting from the paid slip.
  const synonyms = STORED_SYNONYMS;

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
 *  Delegates to the shared branding-assets loader (presigned URL + PNG sanitize). */
const fetchStoredImageDataUri = fetchStoredCompanyAssetDataUri;

function defaultReferenceBlueprint(taxRegime: string = "NEW"): Blueprint {
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
    taxConfig: { defaultRegime: taxRegime === "OLD" ? "OLD" : "NEW", employeeChoiceAllowed: true, regimes: ["OLD", "NEW"] },
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

  const buffer = await generatePayslipPdf(defaultReferenceBlueprint((await getCompanyConfig()).defaultTaxRegime), {
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

interface PaySourceStructure {
  id: string;
  basicSalary: unknown; hra: unknown; conveyanceAllowance: unknown; medicalAllowance: unknown;
  performanceBonus: unknown; otherAllowances: unknown; providentFund: unknown; professionalTax: unknown;
  incomeTax: unknown; healthInsurance: unknown;
  employee?: { annualSalary?: unknown } | null;
}

/** Resolve an employee's pay basis: their active salary structure when one
 *  exists, otherwise a breakdown synthesised from the yearly salary package.
 *  Returns null only when neither exists (employee excluded from runs). */
function resolvePaySource(
  emp: {
    annualSalary?: unknown;
    salaryStructures?: PaySourceStructure[];
  },
  cfg?: CompanyConfigSnapshot,
): { salaryStructureId: string | null; structure: PaySourceStructure } | null {
  const structure = emp.salaryStructures?.[0];
  if (structure) return { salaryStructureId: structure.id, structure };
  const annual = toNumber(emp.annualSalary);
  const effectiveAnnual = annual > 0 ? annual : 360000;
  const b = salaryStructureBreakdown(effectiveAnnual, cfg);
  return {
    salaryStructureId: null,
    structure: {
      id: "",
      basicSalary: b.basicSalary,
      hra: b.hra,
      conveyanceAllowance: b.conveyanceAllowance,
      medicalAllowance: b.medicalAllowance,
      performanceBonus: b.performanceBonus,
      otherAllowances: b.otherAllowances,
      providentFund: b.providentFund,
      professionalTax: b.professionalTax,
      incomeTax: b.incomeTax,
      healthInsurance: b.healthInsurance,
      employee: { annualSalary: effectiveAnnual },
    },
  };
}

/**
 * Full-month earnings/deductions per stored key, driven by the employee's
 * skill-type nesting blueprint where it defines the component (fixed value,
 * % of CTC, formula), falling back to the salary-package breakdown for any
 * key the blueprint does not cover. The calculation engine runs over the
 * salary package so designer components like "Basic Salary" (fixed, pulls
 * from ctx) or "HRA = 50% of ctc" resolve to real amounts.
 */
function blueprintComponentAmounts(
  blueprint: Blueprint | null,
  structure: PaySourceStructure,
  amounts: ReturnType<typeof buildPayslipAmounts>,
): { earnings: Record<string, number>; deductions: Record<string, number>; computed: { results?: Record<string, { final: number }> } | null } {
  const fullEarnings: Record<string, number> = {
    basicSalary: amounts.earnings.basicSalary,
    hra: amounts.earnings.hra,
    conveyanceAllowance: amounts.earnings.conveyanceAllowance,
    medicalAllowance: amounts.earnings.medicalAllowance,
    performanceBonus: amounts.earnings.performanceBonus,
    otherAllowances: amounts.earnings.otherAllowances,
  };
  const fullDeductions: Record<string, number> = {
    providentFund: amounts.deductions.providentFund,
    professionalTax: amounts.deductions.professionalTax,
    incomeTax: amounts.deductions.incomeTax,
    healthInsurance: amounts.deductions.healthInsurance,
  };
  const visible = (blueprint?.components ?? []).filter((c) => c.visible !== false);
  if (!visible.length) {
    return {
      earnings: fullEarnings,
      deductions: fullDeductions,
      computed: null,
    };
  }

  const monthlyCtc = toNumber(structure.employee?.annualSalary) / 12;
  const engineBase: Record<string, number> = {
    basic: toNumber(structure.basicSalary),
    hra: toNumber(structure.hra),
    conveyance: toNumber(structure.conveyanceAllowance),
    medical: toNumber(structure.medicalAllowance),
    performance_bonus: toNumber(structure.performanceBonus),
    other_allowances: toNumber(structure.otherAllowances),
    ctc: monthlyCtc,
    annual: toNumber(structure.employee?.annualSalary),
  };
  const computed = computePayroll({ ...blueprint!, components: visible }, engineBase, {});

  const componentForStoredKey = (key: string) => {
    const cands = new Set([key, ...(STORED_SYNONYMS[key] ?? [])].map(normalizeCompId));
    return visible.find((c) => cands.has(normalizeCompId(c.id)));
  };
  const applyBlueprint = (obj: Record<string, number>, key: string) => {
    const comp = componentForStoredKey(key);
    if (!comp) return;
    const v = computed.results?.[comp.id.toLowerCase()]?.final;
    if (v !== undefined) obj[key] = v;
  };

  for (const key of Object.keys(fullEarnings)) applyBlueprint(fullEarnings, key);
  for (const key of Object.keys(fullDeductions)) applyBlueprint(fullDeductions, key);
  return { earnings: fullEarnings, deductions: fullDeductions, computed };
}

/** Employer statutory costs from the blueprint's employer-kind components
 *  when the template defines them (13% of ctc via `epf_employer`, etc.),
 *  otherwise the fallback statutory calculation on prorated basic wages. */
function employerBlueprintAmounts(
  blueprint: Blueprint | null,
  computed: { results?: Record<string, { final: number }> } | null,
  fallback: { providentFund: number; esi: number; gratuity: number },
): { providentFund: number; esi: number; gratuity: number } {
  const employers = (blueprint?.components ?? []).filter((c) => c.kind === "employer");
  if (!employers.length || !computed) return fallback;
  const out = { ...fallback };
  for (const c of employers) {
    const v = computed.results?.[c.id.toLowerCase()]?.final;
    if (v === undefined) continue;
    if (c.id.toLowerCase() === "epf_employer") out.providentFund = v;
    else if (c.id.toLowerCase() === "esi_employer") out.esi = v;
    else if (c.id.toLowerCase() === "gratuity") out.gratuity = v;
  }
  return out;
}

/**
 * Compute one employee's payslip from their salary structure + reconciliation.
 * When `precomputed` is supplied the (expensive) reconcile step is skipped,
 * enabling N employees to share a single batched reconcileEmployees call.
 * When `blueprint` is supplied (skill-type nesting template), component amounts
 * are computed per the template; otherwise the salary-package breakdown is used.
 */
async function computeEmployeePayslip(
  employee: { id: string },
  structure: PaySourceStructure,
  year: number,
  month: number,
  precomputed?: EmployeeReconciliation,
  cfg?: CompanyConfigSnapshot,
  blueprint: Blueprint | null = null,
) {
  const c = cfg ?? (await getCompanyConfig());
  const amounts = buildPayslipAmounts(structure as unknown as SalaryStructure);
  const { summary, shiftHours } = precomputed ?? await reconcileEmployee(employee.id, year, month);

  // Prorate against calendar working days using the uploaded attendance:
  // present days + approved paid leave are the paid days. When no punches or
  // leave are recorded yet for the period, full monthly salary applies.
  const workingDays = Math.max(summary.workingDays, 1);
  const payableDays = (summary.presentDays === 0 && summary.unpaidLeaveDays === 0 && summary.paidLeaveDays === 0)
    ? workingDays
    : Math.max(summary.presentDays + summary.paidLeaveDays, 0);
  const ratio = Math.min(Math.max(payableDays / workingDays, 0), 1);

  const { earnings: fullEarnings, deductions: fullDeductions, computed } = blueprintComponentAmounts(blueprint, structure, amounts);

  const visible = (blueprint?.components ?? []).filter((c) => c.visible !== false);
  const isOvertimeId = (id: string) => ["overtime", "ot"].map(normalizeCompId).includes(normalizeCompId(id));
  const overtimeComp = visible.find((c) => isOvertimeId(c.id));
  const overtimeBlueprintAmount = overtimeComp ? computed?.results?.[overtimeComp.id.toLowerCase()]?.final ?? 0 : 0;

  const earnings: Record<string, number> = {
    basicSalary: round2(fullEarnings.basicSalary * ratio),
    hra: round2(fullEarnings.hra * ratio),
    conveyanceAllowance: round2(fullEarnings.conveyanceAllowance * ratio),
    medicalAllowance: round2(fullEarnings.medicalAllowance * ratio),
    performanceBonus: round2(fullEarnings.performanceBonus * ratio),
    otherAllowances: round2(fullEarnings.otherAllowances * ratio),
    total: 0,
  };
  // Overtime at the configured multiplier of the basic hourly rate (not
  // LOP-prorated — it is genuinely extra time worked beyond the scheduled
  // shift end). A blueprint-defined overtime component wins over the default.
  const shiftDayHours = Math.max(shiftHours || 9, 1);
  const hourlyBasic = toNumber(structure.basicSalary) / (workingDays * shiftDayHours);
  earnings.overtime = round2(
    overtimeComp ? overtimeBlueprintAmount * ratio : summary.overtimeHours * hourlyBasic * c.overtimeMultiplier
  );
  earnings.total = Math.round(Object.values(earnings).reduce((s, v) => s + v, 0));

  // PF scales with prorated earnings; statutory flat items stay monthly-fixed.
  const withholding: Record<string, number> = {
    providentFund: round2(fullDeductions.providentFund * ratio),
    professionalTax: fullDeductions.professionalTax,
    incomeTax: fullDeductions.incomeTax,
    healthInsurance: fullDeductions.healthInsurance,
    total: 0,
  };
  withholding.total = Math.round(
    withholding.providentFund + withholding.professionalTax + withholding.incomeTax + withholding.healthInsurance
  );
  // Never deduct more than the earnings actually earned (net stays >= 0),
  // e.g. full-month absence yields gross 0 -> take-home 0. When the raw
  // withholding exceeds what was earned, scale every line item proportionally
  // so the components always sum to the actual total (no phantom deductions).
  const maxDeductible = Math.max(earnings.total, 0);
  const rawTotal = withholding.providentFund + withholding.professionalTax + withholding.incomeTax + withholding.healthInsurance;
  const scale = rawTotal > maxDeductible && rawTotal > 0 ? maxDeductible / rawTotal : 1;
  withholding.providentFund = round2(withholding.providentFund * scale);
  withholding.professionalTax = round2(withholding.professionalTax * scale);
  withholding.incomeTax = round2(withholding.incomeTax * scale);
  withholding.healthInsurance = round2(withholding.healthInsurance * scale);
  withholding.total = Math.round(
    withholding.providentFund + withholding.professionalTax + withholding.incomeTax + withholding.healthInsurance
  );

  const slipNet = earnings.total - withholding.total;

  // Employer-side statutory costs (PF, ESI, gratuity) — tracked on the slip
  // for reporting (Form 12A, PF/ESI returns) but not subtracted from net pay.
  // A blueprint that defines employer-kind components (e.g. `epf_employer`
  // = 13% of ctc) drives these amounts; otherwise the statutory fallback uses
  // the configured rates over prorated wages. Employer costs scale with the
  // paid days (ratio) just like earnings.
  const monthlySalary = toNumber(structure.employee?.annualSalary) / 12;
  const proratedBasic = Number(earnings.basicSalary ?? 0);
  const esiEligible = monthlySalary > 0 && monthlySalary <= c.esiGrossCeiling;
  const fallbackEmployer = {
    providentFund: round2(proratedBasic * c.epfEmployerRate),
    esi: esiEligible ? round2(earnings.total * c.esiEmployerRate) : 0,
    gratuity: round2(proratedBasic * c.gratuityRate),
  };
  const blueprintEmployer = employerBlueprintAmounts(blueprint, computed, fallbackEmployer);
  const employerContributions: Record<string, number> = {
    providentFund: round2(blueprintEmployer.providentFund * ratio),
    esi: blueprintEmployer.esi > 0 ? round2(blueprintEmployer.esi * ratio) : 0,
    gratuity: round2(blueprintEmployer.gratuity * ratio),
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
    prisma.employee.findMany({
      where: { status: { in: ["Active", "ACTIVE", "active"] } },
      select: { id: true, employeeCode: true, annualSalary: true, skillType: true },
    }),
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

  // Every active employee with a pay basis (salary structure OR yearly package)
  // is processed. Reconcile them all in ONE batch (avoids N×6 queries), then
  // use pure-memory payslip computation that reuses the precomputed summaries.
  const eligible = employees.filter((emp) => structureByEmployee.has(emp.id) || toNumber(emp.annualSalary) > 0);
  const cfg = await getCompanyConfig();
  const templates = await loadBlueprintsBySkillType();
  const reconciliations = await reconcileEmployees(eligible.map((e) => e.id), parsed.year, parsed.month);
  const reconciliationById = new Map(reconciliations.map((r) => [r.employeeId, r]));

  let gross = 0;
  let deductions = 0;
  let net = 0;

  const slipData: Array<{
    employeeId: string;
    salaryStructureId: string | null;
    earnings: Record<string, number>;
    deductions: Record<string, number>;
    employerContributions: Record<string, number>;
    netPay: number;
    attendanceSummary: Record<string, unknown>;
  }> = [];
  for (const emp of eligible) {
    const structure = structureByEmployee.get(emp.id);
    const source = structure
      ? { salaryStructureId: structure.id, structure: structure as unknown as PaySourceStructure }
      : resolvePaySource(emp, cfg)!;
    const comp = await computeEmployeePayslip(
      emp,
      source.structure,
      parsed.year,
      parsed.month,
      reconciliationById.get(emp.id),
      cfg,
      blueprintForSkill(templates, (emp as { skillType?: string | null }).skillType),
    );

    gross += comp.earnings.total;
    deductions += comp.deductions.total;
    net += comp.netPay;

    slipData.push({
      employeeId: emp.id,
      salaryStructureId: source.salaryStructureId,
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
    if (valid.length > 0) {
      await tx.payslip.createMany({
        data: valid.map((slip) => ({
          payrollRunId: run.id,
          period: `${run.period}`,
          employeeId: slip.employeeId,
          salaryStructureId: slip.salaryStructureId,
          earnings: slip.earnings as unknown as Prisma.InputJsonValue,
          deductions: slip.deductions as unknown as Prisma.InputJsonValue,
          employerContributions: slip.employerContributions as unknown as Prisma.InputJsonValue,
          attendanceSummary: slip.attendanceSummary as Prisma.InputJsonValue,
          netPay: slip.netPay,
        })),
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
 * matches the actual (approved) payslip. Figures are always derived live from
 * the employee's pay basis (yearly salary package or active salary structure),
 * independent of whether a payroll run has been processed yet — so the panel
 * shows what the employee will be paid as soon as a pay basis exists.
 */
export async function getEmployeePayrollSummary(employeeCode: string, month: number, year: number) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeCode);
  const emp = await prisma.employee.findFirst({
    where: isUuid
      ? {
          OR: [
            { id: employeeCode },
            { userId: employeeCode },
          ],
        }
      : {
          OR: [
            { employeeCode },
            { personalEmail: employeeCode },
            { user: { email: employeeCode } },
          ],
        },
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

  const [run, templates] = await Promise.all([
    prisma.payrollRun.findUnique({ where: { month_year: { month, year } } }),
    loadBlueprintsBySkillType(),
  ]);
  const blueprint = blueprintForSkill(templates, (emp as { skillType?: string | null }).skillType);

  const cfg = await getCompanyConfig();
  const source = resolvePaySource(emp, cfg);
  // No pay basis configured yet (no active salary structure, no yearly
  // package) — show a clean zero summary rather than synthesizing amounts.
  if (!source) return { data: zeroSummaryPayload(emp, run, month, year) };

  const comp = await computeEmployeePayslip(emp, source.structure, year, month, undefined, cfg, blueprint);
  return { data: buildSummaryPayload(emp, run!, comp, month, year, blueprint) };
}

/** Zero-state summary payload shown before a structure/run exists. */
function zeroSummaryPayload(
  emp: { employeeCode: string; firstName: string; lastName: string },
  run: { status: string } | null,
  month: number,
  year: number,
) {
  return {
    period: periodLabel({ month, year }),
    month,
    year,
    status: run?.status ?? "Not Processed",
    employeeId: emp.employeeCode,
    employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
    gross: 0,
    annualSalary: 0,
    leaveDays: 0,
    workingDays: 0,
    presentDays: 0,
    paidLeaveDays: 0,
    attendanceRatio: 0,
    leaveDeduction: 0,
    noSalaryStructure: true,
    deductions: {
      providentFund: 0,
      professionalTax: 0,
      incomeTax: 0,
      healthInsurance: 0,
      leaveDeduction: 0,
      total: 0,
    },
    earningGroups: [],
    deductionGroups: [],
    netPay: 0,
  };
}

function buildSummaryPayload(
  emp: { employeeCode: string; firstName: string; lastName: string; annualSalary?: unknown },
  run: { status: string },
  comp: Awaited<ReturnType<typeof computeEmployeePayslip>>,
  month: number,
  year: number,
  blueprint: Blueprint | null = null,
) {
  const annualSalary = toNumber(emp.annualSalary);
  const monthlyPackage = annualSalary > 0 ? annualSalary / 12 : comp.fullGross;
  const gross = Math.round(monthlyPackage);
  const leaveDeduction = Math.max(gross - comp.earnings.total, 0);
  const { earningGroups, deductionGroups } = buildPayrollGroups(comp.earnings, comp.deductions, blueprint);
  return {
    period: periodLabel({ month, year }),
    month,
    year,
    status: run?.status ?? "Not Processed",
    employeeId: emp.employeeCode,
    employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
    gross,
    annualSalary: Math.round(annualSalary),
    leaveDays: comp.summary.unpaidLeaveDays,
    workingDays: comp.summary.workingDays,
    presentDays: comp.summary.presentDays,
    paidLeaveDays: comp.summary.paidLeaveDays,
    attendanceRatio: Math.round(comp.ratio * 100) / 100,
    leaveDeduction,
    deductions: {
      providentFund: comp.deductions.providentFund,
      professionalTax: comp.deductions.professionalTax,
      incomeTax: comp.deductions.incomeTax,
      healthInsurance: comp.deductions.healthInsurance,
      leaveDeduction,
      // Total deduction = statutory withholding + unpaid-leave (LOP) amount, so
      // full monthly package − total = net pay (leave is a real take-home loss).
      total: comp.deductions.total + leaveDeduction,
    },
    earnings: comp.earnings,
    earningGroups,
    deductionGroups,
    netPay: comp.netPay,
  };
}

/**
 * Batched payroll summaries for all active employees in one request. Uses a
 * single reconcileEmployees call (6 queries total) instead of N per-employee
 * reconciliations, and one blueprint load, so the annual/monthly payroll views
 * scale with employee count instead of multiplying round-trips.
 */
export async function getEmployeePayrollSummaries(month: number, year: number) {
  const [employees, run] = await Promise.all([
    prisma.employee.findMany({
      where: { status: { in: ["Active", "ACTIVE", "active"] } },
      include: {
        salaryStructures: {
          where: { isActive: true },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          include: { employee: { select: { annualSalary: true } } },
        },
      },
    }),
    prisma.payrollRun.findUnique({ where: { month_year: { month, year } } }),
  ]);

  const cfg = await getCompanyConfig();
  const withPaySource = employees.filter((e) => !!resolvePaySource(e, cfg));
  const reconciliations = withPaySource.length > 0
    ? await reconcileEmployees(withPaySource.map((e) => e.id), year, month)
    : [];
  const recById = new Map(reconciliations.map((r) => [r.employeeId, r]));

  const templates = await loadBlueprintsBySkillType();
  const comps = await Promise.all(
    withPaySource.map((emp) =>
      computeEmployeePayslip(
        emp,
        resolvePaySource(emp, cfg)!.structure,
        year,
        month,
        recById.get(emp.id),
        cfg,
        blueprintForSkill(templates, (emp as { skillType?: string | null }).skillType),
      ),
    ),
  );

  const compById = new Map<string, Awaited<ReturnType<typeof computeEmployeePayslip>>>();
  withPaySource.forEach((emp, i) => {
    const c = comps[i];
    if (c) compById.set(emp.id, c);
  });

  const rows = employees.map((emp) => {
    const comp = compById.get(emp.id);
    if (!comp) return zeroSummaryPayload(emp, run, month, year);
    const blueprint = blueprintForSkill(templates, (emp as { skillType?: string | null }).skillType);
    return buildSummaryPayload(emp, run!, comp, month, year, blueprint);
  });

  return { data: rows };
}
