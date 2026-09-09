/**
 * Company payslip branding service.
 * Reads/updates Company-level payslip settings and stores logo/signature
 * images in MinIO (reusing the existing storage pattern). Persisted as
 * `/uploads/company/...` URLs so they survive refresh and render on every
 * payslip without re-uploading.
 */
import { randomUUID } from "crypto";
import path from "path";
import minioClient, { MINIO_BUCKET, ensureMinioBucket } from "../../config/minio";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";

const CURRENT = { isActive: true } as const;

export function serializeBranding(company: {
  name: string;
  tagline: string | null;
  website: string | null;
  address: string | null;
  logoUrl: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
  signatureUrl: string | null;
}) {
  return {
    companyName: company.name,
    tagline: company.tagline,
    website: company.website,
    address: company.address,
    logoUrl: company.logoUrl,
    signatoryName: company.signatoryName,
    signatoryDesignation: company.signatoryDesignation,
    signatureUrl: company.signatureUrl,
  };
}

async function currentCompany() {
  const company = await prisma.company.findFirst({ where: CURRENT });
  if (!company) throw AppError.notFound("Company not configured");
  return company;
}

export async function getBranding() {
  const company = await currentCompany();
  return { data: serializeBranding(company) };
}

export async function updateBranding(input: {
  companyName?: string;
  tagline?: string;
  website?: string;
  address?: string;
  signatoryName?: string;
  signatoryDesignation?: string;
}, actorUserId?: string) {
  const company = await currentCompany();
  const updated = await prisma.company.update({
    where: { id: company.id },
    data: {
      name: input.companyName !== undefined ? input.companyName : company.name,
      tagline: input.tagline !== undefined ? input.tagline : company.tagline,
      website: input.website !== undefined ? input.website : company.website,
      address: input.address !== undefined ? input.address : company.address,
      signatoryName: input.signatoryName !== undefined ? input.signatoryName : company.signatoryName,
      signatoryDesignation: input.signatoryDesignation !== undefined ? input.signatoryDesignation : company.signatoryDesignation,
    },
  });
  writeAuditLog({ action: "UPDATE", entityType: "Company", entityId: company.id, actorUserId, newValue: { payslipBranding: true } });
  return { data: serializeBranding(updated) };
}

async function storeImage(folder: "logo" | "signature", file: Express.Multer.File) {
  if (!file) throw AppError.badRequest("Image file is required");
  await ensureMinioBucket();
  const extension = path.extname(file.originalname).toLowerCase();
  const objectName = `company/${folder}/${randomUUID()}${extension}`;
  await minioClient.putObject(MINIO_BUCKET, objectName, file.buffer, file.size, {
    "Content-Type": file.mimetype,
  });
  return `/uploads/company/${folder}/${path.basename(objectName)}`;
}

export async function uploadLogo(file: Express.Multer.File, actorUserId?: string) {
  const company = await currentCompany();
  const logoUrl = await storeImage("logo", file);
  await prisma.company.update({ where: { id: company.id }, data: { logoUrl } });
  writeAuditLog({ action: "UPDATE", entityType: "Company", entityId: company.id, actorUserId, newValue: { logoUploaded: true } });
  return { data: serializeBranding({ ...company, logoUrl }) };
}

export async function uploadSignature(file: Express.Multer.File, actorUserId?: string) {
  const company = await currentCompany();
  const signatureUrl = await storeImage("signature", file);
  await prisma.company.update({ where: { id: company.id }, data: { signatureUrl } });
  writeAuditLog({ action: "UPDATE", entityType: "Company", entityId: company.id, actorUserId, newValue: { signatureUploaded: true } });
  return { data: serializeBranding({ ...company, signatureUrl }) };
}

export async function removeLogo(actorUserId?: string) {
  const company = await currentCompany();
  await prisma.company.update({ where: { id: company.id }, data: { logoUrl: null } });
  writeAuditLog({ action: "UPDATE", entityType: "Company", entityId: company.id, actorUserId, newValue: { logoRemoved: true } });
  return { data: serializeBranding({ ...company, logoUrl: null }) };
}

export async function removeSignature(actorUserId?: string) {
  const company = await currentCompany();
  await prisma.company.update({ where: { id: company.id }, data: { signatureUrl: null } });
  writeAuditLog({ action: "UPDATE", entityType: "Company", entityId: company.id, actorUserId, newValue: { signatureRemoved: true } });
  return { data: serializeBranding({ ...company, signatureUrl: null }) };
}