/**
 * Company payroll & attendance configuration service.
 * Admin can view/update the single company-level config; authenticated
 * readers get a read-only view. Falls back to built-in defaults.
 */
import { getCompanyConfigWithCompany, serializeConfig, upsertCompanyConfig } from "../../lib/companyConfig";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import type { CompanyConfigSnapshot } from "../../lib/companyConfig";

const UPDATE_KEYS: (keyof CompanyConfigSnapshot)[] = [
  "shiftStartMinutes",
  "shiftEndMinutes",
  "weeklyOffDays",
  "epfEmployerRate",
  "esiEmployerRate",
  "esiGrossCeiling",
  "gratuityRate",
  "overtimeMultiplier",
  "basicSalaryFactor",
  "hraFactor",
  "conveyanceAllowance",
  "medicalAllowance",
  "providentFundRate",
  "professionalTax",
  "incomeTaxRate",
  "healthInsurance",
  "defaultTaxRegime",
];

export async function getConfig() {
  const { company, config } = await getCompanyConfigWithCompany();
  return {
    data: {
      ...serializeConfig(config),
      companyName: company?.name ?? null,
    },
  };
}

export async function updateConfig(input: Record<string, unknown>, actorUserId?: string) {
  const validated: Partial<CompanyConfigSnapshot> & { updatedByUserId?: string | null } = {};
  for (const field of UPDATE_KEYS) {
    if (!(field in input)) continue;
    validated[field] = input[field] as never;
  }
  const snapshot = await upsertCompanyConfig({ ...validated, updatedByUserId: actorUserId ?? null });
  if (!snapshot) throw AppError.conflict("No active company configured");

  await writeAuditLog({
    actorUserId: actorUserId ?? null,
    action: "UPDATE",
    entityType: "CompanyConfig",
    entityId: "company",
    newValue: { changedKeys: Object.keys(validated) },
  });
  return { data: serializeConfig(snapshot) };
}