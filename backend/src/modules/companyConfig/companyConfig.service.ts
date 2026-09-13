import { getCompanyConfigWithCompany, serializeConfig, upsertCompanyConfig } from "../../lib/companyConfig";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import type { CompanyConfigSnapshot } from "../../lib/companyConfig";
import { Prisma } from "@prisma/client";

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

export async function getUiLabels(): Promise<{ data: Record<string, string> }> {
  const company = await prisma.company.findFirst({ where: { isActive: true } });
  if (!company) return { data: {} };
  const row = await prisma.companyConfig.findUnique({ where: { companyId: company.id } });
  return { data: (row?.uiLabels as Record<string, string>) || {} };
}

export async function updateUiLabels(labels: Record<string, string>, actorUserId?: string) {
  const company = await prisma.company.findFirst({ where: { isActive: true } });
  if (!company) throw AppError.conflict("No active company configured");

  const existing = await prisma.companyConfig.findUnique({ where: { companyId: company.id } });
  const currentLabels = (existing?.uiLabels as Record<string, string>) || {};
  const mergedLabels = { ...currentLabels, ...labels };

  const updated = await prisma.companyConfig.upsert({
    where: { companyId: company.id },
    create: {
      companyId: company.id,
      uiLabels: mergedLabels as Prisma.InputJsonValue,
      updatedByUserId: actorUserId ?? null,
    },
    update: {
      uiLabels: mergedLabels as Prisma.InputJsonValue,
      updatedByUserId: actorUserId ?? null,
    },
  });

  await writeAuditLog({
    actorUserId: actorUserId ?? null,
    action: "UPDATE",
    entityType: "CompanyConfig",
    entityId: "ui_labels",
    newValue: { uiLabels: mergedLabels },
  });

  return { data: (updated.uiLabels as Record<string, string>) || {} };
}