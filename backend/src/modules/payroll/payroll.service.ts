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
import { computePayroll, ensureDefaultSkillTemplates } from "../payslip/payslip.service";
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
  basicSalary: ["basic", "basic_salary", "basic_wage"],
  hra: ["hra", "living_allowance"],
  conveyanceAllowance: ["conveyance", "conveyance_allowance", "transport_allowance"],
  medicalAllowance: ["medical", "medical_allowance", "medical_allowances"],
  performanceBonus: ["performance_bonus", "attendance_allowance"],
  otherAllowances: ["other", "other_allowances", "special_allowance", "daily_allowance", "uniform_allowance"],
  overtime: ["overtime", "ot"],
  attendanceBonus: ["attendance_bonus", "att_bonus"],
  nightShiftAllowance: ["night_shift_allowance", "night_allow", "night_allowance"],
  productionIncentive: ["production_incentive", "prod_inc"],
  foodAllowance: ["food_allowance", "food_allow", "canteen_allowance"],
  transportAllowance: ["transport_allowance", "transport_allow"],
  providentFund: ["provident_fund", "epf_employee", "pf"],
  professionalTax: ["professional_tax", "pt"],
  incomeTax: ["income_tax", "tds"],
  healthInsurance: ["health_insurance", "esi_employee", "esi"],
};

/** Case/separator-insensitive component id comparison (income_tax === incomeTax). */
const normalizeCompId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Unified-config doctrine for Annual/Monthly payroll columns:
 * earning/deduction columns come from PayrollComponentConfig (Earnings /
 * Deductions tabs) + wage rates. Static salary-structure / company-config
 * legs are used ONLY when no configured component covers them ("config-only
 * fallback"), so a configured allowance/deduction never double-counts
 * against a hardcoded leg and unconfigured columns are never fabricated
 * (e.g. no ₹250 Medical leg unless Medical is actually configured).
 */
const normCompToken = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

/** Static withholding-key → configured spellings (code or name) that own it. */
const DEDUCTION_COVERS: Record<string, string[]> = {
  providentFund: ["providentfund", "epf", "pf"],
  professionalTax: ["professionaltax", "pt"],
  incomeTax: ["incometax", "tds"],
  healthInsurance: ["healthinsurance", "esic", "esi"],
  lwf: ["labourwelfarefund", "lwf"],
  salaryAdvanceRecovery: ["salaryadvancerecovery", "advancerecovery", "advance", "loan"],
};

/**
 * Did the eligible, applied deduction configs already claim a static
 * withholding key? Short aliases (pt/epf/esi/tds/lwf/pf) match on code
 * equality only — substring matching would false-positive ("exempt"
 * contains "pt"). Longer aliases match code/name inclusion either way, so
 * "Voluntary Provident Fund" still covers the providentFund leg.
 */
export function appliedDeductionCovers(applied: Set<string>, key: string): boolean {
  const aliases = [normCompToken(key), ...(DEDUCTION_COVERS[key] ?? [])].filter(Boolean);
  for (const a of aliases) {
    if (applied.has(a)) return true;
    if (a.length > 3) {
      for (const t of applied) {
        if (t.length > 3 && (t.includes(a) || a.includes(t))) return true;
      }
    }
  }
  return false;
}

/** LOP is owned by the attendance mechanism (payable-days envelope +
 *  leaveDeduction), never by a deduction component — a persisted LOP rule
 *  would otherwise withhold up to the full monthly as "LOP". */
export function isLopLikeRule(rule: { code?: string | null; name?: string | null }): boolean {
  const code = normCompToken(rule.code);
  const name = normCompToken(rule.name);
  return code === "lop" || name === "lop" || name.includes("lossofpay");
}

/** Flat EMI-assumption rules must yield to real advance recoveries. */
export function isAdvanceLikeRule(rule: { code?: string | null; name?: string | null }): boolean {
  const code = normCompToken(rule.code);
  const name = normCompToken(rule.name);
  const hasAdvance = code.includes("advance") || name.includes("advance");
  const hasRecovery = code.includes("recover") || name.includes("recover") || code.includes("loan") || name.includes("loan") || name.includes("emi");
  return hasAdvance && hasRecovery;
}

/**
 * Canonical skill-category key shared by every payroll/employee comparison.
 * "Skilled" -> "skilled", "Semi Skilled"/"Semi-Skilled"/"SEMISKILLED" -> "semiskilled",
 * "Unskilled" -> "unskilled". Strips every non-letter so hyphen/space/case
 * variants from the profile form, wage table and payroll filters always match.
 */
export function normalizeSkill(s?: string | null): string {
  return String(s || "").toLowerCase().replace(/[^a-z]/g, "");
}

/** All accepted spellings of a canonical skill key (for Prisma OR queries). */
export function skillVariants(canonical: string): string[] {
  const n = normalizeSkill(canonical);
  if (n === "semiskilled") return ["Semi Skilled", "Semi-Skilled", "SEMISKILLED", "SemiSkilled", "semi skilled", "semi-skilled", "semiskilled"];
  if (n === "unskilled") return ["Unskilled", "UNSKILLED", "unskilled"];
  if (n === "skilled") return ["Skilled", "SKILLED", "skilled"];
  return [canonical];
}

/** Payroll-eligible employment statuses (Active + On Leave family). */
const PAYROLL_ELIGIBLE_STATUSES = ["Active", "ACTIVE", "active", "On Leave", "ON_NOTICE", "ON_LONG_LEAVE"];

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
  await ensureDefaultSkillTemplates();
  const templates = await prisma.payslipTemplate.findMany({
    where: { isActive: true, status: "Published" },
    orderBy: { updatedAt: "desc" },
    include: { versions: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1 } },
  });
  const fallback = (templates[0]?.versions?.[0]?.blueprint as unknown as Blueprint | null) ?? null;
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
  if (skillType) {
    const direct = maps.bySkill.get(skillType);
    if (direct) return direct;
    const norm = skillType.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const [k, v] of maps.bySkill.entries()) {
      if (k.toLowerCase().replace(/[^a-z0-9]/g, "") === norm) return v;
    }
  }
  return maps.fallback;
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
export function resolveEmployeeWageRate(
  emp: {
    skillType?: string | null;
    locationId?: string | null;
    contractorId?: string | null;
    dailyWageRate?: unknown;
    state?: string | null;
    location?: { state?: string | null; name?: string | null } | null;
  },
  wageRates: Array<{
    skillCategory: string;
    dailyRate: unknown;
    hourlyRate?: unknown;
    locationId?: string | null;
    contractorId?: string | null;
    state?: string | null;
  }> = [],
): { dailyRate: number; hourlyRate: number } {
  // 1. Explicit override on employee profile
  if (emp.dailyWageRate && toNumber(emp.dailyWageRate) > 0) {
    const dr = toNumber(emp.dailyWageRate);
    return { dailyRate: dr, hourlyRate: round2(dr / 8) };
  }

  const skill = (emp.skillType || "Skilled").trim();
  const normalizedSkill = normalizeSkill(skill);

  const matching = wageRates.filter((r) => normalizeSkill(r.skillCategory) === normalizedSkill);

  const rawLoc = `${emp.location?.name || ""} ${(emp.location as { address?: string | null })?.address || ""}`.toLowerCase();
  let empState = (emp.state || "").trim().toLowerCase();
  if (!empState || empState.includes("default") || empState === "india") {
    if (rawLoc.includes("delhi") || rawLoc.includes("gurugram") || rawLoc.includes("noida")) empState = "delhi";
    else if (rawLoc.includes("maharashtra") || rawLoc.includes("mumbai") || rawLoc.includes("pune")) empState = "maharashtra";
    else if (rawLoc.includes("karnataka") || rawLoc.includes("bangalore") || rawLoc.includes("bengaluru")) empState = "karnataka";
    else if (rawLoc.includes("gujarat") || rawLoc.includes("ahmedabad") || rawLoc.includes("surat")) empState = "gujarat";
    else if (rawLoc.includes("tamil nadu") || rawLoc.includes("chennai")) empState = "tamil nadu";
    else if (rawLoc.includes("telangana") || rawLoc.includes("hyderabad")) empState = "telangana";
    else if (rawLoc.includes("uttar pradesh") || rawLoc.includes("lucknow")) empState = "uttar pradesh";
    else if (rawLoc.includes("haryana")) empState = "haryana";
    else if (rawLoc.includes("west bengal") || rawLoc.includes("kolkata")) empState = "west bengal";
  }

  // 2. Specific state + location + contractor
  let match = matching.find((r) =>
    (empState && r.state && (r.state.toLowerCase() === empState || r.state.toLowerCase().includes(empState))) &&
    r.locationId === emp.locationId &&
    r.contractorId === emp.contractorId
  );

  // 3. Match by state alone
  if (!match && empState) {
    match = matching.find((r) => r.state && (r.state.toLowerCase() === empState || r.state.toLowerCase().includes(empState)) && !r.contractorId);
  }

  // 4. Match by location
  if (!match && emp.locationId) {
    match = matching.find((r) => r.locationId === emp.locationId && !r.contractorId);
  }

  // 5. Match by contractor
  if (!match && emp.contractorId) {
    match = matching.find((r) => !r.locationId && r.contractorId === emp.contractorId);
  }

  // 6. Central / All States default
  if (!match) {
    match = matching.find((r) => (!r.state || r.state.toLowerCase().includes("all")) && !r.locationId && !r.contractorId);
  }

  // 7. First matching category rate
  if (!match && matching.length > 0) {
    match = matching[0];
  }

  if (match) {
    const dr = toNumber(match.dailyRate);
    const hr = match.hourlyRate ? toNumber(match.hourlyRate) : round2(dr / 8);
    return { dailyRate: dr, hourlyRate: hr };
  }

  // No static fallback: rates are strictly the DB-configured wage-rate rows
  // (matched by skill + state + location + contractor above) plus the
  // per-employee `dailyWageRate` override handled first. When nothing matches,
  // 0 is returned so wage-driven lines surface as unset instead of inventing a
  // hardcoded amount — add the rate in Wage Rates & Overrides to pay off it.
  return { dailyRate: 0, hourlyRate: 0 };
}

/**
 * Single source of truth for Basic Wages.
 * Basic (monthly) = dailyRate × 26 statutory days, where dailyRate comes
 * from the employee override (dailyWageRate) else the state/skill/location/
 * contractor wage-rate table via resolveEmployeeWageRate.
 * Returns the rate, monthly basic, whether an override applied, and a
 * human-readable source label for UI badges ("Override" / state / default).
 */
export function basicMonthlyWage(
  emp: {
    skillType?: string | null;
    locationId?: string | null;
    contractorId?: string | null;
    dailyWageRate?: unknown;
    state?: string | null;
    location?: { state?: string | null; name?: string | null } | null;
  },
  wageRates: Array<{
    skillCategory: string;
    dailyRate: unknown;
    hourlyRate?: unknown;
    locationId?: string | null;
    contractorId?: string | null;
    state?: string | null;
  }> = [],
): { dailyRate: number; hourlyRate: number; basicMonthly: number; isOverride: boolean; source: string | null } {
  const overrideRate = toNumber(emp.dailyWageRate);
  const isOverride = overrideRate > 0;
  const { dailyRate, hourlyRate } = resolveEmployeeWageRate(emp, wageRates);
  const basicMonthly = Math.round(dailyRate * 26);
  // Nothing configured (no override, no matching DB wage-rate row) — report a
  // null source instead of pretending an "All States (Default)" rate applies.
  if (dailyRate <= 0 && !isOverride) {
    return { dailyRate: 0, hourlyRate: 0, basicMonthly: 0, isOverride: false, source: null };
  }
  let source: string | null = "All States (Default)";
  if (isOverride) {
    source = "Override";
  } else {
    const skill = normalizeSkill((emp as { skillType?: string | null }).skillType || "Skilled");
    const matching = wageRates.filter((r) => normalizeSkill(r.skillCategory) === skill);
    const empState = String(emp.state || "").trim();
    const stateMatch =
      (empState && matching.find((r) => r.state && r.state.toLowerCase() === empState.toLowerCase() && !r.contractorId)) ||
      matching.find((r) => r.state && !r.state.toLowerCase().includes("all") && !r.locationId && !r.contractorId);
    if (stateMatch?.state) source = stateMatch.state;
    else {
      const def = matching.find((r) => !r.state || r.state.toLowerCase().includes("all"));
      if (def?.state) source = def.state;
    }
  }
  return { dailyRate, hourlyRate, basicMonthly, isOverride, source };
}

/** True when a payroll component code/name refers to Basic wages (locked). */
export function isBasicComponentKey(codeOrName: unknown): boolean {
  return String(codeOrName || "").toLowerCase().replace(/[^a-z]/g, "").includes("basic");
}

/**
 * Rupee-exact monthly split implementing the payroll doctrine:
 *   monthly salary (target) = Basic (locked statutory minimum) + allowances
 *   gross earnings === monthly salary, always.
 *
 * Basic is FIXED (state/skill wage rate × 26, prorated by the caller) — it is
 * never a residual. The remainder (target − basic) is divided into the
 * allowance parts:
 * Basic is FIXED (state/skill wage rate × 26, prorated by the caller) — it is
 * never a residual. The remainder (target − basic) is the ALLOWANCE ENVELOPE,
 * the only pool the non-basic parts can draw from:
 *  - when the configured parts (percentage + fixed) fit the envelope, they
 *    are honoured in full and any leftover goes to `otherKey` so
 *    Σ(parts) === gross exactly,
 *  - when the configured parts over-draw the envelope (e.g. fixed allowances
 *    or % of gross beyond the remainder), EVERY non-basic part is scaled
 *    pro-rata — rupee-exact with largest-remainder rounding — so
 *    Σ(non-basic) === envelope exactly and gross earnings === monthly gross
 *    ALWAYS. The overage is reported via `excess` so callers can surface a
 *    disclaimer instead of silently paying more than the monthly package.
 *
 * Non-compliant envelope (target below the statutory Basic itself): fixed
 * parts are zeroed, percentage minimums are kept, and the payable gross is
 * RAISED to the committed minimum so Σ === gross still holds
 * (`nonCompliant: true`).
 */
export interface SplitFixedWeight { key: string; weight: number }
export interface SplitPctPart { key: string; amount: number }
export interface SplitPackageResult {
  basic: number;
  gross: number;
  amounts: Record<string, number>;
  nonCompliant: boolean;
  /** Σ(configured non-basic parts) − envelope, when the config over-drew (> 0). */
  excess: number;
}

export function splitMonthlyPackage(args: {
  target: number;
  basic: number;
  fixedWeights?: SplitFixedWeight[];
  basicPctParts?: SplitPctPart[];
  grossPctParts?: SplitPctPart[];
  otherKey?: string;
}): SplitPackageResult {
  const target = Math.max(Math.round(args.target || 0), 0);
  const basic = Math.max(Math.round(args.basic || 0), 0);
  const fixedWeights = (args.fixedWeights ?? []).map((w) => ({ key: w.key, weight: Math.max(Math.round(w.weight || 0), 0) }));
  const basicPctParts = (args.basicPctParts ?? []).map((p) => ({ key: p.key, amount: Math.max(Math.round(p.amount || 0), 0) }));
  const grossPctParts = (args.grossPctParts ?? []).map((p) => ({ key: p.key, amount: Math.max(Math.round(p.amount || 0), 0) }));
  const amounts: Record<string, number> = {};

  const basicPctSum = basicPctParts.reduce((s, p) => s + p.amount, 0);
  const grossPctSum = grossPctParts.reduce((s, p) => s + p.amount, 0);
  const sumW = fixedWeights.reduce((s, w) => s + w.weight, 0);
  const committed = basic + basicPctSum + grossPctSum;
  const envelope = target - basic; // allowance pool shared by ALL non-basic parts
  const configuredAllowances = basicPctSum + grossPctSum + sumW;
  const otherKey =
    args.otherKey ||
    fixedWeights.find((w) => /other/i.test(w.key))?.key ||
    "otherAllowances";

  if (envelope < 0) {
    // Statutory floor: Basic alone exceeds the monthly envelope. Fixed parts
    // are zeroed, percentage minimums are kept, and the payable gross is
    // RAISED to the committed minimum so Σ === gross still holds.
    for (const p of [...basicPctParts, ...grossPctParts]) amounts[p.key] = (amounts[p.key] ?? 0) + p.amount;
    return { basic, gross: committed, amounts, nonCompliant: true, excess: 0 };
  }

  if (configuredAllowances <= envelope) {
    // Everything fits: honour every configured part in full; any leftover
    // goes to `otherKey` so Σ(parts) === gross exactly.
    for (const p of [...basicPctParts, ...grossPctParts]) amounts[p.key] = (amounts[p.key] ?? 0) + p.amount;
    for (const w of fixedWeights) amounts[w.key] = (amounts[w.key] ?? 0) + w.weight;
    const leftover = envelope - configuredAllowances;
    if (leftover > 0) amounts[otherKey] = (amounts[otherKey] ?? 0) + leftover;
    return { basic, gross: target, amounts, nonCompliant: false, excess: 0 };
  }

  // Config excess: the configured parts (pct + fixed) draw more than the
  // envelope allows. EVERY non-basic part is scaled pro-rata — rupee-exact
  // with largest-remainder rounding — so Σ(non-basic) === envelope exactly
  // and gross earnings === monthly gross ALWAYS. The overage is reported
  // via `excess` so callers can surface a disclaimer.
  const parts = [
    ...basicPctParts,
    ...grossPctParts,
    ...fixedWeights.map((w) => ({ key: w.key, amount: w.weight })),
  ].filter((p) => p.amount > 0);
  const scale = envelope / configuredAllowances;
  const floored = parts.map((p) => {
    const raw = p.amount * scale;
    return { key: p.key, base: Math.floor(raw), frac: raw - Math.floor(raw) };
  });
  let assigned = floored.reduce((s, f) => s + f.base, 0);
  floored.sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (assigned < envelope && floored.length > 0) {
    floored[i % floored.length].base += 1;
    assigned += 1;
    i += 1;
  }
  for (const f of floored) amounts[f.key] = (amounts[f.key] ?? 0) + f.base;
  return { basic, gross: target, amounts, nonCompliant: false, excess: configuredAllowances - envelope };
}

export function isDailyWageWorker(emp: {
  salaryType?: string | null;
  dailyWageRate?: unknown;
  annualSalary?: unknown;
  skillType?: string | null;
}): boolean {
  const type = (emp.salaryType || "").trim().toLowerCase();
  if (type === "monthly") return false;
  if (type === "daily") return true;
  if (toNumber(emp.dailyWageRate) > 0 && !toNumber(emp.annualSalary)) return true;
  return false;
}

function resolvePaySource(
  emp: {
    annualSalary?: unknown;
    salaryStructures?: PaySourceStructure[];
    salaryType?: string | null;
    dailyWageRate?: unknown;
    skillType?: string | null;
  },
  cfg?: CompanyConfigSnapshot,
  // Wage rates fetched from the Wage Rates & Overrides store. Never defaulted
  // statically — a daily worker with no configured rate (and no override) has
  // no pay basis and is skipped rather than paid off an invented figure.
  wageRates: Array<{
    skillCategory: string;
    dailyRate: unknown;
    hourlyRate?: unknown;
    locationId?: string | null;
    contractorId?: string | null;
    state?: string | null;
  }> = [],
): { salaryStructureId: string | null; structure: PaySourceStructure } | null {
  const structure = emp.salaryStructures?.[0];
  // Prefer the LIVE yearly package so salary edits take effect immediately,
  // even when the stored salary structure hasn't been re-synced yet. The
  // stored structure id is kept for the payslip FK; only the amounts are
  // rebuilt from the current annual salary.
  const annual = toNumber(emp.annualSalary);
  if (annual > 0) {
    const b = salaryStructureBreakdown(annual, cfg);
    return {
      salaryStructureId: structure?.id ?? null,
      structure: {
        id: structure?.id ?? "",
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
        employee: { annualSalary: annual },
      },
    };
  }
  if (structure) return { salaryStructureId: structure.id, structure };
  // Daily-wage workers are paid off the wage-rate table (daily rate × payable
  // days), so the rate table — not a yearly package — is their pay basis.
  // Build a monthly-equivalent allowance base from their resolved rate (the DB
  // wage-rate row, or their own profile override) so allowances/ESI stay
  // proportional to real wages. No static skill default exists: an
  // unconfigured rate means no pay basis.
  if (isDailyWageWorker(emp)) {
    const { dailyRate } = resolveEmployeeWageRate(emp, wageRates);
    if (dailyRate <= 0) return null;
    const monthlyEquiv = Math.max(Math.round(dailyRate * 26), 1);
    const b = salaryStructureBreakdown(monthlyEquiv * 12, cfg);
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
        employee: { annualSalary: monthlyEquiv * 12 },
      },
    };
  }
  // No pay basis configured (no yearly package and no active salary
  // structure) — return null so callers emit an explicit zero /
  // "Not Processed" row instead of synthesising a fabricated salary.
  return null;
}

/**
 * Full-month earnings/deductions per stored key and custom nesting components,
 * driven by the employee's skill-type nesting blueprint. Evaluates all
 * components declared in the template (Fixed, Variable, Benefits, Statutory,
 * and Custom Nest Deductions).
 */
function blueprintComponentAmounts(
  blueprint: Blueprint | null,
  structure: PaySourceStructure,
  amounts: ReturnType<typeof buildPayslipAmounts>,
): {
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  computed: { results?: Record<string, { final: number }> } | null;
  componentMeta: Map<string, { id: string; label: string; kind: string; isPercentage: boolean; nestId?: string | null }>;
} {
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
  const componentMeta = new Map<string, { id: string; label: string; kind: string; isPercentage: boolean; nestId?: string | null }>();

  const visible = (blueprint?.components ?? []).filter((c) => c.visible !== false);
  if (!visible.length) {
    return {
      earnings: fullEarnings,
      deductions: fullDeductions,
      computed: null,
      componentMeta,
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

  const hasCustomStructure = !!structure.id && (toNumber(structure.basicSalary) > 0 || toNumber(structure.hra) > 0);

  for (const key of Object.keys(fullEarnings)) {
    const comp = componentForStoredKey(key);
    if (comp) {
      const v = computed.results?.[comp.id.toLowerCase()]?.final;
      if (v !== undefined && !hasCustomStructure) fullEarnings[key] = v;
      componentMeta.set(key, { id: comp.id, label: comp.label, kind: comp.kind, isPercentage: comp.logic?.type === "percentage", nestId: comp.nestId });
    }
  }

  for (const key of Object.keys(fullDeductions)) {
    const comp = componentForStoredKey(key);
    if (comp) {
      const v = computed.results?.[comp.id.toLowerCase()]?.final;
      if (v !== undefined && !hasCustomStructure) fullDeductions[key] = v;
      componentMeta.set(key, { id: comp.id, label: comp.label, kind: comp.kind, isPercentage: comp.logic?.type === "percentage", nestId: comp.nestId });
    }
  }

  // Attach all custom earnings and custom nesting deductions from the blueprint
  const handledIds = new Set<string>();
  for (const meta of componentMeta.values()) handledIds.add(meta.id.toLowerCase());
  handledIds.add("overtime");
  handledIds.add("ot");

  if (!hasCustomStructure) {
    for (const c of visible) {
      const cid = c.id.toLowerCase();
      if (handledIds.has(cid)) continue;
      const finalVal = computed.results?.[cid]?.final ?? 0;
      const isPct = c.logic?.type === "percentage";
      if (c.kind === "earning" || c.kind === "reimbursement") {
        fullEarnings[c.id] = finalVal;
        componentMeta.set(c.id, { id: c.id, label: c.label, kind: c.kind, isPercentage: isPct, nestId: c.nestId });
      } else if (c.kind === "deduction") {
        fullDeductions[c.id] = finalVal;
        componentMeta.set(c.id, { id: c.label ? c.id : c.id, label: c.label, kind: c.kind, isPercentage: isPct, nestId: c.nestId });
      }
    }
  }

  return { earnings: fullEarnings, deductions: fullDeductions, computed, componentMeta };
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
 * State-specific statutory deductions resolver for Professional Tax (PT) and Labour Welfare Fund (LWF).
 */
export function resolveStateStatutoryDeductions(
  stateName: string | null | undefined,
  gross: number,
  gender: string = "M",
  month: number = 9
) {
  const normState = (stateName || "All States (Default)").toLowerCase().trim();
  let pt = 0;
  let lwf = 20;

  if (normState.includes("delhi")) {
    // Delhi NCT: No Professional Tax, LWF is ₹0.75/month
    pt = 0;
    lwf = 0.75;
  } else if (normState.includes("haryana")) {
    // Haryana: No PT, LWF is 0.2% of salary up to max ₹25/month
    pt = 0;
    lwf = round2(Math.min(Math.max(gross * 0.002, 5), 25));
  } else if (normState.includes("karnataka")) {
    // Karnataka: PT is ₹200 for gross > ₹15,000 (0 below)
    pt = gross > 15000 ? 200 : 0;
    lwf = month === 12 ? 20 : 6;
  } else if (normState.includes("gujarat")) {
    // Gujarat: PT is ₹200 for gross > ₹12,000 (0 below)
    pt = gross > 12000 ? 200 : (gross > 9000 ? 150 : (gross > 6000 ? 80 : 0));
    lwf = 6;
  } else if (normState.includes("tamil nadu") || normState.includes("tamilnadu")) {
    // Tamil Nadu: PT semi-annual slabs (approx ₹208/mo for gross > ₹15,000)
    pt = gross > 15000 ? 208 : (gross > 10000 ? 150 : 0);
    lwf = 20;
  } else if (normState.includes("telangana") || normState.includes("andhra")) {
    // Telangana / AP: PT ₹150 for 15k-20k, ₹200 for > 20k
    pt = gross > 20000 ? 200 : (gross >= 15000 ? 150 : 0);
    lwf = 20;
  } else if (normState.includes("west bengal") || normState.includes("bengal")) {
    // West Bengal: PT slabs: 10k-15k: 110, 15k-20k: 130, 20k-40k: 150, >40k: 200
    pt = gross > 40000 ? 200 : (gross > 20000 ? 150 : (gross > 15000 ? 130 : (gross > 10000 ? 110 : 0)));
    lwf = 3;
  } else if (normState.includes("kerala")) {
    pt = gross > 12500 ? 208 : (gross > 10000 ? 125 : 0);
    lwf = 20;
  } else if (normState.includes("uttar pradesh") || normState.includes("up")) {
    pt = 0;
    lwf = 10;
  } else {
    // Maharashtra & default:
    // PT: ₹200/mo (Feb ₹300). Females earning up to ₹25,000 are exempt.
    const isFemale = String(gender || "").toUpperCase().startsWith("F");
    const ptExempt = isFemale && gross <= 25000;
    if (ptExempt || gross <= 10000) {
      pt = 0;
    } else {
      pt = month === 2 ? 300 : 200;
    }
    lwf = 20;
  }

  return { pt, lwf };
}

/**
 * Compute one employee's payslip from their salary structure/wage rate + reconciliation.
 * Dynamically supports Daily-wage, Monthly-salary with LOP, Overtime multipliers,
 * Configurable components & slabs, Salary advance recovery, and Mid-month join/exit.
 */
export async function computeEmployeePayslip(
  employee: {
    id: string;
    employeeCode?: string;
    firstName?: string;
    lastName?: string;
    annualSalary?: unknown;
    skillType?: string | null;
    salaryType?: string | null;
    dailyWageRate?: unknown;
    locationId?: string | null;
    contractorId?: string | null;
    dateOfJoining?: Date | null;
    dateOfExit?: Date | null;
    state?: string | null;
    gender?: string | null;
  },
  structure: PaySourceStructure,
  year: number,
  month: number,
  precomputed?: EmployeeReconciliation,
  cfg?: CompanyConfigSnapshot,
  blueprint: Blueprint | null = null,
  extraContext?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wageRates?: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customComponents?: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    advances?: any[];
    productionUnits?: number;
  },
) {
  const c = cfg ?? (await getCompanyConfig());
  const amounts = buildPayslipAmounts(structure as unknown as SalaryStructure);
  const { summary, shiftHours } = precomputed ?? (await reconcileEmployee(employee.id, year, month));

  const workingDays = Math.max(summary.workingDays, 1);
  const payableDays =
    summary.presentDays === 0 && summary.unpaidLeaveDays === 0 && summary.paidLeaveDays === 0
      ? workingDays
      : Math.max(summary.payableDays !== undefined ? summary.payableDays : (summary.presentDays + summary.paidLeaveDays), 0);
  const ratio = Math.min(Math.max(payableDays / workingDays, 0), 1);
  // Pay proration factor actually applied to rupee amounts. Monthly staff use
  // the calendar-based LOP ratio (grossPayable / fixed); daily-wage staff use
  // the attendance ratio. A single factor drives earnings AND deductions so
  // both sides of the slip always agree with each other.
  let payRatio = ratio;
  // Share of the calendar month the employee was actually employed
  // (1 for full-month staff; < 1 for mid-month joiners / exiters).
  let employmentRatio = 1;

  const { earnings: fullEarnings, deductions: fullDeductions, computed, componentMeta } =
    blueprintComponentAmounts(blueprint, structure, amounts);

  const isDaily = isDailyWageWorker(employee);

  const { dailyRate, hourlyRate } = resolveEmployeeWageRate(employee, extraContext?.wageRates ?? []);

  const earnings: Record<string, number> = {};
  const shiftDayHours = Math.max(shiftHours || 8, 1);
  const calendarDaysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate() || 30;

  let fixedMonthlySalary = 0;
  let dailySalaryRate = 0;
  let lopDays = 0;
  let lopDeduction = 0;
  let grossPayableSalary = 0;

  // Dynamic component configuration: when active earning components
  // (fixed/percentage) exist for this employee, the package is derived from
  // THEM with a residual basic — Σ(package) === monthly package exactly —
  // instead of stacking component amounts on top of the static structure
  // breakdown (which double-counted, e.g. structure basic + BASIC_WAGE).
  // Tracks which rule codes were consumed so the generic custom-component
  // loop below doesn't apply them a second time.
  const handledPackageCodes = new Set<string>();
  const earningLabels: Record<string, string> = {};
  const deductionLabels: Record<string, string> = {};
  let dynamicBasicAmount: number | undefined;
  let dynamicFullGross: number | undefined;

  const isBasicLikeKey = (codeOrName: unknown) =>
    String(codeOrName || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .includes("basic");
  const isOvertimeLikeRule = (rule: any) =>
    rule.code === "ot_2026" ||
    (rule.code || "").toLowerCase().includes("ot") ||
    (rule.name || "").toLowerCase().includes("overtime") ||
    (rule.name || "").toLowerCase().includes("over time");
  const isPackageEligible = (rule: any) => {
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    if (rule.effectiveFrom && new Date(rule.effectiveFrom) > periodEnd) return false;
    if (rule.effectiveTo && new Date(rule.effectiveTo) < periodStart) return false;
    const appCat = (rule.applicableCategory || "ALL").toUpperCase().replace(/[^A-Z]/g, "");
    const empSkill = (employee.skillType || "Skilled").toUpperCase().replace(/[^A-Z]/g, "");
    if (appCat !== "ALL" && appCat !== empSkill) return false;
    if (rule.locationId && rule.locationId !== employee.locationId) return false;
    if (rule.contractorId && rule.contractorId !== employee.contractorId) return false;
    const effectiveAtt = Math.max(summary.presentDays, summary.payableDays);
    if (rule.minAttendanceDays && effectiveAtt < toNumber(rule.minAttendanceDays)) return false;
    return true;
  };

  // Unified-config gate: fixed/percentage earning components (non-overtime)
  // are configured anywhere in the system → allowance columns come from
  // configs + wage rates, and static structure/company-config legs are
  // skipped. With nothing configured, legacy config-driven legs apply.
  // (Declared here, after isOvertimeLikeRule, to avoid TDZ initialization
  // crashes — this gate runs on every payslip computation including Run.)
  const hasConfiguredAllowances = (extraContext?.customComponents ?? []).some(
    (r: any) => r.kind === "earning" && (r.calcType === "fixed" || r.calcType === "percentage") && !isOvertimeLikeRule(r),
  );

  if (isDaily) {
    // Scenario 1 & 2: Daily rate * payable days
    // Scenario 1 Example: Ravi: 26 Present + 2 Paid Leave = 28 payable days. 900 * 28 = 25200.
    const basicWage = round2(payableDays * dailyRate);
    earnings.basicSalary = basicWage;
    dailySalaryRate = dailyRate;
    lopDays = summary.unpaidLeaveDays;
    lopDeduction = round2(dailyRate * lopDays);
    grossPayableSalary = basicWage;

    // Baseline allowance legs — fully config-driven from the active company
    // configuration (Payroll Settings / CompanyConfig) and pro-rated by the
    // attendance ratio, applied only when neither the salary structure nor
    // the skill blueprint defines the leg. No hardcoded percentages or flat
    // amounts: changing the company config changes these columns everywhere.
    // Unified doctrine: when the admin has configured earning components
    // (Earnings tab), THEY own the allowance columns — these static legs are
    // skipped so no fabricated HRA/Conveyance/Medical appears. With no
    // earning components configured anywhere, the company-config fallback
    // below still pays allowances (config-only fallback).
    if (!hasConfiguredAllowances) {
      if (!fullEarnings.hra && !earnings.hra) {
        earnings.hra = round2(basicWage * c.hraFactor);
      }
      if (!fullEarnings.conveyanceAllowance && !earnings.conveyanceAllowance) {
        earnings.conveyanceAllowance = round2(c.conveyanceAllowance * ratio);
      }
      if (!fullEarnings.medicalAllowance && !earnings.medicalAllowance) {
        earnings.medicalAllowance = round2(c.medicalAllowance * ratio);
      }
    }
    earnings.cca = earnings.cca || 0;

    for (const [key, val] of Object.entries(fullEarnings)) {
      if (key === "total" || key === "overtime" || key === "basicSalary") continue;
      // Configured allowance scheme owns these static legs (see above).
      if (
        hasConfiguredAllowances &&
        (key === "hra" || key === "conveyanceAllowance" || key === "medicalAllowance" || key === "performanceBonus" || key === "otherAllowances")
      ) {
        continue;
      }
      earnings[key] = round2(val * ratio);
    }

    // Scenario 13: Weekly Off & Public Holiday Worked
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weekoffMult = toNumber((c as any).weeklyOffWorkedMultiplier) || 2.0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holidayMult = toNumber((c as any).holidayWorkedMultiplier) || 2.0;
    if (summary.weeklyOffWorkedDays > 0) {
      earnings.weeklyOffPay = round2(summary.weeklyOffWorkedDays * dailyRate * weekoffMult);
    }
    if (summary.holidayWorkedDays > 0) {
      earnings.holidayWorkedPay = round2(summary.holidayWorkedDays * dailyRate * holidayMult);
    }
  } else {
    // Scenario 3: Monthly Salary + Attendance Deduction (LOP)
    // Example:
    // Employee: Suresh
    // Monthly Salary: ₹24,000
    // Month: 30 days
    // LOP: 3 days
    // Daily salary: ₹24,000 ÷ 30 = ₹800
    // LOP deduction: ₹800 × 3 = ₹2,400
    // Gross payable salary: ₹24,000 − ₹2,400 = ₹21,600
    // Then applicable allowances and deductions are processed.
    const annual = toNumber(employee.annualSalary);
    const structureBasic = toNumber(structure.basicSalary);
    // Statutory Basic floor: dailyRate (override else wage table) × 26.
    // Monthly basics can never fall below this — it is the non-editable
    // system-driven floor that keeps payslips compliant state-wise/skill-wise.
    const statutoryMonthlyBasic = basicMonthlyWage(employee, extraContext?.wageRates ?? []).basicMonthly;
    // Rupee-exact monthly package: rounded ONCE so annual/12 never drifts
    // (e.g. ₹5,00,000 → ₹41,667, not 41666.67). All downstream splits absorb
    // remainders instead of re-rounding, so parts always sum to the whole.
    // Base pay is strictly employee-defined (yearly package, else the stored
    // structure). The statutory fallthrough below is reachable only for daily
    // workers (whose pay basis IS the wage-rate table) — monthly staff without
    // a package are excluded upstream by resolvePaySource, never paid off
    // wages. No static default: a daily worker with no configured rate gets 0
    // rather than an invented salary.
    fixedMonthlySalary =
      annual > 0
        ? Math.round(annual / 12)
        : structureBasic > 0
        ? Math.round(structureBasic * 2)
        : statutoryMonthlyBasic;

    dailySalaryRate = round2(fixedMonthlySalary / calendarDaysInMonth);
    lopDays = summary.unpaidLeaveDays;
    lopDeduction = round2(dailySalaryRate * lopDays);
    // Mid-month joining / exit: shrink the monthly envelope to the employed
    // calendar days before subtracting LOP. Reconciliation marks pre-joining
    // days "Not Hired" and post-exit days "Exited" (never LOP), so without
    // this a joiner on the 15th would draw a near-full month. Full-month
    // staff are unaffected (employmentRatio === 1).
    const monthStartUtc = new Date(Date.UTC(year, month - 1, 1));
    const monthEndUtc = new Date(Date.UTC(year, month, 0));
    const dojRaw = employee.dateOfJoining ? new Date(employee.dateOfJoining) : null;
    const exitRaw = employee.dateOfExit ? new Date(employee.dateOfExit) : null;
    const dojUtc = dojRaw && !Number.isNaN(dojRaw.getTime()) ? new Date(Date.UTC(
      dojRaw.getUTCFullYear(),
      dojRaw.getUTCMonth(),
      dojRaw.getUTCDate(),
    )) : null;
    const exitUtc = exitRaw && !Number.isNaN(exitRaw.getTime()) ? new Date(Date.UTC(
      exitRaw.getUTCFullYear(),
      exitRaw.getUTCMonth(),
      exitRaw.getUTCDate(),
    )) : null;
    const employedStart = dojUtc && dojUtc > monthStartUtc ? dojUtc : monthStartUtc;
    const employedEnd = exitUtc && exitUtc < monthEndUtc ? exitUtc : monthEndUtc;
    const employedCalendarDays = employedEnd >= employedStart
      ? Math.round((employedEnd.getTime() - employedStart.getTime()) / 86400000) + 1
      : 0;
    const employmentRatioLocal = employedCalendarDays > 0
      ? Math.min(Math.max(employedCalendarDays / calendarDaysInMonth, 0), 1)
      : 0;
    employmentRatio = employmentRatioLocal;
    const adjustedFixed = Math.round(fixedMonthlySalary * employmentRatioLocal);
    grossPayableSalary = Math.max(Math.round(adjustedFixed - lopDeduction), 0);

    const prorateRatio = fixedMonthlySalary > 0 ? grossPayableSalary / fixedMonthlySalary : ratio;
    payRatio = prorateRatio;

    // Fully dynamic package: the monthly salary envelope (target) is split
    // into the LOCKED statutory basic + allowances so
    // basic + allowances === monthly salary === gross earnings, always.
    // Falls back to the structure-leg split (same doctrine) when no package
    // components apply.
    const packageRules = (extraContext?.customComponents ?? [])
      .filter(
        (r: any) =>
          r.kind === "earning" &&
          (r.calcType === "fixed" || r.calcType === "percentage") &&
          !isOvertimeLikeRule(r) &&
          isPackageEligible(r),
      )
      .sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99));

    if (packageRules.length > 0) {
      // Doctrine: monthly salary (target) = Basic (locked statutory) + allowances;
      // gross === monthly always. Basic is FIXED from the wage table (prorated
      // to the payable target); the remainder is divided into allowances.
      const target = grossPayableSalary;
      const q = fixedMonthlySalary > 0 ? target / fixedMonthlySalary : 1;
      const keyOf = (r: any) => String(r.code || r.name);
      const fromGross = (r: any) =>
        String(r.sourceField || "").toLowerCase() === "ctc" ||
        String(r.percentageFrom || "").toLowerCase().includes("gross");
      const basic = Math.round(statutoryMonthlyBasic * q);
      const fixedWeights: SplitFixedWeight[] = [];
      const basicPctParts: SplitPctPart[] = [];
      const grossPctParts: SplitPctPart[] = [];
      for (const r of packageRules) {
        const key = keyOf(r);
        if (r.calcType === "fixed") {
          let w = Math.round(toNumber(r.value) * q);
          if (r.maxCap != null && w > toNumber(r.maxCap)) w = Math.round(toNumber(r.maxCap));
          fixedWeights.push({ key, weight: Math.max(0, w) });
        } else {
          const pct = toNumber(r.pct);
          if (fromGross(r)) {
            let amt = Math.round(target * (pct / 100));
            if (r.maxCap != null && amt > toNumber(r.maxCap)) amt = Math.round(toNumber(r.maxCap));
            grossPctParts.push({ key, amount: Math.max(0, amt) });
          } else {
            let amt = Math.round(basic * (pct / 100));
            if (r.maxCap != null && amt > toNumber(r.maxCap)) amt = Math.round(toNumber(r.maxCap));
            basicPctParts.push({ key, amount: Math.max(0, amt) });
          }
        }
        handledPackageCodes.add(String(r.code || ""));
        earningLabels[key] = r.name || labelForStoredKey(key);
      }
      const basicRule = packageRules.find((r: any) => isBasicLikeKey(r.code) || isBasicLikeKey(r.name));
      const basicKey = basicRule ? keyOf(basicRule) : "basicSalary";
      if (!earningLabels[basicKey]) earningLabels[basicKey] = basicRule?.name || "Basic Salary";
      const otherRule = packageRules.find(
        (r: any) => !isBasicLikeKey(r.code) && !isBasicLikeKey(r.name) && /other/i.test(keyOf(r)),
      );
      const split = splitMonthlyPackage({
        target,
        basic,
        fixedWeights,
        basicPctParts,
        grossPctParts,
        otherKey: otherRule ? keyOf(otherRule) : "otherAllowances",
      });
      if (split.nonCompliant) {
        // Monthly below the statutory minimum: payable gross is raised to the
        // committed minimum so Σ === gross still holds (flagged in the UI).
        grossPayableSalary = split.gross;
        payRatio = fixedMonthlySalary > 0 ? grossPayableSalary / fixedMonthlySalary : payRatio;
      }
      earnings[basicKey] = split.basic;
      for (const [key, amount] of Object.entries(split.amounts)) earnings[key] = (earnings[key] || 0) + amount;
      dynamicBasicAmount = split.basic;
      dynamicFullGross = fixedMonthlySalary;
    } else if (!hasConfiguredAllowances) {
      // No configurable package rules AND no earning components configured
      // anywhere: Basic is still the locked statutory wage; the remainder
      // (target − basic) is divided across the structure allowance legs
      // pro-rata so Σ === target === monthly salary exactly. This is the
      // config-only fallback — company-config values apply only when no
      // earning component exists.
      const target = grossPayableSalary;
      const q = fixedMonthlySalary > 0 ? target / fixedMonthlySalary : 1;
      const lockedBasic = Math.round(statutoryMonthlyBasic * q);
      const legKeys = ["hra", "conveyanceAllowance", "medicalAllowance", "performanceBonus", "otherAllowances"] as const;
      const proratedLegs = legKeys.map((k) => ({ key: k, weight: Math.max(Math.round(toNumber((fullEarnings as Record<string, unknown>)[k]) * 1), 0) }));
      // NOTE: fullEarnings legs are full-month values; scale them to the
      // payable target the same way package weights are scaled.
      const scaledLegs = proratedLegs.map((l) => ({ key: l.key, weight: Math.max(Math.round(l.weight * q), 0) }));
      const split = splitMonthlyPackage({
        target,
        basic: lockedBasic,
        fixedWeights: scaledLegs,
        otherKey: "otherAllowances",
      });
      for (const [key, val] of Object.entries(fullEarnings)) {
        if (key === "total" || key === "overtime") continue;
        earnings[key] = 0;
      }
      earnings.basicSalary = split.basic;
      for (const [key, amount] of Object.entries(split.amounts)) {
        earnings[key] = round2(toNumber(earnings[key] || 0) + amount);
      }
      if (split.nonCompliant) {
        grossPayableSalary = split.gross;
        payRatio = fixedMonthlySalary > 0 ? grossPayableSalary / fixedMonthlySalary : payRatio;
      }
      dynamicBasicAmount = split.basic;
      dynamicFullGross = fixedMonthlySalary;
    } else {
      // Unified doctrine: earning components ARE configured (just none
      // eligible for this employee), so columns come from configs + wage
      // rates only — locked Basic plus the whole remainder as the residual
      // otherAllowances bucket (mirrors the Earnings-tab split with no
      // allowance weights). Never fabricate hra/conveyance/medical legs.
      const target = grossPayableSalary;
      const q = fixedMonthlySalary > 0 ? target / fixedMonthlySalary : 1;
      const lockedBasic = Math.round(statutoryMonthlyBasic * q);
      for (const [key, val] of Object.entries(fullEarnings)) {
        if (key === "total" || key === "overtime") continue;
        earnings[key] = 0;
      }
      const split = splitMonthlyPackage({
        target,
        basic: lockedBasic,
        fixedWeights: [],
        basicPctParts: [],
        grossPctParts: [],
        otherKey: "otherAllowances",
      });
      earnings.basicSalary = split.basic;
      for (const [key, amount] of Object.entries(split.amounts)) {
        earnings[key] = round2(toNumber(earnings[key] || 0) + amount);
      }
      if (split.nonCompliant) {
        grossPayableSalary = split.gross;
        payRatio = fixedMonthlySalary > 0 ? grossPayableSalary / fixedMonthlySalary : payRatio;
      }
      dynamicBasicAmount = split.basic;
      dynamicFullGross = fixedMonthlySalary;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weekoffMult = toNumber((c as any).weeklyOffWorkedMultiplier) || 2.0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const holidayMult = toNumber((c as any).holidayWorkedMultiplier) || 2.0;
    if (summary.weeklyOffWorkedDays > 0) {
      earnings.weeklyOffPay = round2(summary.weeklyOffWorkedDays * dailySalaryRate * weekoffMult);
    }
    if (summary.holidayWorkedDays > 0) {
      earnings.holidayWorkedPay = round2(summary.holidayWorkedDays * dailySalaryRate * holidayMult);
    }
  }

  // Scenario 5: Overtime with normal, weekly-off, holiday, and night multipliers
  // effectiveBasic prefers the dynamic residual basic (custom basic-code key)
  // and falls back to the structure basic leg.
  const effectiveBasic = dynamicBasicAmount ?? toNumber(earnings.basicSalary);
  const baseHourlyRate = (isDaily || toNumber(employee.dailyWageRate) > 0)
    ? hourlyRate
    : round2((effectiveBasic / workingDays) / shiftDayHours);
  const normalOtMult = toNumber(c.overtimeMultiplier) || 1.5;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weeklyOffOtMult = toNumber((c as any).weeklyOffOtMultiplier) || 2.0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holidayOtMult = toNumber((c as any).holidayOtMultiplier) || 2.0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nightOtMult = toNumber((c as any).nightOtMultiplier) || 2.0;

  const normalOtPay = (summary.normalOtHours || 0) * round2(baseHourlyRate * normalOtMult);
  const weeklyOffOtPay = (summary.weeklyOffOtHours || 0) * round2(baseHourlyRate * weeklyOffOtMult);
  const holidayOtPay = (summary.holidayOtHours || 0) * round2(baseHourlyRate * holidayOtMult);
  const nightOtPay = (summary.nightOtHours || 0) * round2(baseHourlyRate * nightOtMult);
  const totalOtPay = round2(normalOtPay + weeklyOffOtPay + holidayOtPay + nightOtPay);

  // Overtime is purely variable based on actual hours or dynamic pay rules (NEVER static blueprint ratios)
  earnings.overtime = totalOtPay > 0
    ? totalOtPay
    : summary.overtimeHours > 0
    ? round2(summary.overtimeHours * baseHourlyRate * normalOtMult)
    : 0;

  // Scenario 6, 7, 8, 10, 11: Dynamic Configurable Components & Slabs
  const customRules = extraContext?.customComponents ?? [];
  const withholding: Record<string, number> = {};
  // Deduction semantics already claimed by eligible configured components
  // (code + name tokens). Static structure/statutory legs consult this so a
  // configured deduction never double-counts against a hardcoded leg.
  const appliedDeductionTokens = new Set<string>();

  for (const rule of customRules) {
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    if (rule.effectiveFrom && new Date(rule.effectiveFrom) > periodEnd) continue;
    if (rule.effectiveTo && new Date(rule.effectiveTo) < periodStart) continue;

    const appCat = (rule.applicableCategory || "ALL").toUpperCase().replace(/[^A-Z]/g, "");
    const empSkill = (employee.skillType || "Skilled").toUpperCase().replace(/[^A-Z]/g, "");
    if (appCat !== "ALL" && appCat !== empSkill) continue;

    if (rule.locationId && rule.locationId !== employee.locationId) continue;
    if (rule.contractorId && rule.contractorId !== employee.contractorId) continue;

    // Already consumed as a package component above (fixed/percentage inside
    // the monthly envelope) — skipping here prevents double-counting.
    if (rule.code && handledPackageCodes.has(rule.code)) continue;

    // Unified doctrine: LOP is owned by the attendance mechanism
    // (payable-days envelope + leaveDeduction), never by a component.
    if (rule.kind === "deduction" && isLopLikeRule(rule)) continue;

    // Real advance recoveries (advances table) win over flat EMI assumptions.
    if (rule.kind === "deduction" && isAdvanceLikeRule(rule)) {
      const hasRealAdvance = (extraContext?.advances ?? []).some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => a.employeeId === employee.id && a.status === "Active" && Math.max(toNumber(a.amount) - toNumber(a.recoveredAmount), 0) > 0,
      );
      if (hasRealAdvance) continue;
    }

    const isOtRule =
      rule.code === "ot_2026" ||
      (rule.code || "").toLowerCase().includes("ot") ||
      (rule.name || "").toLowerCase().includes("overtime") ||
      (rule.name || "").toLowerCase().includes("over time");

    // Enforce minimum attendance threshold (e.g. Min 24d att.)
    const effectiveAtt = Math.max(summary.presentDays, summary.payableDays);
    if (rule.minAttendanceDays && effectiveAtt < rule.minAttendanceDays) {
      // If employee fails attendance threshold for an overtime rule, overtime pay from this rule is 0
      if (isOtRule) {
        earnings.overtime = 0;
        if (rule.code) earnings[rule.code] = 0;
      }
      continue;
    }

    // Eligible deduction rule: claim its semantics so static legs yield.
    // Recorded even at a zero amount — an admin-owned 0% TDS still owns
    // the incomeTax column (no static leg stacked on top).
    if (rule.kind === "deduction") {
      const codeTok = normCompToken(rule.code);
      const nameTok = normCompToken(rule.name);
      if (codeTok) appliedDeductionTokens.add(codeTok);
      if (nameTok) appliedDeductionTokens.add(nameTok);
    }

    let compAmount = 0;
    const calcType = rule.calcType;

    if (calcType === "fixed") {
      compAmount = toNumber(rule.value);
    } else if (calcType === "percentage") {
      // Single dynamic base: the employee's Monthly gross (₹) — monthlyGross
      // field, else annualSalary / 12. Legacy basic/ctc sources resolve here
      // too so every % rule tracks live profile edits.
      const monthlyBase =
        toNumber((employee as any).monthlyGross) > 0
          ? toNumber((employee as any).monthlyGross)
          : toNumber(employee.annualSalary) / 12;
      const src = monthlyBase > 0 ? monthlyBase : earnings.basicSalary;
      compAmount = round2(src * (toNumber(rule.pct) / 100));
      // Percentage deductions follow the same pay factor as earnings so a
      // LOP / mid-month-joining month doesn't over-withhold. Fixed-amount
      // deductions (PT/LWF flats) and attendance-driven rules stay unscaled.
      if (rule.kind === "deduction") compAmount = round2(compAmount * payRatio);
    } else if (calcType === "per_day" || calcType === "per_shift") {
      const isNight = (rule.metric || "").toLowerCase().includes("night") || rule.code === "NIGHT_ALLOW";
      if (isOtRule) {
        // For overtime per_day rule, calculate by overtime days worked (or ot hours / 8)
        const otDays = (summary as any).overtimeDays || (summary.overtimeHours > 0 ? Math.ceil(summary.overtimeHours / 8) : 0);
        compAmount = otDays > 0 ? round2(toNumber(rule.value) * otDays) : 0;
      } else {
        const count = isNight ? (summary.nightShiftCount || 0) : summary.payableDays;
        const minThresh = toNumber(rule.minThreshold) || 0;
        compAmount = count < minThresh ? 0 : round2(toNumber(rule.value) * count);
      }
    } else if (calcType === "per_hour") {
      compAmount = round2(toNumber(rule.value) * summary.overtimeHours);
    } else if (calcType === "slab") {
      const metric = (rule.metric || "payableDays").toLowerCase();
      let metricVal = summary.payableDays;
      if (metric.includes("night")) metricVal = summary.nightShiftCount || 0;
      else if (metric.includes("production")) metricVal = extraContext?.productionUnits ?? 0;
      else if (metric.includes("ot")) metricVal = summary.overtimeHours || 0;
      else if (metric.includes("present")) metricVal = summary.presentDays;

      let matched = 0;
      const slabs = Array.isArray(rule.slabs)
        ? rule.slabs
        : typeof rule.slabs === "string"
        ? JSON.parse(rule.slabs)
        : [];
      for (const s of slabs) {
        const sMin = toNumber(s.min);
        const sMax = s.max !== undefined && s.max !== null ? toNumber(s.max) : Infinity;
        if (metricVal >= sMin && metricVal <= sMax) {
          matched = s.amount !== undefined ? toNumber(s.amount) : (s.value !== undefined ? toNumber(s.value) : 0);
          break;
        }
      }
      compAmount = matched;
    } else if (calcType === "threshold") {
      const metric = (rule.metric || "payableDays").toLowerCase();
      let metricVal = summary.payableDays;
      if (metric.includes("night")) metricVal = summary.nightShiftCount || 0;
      else if (metric.includes("production")) metricVal = extraContext?.productionUnits ?? 0;

      const thresh = rule.minThreshold !== undefined ? toNumber(rule.minThreshold) : 0;
      compAmount = metricVal >= thresh ? toNumber(rule.value) : 0;
    }

    if (rule.maxCap && compAmount > toNumber(rule.maxCap)) {
      compAmount = toNumber(rule.maxCap);
    }

    const isAttBonus = rule.code === "ATT_BONUS" || rule.name?.toLowerCase().includes("attendance bonus");
    const isNightAllow = rule.code === "NIGHT_ALLOW" || rule.name?.toLowerCase().includes("night");
    const isProdInc = rule.code === "PROD_INC" || rule.name?.toLowerCase().includes("production");

    if (isOtRule) {
      earnings.overtime = round2(compAmount);
      if (rule.code) {
        earnings[rule.code] = round2(compAmount);
        earningLabels[rule.code] = rule.name || labelForStoredKey(rule.code);
      }
      earningLabels.overtime = "Overtime";
    } else if (isAttBonus) {
      earnings.attendanceBonus = round2(compAmount);
      earningLabels.attendanceBonus = rule.name || "Attendance Bonus";
    } else if (isNightAllow) {
      earnings.nightShiftAllowance = round2(compAmount);
      earningLabels.nightShiftAllowance = rule.name || "Night Shift Allowance";
    } else if (isProdInc) {
      earnings.productionIncentive = round2(compAmount);
      earningLabels.productionIncentive = rule.name || "Production Incentive";
    } else if (compAmount > 0) {
      const codeKey = rule.code || rule.name;
      if (rule.kind === "earning") {
        earnings[codeKey] = round2(compAmount);
        earningLabels[codeKey] = rule.name || labelForStoredKey(codeKey);
      } else if (rule.kind === "deduction") {
        withholding[codeKey] = round2(compAmount);
        deductionLabels[codeKey] = rule.name || labelForStoredKey(codeKey);
      }
    }
  }

  // Scenario 7: Night Shift Allowance fallback if no custom slab component exists but night shifts worked
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (earnings.nightShiftAllowance === undefined && summary.nightShiftCount > 0 && (c as any).nightShiftAllowance) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perShiftRate = toNumber((c as any).nightShiftAllowance) || 100;
    earnings.nightShiftAllowance = round2(summary.nightShiftCount * perShiftRate);
  }

  // Scenario 14: Mid-Month Exit & Leave Encashment
  if (employee.dateOfExit) {
    // No static default: encashment follows the employee's own basic (daily
    // staff use their wage rate). Zero basic → zero encashment, never an
    // invented sum.
    const encashDailyRate = isDaily
      ? dailyRate
      : effectiveBasic > 0
      ? round2(effectiveBasic / calendarDaysInMonth)
      : 0;
    earnings.leaveEncashment = round2(2 * encashDailyRate);
    earningLabels.leaveEncashment = "Leave Encashment";
  }

  // Blueprint / Statutory Deductions — prorated by the same pay factor as
  // earnings so a LOP (or mid-month joining) month stays internally
  // consistent instead of mixing calendar-based earnings with
  // working-day-based deductions.
  // Unified doctrine: a configured deduction owns its column — skip any
  // static structure leg it already claimed (no double PF/PT/ESI).
  for (const [key, val] of Object.entries(fullDeductions)) {
    if (key === "total" || key === "leaveDeduction" || withholding[key] !== undefined) continue;
    if (appliedDeductionCovers(appliedDeductionTokens, key)) continue;
    const meta = componentMeta.get(key);
    const shouldProrate = meta?.isPercentage || key === "providentFund";
    withholding[key] = shouldProrate ? round2(val * payRatio) : round2(val);
  }

  // Scenario 12: Salary Advance / Loan Recovery
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const advances = (extraContext?.advances ?? []).filter((a: any) => a.employeeId === employee.id && a.status === "Active");
  let totalAdvanceDeduction = 0;
  for (const adv of advances) {
    const outstanding = Math.max(toNumber(adv.amount) - toNumber(adv.recoveredAmount), 0);
    const recovery = Math.min(toNumber(adv.monthlyDeduction), outstanding);
    if (recovery > 0) totalAdvanceDeduction += recovery;
  }
  if (totalAdvanceDeduction > 0) {
    withholding.salaryAdvanceRecovery = round2(totalAdvanceDeduction);
  }

  earnings.total = Math.round(Object.values(earnings).reduce((s, v) => s + v, 0));

  // Statutory Indian defaults for workforce / daily-wage calculations.
  // Each applies ONLY when no configured deduction owns the column
  // (config-only fallback — a configured EPF/ESI/PT/LWF fully replaces the
  // static default instead of stacking on top of it).
  // PF: 12% of basic wage (capped at 1800 if basic >= 15000)
  if (!withholding.providentFund && !appliedDeductionCovers(appliedDeductionTokens, "providentFund")) {
    const pfBase = Number(effectiveBasic || 0);
    withholding.providentFund = round2(Math.min(pfBase * 0.12, 1800));
  }

  // ESIC: 0.75% of gross earnings if gross <= 21,000; otherwise 0
  if (
    withholding.healthInsurance === undefined &&
    withholding.esic === undefined &&
    !appliedDeductionCovers(appliedDeductionTokens, "healthInsurance")
  ) {
    withholding.healthInsurance = earnings.total <= 21000 ? round2(earnings.total * 0.0075) : 0;
  }

  const stateDeductions = resolveStateStatutoryDeductions(
    employee.state,
    earnings.total,
    employee.gender || "M",
    month
  );

  // Professional Tax (PT): State-specific statutory computation
  if (withholding.professionalTax === undefined && !appliedDeductionCovers(appliedDeductionTokens, "professionalTax")) {
    withholding.professionalTax = stateDeductions.pt;
  }

  // Labour Welfare Fund (LWF): State-specific statutory computation
  if (withholding.lwf === undefined && !appliedDeductionCovers(appliedDeductionTokens, "lwf")) {
    withholding.lwf = stateDeductions.lwf;
  }

  // Net protection: total deductions cannot exceed gross earnings
  const maxDeductible = Math.max(earnings.total, 0);
  const rawTotal = Object.values(withholding).reduce((s, v) => s + v, 0);
  const scale = rawTotal > maxDeductible && rawTotal > 0 ? maxDeductible / rawTotal : 1;
  for (const key of Object.keys(withholding)) {
    withholding[key] = round2(withholding[key] * scale);
  }
  withholding.total = Math.round(Object.values(withholding).reduce((s, v) => s + v, 0));

  const slipNet = Math.max(earnings.total - withholding.total, 0);

  // Employer-side statutory costs (PF, ESI, gratuity)
  const monthlySalary = toNumber(structure.employee?.annualSalary) / 12 || earnings.total;
  const proratedBasic = Number(effectiveBasic ?? 0);
  const esiEligible = monthlySalary > 0 && monthlySalary <= c.esiGrossCeiling;
  const fallbackEmployer = {
    providentFund: round2(proratedBasic * c.epfEmployerRate),
    esi: esiEligible ? round2(earnings.total * c.esiEmployerRate) : 0,
    gratuity: round2(proratedBasic * c.gratuityRate),
  };
  const blueprintEmployer = employerBlueprintAmounts(blueprint, computed, fallbackEmployer);
  const employerContributions: Record<string, number> = {
    providentFund: round2(blueprintEmployer.providentFund * payRatio),
    esi: blueprintEmployer.esi > 0 ? round2(blueprintEmployer.esi * payRatio) : 0,
    gratuity: round2(blueprintEmployer.gratuity * payRatio),
  };

  const unproratedGross = Object.values(fullEarnings).reduce((s, v) => s + v, 0);

  // Fill label gaps: structure/statutory keys get canonical labels so the
  // frontend can render fully dynamic columns without hardcoding names.
  for (const k of Object.keys(earnings)) {
    if (k === "total") continue;
    if (!earningLabels[k]) earningLabels[k] = labelForStoredKey(k);
  }
  for (const k of Object.keys(withholding)) {
    if (k === "total") continue;
    if (!deductionLabels[k]) deductionLabels[k] = labelForStoredKey(k);
  }

  return {
    earnings,
    deductions: withholding,
    employerContributions,
    earningLabels,
    deductionLabels,
    netPay: slipNet,
    fullGross: Math.round(dynamicFullGross ?? unproratedGross ?? amounts.earnings.total),
    summary: {
      ...summary,
      dailyRate: isDaily ? dailyRate : dailySalaryRate,
      dailySalaryRate,
      fixedMonthlySalary: !isDaily ? fixedMonthlySalary : undefined,
      calendarDaysInMonth,
      employmentRatio: Math.round(employmentRatio * 10000) / 10000,
      lopDays,
      lopDeduction,
      grossPayableSalary: !isDaily ? grossPayableSalary : earnings.total,
      salaryType: isDaily ? "Daily" : "Monthly",
      productionUnits: Number(extraContext?.productionUnits ?? 0),
    },
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

  const [employees, structures, wageRates, customComponents, salaryAdvances, productionRecords] = await Promise.all([
    prisma.employee.findMany({
      where: { status: { in: PAYROLL_ELIGIBLE_STATUSES } },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        annualSalary: true,
        skillType: true,
        salaryType: true,
        dailyWageRate: true,
        locationId: true,
        contractorId: true,
        dateOfJoining: true,
        dateOfExit: true,
        state: true,
        gender: true,
        location: { select: { name: true, address: true } },
      },
    }),
    prisma.salaryStructure.findMany({
      where: { isActive: true },
      include: { employee: { select: { id: true, status: true, annualSalary: true } } },
    }),
    prisma.wageRate.findMany({ where: { isActive: true } }),
    prisma.payrollComponentConfig.findMany({ where: { isActive: true } }),
    prisma.salaryAdvance.findMany({ where: { status: "Active" } }),
    prisma.productionRecord.findMany({ where: { month: parsed.month, year: parsed.year } }),
  ]);

  const productionByEmp = new Map<string, number>();
  for (const pr of productionRecords) {
    productionByEmp.set(pr.employeeId, pr.unitsProduced);
  }

  const activeEmployeeIds = new Set(employees.map((e) => e.id));
  const structureByEmployee = new Map<string, (typeof structures)[number]>();
  for (const s of structures) {
    if (activeEmployeeIds.has(s.employeeId)) structureByEmployee.set(s.employeeId, s);
  }

  // Every active employee with a genuine pay basis: a yearly package, an
  // active salary structure, or a daily-wage profile (rate table). Skill type
  // alone is NOT a pay basis — such employees surface as zero/"Not Processed"
  // rows in the live summaries instead of fabricated slips here.
  const eligible = employees.filter(
    (emp) =>
      structureByEmployee.has(emp.id) ||
      toNumber(emp.annualSalary) > 0 ||
      isDailyWageWorker(emp),
  );
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
    // Route every employee through resolvePaySource so the LIVE annualSalary
    // drives the breakdown. resolvePaySource keeps the stored structure id
    // for the FK but rebuilds amounts from the current package — a salary
    // edit is therefore reflected in the very next run/summary instead of
    // reusing a stale stored structure. Employees whose pay basis vanished
    // since eligibility was computed are skipped, never fabricated.
    const withStructures = {
      ...emp,
      salaryStructures: structureByEmployee.has(emp.id)
        ? [structureByEmployee.get(emp.id)! as unknown as PaySourceStructure]
        : [],
    };
    const source = resolvePaySource(withStructures, cfg, wageRates);
    if (!source) continue;
    const comp = await computeEmployeePayslip(
      emp,
      source.structure,
      parsed.year,
      parsed.month,
      reconciliationById.get(emp.id),
      cfg,
      blueprintForSkill(templates, (emp as { skillType?: string | null }).skillType),
      {
        wageRates,
        customComponents,
        advances: salaryAdvances,
        productionUnits: productionByEmp.get(emp.id) ?? 0,
      },
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
      attendanceSummary: {
        ...comp.summary,
        ratio: Math.round(comp.ratio * 100) / 100,
        contractorId: emp.contractorId,
        locationId: emp.locationId,
      },
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

  // Apply salary advance recoveries to advance ledger
  const runPayslips = await prisma.payslip.findMany({
    where: { payrollRunId: run.id },
    select: { employeeId: true, deductions: true },
  });

  for (const slip of runPayslips) {
    const ded = (slip.deductions as Record<string, number>) || {};
    const advRec = ded.salaryAdvanceRecovery || ded.advanceRecovery || 0;
    if (advRec > 0) {
      const activeAdvances = await prisma.salaryAdvance.findMany({
        where: { employeeId: slip.employeeId, status: "Active" },
        orderBy: { disbursedOn: "asc" },
      });
      let rem = advRec;
      for (const adv of activeAdvances) {
        if (rem <= 0) break;
        const out = Math.max(toNumber(adv.amount) - toNumber(adv.recoveredAmount), 0);
        const apply = Math.min(out, rem);
        const newRecovered = toNumber(adv.recoveredAmount) + apply;
        const newStatus = newRecovered >= toNumber(adv.amount) ? "Completed" : "Active";
        await prisma.salaryAdvance.update({
          where: { id: adv.id },
          data: { recoveredAmount: newRecovered, status: newStatus },
        });
        rem -= apply;
      }
    }
  }

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

  const [run, templates, wageRates, customComponents, salaryAdvances, productionRecords] = await Promise.all([
    prisma.payrollRun.findUnique({ where: { month_year: { month, year } } }),
    loadBlueprintsBySkillType(),
    prisma.wageRate.findMany({ where: { isActive: true } }),
    prisma.payrollComponentConfig.findMany({ where: { isActive: true } }),
    prisma.salaryAdvance.findMany({ where: { employeeId: emp.id, status: "Active" } }),
    prisma.productionRecord.findMany({ where: { employeeId: emp.id, month, year } }),
  ]);
  const blueprint = blueprintForSkill(templates, (emp as { skillType?: string | null }).skillType);

  const cfg = await getCompanyConfig();
  const source = resolvePaySource(emp, cfg, wageRates);
  // No pay basis configured yet (no active salary structure, no yearly
  // package) — show a clean zero summary rather than synthesizing amounts.
  if (!source) return { data: zeroSummaryPayload(emp, run, month, year) };

  const comp = await computeEmployeePayslip(
    emp,
    source.structure,
    year,
    month,
    undefined,
    cfg,
    blueprint,
    {
      wageRates,
      customComponents,
      advances: salaryAdvances,
      productionUnits: productionRecords[0]?.unitsProduced ?? 0,
    },
  );
  return { data: buildSummaryPayload(emp, run!, comp, month, year, blueprint) };
}

function zeroSummaryPayload(
  emp: {
    id?: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    gender?: string | null;
    dateOfJoining?: Date | null;
    skillType?: string | null;
    state?: string | null;
  },
  run: { status: string } | null,
  month: number,
  year: number,
) {
  return {
    id: emp.id || emp.employeeCode,
    period: periodLabel({ month, year }),
    month,
    year,
    status: run?.status ?? "Not Processed",
    employeeId: emp.employeeCode,
    employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
    gender: emp.gender ? (emp.gender.toUpperCase().startsWith("M") ? "M" : "F") : "M",
    doj: emp.dateOfJoining ? new Date(emp.dateOfJoining).toISOString().slice(0, 10) : "",
    category: (emp.skillType || "Skilled").toUpperCase().replace(/\s+/g, ""),
    skillType: emp.skillType || "Skilled",
    state: emp.state || "All States (Default)",
    salaryType: (emp as { salaryType?: string | null }).salaryType || "Monthly",
    dailyRate: 0,
    dailyWageRate: 0,
    dailySalaryRate: 0,
    fixedMonthlySalary: 0,
    calendarDaysInMonth: 30,
    lopDays: 0,
    lopDeduction: 0,
    grossPayableSalary: 0,
    days: 0,
    workingDays: 0,
    presentDays: 0,
    paidLeaveDays: 0,
    leaveDays: 0,
    basic: 0,
    hra: 0,
    conv: 0,
    med: 0,
    cca: 0,
    special: 0,
    overtime: 0,
    overtimeHours: 0,
    attendanceBonus: 0,
    nightShiftCount: 0,
    nightShiftAllowance: 0,
    productionUnits: 0,
    productionIncentive: 0,
    gross: 0,
    annualSalary: 0,
    attendanceRatio: 0,
    leaveDeduction: 0,
    noSalaryStructure: true,
    pf: 0,
    esic: 0,
    pt: 0,
    lwf: 0,
    deductions: {
      providentFund: 0,
      professionalTax: 0,
      incomeTax: 0,
      healthInsurance: 0,
      lwf: 0,
      leaveDeduction: 0,
      total: 0,
    },
    totalDeductions: 0,
    earnings: {},
    earningGroups: [],
    deductionGroups: [],
    net: 0,
    netPay: 0,
  };
}

function buildSummaryPayload(
  emp: {
    id?: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    annualSalary?: unknown;
    salaryType?: string | null;
    dailyWageRate?: unknown;
    gender?: string | null;
    dateOfJoining?: Date | null;
    skillType?: string | null;
    state?: string | null;
  },
  run: { status: string } | null,
  comp: Awaited<ReturnType<typeof computeEmployeePayslip>>,
  month: number,
  year: number,
  blueprint: Blueprint | null = null,
) {
  const annualSalary = toNumber(emp.annualSalary);
  const monthlyPackage = annualSalary > 0 ? annualSalary / 12 : comp.fullGross;
  const isDaily = comp.summary.salaryType === "Daily";
  const fixedMonthlySalary = comp.summary.fixedMonthlySalary || (isDaily ? undefined : Math.round(monthlyPackage));
  const lopDays = comp.summary.lopDays ?? comp.summary.unpaidLeaveDays;
  const lopDeduction = comp.summary.lopDeduction ?? Math.max(Math.round(monthlyPackage) - comp.earnings.total, 0);
  const grossPayableSalary = comp.summary.grossPayableSalary ?? comp.earnings.total;
  const gross = Math.round(comp.earnings.total || monthlyPackage);
  const leaveDeduction = Math.round(lopDeduction);
  const { earningGroups, deductionGroups } = buildPayrollGroups(comp.earnings, comp.deductions, blueprint);

  // Fully dynamic breakdowns: every earning/deduction key with its display
  // label and rupee amount, so clients render columns from real data instead
  // of a hardcoded component list. Rounding drift is absorbed into the
  // basic-like (earnings) or largest (deductions) leg so details always sum
  // to the headline totals exactly.
  const toDetails = (
    obj: Record<string, number>,
    labels: Record<string, string> | undefined,
    exclude: string[],
  ) =>
    Object.entries(obj || {})
      .filter(([k]) => !exclude.includes(k))
      .map(([key, v]) => ({
        key,
        label: labels?.[key] || labelForStoredKey(key),
        amount: Math.round(toNumber(v)),
      }));
  const earningDetails = toDetails(comp.earnings, (comp as any).earningLabels, ["total"]);
  const deductionDetails = toDetails(comp.deductions, (comp as any).deductionLabels, [
    "total",
    "leaveDeduction",
  ]);
  const absorbDrift = (
    details: Array<{ key: string; amount: number }>,
    target: number,
  ) => {
    const sum = details.reduce((s, d) => s + d.amount, 0);
    const diff = Math.round(target) - sum;
    if (diff !== 0 && details.length > 0) {
      const basicIdx = details.findIndex((d) =>
        d.key.toLowerCase().replace(/[^a-z]/g, "").includes("basic"),
      );
      const idx =
        basicIdx >= 0
          ? basicIdx
          : details.reduce((bi, d, i) => (d.amount > details[bi].amount ? i : bi), 0);
      details[idx].amount += diff;
    }
  };
  absorbDrift(earningDetails, gross);
  absorbDrift(deductionDetails, Math.round(comp.deductions.total));

  const normDetailKey = (k: string) => k.toLowerCase().replace(/[^a-z]/g, "");
  const detailAmt = (
    details: Array<{ key: string; amount: number }>,
    ...matchers: string[]
  ) => {
    const hit = details.find((d) =>
      matchers.some((m) => normDetailKey(d.key).includes(m)),
    );
    return hit ? hit.amount : 0;
  };

  // Legacy flat columns are derived from the SAME dynamic details (not from
  // hardcoded structure legs), so every consumer sees identical numbers:
  // no static SPECIAL/CCA-style buckets anywhere in the chain.
  const basic = detailAmt(earningDetails, "basic");
  const hra = detailAmt(earningDetails, "hra");
  const conv = detailAmt(earningDetails, "conveyance", "transport", "conv");
  const med = detailAmt(earningDetails, "medical");
  const cca = detailAmt(earningDetails, "cca", "compensatory");
  const overtime = detailAmt(earningDetails, "overtime");
  const attendanceBonus = detailAmt(
    earningDetails,
    "attendancebonus",
    "attbonus",
  );
  const nightShiftAllowance = detailAmt(
    earningDetails,
    "nightshiftallowance",
    "nightallow",
    "night",
  );
  const productionIncentive = detailAmt(
    earningDetails,
    "productionincentive",
    "prodinc",
    "production",
  );

  const nightShiftCount = comp.summary.nightShiftCount || 0;
  const productionUnits = Number((comp.summary as any).productionUnits || 0);

  // Special is the balancing figure so the displayed columns ALWAYS sum to
  // gross exactly: it folds in otherAllowances + performanceBonus +
  // weekly-off/holiday/leave-encashment extras + any dynamic custom earning
  // components (food, transport, …) that have no dedicated column.
  // (Previously special was just otherAllowances, so every hidden extra made
  // the visible parts sum to less than gross — the "round off" mismatch.)
  const special = Math.max(
    0,
    gross - (basic + hra + conv + med + cca + overtime + attendanceBonus + nightShiftAllowance + productionIncentive),
  );

  const pf = Math.round(comp.deductions.providentFund || 0);
  const esic = Math.round(comp.deductions.healthInsurance || comp.deductions.esic || 0);
  const pt = Math.round(comp.deductions.professionalTax || 0);
  // No fabricated fallback: when neither the state resolver nor a configured
  // LWF rule produced a value, LWF is 0 (previously a hardcoded ₹20).
  const lwf = comp.deductions.lwf !== undefined ? round2(comp.deductions.lwf) : 0;
  const incomeTax = Math.round(
    comp.deductions.incomeTax ?? comp.deductions.tds ?? 0,
  );
  const advanceRecovery = Math.round(
    comp.deductions.salaryAdvanceRecovery ?? comp.deductions.advanceRecovery ?? 0,
  );
  const totalDeductions = Math.round(comp.deductions.total);

  const netPay = Math.round(comp.netPay);

  return {
    id: emp.id || emp.employeeCode,
    period: periodLabel({ month, year }),
    month,
    year,
    status: run?.status ?? "Draft",
    employeeId: emp.employeeCode,
    employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
    gender: emp.gender ? (emp.gender.toUpperCase().startsWith("M") ? "M" : "F") : "M",
    doj: emp.dateOfJoining ? new Date(emp.dateOfJoining).toISOString().slice(0, 10) : "",
    category: (emp.skillType || "Skilled").toUpperCase().replace(/\s+/g, ""),
    skillType: emp.skillType || "Skilled",
    salaryType: comp.summary.salaryType || emp.salaryType || "Monthly",
    dailyRate: comp.summary.dailyRate,
    dailyWageRate: comp.summary.dailySalaryRate ?? comp.summary.dailyRate,
    dailySalaryRate: comp.summary.dailySalaryRate,
    fixedMonthlySalary,
    calendarDaysInMonth: comp.summary.calendarDaysInMonth || 30,
    lopDays,
    lopDeduction,
    grossPayableSalary,
    state: emp.state || "All States (Default)",
    days: comp.summary.payableDays,
    workingDays: comp.summary.workingDays,
    presentDays: comp.summary.presentDays,
    paidLeaveDays: comp.summary.paidLeaveDays,
    leaveDays: comp.summary.unpaidLeaveDays,
    attendanceRatio: Math.round(comp.ratio * 100) / 100,
    basic,
    hra,
    conv,
    med,
    cca,
    special,
    overtime,
    overtimeHours: comp.summary.overtimeHours || 0,
    attendanceBonus,
    nightShiftCount,
    nightShiftAllowance,
    productionUnits,
    productionIncentive,
    gross,
    annualSalary: Math.round(annualSalary),
    leaveDeduction,
    pf,
    esic,
    pt,
    lwf,
    incomeTax,
    advanceRecovery,
    deductions: {
      ...comp.deductions,
      providentFund: pf,
      professionalTax: pt,
      incomeTax,
      salaryAdvanceRecovery: advanceRecovery,
      healthInsurance: esic,
      lwf,
      leaveDeduction,
      total: totalDeductions,
    },
    totalDeductions,
    earningDetails,
    deductionDetails,
    net: netPay,
    netPay,
    earnings: comp.earnings,
    earningGroups,
    deductionGroups,
  };
}

/**
 * Batched payroll summaries for all active employees in one request. Uses a
 * single reconcileEmployees call (6 queries total) instead of N per-employee
 * reconciliations, and one blueprint load, so the annual/monthly payroll views
 * scale with employee count instead of multiplying round-trips.
 */
export async function getEmployeePayrollSummaries(month: number, year: number) {
  const [employees, run, wageRates, customComponents, salaryAdvances, productionRecords] = await Promise.all([
    prisma.employee.findMany({
      where: { status: { in: PAYROLL_ELIGIBLE_STATUSES } },
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
    prisma.wageRate.findMany({ where: { isActive: true } }),
    prisma.payrollComponentConfig.findMany({ where: { isActive: true } }),
    prisma.salaryAdvance.findMany({ where: { status: "Active" } }),
    prisma.productionRecord.findMany({ where: { month, year } }),
  ]);

  const productionByEmp = new Map<string, number>();
  for (const pr of productionRecords) {
    productionByEmp.set(pr.employeeId, pr.unitsProduced);
  }

  const cfg = await getCompanyConfig();
  const withPaySource = employees.filter((e) => !!resolvePaySource(e, cfg, wageRates));
  const reconciliations = withPaySource.length > 0
    ? await reconcileEmployees(withPaySource.map((e) => e.id), year, month)
    : [];
  const recById = new Map(reconciliations.map((r) => [r.employeeId, r]));

  const templates = await loadBlueprintsBySkillType();
  const comps = await Promise.all(
    withPaySource.map((emp) =>
      computeEmployeePayslip(
        emp,
        resolvePaySource(emp, cfg, wageRates)!.structure,
        year,
        month,
        recById.get(emp.id),
        cfg,
        blueprintForSkill(templates, (emp as { skillType?: string | null }).skillType),
        {
          wageRates,
          customComponents,
          advances: salaryAdvances,
          productionUnits: productionByEmp.get(emp.id) ?? 0,
        },
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

/**
 * Execute payroll calculations and upsert payslips for an entire skill category
 * (or all employees) for a given month and year.
 */
export async function runPayrollForSkillGroup(
  skillType: string,
  month: number,
  year: number,
  actorUserId?: string
) {
  let run = await prisma.payrollRun.findUnique({
    where: { month_year: { month, year } },
  });
  if (!run) {
    run = await prisma.payrollRun.create({
      data: {
        period: `${month}/${year}`,
        month,
        year,
        status: "Draft",
      },
      include: RUN_INCLUDE,
    });
  }

  const whereClause: Prisma.EmployeeWhereInput = {
    status: { in: PAYROLL_ELIGIBLE_STATUSES },
  };
  if (skillType && skillType !== "ALL") {
    // Match every spelling variant (Semi Skilled / Semi-Skilled / SEMISKILLED…)
    // so a profile edit in any format is found by any payroll filter.
    const variants = skillVariants(skillType);
    whereClause.OR = variants.map((v) => ({ skillType: { equals: v, mode: "insensitive" as const } }));
  }

  const employees = await prisma.employee.findMany({
    where: whereClause,
    include: {
      salaryStructures: {
        where: { isActive: true },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
      location: true,
    },
  });

  const [wageRates, customComponents, salaryAdvances, productionRecords, cfg, templates] = await Promise.all([
    prisma.wageRate.findMany({ where: { isActive: true } }),
    prisma.payrollComponentConfig.findMany({ where: { isActive: true } }),
    prisma.salaryAdvance.findMany({ where: { status: "Active" } }),
    prisma.productionRecord.findMany({ where: { month, year } }),
    getCompanyConfig(),
    loadBlueprintsBySkillType(),
  ]);

  const productionByEmp = new Map<string, number>();
  for (const pr of productionRecords) {
    productionByEmp.set(pr.employeeId, pr.unitsProduced);
  }

  const reconciliations = employees.length > 0
    ? await reconcileEmployees(employees.map((e) => e.id), year, month)
    : [];
  const recById = new Map(reconciliations.map((r) => [r.employeeId, r]));

  const generatedSlips = [];
  const skippedNoPayBasis: string[] = [];
  for (const emp of employees) {
    const paySource = resolvePaySource(emp, cfg, wageRates);
    // No pay basis (no package, no structure, not daily-wage) — skip instead
    // of inventing a zero slip, so run totals only reflect real workers.
    if (!paySource) {
      skippedNoPayBasis.push(emp.employeeCode);
      continue;
    }
    const structure = paySource.structure;
    const comp = await computeEmployeePayslip(
      emp,
      structure,
      year,
      month,
      recById.get(emp.id),
      cfg,
      blueprintForSkill(templates, (emp as { skillType?: string | null }).skillType),
      {
        wageRates,
        customComponents,
        advances: salaryAdvances,
        productionUnits: productionByEmp.get(emp.id) ?? 0,
      }
    );

    const slip = await prisma.payslip.upsert({
      where: {
        payrollRunId_employeeId: {
          payrollRunId: run.id,
          employeeId: emp.id,
        },
      },
      create: {
        payrollRunId: run.id,
        employeeId: emp.id,
        period: `${run.period}`,
        salaryStructureId: paySource?.salaryStructureId || null,
        earnings: comp.earnings as unknown as Prisma.InputJsonValue,
        deductions: comp.deductions as unknown as Prisma.InputJsonValue,
        employerContributions: comp.employerContributions as unknown as Prisma.InputJsonValue,
        attendanceSummary: {
          ...comp.summary,
          ratio: Math.round(comp.ratio * 100) / 100,
          category: emp.skillType,
          state: emp.state,
        } as Prisma.InputJsonValue,
        netPay: comp.netPay,
        status: "Draft",
      },
      update: {
        salaryStructureId: paySource?.salaryStructureId || null,
        earnings: comp.earnings as unknown as Prisma.InputJsonValue,
        deductions: comp.deductions as unknown as Prisma.InputJsonValue,
        employerContributions: comp.employerContributions as unknown as Prisma.InputJsonValue,
        attendanceSummary: {
          ...comp.summary,
          ratio: Math.round(comp.ratio * 100) / 100,
          category: emp.skillType,
          state: emp.state,
        } as Prisma.InputJsonValue,
        netPay: comp.netPay,
      },
    });
    generatedSlips.push(slip);
  }

  const allSlips = await prisma.payslip.findMany({
    where: { payrollRunId: run.id },
  });
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  for (const s of allSlips) {
    const e = (s.earnings as Record<string, number>) || {};
    const d = (s.deductions as Record<string, number>) || {};
    totalGross += (e.total || 0);
    totalDeductions += (d.total || 0);
    totalNet += toNumber(s.netPay);
  }

  await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      totalEmployees: allSlips.length,
      grossPayroll: Math.round(totalGross),
      totalDeductions: Math.round(totalDeductions),
      netPayroll: Math.round(totalNet),
    },
  });

  await writeAuditLog({
    action: "UPDATE",
    entityType: "PayrollRun",
    entityId: run.id,
    actorUserId,
    newValue: { skillGroup: skillType, processedCount: generatedSlips.length, totalEmployees: allSlips.length },
  });

  return {
    data: {
      runId: runPublicId(run),
      skillType,
      processedCount: generatedSlips.length,
      skippedNoPayBasis: skippedNoPayBasis.length,
      totalEmployees: allSlips.length,
      grossPayroll: Math.round(totalGross),
      totalDeductions: Math.round(totalDeductions),
      netPayroll: Math.round(totalNet),
    },
  };
}

/**
 * Execute payroll calculations and upsert payslip for an individual employee.
 */
export async function runPayrollForIndividualEmployee(
  employeeId: string,
  month: number,
  year: number,
  actorUserId?: string
) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);
  const emp = await prisma.employee.findFirst({
    where: isUuid
      ? { OR: [{ id: employeeId }, { userId: employeeId }] }
      : { OR: [{ employeeCode: employeeId }, { personalEmail: employeeId }] },
    include: {
      salaryStructures: {
        where: { isActive: true },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
      location: true,
    },
  });
  if (!emp) throw AppError.notFound("Employee not found");

  let run = await prisma.payrollRun.findUnique({
    where: { month_year: { month, year } },
  });
  if (!run) {
    run = await prisma.payrollRun.create({
      data: {
        period: `${month}/${year}`,
        month,
        year,
        status: "Draft",
      },
      include: RUN_INCLUDE,
    });
  }

  const [wageRates, customComponents, salaryAdvances, productionRecords, cfg, templates] = await Promise.all([
    prisma.wageRate.findMany({ where: { isActive: true } }),
    prisma.payrollComponentConfig.findMany({ where: { isActive: true } }),
    prisma.salaryAdvance.findMany({ where: { employeeId: emp.id, status: "Active" } }),
    prisma.productionRecord.findMany({ where: { employeeId: emp.id, month, year } }),
    getCompanyConfig(),
    loadBlueprintsBySkillType(),
  ]);

  const rec = await reconcileEmployee(emp.id, year, month);
  const paySource = resolvePaySource(emp, cfg, wageRates);
  if (!paySource) {
    throw AppError.badRequest(
      `No pay basis for ${emp.employeeCode}: set a yearly salary package, an active salary structure, or a daily-wage profile first`,
    );
  }
  const structure = paySource.structure;
  const comp = await computeEmployeePayslip(
    emp,
    structure,
    year,
    month,
    rec,
    cfg,
    blueprintForSkill(templates, emp.skillType),
    {
      wageRates,
      customComponents,
      advances: salaryAdvances,
      productionUnits: productionRecords[0]?.unitsProduced ?? 0,
    }
  );

  const slip = await prisma.payslip.upsert({
    where: {
      payrollRunId_employeeId: {
        payrollRunId: run.id,
        employeeId: emp.id,
      },
    },
    create: {
      payrollRunId: run.id,
      employeeId: emp.id,
      period: `${run.period}`,
      salaryStructureId: paySource?.salaryStructureId || null,
      earnings: comp.earnings as unknown as Prisma.InputJsonValue,
      deductions: comp.deductions as unknown as Prisma.InputJsonValue,
      employerContributions: comp.employerContributions as unknown as Prisma.InputJsonValue,
      attendanceSummary: {
        ...comp.summary,
        ratio: Math.round(comp.ratio * 100) / 100,
        category: emp.skillType,
        state: emp.state,
      } as Prisma.InputJsonValue,
      netPay: comp.netPay,
      status: "Draft",
    },
    update: {
      salaryStructureId: paySource?.salaryStructureId || null,
      earnings: comp.earnings as unknown as Prisma.InputJsonValue,
      deductions: comp.deductions as unknown as Prisma.InputJsonValue,
      employerContributions: comp.employerContributions as unknown as Prisma.InputJsonValue,
      attendanceSummary: {
        ...comp.summary,
        ratio: Math.round(comp.ratio * 100) / 100,
        category: emp.skillType,
        state: emp.state,
      } as Prisma.InputJsonValue,
      netPay: comp.netPay,
    },
  });

  const allSlips = await prisma.payslip.findMany({
    where: { payrollRunId: run.id },
  });
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  for (const s of allSlips) {
    const e = (s.earnings as Record<string, number>) || {};
    const d = (s.deductions as Record<string, number>) || {};
    totalGross += (e.total || 0);
    totalDeductions += (d.total || 0);
    totalNet += toNumber(s.netPay);
  }

  await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      totalEmployees: allSlips.length,
      grossPayroll: Math.round(totalGross),
      totalDeductions: Math.round(totalDeductions),
      netPayroll: Math.round(totalNet),
    },
  });

  await writeAuditLog({
    action: "UPDATE",
    entityType: "PayrollRun",
    entityId: run.id,
    actorUserId,
    newValue: { employeeCode: emp.employeeCode, netPay: comp.netPay },
  });

  return {
    data: {
      runId: runPublicId(run),
      employeeId: emp.employeeCode,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      summary: buildSummaryPayload(emp, run, comp, month, year, blueprintForSkill(templates, emp.skillType)),
      payslip: serializePayslipList([slip])[0],
    },
  };
}

