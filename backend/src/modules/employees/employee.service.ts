import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { salaryStructureBreakdown } from "../../lib/salaryStructure";
import { hashPassword } from "../../lib/password";
import { writeAuditLog } from "../../services/audit.service";
import { serializeEmployeeList } from "../../serializers/employee.serializer";
import { parsePagination } from "../../lib/utils";

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
  dob?: string;
  password?: string;
  state?: string;
  country?: string;
  annualSalary?: number;
}

function toOptionalDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Resolve an org reference (designation/department/location) by name for
 *  frontend payloads that send human-readable names instead of UUIDs. */
async function resolveNameToId(
  findFirst: (name: string) => Promise<{ id: string } | null>,
  name: string,
  label: string
): Promise<string> {
  const row = await findFirst(name);
  if (!row) throw AppError.badRequest(`${label} "${name}" not found. Add it in Organization first.`);
  return row.id;
}

async function resolveOrgRefs(input: Partial<CreateEmployeeInput>) {
  const [designationId, departmentId, locationId] = await Promise.all([
    input.designationId ? Promise.resolve(input.designationId)
      : input.designation ? resolveNameToId(
          (n) => {
            const where: Prisma.DesignationWhereInput = { title: { equals: n, mode: "insensitive" } };
            return prisma.designation.findFirst({ where });
          },
          input.designation,
          "Designation"
        ) : Promise.resolve(null),
    input.departmentId ? Promise.resolve(input.departmentId)
      : input.department ? resolveNameToId(
          (n) => {
            const where: Prisma.DepartmentWhereInput = { name: { equals: n, mode: "insensitive" } };
            return prisma.department.findFirst({ where });
          },
          input.department,
          "Department"
        ) : Promise.resolve(null),
    input.locationId ? Promise.resolve(input.locationId)
      : input.location ? resolveNameToId(
          (n) => {
            const where: Prisma.LocationWhereInput = { name: { equals: n, mode: "insensitive" } };
            return prisma.location.findFirst({ where });
          },
          input.location,
          "Location"
        ) : Promise.resolve(null),
  ]);
  return { designationId, departmentId, locationId };
}

export async function createEmployee(input: CreateEmployeeInput) {
  const nextCode = await generateEmployeeCode();
  const { designationId, departmentId, locationId } = await resolveOrgRefs(input);

  // Employee creation requires an auth user (email is required for login).
  const email = (input.email ?? "").toLowerCase();
  let userId: string | null = null;
  if (email) {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password ?? "Welcome@123"),
        role: { connect: { name: "EMPLOYEE" } },
      },
    });
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
      designationId: designationId,
      departmentId: departmentId,
      locationId: locationId,
      reportingManagerId: input.managerId ?? null,
      dateOfJoining: new Date(input.dateOfJoining ?? new Date()),
      employmentType: input.employmentType ?? "Full-Time",
      state: input.state ?? null,
      country: input.country ?? null,
      annualSalary: typeof input.annualSalary === "number" ? input.annualSalary : null,
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

  const data: Prisma.EmployeeUpdateInput = {
    firstName: input.firstName ?? undefined,
    lastName: input.lastName ?? undefined,
    personalMobile: input.phone ?? undefined,
    dateOfBirth: toOptionalDate(input.dob) ?? undefined,
    gender: input.gender ?? undefined,
    designation: designationId ? { connect: { id: designationId } } : undefined,
    department: departmentId ? { connect: { id: departmentId } } : undefined,
    location: locationId ? { connect: { id: locationId } } : undefined,
    reportingManager: input.managerId ? { connect: { id: input.managerId } } : undefined,
    employmentType: input.employmentType ?? undefined,
    dateOfJoining: input.dateOfJoining ? new Date(input.dateOfJoining) : undefined,
    state: input.state ?? undefined,
    country: input.country ?? undefined,
    annualSalary: typeof input.annualSalary === "number" ? input.annualSalary : undefined,
  };

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

  // Soft-delete: set status Inactive, remove auth access.
  await prisma.employee.update({ where: { id }, data: { status: "Inactive" } });
  if (existing.userId) {
    await prisma.user.update({ where: { id: existing.userId }, data: { isActive: false } });
  }

  writeAuditLog({
    action: "DELETE",
    entityType: "Employee",
    entityId: existing.id,
    oldValue: { employeeCode: existing.employeeCode },
    newValue: { status: "Inactive" },
  });

  return { data: { id: existing.employeeCode, deleted: true } };
}
