import { Prisma } from "@prisma/client";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import minioClient, { MINIO_BUCKET, ensureMinioBucket } from "../../config/minio";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import type { AccessTokenPayload } from "../../lib/jwt";

const include = { versions: { orderBy: { versionNumber: "asc" as const } } };

function requireEmployee(actor?: AccessTokenPayload) {
  if (!actor?.employeeId) throw AppError.forbidden("Account is not linked to an employee record");
  return actor.employeeId;
}

async function actorName(actor?: AccessTokenPayload) {
  if (!actor?.employeeId) return actor?.role || "System";
  const employee = await prisma.employee.findUnique({ where: { id: actor.employeeId }, select: { firstName: true, lastName: true } });
  return employee ? `${employee.firstName} ${employee.lastName}` : actor.employeeCode || actor.role;
}

function dateOnly(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function serializePolicy(policy: any) {
  const current = policy.versions.at(-1);
  return {
    id: policy.id,
    title: policy.title,
    category: policy.category,
    scope: policy.scope,
    mandatoryAcknowledgement: policy.mandatoryAcknowledgement,
    reviewCycleMonths: policy.reviewCycleMonths,
    status: policy.status,
    currentVersionId: current?.id ?? null,
    nextReviewDate: dateOnly(policy.nextReviewDate),
    versions: policy.versions.map((version: any) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      effectiveDate: dateOnly(version.effectiveDate),
      ackDeadlineDays: version.acknowledgementDeadlineDays,
      requiresReacknowledgement: version.requiresReacknowledgement,
      summary: version.summary,
      content: version.content || null,
      fileUrl: version.fileUrl || null,
      fileName: version.fileName || null,
      createdAt: dateOnly(version.createdAt),
      createdBy: version.createdByName,
      publishedAt: version.publishedAt,
    })),
  };
}

async function employeeScope(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { department: { select: { name: true } }, location: { select: { name: true } } },
  });
  return [
    "Company-wide",
    ...(employee?.department?.name ? [`Department: ${employee.department.name}`] : []),
    ...(employee?.location?.name ? [`Location: ${employee.location.name}`] : []),
  ];
}

export async function ensureDefaultPolicies() {
  const count = await prisma.policy.count();
  if (count > 0) return;

  const defaultPolicies = [
    {
      title: "Code of Conduct & Professional Ethics",
      category: "Conduct",
      scope: "Company-wide",
      mandatoryAcknowledgement: true,
      reviewCycleMonths: 12,
      status: "Published",
      summary: "Defines organizational standards of professional integrity, workplace decorum, conflict of interest, and anti-harassment standards.",
      content: `# Code of Conduct & Professional Ethics

## 1. Purpose & Core Values
Proteccio Enterprise is committed to fostering an inclusive, transparent, and ethical workplace environment. Every employee is expected to act with absolute integrity, accountability, and mutual respect.

## 2. Professional Decorum
- Maintain respectful communication across all physical and digital channels.
- Zero tolerance for harassment, discrimination, or intimidation of any form based on gender, race, religion, or background.
- Proactively declare any conflicts of interest that could compromise business decisions.

## 3. Confidentiality & Whistleblower Protections
- Company data, client details, and internal systems are strictly confidential.
- Employees can report violations in good faith through anonymous reporting channels without fear of retaliation.`,
      effectiveDate: new Date("2026-01-01"),
      ackDeadlineDays: 14,
    },
    {
      title: "Information Security & Data Protection Policy",
      category: "IT & Security",
      scope: "Company-wide",
      mandatoryAcknowledgement: true,
      reviewCycleMonths: 12,
      status: "Published",
      summary: "Guidelines on credential safety, data privacy classification, acceptable equipment usage, and cybersecurity incident response.",
      content: `# Information Security & Data Protection Policy

## 1. Objective
Ensure company confidential data and customer personal identifiable information (PII) are safeguarded against unauthorized access, loss, or disclosure.

## 2. Password & Access Control
- Passwords must be at least 12 characters and changed every 90 days.
- Multi-Factor Authentication (MFA) is mandatory on all corporate accounts and VPNs.
- Never share credentials, access badges, or tokens with anyone.

## 3. Acceptable Use of Corporate Assets
- Laptops and mobile workstations must have full-disk encryption enabled.
- Clean desk policy applies: lock screens when stepping away from workstations.
- Report lost devices or suspected phishing attempts to security@company.com immediately.`,
      effectiveDate: new Date("2026-01-01"),
      ackDeadlineDays: 14,
    },
    {
      title: "Remote & Hybrid Working Guidelines",
      category: "HR",
      scope: "Company-wide",
      mandatoryAcknowledgement: false,
      reviewCycleMonths: 6,
      status: "Published",
      summary: "Operating protocols for hybrid work arrangements, core communication hours, ergonomic allowances, and team collaboration.",
      content: `# Remote & Hybrid Working Guidelines

## 1. Scope
Applies to full-time team members whose roles allow flexible work from home arrangements upon manager approval.

## 2. Core Working Hours & Availability
- Maintain active status and presence on team communication tools during core business hours (10:00 AM – 5:00 PM).
- Ensure attendance at scheduled sprint reviews, team standups, and customer touchpoints.

## 3. Connectivity & Ergonomics
- Maintain high-speed broadband connectivity suitable for video calls.
- Submit expense claims for approved ergonomic accessories via the employee reimbursement portal.`,
      effectiveDate: new Date("2026-01-15"),
      ackDeadlineDays: null,
    },
    {
      title: "Workplace Health, Safety & Ergonomics",
      category: "Safety",
      scope: "Company-wide",
      mandatoryAcknowledgement: true,
      reviewCycleMonths: 12,
      status: "Published",
      summary: "Occupational safety standards, fire evacuation procedures, first aid protocols, and incident reporting.",
      content: `# Workplace Health, Safety & Ergonomics Policy

## 1. Safety Protocols
Proteccio Enterprise prioritizes employee well-being above all operational metrics.

## 2. Emergency Procedures
- Review emergency exit routes posted on every floor and assembly points outside the premises.
- Fire drills are conducted bi-annually; participation is mandatory for all personnel on-site.
- Certified first-aid responders and AED equipment are stationed on each floor near reception.`,
      effectiveDate: new Date("2026-02-01"),
      ackDeadlineDays: 14,
    },
  ];

  for (const item of defaultPolicies) {
    await prisma.policy.create({
      data: {
        title: item.title,
        category: item.category,
        scope: item.scope,
        mandatoryAcknowledgement: item.mandatoryAcknowledgement,
        reviewCycleMonths: item.reviewCycleMonths,
        status: item.status,
        versions: {
          create: {
            versionNumber: 1,
            effectiveDate: item.effectiveDate,
            acknowledgementDeadlineDays: item.ackDeadlineDays,
            requiresReacknowledgement: true,
            summary: item.summary,
            content: item.content,
            createdByName: "People Operations",
            publishedAt: new Date(),
          },
        },
      },
    });
  }
}

export async function uploadPolicyDocument(file: Express.Multer.File) {
  if (!file) throw AppError.badRequest("Policy file is required");
  const extension = path.extname(file.originalname).toLowerCase();
  const name = `${randomUUID()}${extension}`;
  try {
    await ensureMinioBucket();
    await minioClient.putObject(MINIO_BUCKET, `policies/${name}`, file.buffer, file.size, {
      "Content-Type": file.mimetype,
    });
  } catch {
    const dir = path.join(process.cwd(), "uploads", "policies");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), file.buffer);
  }
  return {
    fileUrl: `/uploads/policies/${name}`,
    fileName: file.originalname,
    fileSize: file.size,
  };
}

export async function listPolicies(actor?: AccessTokenPayload) {
  await ensureDefaultPolicies();
  let where: Prisma.PolicyWhereInput = {};
  if (!actor || !["HR", "ADMIN"].includes(actor.role)) {
    const employeeId = requireEmployee(actor);
    where = { status: "Published", scope: { in: await employeeScope(employeeId), mode: "insensitive" } };
  }
  const policies = await prisma.policy.findMany({ where, include, orderBy: { updatedAt: "desc" } });
  return policies.map(serializePolicy);
}

export async function createPolicy(input: any, actor?: AccessTokenPayload) {
  if (input.mandatoryAcknowledgement && !input.ackDeadlineDays) {
    throw AppError.badRequest("Mandatory policies need an acknowledgement deadline");
  }
  const createdByName = await actorName(actor);
  const policy = await prisma.policy.create({
    data: {
      title: input.title,
      category: input.category,
      scope: input.scope,
      mandatoryAcknowledgement: input.mandatoryAcknowledgement,
      reviewCycleMonths: input.reviewCycleMonths || null,
      createdByUserId: actor?.sub,
      versions: { create: {
        versionNumber: 1,
        effectiveDate: input.effectiveDate,
        acknowledgementDeadlineDays: input.mandatoryAcknowledgement ? input.ackDeadlineDays : null,
        requiresReacknowledgement: true,
        summary: input.summary,
        content: input.content || null,
        fileUrl: input.fileUrl || null,
        fileName: input.fileName || null,
        createdByUserId: actor?.sub,
        createdByName,
      } },
    }, include,
  });
  void writeAuditLog({ actorUserId: actor?.sub, action: "CREATE", entityType: "Policy", entityId: policy.id, newValue: { title: policy.title, status: policy.status } });
  return serializePolicy(policy);
}

export async function addVersion(id: string, input: any, actor?: AccessTokenPayload) {
  const policy = await prisma.policy.findUnique({ where: { id }, include });
  if (!policy) throw AppError.notFound("Policy not found");
  if (policy.mandatoryAcknowledgement && !input.ackDeadlineDays) {
    throw AppError.badRequest("Mandatory policies need an acknowledgement deadline");
  }
  const latestNumber = policy.versions.at(-1)?.versionNumber ?? 0;
  const createdByName = await actorName(actor);
  await prisma.$transaction([
    prisma.policyVersion.create({ data: {
      policyId: id,
      versionNumber: latestNumber + 1,
      effectiveDate: input.effectiveDate,
      acknowledgementDeadlineDays: policy.mandatoryAcknowledgement ? input.ackDeadlineDays : null,
      requiresReacknowledgement: input.requiresReacknowledgement,
      summary: input.summary,
      content: input.content || null,
      fileUrl: input.fileUrl || null,
      fileName: input.fileName || null,
      createdByUserId: actor?.sub,
      createdByName,
    } }),
    prisma.policy.update({ where: { id }, data: { status: "Draft", nextReviewDate: null } }),
  ]);
  void writeAuditLog({ actorUserId: actor?.sub, action: "UPDATE", entityType: "Policy", entityId: id, newValue: { versionNumber: latestNumber + 1, status: "Draft" } });
  return serializePolicy(await prisma.policy.findUniqueOrThrow({ where: { id }, include }));
}

export async function publishPolicy(id: string, actor?: AccessTokenPayload) {
  const policy = await prisma.policy.findUnique({ where: { id }, include });
  if (!policy) throw AppError.notFound("Policy not found");
  const current = policy.versions.at(-1);
  if (!current?.effectiveDate) throw AppError.badRequest("Set an effective date before publishing");
  if (policy.mandatoryAcknowledgement && !current.acknowledgementDeadlineDays) {
    throw AppError.badRequest("Mandatory policies need an acknowledgement deadline before publishing");
  }
  const nextReviewDate = policy.reviewCycleMonths
    ? new Date(Date.UTC(current.effectiveDate.getUTCFullYear(), current.effectiveDate.getUTCMonth() + policy.reviewCycleMonths, current.effectiveDate.getUTCDate()))
    : null;
  await prisma.$transaction(async (tx) => {
    await tx.policy.update({ where: { id }, data: { status: "Published", nextReviewDate } });
    await tx.policyVersion.update({ where: { id: current.id }, data: { publishedAt: new Date() } });
    const previous = policy.versions.at(-2);
    if (!current.requiresReacknowledgement && previous) {
      const previousAcknowledgements = await tx.policyAcknowledgement.findMany({ where: { versionId: previous.id } });
      if (previousAcknowledgements.length) {
        await tx.policyAcknowledgement.createMany({
          data: previousAcknowledgements.map((acknowledgement) => ({
            versionId: current.id,
            employeeId: acknowledgement.employeeId,
            acknowledgedAt: acknowledgement.acknowledgedAt,
            device: acknowledgement.device,
          })),
          skipDuplicates: true,
        });
      }
    }
  });
  void writeAuditLog({ actorUserId: actor?.sub, action: "UPDATE", entityType: "Policy", entityId: id, oldValue: { status: policy.status }, newValue: { status: "Published", versionNumber: current.versionNumber } });
  return { policy: serializePolicy(await prisma.policy.findUniqueOrThrow({ where: { id }, include })) };
}

function serializeAcknowledgement(row: any) {
  return {
    id: row.id,
    policyId: row.version.policyId,
    versionId: row.versionId,
    employeeId: row.employee.employeeCode,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
    acknowledgedAt: dateOnly(row.acknowledgedAt),
    device: row.device,
  };
}

const acknowledgementInclude = {
  version: { select: { policyId: true } },
  employee: { select: { employeeCode: true, firstName: true, lastName: true } },
};

export async function getMyAcknowledgements(actor?: AccessTokenPayload) {
  const employeeId = requireEmployee(actor);
  const rows = await prisma.policyAcknowledgement.findMany({ where: { employeeId }, include: acknowledgementInclude, orderBy: { acknowledgedAt: "desc" } });
  return rows.map(serializeAcknowledgement);
}

export async function acknowledgePolicy(policyId: string, versionId: string, device?: string, actor?: AccessTokenPayload) {
  const employeeId = requireEmployee(actor);
  const policy = await prisma.policy.findUnique({ where: { id: policyId }, include });
  if (!policy || policy.status !== "Published") throw AppError.notFound("Published policy not found");
  const current = policy.versions.at(-1);
  if (!current || current.id !== versionId) throw AppError.conflict("Only the current policy version can be acknowledged");
  if (!(await employeeScope(employeeId)).some((scope) => scope.toLowerCase() === policy.scope.toLowerCase())) {
    throw AppError.forbidden("This policy does not apply to your employee scope");
  }
  const acknowledgement = await prisma.policyAcknowledgement.upsert({
    where: { versionId_employeeId: { versionId, employeeId } },
    create: { versionId, employeeId, device: device?.slice(0, 255) || null },
    update: {},
    include: acknowledgementInclude,
  });
  void writeAuditLog({ actorUserId: actor?.sub, action: "APPROVE", entityType: "Policy", entityId: policyId, newValue: { versionId, employeeId, acknowledgement: true } });
  return serializeAcknowledgement(acknowledgement);
}

export async function getComplianceData(_actor?: AccessTokenPayload) {
  const [rows, employees] = await prisma.$transaction([
    prisma.policyAcknowledgement.findMany({ include: acknowledgementInclude, orderBy: { acknowledgedAt: "desc" } }),
    prisma.employee.findMany({
      where: { status: { not: "Inactive" } },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: { employeeCode: "asc" },
    }),
  ]);
  return {
    acknowledgements: rows.map(serializeAcknowledgement),
    employees: employees.map((employee) => ({
      id: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`,
      department: employee.department?.name ?? null,
      location: employee.location?.name ?? null,
    })),
  };
}
