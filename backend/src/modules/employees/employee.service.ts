import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { salaryStructureBreakdown } from "../../lib/salaryStructure";
import { hashPassword } from "../../lib/password";
import { writeAuditLog } from "../../services/audit.service";
import { serializeEmployeeList, serializeEmployee, sanitizeWizardData, type SerializationContext } from "../../serializers/employee.serializer";
export { serializeEmployeeList, serializeEmployee, sanitizeWizardData, type SerializationContext };
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

export async function listEmployees(filters: EmployeeFilters, context?: SerializationContext) {
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
    data: serializeEmployeeList(rows, context),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getEmployeeById(id: string, context?: SerializationContext) {
  const emp = await prisma.employee.findUnique({
    where: { id },
    include: EMPLOYEE_INCLUDE,
  });
  if (!emp) throw AppError.notFound("Employee not found");
  return { data: serializeEmployeeList([emp], context)[0] };
}

export async function getEmployeeByCode(code: string, context?: SerializationContext) {
  const emp = await prisma.employee.findUnique({
    where: { employeeCode: code },
    include: EMPLOYEE_INCLUDE,
  });
  if (!emp) throw AppError.notFound("Employee not found");
  return { data: serializeEmployeeList([emp], context)[0] };
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
  annualSalary?: number | string | null;
  photoUrl?: string;
  status?: string;
  wizardData?: unknown;
}

export interface CreateEmployeeOptions {
  /** When true, unknown designation/department/location names are created (instead of failing). */
  autoCreateRefs?: boolean;
}

export interface BulkEmployeeRow {
  employeeCode?: string;
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

export interface BulkPreviewRow extends BulkEmployeeRow {
  rowNo: number;
  fullName: string;
  status: "ready" | "duplicate" | "invalid";
  reason?: string;
}

export interface BulkPreviewResult {
  rows: BulkPreviewRow[];
  totalCount: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  isAllDuplicates: boolean;
}

function toOptionalDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Coerce an annual-salary payload (number or numeric string with commas/
 *  spaces) to a rounded integer. Returns `undefined` when the field was not
 *  supplied (no change), `null` when it should be cleared, otherwise the
 *  parsed amount. Previously a string salary (e.g. "500000" from a form)
 *  failed the `typeof === "number"` check and was stored as NULL — wiping
 *  the package and freezing gross earnings at the fallback. */
function parseAnnualSalaryInput(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const cleaned = typeof value === "string" ? value.replace(/[,\s₹]/g, "") : value;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
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

  const parsedCreateSalary = parseAnnualSalaryInput(input.annualSalary) ?? null;
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
      annualSalary: parsedCreateSalary,
      photoUrl: input.photoUrl ?? null,
      wizardData: (input.wizardData ?? undefined) as any,
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
  await ensureActiveSalaryStructure(emp.id, parsedCreateSalary);

  return { data: serializeEmployeeList([emp])[0], employeePk: emp.id };
}

interface ImportBatchRecord {
  employeeIds: string[];
  userIds: string[];
  createdAt: number;
}

const recentImportBatches = new Map<string, ImportBatchRecord>();

function cleanExpiredBatches() {
  const now = Date.now();
  for (const [id, batch] of recentImportBatches.entries()) {
    if (now - batch.createdAt > 10 * 60 * 1000) {
      recentImportBatches.delete(id);
    }
  }
}

/**
 * Preview employee spreadsheet rows, validate fields, and identify duplicates
 * against existing database records and within the uploaded file itself.
 */
export async function previewEmployeesBulk(rows: BulkEmployeeRow[]): Promise<BulkPreviewResult> {
  const [existingUsers, existingEmployees] = await Promise.all([
    prisma.user.findMany({ select: { email: true } }),
    prisma.employee.findMany({
      select: {
        employeeCode: true,
        personalEmail: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
      },
    }),
  ]);

  const dbEmails = new Set<string>();
  for (const u of existingUsers) {
    if (u.email) dbEmails.add(u.email.toLowerCase().trim());
  }
  for (const e of existingEmployees) {
    if (e.personalEmail) dbEmails.add(e.personalEmail.toLowerCase().trim());
  }

  const dbCodes = new Set<string>();
  for (const e of existingEmployees) {
    if (e.employeeCode) dbCodes.add(e.employeeCode.toUpperCase().trim());
  }

  const dbNameDept = new Set<string>();
  for (const e of existingEmployees) {
    const key = `${e.firstName.toLowerCase().trim()}|${e.lastName.toLowerCase().trim()}|${(e.department?.name || "").toLowerCase().trim()}`;
    dbNameDept.add(key);
  }

  const seenFileEmails = new Set<string>();
  const seenFileCodes = new Set<string>();
  const seenFileNameDept = new Set<string>();

  const previewRows: BulkPreviewRow[] = [];
  let readyCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2; // Header is row 1
    const firstName = (row.firstName ?? "").trim();
    const lastName = (row.lastName ?? "").trim();
    const designation = (row.designation ?? "").trim();
    const department = (row.department ?? "").trim();
    const email = (row.email ?? "").trim().toLowerCase();
    const employeeCode = (row.employeeCode ?? "").trim().toUpperCase();
    const fullName = `${firstName} ${lastName}`.trim();
    const nameDeptKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${department.toLowerCase()}`;

    // 1. Mandatory field checks
    if (!firstName || !lastName || !designation || !department) {
      invalidCount++;
      previewRows.push({
        ...row,
        rowNo,
        fullName: fullName || "Unnamed",
        status: "invalid",
        reason: "Missing mandatory fields (first name, last name, designation, department)",
      });
      continue;
    }

    // 2. Email format check
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalidCount++;
      previewRows.push({
        ...row,
        rowNo,
        fullName,
        status: "invalid",
        reason: `Invalid email format "${email}"`,
      });
      continue;
    }

    // 3. Check existing records in database
    if (email && dbEmails.has(email)) {
      duplicateCount++;
      previewRows.push({
        ...row,
        rowNo,
        fullName,
        status: "duplicate",
        reason: `Employee with email "${email}" is already present in the system`,
      });
      continue;
    }

    if (employeeCode && dbCodes.has(employeeCode)) {
      duplicateCount++;
      previewRows.push({
        ...row,
        rowNo,
        fullName,
        status: "duplicate",
        reason: `Employee code "${employeeCode}" is already present in the system`,
      });
      continue;
    }

    if (!email && dbNameDept.has(nameDeptKey)) {
      duplicateCount++;
      previewRows.push({
        ...row,
        rowNo,
        fullName,
        status: "duplicate",
        reason: `Employee "${fullName}" in department "${department}" is already present in the system`,
      });
      continue;
    }

    // 4. Check duplicates within the file itself
    if (email && seenFileEmails.has(email)) {
      duplicateCount++;
      previewRows.push({
        ...row,
        rowNo,
        fullName,
        status: "duplicate",
        reason: `Duplicate email "${email}" repeated within this file`,
      });
      continue;
    }

    if (employeeCode && seenFileCodes.has(employeeCode)) {
      duplicateCount++;
      previewRows.push({
        ...row,
        rowNo,
        fullName,
        status: "duplicate",
        reason: `Duplicate employee code "${employeeCode}" repeated within this file`,
      });
      continue;
    }

    if (!email && seenFileNameDept.has(nameDeptKey)) {
      duplicateCount++;
      previewRows.push({
        ...row,
        rowNo,
        fullName,
        status: "duplicate",
        reason: `Duplicate employee "${fullName}" (${department}) repeated within this file`,
      });
      continue;
    }

    // 5. Valid unique record ready for import
    if (email) seenFileEmails.add(email);
    if (employeeCode) seenFileCodes.add(employeeCode);
    seenFileNameDept.add(nameDeptKey);
    readyCount++;

    previewRows.push({
      ...row,
      rowNo,
      fullName,
      status: "ready",
      reason: undefined,
    });
  }

  const isAllDuplicates = rows.length > 0 && readyCount === 0 && duplicateCount > 0;

  return {
    rows: previewRows,
    totalCount: rows.length,
    readyCount,
    duplicateCount,
    invalidCount,
    isAllDuplicates,
  };
}

/**
 * Create employees from validated spreadsheet rows. Automatically skips duplicates
 * and invalid rows, tracks the created batch, and supports undo within 15-30 seconds.
 */
export async function createEmployeesBulk(rows: BulkEmployeeRow[]) {
  const preview = await previewEmployeesBulk(rows);
  const readyRows = preview.rows.filter((r) => r.status === "ready");

  const batchId = randomUUID();
  const createdEmployeeIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdNames: Array<{ id: string; name: string }> = [];
  const skipped: Array<{ row: number; reason: string }> = [];

  // Add preview-detected skips
  for (const r of preview.rows) {
    if (r.status !== "ready") {
      skipped.push({ row: r.rowNo, reason: r.reason || "Skipped (duplicate or invalid)" });
    }
  }

  for (const row of readyRows) {
    try {
      const email = (row.email ?? "").trim().toLowerCase();
      const existingUser = email ? await prisma.user.findUnique({ where: { email } }) : null;

      const annualSalaryRaw = row.annualSalary;
      const annualSalary =
        typeof annualSalaryRaw === "number"
          ? annualSalaryRaw > 0 ? annualSalaryRaw : undefined
          : annualSalaryRaw != null && String(annualSalaryRaw).trim() !== ""
            ? Number(String(annualSalaryRaw).replace(/[,\s]/g, ""))
            : undefined;

      const result = await createEmployee(
        {
          firstName: row.firstName!,
          lastName: row.lastName!,
          email: email || undefined,
          phone: row.phone ? String(row.phone).trim() : undefined,
          designation: row.designation!,
          department: row.department!,
          location: row.location ? String(row.location).trim() : undefined,
          state: row.state ? String(row.state).trim() : undefined,
          country: row.country ? String(row.country).trim() : undefined,
          annualSalary,
          employmentType: row.employmentType ? String(row.employmentType).trim() : undefined,
          dateOfJoining: row.dateOfJoining ? String(row.dateOfJoining).trim() : undefined,
        },
        { autoCreateRefs: true }
      );

      createdEmployeeIds.push(result.employeePk || result.data.id);
      createdNames.push({ id: result.data.id, name: `${result.data.firstName} ${result.data.lastName}` });

      if (email && !existingUser) {
        const newUser = await prisma.user.findUnique({ where: { email } });
        if (newUser) createdUserIds.push(newUser.id);
      }
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? "Failed to create employee";
      skipped.push({ row: row.rowNo, reason: message.replace(/^Error:\s*/i, "") });
    }
  }

  cleanExpiredBatches();
  recentImportBatches.set(batchId, {
    employeeIds: createdEmployeeIds,
    userIds: createdUserIds,
    createdAt: Date.now(),
  });

  return {
    batchId,
    createdCount: createdEmployeeIds.length,
    skippedCount: skipped.length,
    skippedDuplicatesCount: preview.duplicateCount,
    skippedInvalidCount: preview.invalidCount,
    skipped: skipped.slice(0, 200),
    created: createdNames.slice(0, 50),
    isAllDuplicates: preview.isAllDuplicates,
  };
}

/**
 * Undo a recent bulk employee import batch within the undo window.
 * Safely removes the employees, their salary structures, and created users.
 */
export async function undoEmployeesBulk(batchId: string) {
  cleanExpiredBatches();
  const batch = recentImportBatches.get(batchId);
  if (!batch) {
    throw AppError.badRequest("Undo window has expired or this import batch was not found.");
  }

  const { employeeIds, userIds } = batch;
  let undoneCount = 0;

  for (const empId of employeeIds) {
    try {
      await deleteEmployee(empId);
      undoneCount++;
    } catch (err) {
      // Continue cleanup on remaining employees
    }
  }

  for (const uid of userIds) {
    try {
      await prisma.user.deleteMany({ where: { id: uid, employee: null } });
    } catch {
      // User may already be deleted or attached elsewhere
    }
  }

  recentImportBatches.delete(batchId);

  writeAuditLog({
    action: "DELETE",
    entityType: "Employee",
    newValue: { bulkUndo: true, batchId, undoneCount },
  });

  return { success: true, undoneCount, batchId };
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
  const existing = await prisma.employee.findUnique({ where: { id }, include: EMPLOYEE_INCLUDE });
  if (!existing) throw AppError.notFound("Employee not found");

  const cache: Record<string, string> = {};
  const { designationId, departmentId, locationId } = await resolveOrgRefs(
    {
      designation: input.designation,
      designationId: input.designationId,
      department: input.department,
      departmentId: input.departmentId,
      location: input.location,
      locationId: input.locationId,
    },
    true,
    cache
  );

  const email = input.email !== undefined ? (input.email ? input.email.toLowerCase() : null) : undefined;
  if (email !== undefined && email !== existing.personalEmail && email !== existing.user?.email) {
    if (email) {
      const clash = await prisma.user.findFirst({ where: { email, NOT: { id: existing.userId ?? undefined } } });
      if (clash) throw AppError.conflict("An account with that email already exists");
    }
  }

  const parsedAnnualSalary = parseAnnualSalaryInput(input.annualSalary);

let finalUserId = existing.userId;
  if (email !== undefined && email !== null) {
    if (!existing.userId) {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword("Welcome@123"),
          role: { connect: { name: "EMPLOYEE" } },
        },
      });
      finalUserId = user.id;
    } else {
      await prisma.user.update({ where: { id: existing.userId }, data: { email } });
    }
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      userId: finalUserId,
      firstName: input.firstName ?? undefined,
      lastName: input.lastName ?? undefined,
      personalEmail: email !== undefined ? email : undefined,
      personalMobile: input.phone !== undefined ? input.phone || null : undefined,
      dateOfBirth: input.dob !== undefined ? toOptionalDate(input.dob) : undefined,
      gender: input.gender !== undefined ? input.gender || null : undefined,
      skillType: input.skillType !== undefined ? input.skillType || null : undefined,
      designationId: designationId !== undefined ? designationId : undefined,
      departmentId: departmentId !== undefined ? departmentId : undefined,
      locationId: locationId !== undefined ? locationId : undefined,
      reportingManagerId: input.managerId !== undefined ? input.managerId || null : undefined,
      dateOfJoining: input.dateOfJoining ? new Date(input.dateOfJoining) : undefined,
      employmentType: input.employmentType ?? undefined,
      status: input.status ?? undefined,
      state: input.state !== undefined ? input.state || null : undefined,
      country: input.country !== undefined ? input.country || null : undefined,
      annualSalary: parsedAnnualSalary,
      photoUrl: input.photoUrl !== undefined ? input.photoUrl || null : undefined,
      wizardData: (
        input.wizardData === undefined
          ? undefined
          : input.wizardData === null
            ? Prisma.DbNull
            : (input.wizardData as Prisma.InputJsonValue)
      ) as any,
    },
    include: EMPLOYEE_INCLUDE,
  });

  if (parsedAnnualSalary !== undefined) {
    await ensureActiveSalaryStructure(updated.id, parsedAnnualSalary, true);
  }

  writeAuditLog({
    action: "UPDATE",
    entityType: "Employee",
    entityId: updated.id,
    newValue: { employeeCode: updated.employeeCode, firstName: updated.firstName, lastName: updated.lastName },
  });

  return { data: serializeEmployeeList([updated])[0] };
}

export async function deleteEmployee(id: string, actingUserId?: string | null) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const where: Prisma.EmployeeWhereUniqueInput = isUuid ? { id } : { employeeCode: id };
  const existing = await prisma.employee.findUnique({ where, include: { user: true } });
  if (!existing) throw AppError.notFound("Employee not found");

  // Never let an admin delete their own login account: doing so removes the
  // user + refresh tokens and instantly force-logs the session out.
  if (actingUserId && existing.userId === actingUserId) {
    throw AppError.forbidden(
      "You cannot delete your own account while signed in. Ask another administrator to remove it."
    );
  }

  const pk = existing.id;

  // Hard delete — the employee and all their dependent records are removed
  // permanently. Most child rows (attendance, leave, balances, salary
  // structures, reviews, etc.) cascade from the Employee row itself; the
  // models below use ON DELETE RESTRICT against `employees`, so their rows
  // must be removed explicitly before the cascade fires.
  await prisma.$transaction([
    prisma.helpdeskComment.deleteMany({ where: { authorId: pk } }),
    prisma.helpdeskTicket.deleteMany({ where: { requesterId: pk } }),
    prisma.interviewScorecard.deleteMany({ where: { interviewerId: pk } }),
    prisma.interviewPanel.deleteMany({ where: { interviewerId: pk } }),
    prisma.performanceReview.deleteMany({ where: { reviewerId: pk } }),
    prisma.performanceOneOnOne.deleteMany({ where: { managerId: pk } }),
    prisma.taskTimeEntry.deleteMany({ where: { employeeId: pk } }),
    prisma.task.deleteMany({ where: { assigneeId: pk } }),
    prisma.alumni.deleteMany({ where: { employeeId: pk } }),
    prisma.separation.deleteMany({ where: { employeeId: pk } }),
    prisma.workflowInstance.deleteMany({ where: { requesterId: pk } }),
    prisma.assetRequest.deleteMany({ where: { employeeId: pk } }),
  ]);

  // Payslips carry a RESTRICT FK to SalaryStructure too, so they go before
  // the employee cascade removes the structures. Any payroll run left with
  // zero payslips is cleaned up as well.
  await prisma.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { employeeId: pk } });
    const orphanedRuns = await tx.payrollRun.findMany({
      where: { payslips: { none: {} } },
      select: { id: true },
    });
    if (orphanedRuns.length) {
      await tx.payrollRun.deleteMany({ where: { id: { in: orphanedRuns.map((r) => r.id) } } });
    }
    await tx.employee.delete({ where: { id: pk } });
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
