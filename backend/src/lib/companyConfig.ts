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
  weeklyOffWorkedMultiplier: number;
  holidayWorkedMultiplier: number;
  nightShiftAllowance: number;
  nightOtMultiplier: number;
  weeklyOffOtMultiplier: number;
  holidayOtMultiplier: number;
  minOtMinutesThreshold: number;
  maxOtHoursMonthly: number | null;
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
  weeklyOffWorkedMultiplier: 2.0,
  holidayWorkedMultiplier: 2.0,
  nightShiftAllowance: 100.0,
  nightOtMultiplier: 2.0,
  weeklyOffOtMultiplier: 2.0,
  holidayOtMultiplier: 2.0,
  minOtMinutesThreshold: 30,
  maxOtHoursMonthly: 60,
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
  weeklyOffWorkedMultiplier?: { toNumber(): number } | null;
  holidayWorkedMultiplier?: { toNumber(): number } | null;
  nightShiftAllowance?: { toNumber(): number } | null;
  nightOtMultiplier?: { toNumber(): number } | null;
  weeklyOffOtMultiplier?: { toNumber(): number } | null;
  holidayOtMultiplier?: { toNumber(): number } | null;
  minOtMinutesThreshold?: number | null;
  maxOtHoursMonthly?: { toNumber(): number } | null;
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
    weeklyOffWorkedMultiplier: row.weeklyOffWorkedMultiplier ? row.weeklyOffWorkedMultiplier.toNumber() : COMPANY_CONFIG_DEFAULTS.weeklyOffWorkedMultiplier,
    holidayWorkedMultiplier: row.holidayWorkedMultiplier ? row.holidayWorkedMultiplier.toNumber() : COMPANY_CONFIG_DEFAULTS.holidayWorkedMultiplier,
    nightShiftAllowance: row.nightShiftAllowance ? row.nightShiftAllowance.toNumber() : COMPANY_CONFIG_DEFAULTS.nightShiftAllowance,
    nightOtMultiplier: row.nightOtMultiplier ? row.nightOtMultiplier.toNumber() : COMPANY_CONFIG_DEFAULTS.nightOtMultiplier,
    weeklyOffOtMultiplier: row.weeklyOffOtMultiplier ? row.weeklyOffOtMultiplier.toNumber() : COMPANY_CONFIG_DEFAULTS.weeklyOffOtMultiplier,
    holidayOtMultiplier: row.holidayOtMultiplier ? row.holidayOtMultiplier.toNumber() : COMPANY_CONFIG_DEFAULTS.holidayOtMultiplier,
    minOtMinutesThreshold: row.minOtMinutesThreshold ?? COMPANY_CONFIG_DEFAULTS.minOtMinutesThreshold,
    maxOtHoursMonthly: row.maxOtHoursMonthly ? row.maxOtHoursMonthly.toNumber() : null,
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
    epfEmployerRate: input.epfEmployerRate !== undefined ? toDecimal(input.epfEmployerRate, d.epfEmployerRate) : undefined,
    esiEmployerRate: input.esiEmployerRate !== undefined ? toDecimal(input.esiEmployerRate, d.esiEmployerRate) : undefined,
    esiGrossCeiling: input.esiGrossCeiling !== undefined ? toDecimal(input.esiGrossCeiling, d.esiGrossCeiling) : undefined,
    gratuityRate: input.gratuityRate !== undefined ? toDecimal(input.gratuityRate, d.gratuityRate) : undefined,
    overtimeMultiplier: input.overtimeMultiplier !== undefined ? toDecimal(input.overtimeMultiplier, d.overtimeMultiplier) : undefined,
    weeklyOffWorkedMultiplier: input.weeklyOffWorkedMultiplier !== undefined ? toDecimal(input.weeklyOffWorkedMultiplier, d.weeklyOffWorkedMultiplier) : undefined,
    holidayWorkedMultiplier: input.holidayWorkedMultiplier !== undefined ? toDecimal(input.holidayWorkedMultiplier, d.holidayWorkedMultiplier) : undefined,
    nightShiftAllowance: input.nightShiftAllowance !== undefined ? toDecimal(input.nightShiftAllowance, d.nightShiftAllowance) : undefined,
    nightOtMultiplier: input.nightOtMultiplier !== undefined ? toDecimal(input.nightOtMultiplier, d.nightOtMultiplier) : undefined,
    weeklyOffOtMultiplier: input.weeklyOffOtMultiplier !== undefined ? toDecimal(input.weeklyOffOtMultiplier, d.weeklyOffOtMultiplier) : undefined,
    holidayOtMultiplier: input.holidayOtMultiplier !== undefined ? toDecimal(input.holidayOtMultiplier, d.holidayOtMultiplier) : undefined,
    minOtMinutesThreshold: input.minOtMinutesThreshold !== undefined ? Number(input.minOtMinutesThreshold) : undefined,
    maxOtHoursMonthly: input.maxOtHoursMonthly !== undefined ? (input.maxOtHoursMonthly ? toDecimal(input.maxOtHoursMonthly, 60) : null) : undefined,
    basicSalaryFactor: input.basicSalaryFactor !== undefined ? toDecimal(input.basicSalaryFactor, d.basicSalaryFactor) : undefined,
    hraFactor: input.hraFactor !== undefined ? toDecimal(input.hraFactor, d.hraFactor) : undefined,
    conveyanceAllowance: input.conveyanceAllowance !== undefined ? toDecimal(input.conveyanceAllowance, d.conveyanceAllowance) : undefined,
    medicalAllowance: input.medicalAllowance !== undefined ? toDecimal(input.medicalAllowance, d.medicalAllowance) : undefined,
    providentFundRate: input.providentFundRate !== undefined ? toDecimal(input.providentFundRate, d.providentFundRate) : undefined,
    professionalTax: input.professionalTax !== undefined ? toDecimal(input.professionalTax, d.professionalTax) : undefined,
    incomeTaxRate: input.incomeTaxRate !== undefined ? toDecimal(input.incomeTaxRate, d.incomeTaxRate) : undefined,
    healthInsurance: input.healthInsurance !== undefined ? toDecimal(input.healthInsurance, d.healthInsurance) : undefined,
    defaultTaxRegime: input.defaultTaxRegime?.trim().toUpperCase() === "OLD" ? "OLD" : input.defaultTaxRegime ? "NEW" : undefined,
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
    weeklyOffWorkedMultiplier: snapshot.weeklyOffWorkedMultiplier,
    holidayWorkedMultiplier: snapshot.holidayWorkedMultiplier,
    nightShiftAllowance: snapshot.nightShiftAllowance,
    nightOtMultiplier: snapshot.nightOtMultiplier,
    weeklyOffOtMultiplier: snapshot.weeklyOffOtMultiplier,
    holidayOtMultiplier: snapshot.holidayOtMultiplier,
    minOtMinutesThreshold: snapshot.minOtMinutesThreshold,
    maxOtHoursMonthly: snapshot.maxOtHoursMonthly,
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