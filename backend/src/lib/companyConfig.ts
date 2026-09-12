/**
 * Company-level payroll & attendance configuration.
 *
 * Single optional CompanyConfig row per company. When absent every consumer
 * falls back to these built-in defaults, so the system runs out of the box
 * while remaining fully editable via the admin config API.
 */
import { prisma } from "./prisma";

export interface CompanyConfigSnapshot {
  shiftStartMinutes: number;
  shiftEndMinutes: number;
  weeklyOffDays: number[];
  epfEmployerRate: number;
  esiEmployerRate: number;
  esiGrossCeiling: number;
  gratuityRate: number;
  overtimeMultiplier: number;
  basicSalaryFactor: number;
  hraFactor: number;
  conveyanceAllowance: number;
  medicalAllowance: number;
  providentFundRate: number;
  professionalTax: number;
  incomeTaxRate: number;
  healthInsurance: number;
  defaultTaxRegime: string;
}

export const COMPANY_CONFIG_DEFAULTS: CompanyConfigSnapshot = {
  shiftStartMinutes: 9 * 60,
  shiftEndMinutes: 18 * 60,
  weeklyOffDays: [] as number[],
  epfEmployerRate: 0.13,
  esiEmployerRate: 0.0325,
  esiGrossCeiling: 21000,
  gratuityRate: 0.0481,
  overtimeMultiplier: 1.5,
  basicSalaryFactor: 0.5,
  hraFactor: 0.2,
  conveyanceAllowance: 400,
  medicalAllowance: 250,
  providentFundRate: 0.12,
  professionalTax: 200,
  incomeTaxRate: 0.05,
  healthInsurance: 180,
  defaultTaxRegime: "NEW",
};

const rowToSnapshot = (row: {
  shiftStartMinutes: number;
  shiftEndMinutes: number;
  weeklyOffDays: unknown;
  epfEmployerRate: { toNumber(): number };
  esiEmployerRate: { toNumber(): number };
  esiGrossCeiling: { toNumber(): number };
  gratuityRate: { toNumber(): number };
  overtimeMultiplier: { toNumber(): number };
  basicSalaryFactor: { toNumber(): number };
  hraFactor: { toNumber(): number };
  conveyanceAllowance: { toNumber(): number };
  medicalAllowance: { toNumber(): number };
  providentFundRate: { toNumber(): number };
  professionalTax: { toNumber(): number };
  incomeTaxRate: { toNumber(): number };
  healthInsurance: { toNumber(): number };
  defaultTaxRegime: string;
}): CompanyConfigSnapshot => {
  const storedOff = Array.isArray(row.weeklyOffDays)
    ? (row.weeklyOffDays as unknown[]).filter((d): d is number => typeof d === "number")
    : [];
  return {
    shiftStartMinutes: row.shiftStartMinutes,
    shiftEndMinutes: row.shiftEndMinutes,
    weeklyOffDays: storedOff.length ? storedOff : COMPANY_CONFIG_DEFAULTS.weeklyOffDays,
    epfEmployerRate: row.epfEmployerRate.toNumber(),
    esiEmployerRate: row.esiEmployerRate.toNumber(),
    esiGrossCeiling: row.esiGrossCeiling.toNumber(),
    gratuityRate: row.gratuityRate.toNumber(),
    overtimeMultiplier: row.overtimeMultiplier.toNumber(),
    basicSalaryFactor: row.basicSalaryFactor.toNumber(),
    hraFactor: row.hraFactor.toNumber(),
    conveyanceAllowance: row.conveyanceAllowance.toNumber(),
    medicalAllowance: row.medicalAllowance.toNumber(),
    providentFundRate: row.providentFundRate.toNumber(),
    professionalTax: row.professionalTax.toNumber(),
    incomeTaxRate: row.incomeTaxRate.toNumber(),
    healthInsurance: row.healthInsurance.toNumber(),
    defaultTaxRegime: row.defaultTaxRegime,
  };
};

/** Load the active company's config, falling back to built-in defaults. */
export async function getCompanyConfig(): Promise<CompanyConfigSnapshot> {
  const company = await prisma.company.findFirst({ where: { isActive: true } });
  if (!company) return { ...COMPANY_CONFIG_DEFAULTS };
  const row = await prisma.companyConfig.findUnique({ where: { companyId: company.id } });
  return row ? rowToSnapshot(row) : { ...COMPANY_CONFIG_DEFAULTS };
}

/** Load the config row (or defaults) plus the owning company. */
export async function getCompanyConfigWithCompany() {
  const company = await prisma.company.findFirst({ where: { isActive: true } });
  if (!company) return { company: null, config: { ...COMPANY_CONFIG_DEFAULTS } };
  const row = await prisma.companyConfig.findUnique({ where: { companyId: company.id } });
  return {
    company,
    config: row ? rowToSnapshot(row) : { ...COMPANY_CONFIG_DEFAULTS },
  };
}

const toDecimal = (value: unknown, fallback: number) => {
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : fallback;
};

/** Create or update the active company's config (null on missing company). */
export async function upsertCompanyConfig(
  input: Partial<CompanyConfigSnapshot> & { updatedByUserId?: string | null },
) {
  const company = await prisma.company.findFirst({ where: { isActive: true } });
  if (!company) return null;
  const d = COMPANY_CONFIG_DEFAULTS;
  const data = {
    shiftStartMinutes: input.shiftStartMinutes ?? undefined,
    shiftEndMinutes: input.shiftEndMinutes ?? undefined,
    weeklyOffDays:
      input.weeklyOffDays !== undefined
        ? (input.weeklyOffDays as number[]).filter((dow) => Number.isInteger(dow) && dow >= 0 && dow <= 6)
        : undefined,
    epfEmployerRate: toDecimal(input.epfEmployerRate, d.epfEmployerRate),
    esiEmployerRate: toDecimal(input.esiEmployerRate, d.esiEmployerRate),
    esiGrossCeiling: toDecimal(input.esiGrossCeiling, d.esiGrossCeiling),
    gratuityRate: toDecimal(input.gratuityRate, d.gratuityRate),
    overtimeMultiplier: toDecimal(input.overtimeMultiplier, d.overtimeMultiplier),
    basicSalaryFactor: toDecimal(input.basicSalaryFactor, d.basicSalaryFactor),
    hraFactor: toDecimal(input.hraFactor, d.hraFactor),
    conveyanceAllowance: toDecimal(input.conveyanceAllowance, d.conveyanceAllowance),
    medicalAllowance: toDecimal(input.medicalAllowance, d.medicalAllowance),
    providentFundRate: toDecimal(input.providentFundRate, d.providentFundRate),
    professionalTax: toDecimal(input.professionalTax, d.professionalTax),
    incomeTaxRate: toDecimal(input.incomeTaxRate, d.incomeTaxRate),
    healthInsurance: toDecimal(input.healthInsurance, d.healthInsurance),
    defaultTaxRegime: input.defaultTaxRegime?.trim().toUpperCase() === "OLD" ? "OLD" : "NEW",
  };
  const row = await prisma.companyConfig.upsert({
    where: { companyId: company.id },
    create: { companyId: company.id, ...data, updatedByUserId: input.updatedByUserId ?? null },
    update: { ...data, updatedByUserId: input.updatedByUserId ?? null },
  });
  return rowToSnapshot(row);
}

export function serializeConfig(snapshot: CompanyConfigSnapshot) {
  return {
    shiftStartMinutes: snapshot.shiftStartMinutes,
    shiftEndMinutes: snapshot.shiftEndMinutes,
    weeklyOffDays: snapshot.weeklyOffDays,
    epfEmployerRate: snapshot.epfEmployerRate,
    esiEmployerRate: snapshot.esiEmployerRate,
    esiGrossCeiling: snapshot.esiGrossCeiling,
    gratuityRate: snapshot.gratuityRate,
    overtimeMultiplier: snapshot.overtimeMultiplier,
    basicSalaryFactor: snapshot.basicSalaryFactor,
    hraFactor: snapshot.hraFactor,
    conveyanceAllowance: snapshot.conveyanceAllowance,
    medicalAllowance: snapshot.medicalAllowance,
    providentFundRate: snapshot.providentFundRate,
    professionalTax: snapshot.professionalTax,
    incomeTaxRate: snapshot.incomeTaxRate,
    healthInsurance: snapshot.healthInsurance,
    defaultTaxRegime: snapshot.defaultTaxRegime,
  };
}