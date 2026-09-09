/**
 * Smart Payslip Designer service.
 * Orchestrates templates, blueprints, auto-configuration, calculation, tax,
 * validation, preview, publish & versions, and PDF export.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import type { Blueprint } from "./lib/types";
import { calculatePayroll, type CalcResult, type ComponentResults } from "./lib/calc";
import { buildAutoComponents } from "./lib/countryState";
import { DEFAULT_NESTS } from "./lib/nesting";
import { validateBlueprint, autoArrangeLayout, type ValidationReport } from "./lib/validator";
import { calculateTax, compareRegimes, INDIA_TAX_URL_BASELINE, type TaxInput } from "./lib/tax";
import { generatePayslipPdf, resolveComponentValues } from "./lib/payslip.pdf";
import { rupeesInWords } from "../../lib/numberToWords";
import { fetchStoredCompanyAssetDataUri } from "./lib/brandingAssets";
import { evaluateFormula } from "./lib/expression";
import { COMPONENT_CATALOG } from "./lib/countryState";

const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

const TEMPLATE_INCLUDE = {
  creator: { select: { employeeCode: true, firstName: true, lastName: true } },
  versions: { orderBy: { version: "desc" as const }, take: 1 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTemplate(t: any, withBlueprint = false) {
  const latest = Array.isArray(t.versions) ? t.versions[0] : null;
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    country: t.country,
    state: t.state,
    financialYear: t.financialYear,
    status: t.status,
    isActive: t.isActive,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdBy: t.creator ? `${t.creator.firstName} ${t.creator.lastName}` : null,
    latestVersion: latest?.version ?? 0,
    latestBlueprint: withBlueprint && latest ? (latest.blueprint as unknown as Blueprint) : undefined,
  };
}

export async function listTemplates() {
  const rows = await prisma.payslipTemplate.findMany({
    include: TEMPLATE_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return { data: rows.map((r) => serializeTemplate(r)) };
}

export async function getTemplate(id: string) {
  const template = await prisma.payslipTemplate.findUnique({
    where: { id },
    include: TEMPLATE_INCLUDE,
  });
  if (!template) throw AppError.notFound("Payslip template not found");
  return { data: serializeTemplate(template, true) };
}

export async function createTemplate(
  input: { name: string; description?: string; country?: string; state?: string; financialYear?: number },
  actorEmployeeId?: string
) {
  const defaultBlueprint: Blueprint = {
    name: input.name,
    country: input.country ?? "India",
    state: input.state ?? null,
    financialYear: input.financialYear ?? new Date().getFullYear(),
    theme: {
      primaryColor: "#0f766e",
      secondaryColor: "#0d1b2a",
      accentColor: "#0891b2",
      font: "Helvetica",
      pageSize: "A4",
      orientation: "portrait",
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
    },
    nests: [...DEFAULT_NESTS],
    components: [],
    taxConfig: { defaultRegime: "NEW", employeeChoiceAllowed: true, regimes: ["OLD", "NEW"] },
    settings: { companyName: "Proteccio HRMS" },
  };

  const template = await prisma.$transaction(async (tx) => {
    const t = await tx.payslipTemplate.create({
      data: {
        name: input.name,
        description: input.description,
        country: defaultBlueprint.country,
        state: defaultBlueprint.state,
        financialYear: defaultBlueprint.financialYear,
        createdById: actorEmployeeId ?? null,
      },
    });
    await tx.payslipTemplateVersion.create({
      data: {
        templateId: t.id,
        version: 1,
        blueprint: asJson(defaultBlueprint),
        status: "Draft",
        createdById: actorEmployeeId ?? null,
        changeSummary: "Template created",
      },
    });
    return t;
  });

  writeAuditLog({ action: "CREATE", entityType: "PayslipTemplate", entityId: template.id, newValue: { name: input.name } });
  return { data: serializeTemplate({ ...template, versions: [] }) };
}

async function getLatestVersion(templateId: string) {
  const version = await prisma.payslipTemplateVersion.findFirst({
    where: { templateId },
    orderBy: { version: "desc" },
  });
  if (!version) throw AppError.notFound("Template has no version yet");
  return version;
}

export async function saveDraft(templateId: string, blueprint: Blueprint, actorEmployeeId?: string, summary?: string) {
  const template = await prisma.payslipTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw AppError.notFound("Payslip template not found");
  if (template.status === "Published" && template.isActive) {
    throw AppError.conflict("Cannot edit an active published template directly. Restore a version first.");
  }

  const latest = await getLatestVersion(templateId);
  const version = await prisma.$transaction(async (tx) => {
    const v = await tx.payslipTemplateVersion.create({
      data: {
        templateId,
        version: latest.version + 1,
        blueprint: asJson(blueprint),
        status: "Draft",
        createdById: actorEmployeeId ?? null,
        changeSummary: summary || "Draft updated",
      },
    });
    await tx.payslipTemplate.update({
      where: { id: templateId },
      data: {
        name: blueprint.name ?? template.name,
        country: blueprint.country ?? template.country,
        state: blueprint.state ?? template.state,
        financialYear: blueprint.financialYear ?? template.financialYear,
        status: "Draft",
      },
    });
    return v;
  });

  writeAuditLog({ action: "UPDATE", entityType: "PayslipTemplate", entityId: templateId, newValue: { version: version.version } });
  return { data: { version: version.version, status: "Draft", blueprint } };
}

export async function listVersions(templateId: string) {
  const versions = await prisma.payslipTemplateVersion.findMany({
    where: { templateId },
    orderBy: { version: "desc" },
    include: { creator: { select: { employeeCode: true, firstName: true, lastName: true } } },
  });
  return {
    data: versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      isActive: v.isActive,
      createdAt: v.createdAt,
      changeSummary: v.changeSummary,
      createdBy: v.creator ? `${v.creator.firstName} ${v.creator.lastName}` : null,
    })),
  };
}

export async function getVersion(templateId: string, versionNo: number) {
  const version = await prisma.payslipTemplateVersion.findFirst({
    where: { templateId, version: versionNo },
  });
  if (!version) throw AppError.notFound("Template version not found");
  return { data: { ...version, blueprint: version.blueprint as unknown as Blueprint } };
}

/** Auto-configure components for a context. */
export async function resolveAutoConfig(ctx: { country: string; state?: string | null; companyEmployees?: number; grossMonthly?: number; annualSalary?: number }) {
  const auto = buildAutoComponents(ctx);
  return { data: auto };
}

/**
 * Calculate payroll for a blueprint from a base context + external runtime data.
 */
export interface ComputedPayroll extends CalcResult {
  taxMap: Record<string, unknown>;
}

export function computePayroll(blueprint: Blueprint, base: Record<string, number>, external: Record<string, number> = {}): ComputedPayroll {
  const visible = blueprint.components.filter((c) => c.visible !== false && c.id !== "gross");
  const result = calculatePayroll({ components: visible, base, external });
  const taxMap: Record<string, unknown> = {};
  for (const id of Object.keys(result.results)) {
    const comp = blueprint.components.find((c) => c.id.toLowerCase() === id);
    taxMap[id] = comp?.tax ?? {};
  }
  return { ...result, taxMap };
}

export function buildTaxInputFromBlueprint(blueprint: Blueprint, calcResult: CalcResult, base: Record<string, number>): TaxInput {
  const monthlyGross = Math.round(base.monthlyGross ?? calcResult.gross);
  const grossAnnual = monthlyGross * 12;
  const annualSalary = Number(base.annualSalary || 0) || grossAnnual;
  const hra = calcResult.results["hra"]?.final ?? 0;
  const basic = calcResult.results["basic"]?.final ?? 0;
  const hraExempt = Math.min(hra, basic * 0.5) * 12;
  const epf = (calcResult.results["epf_employee"]?.final ?? 0) * 12;
  const pt = (calcResult.results["professional_tax"]?.final ?? 0) * 12;
  return {
    grossAnnual: Math.max(annualSalary, grossAnnual),
    rules: INDIA_TAX_URL_BASELINE,
    exemptions: { hra: hraExempt, lta: 0, others: 0 },
    deductions: { section80C: Math.min(epf, 150000), section80D: 0, section24b: 0, professionalTax: pt },
  };
}

export function computeTax(blueprint: Blueprint, calcResult: CalcResult, base: Record<string, number>, regime: "OLD" | "NEW") {
  const input = buildTaxInputFromBlueprint(blueprint, calcResult, base);
  return calculateTax(input, regime);
}

export function compareTax(blueprint: Blueprint, calcResult: CalcResult, base: Record<string, number>) {
  const input = buildTaxInputFromBlueprint(blueprint, calcResult, base);
  return compareRegimes(input);
}

export function validate(blueprint: Blueprint): ValidationReport {
  return validateBlueprint(blueprint);
}

/** Publish current (or specified) version, making it immutable + active. */
export async function publishVersion(templateId: string, versionNo?: number) {
  const template = await prisma.payslipTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw AppError.notFound("Payslip template not found");

  const targetVersion = versionNo ?? (await getLatestVersion(templateId)).version;
  const version = await prisma.payslipTemplateVersion.findFirst({
    where: { templateId, version: targetVersion },
  });
  if (!version) throw AppError.notFound("Template version not found");

  const report0 = validateBlueprint(version.blueprint as unknown as Blueprint);
  let blueprintOut = version.blueprint as unknown as Blueprint;
  // Overlapping canvas boxes don't affect the flow-based PDF output, so
  // auto-arrange the layout before publishing instead of hard-blocking the
  // user (auto-configured components used to stack at overlapping offsets).
  if (report0.layout.length > 0) {
    blueprintOut = { ...blueprintOut, components: autoArrangeLayout(blueprintOut.components) };
    await prisma.payslipTemplateVersion.update({
      where: { id: version.id },
      data: { blueprint: asJson(blueprintOut) },
    });
  }

  const report = validateBlueprint(blueprintOut);
  if (!report.ok) {
    throw AppError.conflict(
      `Cannot publish: ${[...report.layout, ...report.calculation, ...report.tax, ...report.countryState, ...report.nesting].join(" ")}`
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.payslipTemplateVersion.updateMany({ where: { templateId }, data: { isActive: false, status: "Archived" } });
    const v = await tx.payslipTemplateVersion.update({
      where: { id: version.id },
      data: { status: "Published", isActive: true },
    });
    await tx.payslipTemplate.update({
      where: { id: templateId },
      data: { status: "Published", isActive: true },
    });
    return v;
  });

  writeAuditLog({ action: "UPDATE", entityType: "PayslipTemplateVersion", entityId: result.id, newValue: { version: result.version, status: "Published" } });
  return { data: { version: result.version, status: "Published", isActive: true } };
}

export async function restoreVersion(templateId: string, versionNo: number, actorEmployeeId?: string) {
  const version = await prisma.payslipTemplateVersion.findFirst({ where: { templateId, version: versionNo } });
  if (!version) throw AppError.notFound("Template version not found");
  const latest = await getLatestVersion(templateId);
  const restored = await prisma.payslipTemplateVersion.create({
    data: {
      templateId,
      version: latest.version + 1,
      blueprint: asJson(version.blueprint),
      status: "Draft",
      createdById: actorEmployeeId ?? null,
      changeSummary: `Restored from v${versionNo}`,
    },
  });
  await prisma.payslipTemplate.update({ where: { id: templateId }, data: { status: "Draft" } });
  return { data: { version: restored.version, status: "Draft" } };
}

export interface PreviewInput {
  employeeId?: string;
  month: number;
  year: number;
}

/** Get an employee's saved tax-regime choice (OLD|NEW), else null. */
export async function getEmployeeTaxSelection(employeeCode: string, financialYear?: number) {
  const year = financialYear ?? new Date().getFullYear();
  const emp = await prisma.employee.findUnique({ where: { employeeCode }, select: { id: true } });
  if (!emp) return null;
  const sel = await prisma.employeeTaxSelection.findUnique({
    where: { employeeId_financialYear: { employeeId: emp.id, financialYear: year } },
  });
  return sel?.regime ?? null;
}

/** Save/update an employee's tax-regime choice for a financial year. */
export async function setEmployeeTaxSelection(employeeCode: string, regime: "OLD" | "NEW", financialYear?: number, updatedByCode?: string) {
  const year = financialYear ?? new Date().getFullYear();
  const emp = await prisma.employee.findUnique({ where: { employeeCode }, select: { id: true } });
  if (!emp) throw AppError.notFound("Employee not found");
  const updater = updatedByCode
    ? await prisma.employee.findUnique({ where: { employeeCode: updatedByCode }, select: { id: true } })
    : null;
  const isSelf = updater && updater.id === emp.id;
  const sel = await prisma.employeeTaxSelection.upsert({
    where: { employeeId_financialYear: { employeeId: emp.id, financialYear: year } },
    create: {
      employeeId: emp.id,
      financialYear: year,
      regime,
      source: isSelf ? "EMPLOYEE" : "HR",
      updatedById: updater?.id ?? null,
    },
    update: {
      regime,
      source: isSelf ? "EMPLOYEE" : "HR",
      updatedById: updater?.id ?? null,
    },
  });
  writeAuditLog({ action: "UPDATE", entityType: "EmployeeTaxSelection", entityId: sel.id, newValue: { regime, year } });
  return { data: { employeeId: employeeCode, financialYear: year, regime, source: sel.source } };
}

/** Preview: compute payroll + tax + serialize for live preview / PDF. */
export async function previewPayslip(templateId: string, input: PreviewInput) {
  const version = await getLatestVersion(templateId);
  const blueprint = version.blueprint as unknown as Blueprint;

  const employee = input.employeeId
    ? await prisma.employee.findUnique({
        where: { employeeCode: input.employeeId },
        include: {
          department: true,
          designation: true,
          location: true,
          user: { select: { email: true } },
          salaryStructures: { where: { isActive: true }, orderBy: { effectiveFrom: "desc" }, take: 1 },
        },
      })
    : null;

  const structure = employee?.salaryStructures?.[0];
  const structBase: Record<string, number> = structure
    ? {
        basic: Number(structure.basicSalary ?? 0),
        hra: Number(structure.hra ?? 0),
        conveyance: Number(structure.conveyanceAllowance ?? 0),
        medical: Number(structure.medicalAllowance ?? 0),
        performance_bonus: Number(structure.performanceBonus ?? 0),
        other: Number(structure.otherAllowances ?? 0),
      }
    : { basic: 0, hra: 0, conveyance: 0, medical: 0, performance_bonus: 0, other: 0 };

  const calc = computePayroll(blueprint, structBase, {});
  const annualSource = employee?.annualSalary ? Number(employee.annualSalary) : calc.gross * 12;
  const savedRegime = employee ? await getEmployeeTaxSelection(employee.employeeCode, blueprint.financialYear) : null;
  const regime: "OLD" | "NEW" =
    savedRegime === "OLD" ? "OLD" : savedRegime === "NEW" ? "NEW" : (blueprint.taxConfig?.defaultRegime === "OLD" ? "OLD" : "NEW");
  const tax = computeTax(
    blueprint,
    calc,
    { ...structBase, monthlyGross: calc.gross, annualSalary: annualSource },
    regime
  );

  const payer = {
    name: employee ? `${employee.firstName} ${employee.lastName}` : "Sample Employee",
    employeeId: employee?.employeeCode ?? "EMP000",
    department: employee?.department?.name ?? "—",
    designation: employee?.designation?.title ?? "—",
    location: employee?.location?.name
      ? [employee.location.name, employee.location.address].filter(Boolean).join(", ")
      : "—",
    taxRegime: regime,
    pan: "—",
    dateOfJoining: employee?.dateOfJoining
      ? employee.dateOfJoining.toISOString().slice(0, 10)
      : "—",
    period: `${(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"])[input.month - 1]} ${input.year}`,
    companyName: blueprint.settings?.companyName ?? "Proteccio HRMS",
    financialYear: blueprint.financialYear,
  };

  return {
    data: {
      blueprint,
      results: calc.results,
      order: calc.allOrder,
      earningsTotal: calc.earningsTotal,
      deductionsTotal: calc.deductionsTotal,
      net: calc.net,
      tax,
      employee: payer,
      notes: calc.notes,
    },
  };
}

export async function generatePdf(templateId: string, input: PreviewInput) {
  const preview = await previewPayslip(templateId, input);
  const { blueprint, results, earningsTotal, net, tax, employee } = preview.data;

  const rows = resolveComponentValues(blueprint as Blueprint, results as unknown as Record<string, { final: number }>);

  // Company branding (logo/signature/signatory) so the exported PDF uses the
  // same corporate reference template as real payslips.
  const company = await prisma.company.findFirst({ where: { isActive: true } });
  const [logoData, sigData] = await Promise.all([
    fetchStoredCompanyAssetDataUri(company?.logoUrl),
    fetchStoredCompanyAssetDataUri(company?.signatureUrl),
  ]);

  const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const bp = blueprint as Blueprint;
  const pdf = await generatePayslipPdf(bp, {
    employee,
    payroll: { gross: Math.round(earningsTotal), net: Math.round(net) },
    earnings: rows.earnings,
    deductions: rows.deductions,
    employer: rows.employer,
    tax: { regime: tax.regime, annualTax: Math.round(tax.annualTax), monthlyTax: Math.round(tax.monthlyTax) },
    company: {
      name: company?.name ?? employee.companyName ?? "HRMS",
      tagline: company?.tagline ?? undefined,
      website: company?.website ?? undefined,
      address: company?.address ?? undefined,
      logoDataUri: logoData ?? undefined,
      signatoryName: company?.signatoryName ?? undefined,
      signatoryDesignation: company?.signatoryDesignation ?? undefined,
      signatureDataUri: sigData ?? undefined,
    },
    generatedOn: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    netInWords: rupeesInWords(net),
    payPeriodLabel: `${MONTHS_FULL[input.month - 1].toUpperCase()} ${input.year}`,
    countryLabel: bp.country,
  });
  return { buffer: pdf, filename: `payslip_${String(employee.employeeId).toLowerCase()}_${input.year}-${String(input.month).padStart(2, "0")}.pdf` };
}

export { COMPONENT_CATALOG, DEFAULT_NESTS, evaluateFormula };