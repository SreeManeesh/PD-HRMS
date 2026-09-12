import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { salaryStructureBreakdown } from "../../lib/salaryStructure";
import { hashPassword } from "../../lib/password";
import { writeAuditLog } from "../../services/audit.service";
import { serializeEmployeeList } from "../../serializers/employee.serializer";
import { parsePagination } from "../../lib/utils";
import minioClient, { MINIO_BUCKET, ensureMinioBucket } from "../../config/minio";

const EMPLOYEE_INCLUDE = {
  department: true,
  designation: true,
  location: true,
  user: { select: { email: true } },
  reportingManager: { select: { employeeCode: true, firstName: true, lastName: true } },
  salaryStructures: { where: { isActive: true } },
} satisfies Prisma.EmployeeInclude;

export interface EmployeeFilters {
  search?: string;
  department?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listEmployees(filters: EmployeeFilters) {
  const { page, limit, skip } = parsePagination({
    page: filters.page,
    limit: filters.limit,
  });

  const where: Prisma.EmployeeWhereInput = {};

  if (filters.status) where.status = filters.status;
  if (filters.department) {
    where.department = { name: filters.department };
  }
  if (filters.search) {
    const q = filters.search.trim();
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { employeeCode: { contains: q, mode: "insensitive" } },
      { personalEmail: { contains: q, mode: "insensitive" } },
      { designation: { title: { contains: q, mode: "insensitive" } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({ where, include: EMPLOYEE_INCLUDE, orderBy: { employeeCode: "asc" }, skip, take: limit }),
    prisma.employee.count({ where }),
  ]);

  return {
    data: serializeEmployeeList(rows),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getEmployeeById(id: string) {
  const emp = await prisma.employee.findUnique({
    where: { id },
    include: EMPLOYEE_INCLUDE,
  });
  if (!emp) throw AppError.notFound("Employee not found");
  return { data: serializeEmployeeList([emp])[0] };
}

export async function getEmployeeByCode(code: string) {
  const emp = await prisma.employee.findUnique({
    where: { employeeCode: code },
    include: EMPLOYEE_INCLUDE,
  });
  if (!emp) throw AppError.notFound("Employee not found");
  return { data: serializeEmployeeList([emp])[0] };
}

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  designationId?: string;
  departmentId?: string;
  locationId?: string;
  designation?: string;
  department?: string;
  location?: string;
  employmentType?: string;
  dateOfJoining?: string;
  managerId?: string;
  gender?: string;
  skillType?: string;
  dob?: string;
  password?: string;
  state?: string;
  country?: string;
  annualSalary?: number;
  photoUrl?: string;
  status?: string;
}

export interface CreateEmployeeOptions {
  /** When true, unknown designation/department/location names are created (instead of failing). */
  autoCreateRefs?: boolean;
}

export interface BulkEmployeeRow {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  designation?: string;
  department?: string;
  location?: string;
  state?: string;
  country?: string;
  annualSalary?: number;
  employmentType?: string;
  dateOfJoining?: string;
}

function toOptionalDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Resolve an org reference (designation/department/location) by name for
 *  frontend payloads that send human-readable names instead of UUIDs. When
 *  `autoCreate` is set, missing names are created on the fly (bulk imports and
 *  the external registration wizard), otherwise they fail loudly. */
type RefCreator = (name: string) => Promise<{ id: string }>;

async function resolveNameToId(
  findFirst: (name: string) => Promise<{ id: string } | null>,
  name: string,
  label: string,
  autoCreate: boolean,
  creator?: RefCreator
): Promise<string> {
  const row = await findFirst(name);
  if (row) return row.id;
  if (!autoCreate || !creator) {
    throw AppError.badRequest(`${label} "${name}" not found. Add it in Organization first.`);
  }
  const created = await creator(name);
  return created.id;
}

/** Find the active company + a business unit for auto-creating org lookups. */
async function defaultOrgContext() {
  const company = await prisma.company.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!company) return null;
  let businessUnit = await prisma.businessUnit.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: "asc" } });
  if (!businessUnit) {
    businessUnit = await prisma.businessUnit.create({ data: { companyId: company.id, name: "General" } });
  }
  return { companyId: company.id, businessUnitId: businessUnit.id };
}

async function resolveOrgRefs(input: Partial<CreateEmployeeInput>, autoCreate = false, cache: Record<string, string> = {}) {
  const orgContext = autoCreate ? await defaultOrgContext() : null;
  const desgCacheKey = input.designation?.toLowerCase() ?? "";
  const deptCacheKey = input.department?.toLowerCase() ?? "";
  const locCacheKey = input.location?.toLowerCase() ?? "";

  const [designationId, departmentId, locationId] = await Promise.all([
    input.designationId ? Promise.resolve(input.designationId)
      : input.designation ? (cache[desgCacheKey]
          ? Promise.resolve(cache[desgCacheKey])
          : resolveNameToId(
              (n) => {
                const where: Prisma.DesignationWhereInput = { title: { equals: n, mode: "insensitive" } };
                return prisma.designation.findFirst({ where });
              },
              input.designation,
              "Designation",
              autoCreate,
              async (n) => {
                const row = await prisma.designation.create({ data: { title: n } });
                cache[desgCacheKey] = row.id;
                return row;
              }
            ))
      : Promise.resolve(null),
    input.departmentId ? Promise.resolve(input.departmentId)
      : input.department ? (cache[deptCacheKey]
          ? Promise.resolve(cache[deptCacheKey])
          : resolveNameToId(
              (n) => {
                const where: Prisma.DepartmentWhereInput = { name: { equals: n, mode: "insensitive" } };
                return prisma.department.findFirst({ where });
              },
              input.department,
              "Department",
              autoCreate,
              async (n) => {
                if (!orgContext) throw AppError.badRequest(`Department "${n}" cannot be auto-created: no active company configured.`);
                const row = await prisma.department.create({
                  data: { companyId: orgContext.companyId, businessUnitId: orgContext.businessUnitId, name: n },
                });
                cache[deptCacheKey] = row.id;
                return row;
              }
            ))
      : Promise.resolve(null),
    input.locationId ? Promise.resolve(input.locationId)
      : input.location ? (cache[locCacheKey]
          ? Promise.resolve(cache[locCacheKey])
          : resolveNameToId(
              (n) => {
                const where: Prisma.LocationWhereInput = { name: { equals: n, mode: "insensitive" } };
                return prisma.location.findFirst({ where });
              },
              input.location,
              "Location",
              autoCreate,
              async (n) => {
                if (!orgContext) throw AppError.badRequest(`Location "${n}" cannot be auto-created: no active company configured.`);
                const row = await prisma.location.create({ data: { companyId: orgContext.companyId, name: n } });
                cache[locCacheKey] = row.id;
                return row;
              }
            ))
      : Promise.resolve(null),
  ]);
  return { designationId, departmentId, locationId };
}

export async function createEmployee(input: CreateEmployeeInput, opts: CreateEmployeeOptions = {}) {
  const nextCode = await generateEmployeeCode();
  const cache: Record<string, string> = {};
  const { designationId, departmentId, locationId } = await resolveOrgRefs(input, opts.autoCreateRefs, cache);

  // Employee creation requires an auth user (email is required for login).
  // Reuse an existing account for the same email instead of failing with a
  // unique-constraint error (wizard mirror / bulk import reprocess-safe).
  const email = (input.email ?? "").toLowerCase();
  let userId: string | null = null;
  if (email) {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(input.password ?? "Welcome@123"),
          role: { connect: { name: "EMPLOYEE" } },
        },
      });
    }
    userId = user.id;
  }

  const emp = await prisma.employee.create({
    data: {
      userId,
      employeeCode: nextCode,
      firstName: input.firstName,
      lastName: input.lastName,
      personalEmail: email || null,
      personalMobile: input.phone ?? null,
      dateOfBirth: toOptionalDate(input.dob),
      gender: input.gender ?? null,
      skillType: input.skillType ?? null,
      designationId: designationId,
      departmentId: departmentId,
      locationId: locationId,
      reportingManagerId: input.managerId ?? null,
      dateOfJoining: new Date(input.dateOfJoining ?? new Date()),
      employmentType: input.employmentType ?? "Full-Time",
      state: input.state ?? null,
      country: input.country ?? null,
      annualSalary: typeof input.annualSalary === "number" ? input.annualSalary : null,
      photoUrl: input.photoUrl ?? null,
    },
    include: EMPLOYEE_INCLUDE,
  });

  writeAuditLog({
    action: "CREATE",
    entityType: "Employee",
    entityId: emp.id,
    newValue: { employeeCode: emp.employeeCode, firstName: emp.firstName, lastName: emp.lastName },
  });

  // Auto-create an active salary structure so the employee immediately shows up
  // in payroll (summary + runs) with a computed salary breakdown.
  await ensureActiveSalaryStructure(emp.id, input.annualSalary);

  return { data: serializeEmployeeList([emp])[0] };
}

/**
 * Create many employees from parsed spreadsheet rows. Rows that miss their
 * mandatory fields (first name, last name, designation, department) or fail
 * validation are skipped and reported instead of aborting the import.
 */
export async function createEmployeesBulk(rows: BulkEmployeeRow[]) {
  const created: Array<{ id: string; name: string }> = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  const seenEmails = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2; // 1-based, +1 for the header row
    try {
      const firstName = (row.firstName ?? "").trim();
      const lastName = (row.lastName ?? "").trim();
      const designation = (row.designation ?? "").trim();
      const department = (row.department ?? "").trim();

      if (!firstName || !lastName || !designation || !department) {
        skipped.push({ row: rowNo, reason: "Missing mandatory fields (first name, last name, designation, department)" });
        continue;
      }

      const email = (row.email ?? "").trim().toLowerCase();
      if (email) {
        if (seenEmails.has(email)) {
          skipped.push({ row: rowNo, reason: `Duplicate email "${email}" within the file` });
          continue;
        }
        // A valid-email check: reject obviously broken emails instead of failing later.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          skipped.push({ row: rowNo, reason: `Invalid email "${email}"` });
          continue;
        }
        seenEmails.add(email);
      }

      const annualSalaryRaw = row.annualSalary;
      const annualSalary =
        typeof annualSalaryRaw === "number"
          ? annualSalaryRaw > 0 ? annualSalaryRaw : undefined
          : annualSalaryRaw != null && String(annualSalaryRaw).trim() !== ""
            ? Number(String(annualSalaryRaw).replace(/[,\s]/g, ""))
            : undefined;

      const result = await createEmployee(
        {
          firstName,
          lastName,
          email: email || undefined,
          phone: row.phone ? String(row.phone).trim() : undefined,
          designation,
          department,
          location: row.location ? String(row.location).trim() : undefined,
          state: row.state ? String(row.state).trim() : undefined,
          country: row.country ? String(row.country).trim() : undefined,
          annualSalary,
          employmentType: row.employmentType ? String(row.employmentType).trim() : undefined,
          dateOfJoining: row.dateOfJoining ? String(row.dateOfJoining).trim() : undefined,
        },
        { autoCreateRefs: true }
      );

      created.push({ id: result.data.id, name: `${result.data.firstName} ${result.data.lastName}` });
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? "Failed to create employee";
      skipped.push({ row: rowNo, reason: message.replace(/^Error:\s*/i, "") });
    }
  }

  return {
    createdCount: created.length,
    skippedCount: skipped.length,
    skipped: skipped.slice(0, 200),
    created: created.slice(0, 50),
  };
}

/** Persist an employee profile photo (MinIO first, local-disk fallback). */
export async function uploadEmployeePhoto(id: string, file: Express.Multer.File) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) throw AppError.notFound("Employee not found");
  if (!file) throw AppError.badRequest("Photo file is required");

  const extension = path.extname(file.originalname).toLowerCase() || ".jpg";
  const name = `${randomUUID()}${extension}`;
  try {
    await ensureMinioBucket();
    await minioClient.putObject(MINIO_BUCKET, `employee/${name}`, file.buffer, file.size, {
      "Content-Type": file.mimetype,
    });
  } catch {
    // MinIO unavailable (e.g. local dev without the object store) — persist on
    // local disk instead so uploads still work and survive a refresh.
    const dir = path.join(process.cwd(), "uploads", "employee");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), file.buffer);
  }

  const photoUrl = `/uploads/employee/${name}`;
  const updated = await prisma.employee.update({
    where: { id },
    data: { photoUrl },
    include: EMPLOYEE_INCLUDE,
  });

  writeAuditLog({
    action: "UPDATE",
    entityType: "Employee",
    entityId: updated.id,
    newValue: { photoUpdated: true, employeeCode: updated.employeeCode },
  });

  return { data: serializeEmployeeList([updated])[0] };
}

async function generateEmployeeCode(): Promise<string> {
  const last = await prisma.employee.findFirst({ orderBy: { employeeCode: "desc" }, select: { employeeCode: true } });
  const nextNumber = last ? (Number(last.employeeCode.replace(/\D/g, "")) || 0) + 1 : 1;
  return `EMP${String(nextNumber).padStart(3, "0")}`;
}

/** Derive a monthly salary-structure split from an annual salary (mirrors the
 *  seed baseline). Employees without an active structure are invisible to
 *  payroll, so create one automatically when an employee is created, and keep
 *  it in sync when the "Yearly Salary Package" changes. */
async function ensureActiveSalaryStructure(employeeId: string, annualSalary?: number | null, syncExisting = false) {
  const existing = await prisma.salaryStructure.findFirst({ where: { employeeId, isActive: true } });
  const breakdown = salaryStructureBreakdown(annualSalary);

  if (existing) {
    if (!syncExisting) return existing;
    return prisma.salaryStructure.update({
      where: { id: existing.id },
      data: { ...breakdown },
    });
  }

  return prisma.salaryStructure.create({
    data: {
      employeeId,
      effectiveFrom: new Date(),
      ...breakdown,
    },
  });
}

export async function updateEmployee(id: string, input: Partial<CreateEmployeeInput>) {
  const existing = await prisma.employee.findUnique({ where: { id }, include: { user: true } });
  if (!existing) throw AppError.notFound("Employee not found");

  const { designationId, departmentId, locationId } = await resolveOrgRefs(input);

  let reportingManagerId: string | null | undefined = undefined;
  if (input.managerId !== undefined) {
    reportingManagerId = null;
    const managerRef = String(input.managerId).trim();
    if (managerRef) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(managerRef);
      const manager = isUuid
        ? await prisma.employee.findUnique({ where: { id: managerRef }, select: { id: true } })
        : await prisma.employee.findUnique({ where: { employeeCode: managerRef }, select: { id: true } });
      if (!manager) throw AppError.badRequest(`Reporting manager "${managerRef}" not found`);
      reportingManagerId = manager.id;
    }
  }

  const data: Prisma.EmployeeUpdateInput = {
    firstName: input.firstName ?? undefined,
    lastName: input.lastName ?? undefined,
    personalMobile: input.phone ?? undefined,
    dateOfBirth: toOptionalDate(input.dob) ?? undefined,
    gender: input.gender ?? undefined,
    skillType: input.skillType ?? undefined,
    designation: designationId ? { connect: { id: designationId } } : undefined,
    department: departmentId ? { connect: { id: departmentId } } : undefined,
    location: locationId ? { connect: { id: locationId } } : undefined,
    reportingManager:
      reportingManagerId === undefined
        ? undefined
        : reportingManagerId
          ? { connect: { id: reportingManagerId } }
          : { disconnect: true },
    employmentType: input.employmentType ?? undefined,
    dateOfJoining: input.dateOfJoining ? new Date(input.dateOfJoining) : undefined,
    state: input.state ?? undefined,
    country: input.country ?? undefined,
    annualSalary: typeof input.annualSalary === "number" ? input.annualSalary : undefined,
    status: input.status ?? undefined,
  };

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (email) {
      const owner = await prisma.user.findUnique({ where: { email } });
      if (owner && owner.id !== existing.userId) {
        throw AppError.badRequest(`Email "${email}" is already in use`);
      }
      if (existing.userId) {
        await prisma.user.update({ where: { id: existing.userId }, data: { email } });
      }
      data.personalEmail = email;
    } else {
      data.personalEmail = null;
    }
  }

  const updated = await prisma.employee.update({
    where: { id },
    data,
    include: EMPLOYEE_INCLUDE,
  });

  writeAuditLog({
    action: "UPDATE",
    entityType: "Employee",
    entityId: updated.id,
    oldValue: { employeeCode: existing.employeeCode },
    newValue: { employeeCode: updated.employeeCode, firstName: updated.firstName, lastName: updated.lastName },
  });

  // Create a salary structure on first payroll setup (and sync it when the
  // yearly salary package changes) so gross always tracks annualSalary.
  await ensureActiveSalaryStructure(
    updated.id,
    input.annualSalary ?? (existing.annualSalary ? Number(existing.annualSalary) : undefined),
    input.annualSalary !== undefined
  );

  return { data: serializeEmployeeList([updated])[0] };
}

export async function deleteEmployee(id: string) {
  const existing = await prisma.employee.findUnique({ where: { id }, include: { user: true } });
  if (!existing) throw AppError.notFound("Employee not found");

  // Hard delete — the employee and all their dependent records are removed
  // permanently. Most child rows (attendance, leave, balances, salary
  // structures, reviews, etc.) cascade from the Employee row itself; the
  // models below use ON DELETE RESTRICT against `employees`, so their rows
  // must be removed explicitly before the cascade fires.
  await prisma.$transaction([
    prisma.helpdeskComment.deleteMany({ where: { authorId: id } }),
    prisma.helpdeskTicket.deleteMany({ where: { requesterId: id } }),
    prisma.interviewScorecard.deleteMany({ where: { interviewerId: id } }),
    prisma.interviewPanel.deleteMany({ where: { interviewerId: id } }),
    prisma.performanceReview.deleteMany({ where: { reviewerId: id } }),
    prisma.performanceOneOnOne.deleteMany({ where: { managerId: id } }),
    prisma.taskTimeEntry.deleteMany({ where: { employeeId: id } }),
    prisma.task.deleteMany({ where: { assigneeId: id } }),
    prisma.alumni.deleteMany({ where: { employeeId: id } }),
    prisma.separation.deleteMany({ where: { employeeId: id } }),
    prisma.workflowInstance.deleteMany({ where: { requesterId: id } }),
    prisma.assetRequest.deleteMany({ where: { employeeId: id } }),
  ]);

  // Payslips carry a RESTRICT FK to SalaryStructure too, so they go before
  // the employee cascade removes the structures. Any payroll run left with
  // zero payslips is cleaned up as well.
  await prisma.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { employeeId: id } });
    const orphanedRuns = await tx.payrollRun.findMany({
      where: { payslips: { none: {} } },
      select: { id: true },
    });
    if (orphanedRuns.length) {
      await tx.payrollRun.deleteMany({ where: { id: { in: orphanedRuns.map((r) => r.id) } } });
    }
    await tx.employee.delete({ where: { id } });
    if (existing.userId) {
      await tx.user.delete({ where: { id: existing.userId } });
    }
  });

  writeAuditLog({
    action: "DELETE",
    entityType: "Employee",
    entityId: existing.id,
    oldValue: { employeeCode: existing.employeeCode, status: existing.status, userId: existing.userId },
    newValue: { deleted: true },
  });

  return { data: { id: existing.employeeCode, deleted: true } };
}
