import { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import { toNumber } from "../../serializers/helpers";
import { Prisma } from "@prisma/client";

/** Basic wages are system-driven (wage rates + overrides) and locked. */
function isBasicLocked(code?: unknown, name?: unknown): boolean {
  const norm = (v: unknown) => String(v || "").toLowerCase().replace(/[^a-z]/g, "");
  return norm(code).includes("basic") || norm(name).includes("basic");
}

export async function listComponents(req: Request, res: Response, next: NextFunction) {
  try {
    const { kind, category, locationId } = req.query;
    const andClauses: object[] = [];
    if (category) andClauses.push({ OR: [{ applicableCategory: "ALL" }, { applicableCategory: String(category) }] });
    if (locationId) andClauses.push({ OR: [{ locationId: null }, { locationId: String(locationId) }] });
    const components = await prisma.payrollComponentConfig.findMany({
      where: {
        isActive: true,
        ...(kind ? { kind: String(kind) } : {}),
        ...(andClauses.length ? { AND: andClauses } : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
        contractor: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: "asc" }, { kind: "asc" }, { name: "asc" }],
    });

    res.json({
      data: components.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        kind: c.kind,
        calcType: c.calcType,
        value: c.value ? toNumber(c.value) : 0,
        sourceField: c.sourceField,
        pct: c.pct ? toNumber(c.pct) : null,
        formula: c.formula,
        metric: c.metric,
        slabs: c.slabs as unknown,
        applicableCategory: c.applicableCategory || "ALL",
        percentageFrom: c.percentageFrom || null,
        priority: c.priority ?? 99,
        locationId: c.locationId,
        locationName: c.location?.name ?? "All Locations",
        contractorId: c.contractorId,
        contractorName: c.contractor?.name ?? "Direct",
        minAttendanceDays: c.minAttendanceDays,
        minThreshold: c.minThreshold ? toNumber(c.minThreshold) : null,
        maxCap: c.maxCap ? toNumber(c.maxCap) : null,
        effectiveFrom: c.effectiveFrom,
        effectiveTo: c.effectiveTo,
        isActive: c.isActive,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createComponent(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      name,
      code,
      kind,
      calcType,
      value,
      sourceField,
      pct,
      formula,
      metric,
      slabs,
      applicableCategory,
      percentageFrom,
      priority,
      locationId,
      contractorId,
      minAttendanceDays,
      minThreshold,
      maxCap,
      effectiveFrom,
      effectiveTo,
    } = req.body;

    if (!name || !code || !kind || !calcType) {
      throw AppError.badRequest("Name, code, kind, and calculation type are required");
    }
    if (isBasicLocked(code, name)) {
      throw AppError.forbidden(
        "Basic wages are system-driven from Wage Rates & overrides (skill/state-wise) and cannot be created manually."
      );
    }

    const component = await prisma.payrollComponentConfig.create({
      data: {
        name,
        code: String(code).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        kind,
        calcType,
        value: value !== undefined ? Number(value) : null,
        sourceField: sourceField || null,
        pct: pct !== undefined ? Number(pct) : null,
        formula: formula || null,
        metric: metric || null,
        slabs: slabs ? (slabs as Prisma.InputJsonValue) : [],
        applicableCategory: applicableCategory || "ALL",
        percentageFrom: percentageFrom || null,
        priority: priority !== undefined ? Number(priority) : 99,
        locationId: locationId || null,
        contractorId: contractorId || null,
        minAttendanceDays: minAttendanceDays !== undefined ? Number(minAttendanceDays) : null,
        minThreshold: minThreshold !== undefined ? Number(minThreshold) : null,
        maxCap: maxCap !== undefined ? Number(maxCap) : null,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        isActive: true,
      },
    });

    await writeAuditLog({
      action: "CREATE",
      entityType: "PayrollComponentConfig",
      entityId: component.id,
      actorUserId: req.auth?.sub,
      newValue: { name, code, kind, calcType },
    });

    res.status(201).json({ data: component });
  } catch (err) {
    next(err);
  }
}

export async function updateComponent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const {
      name,
      kind,
      calcType,
      value,
      sourceField,
      pct,
      formula,
      metric,
      slabs,
      applicableCategory,
      percentageFrom,
      priority,
      locationId,
      contractorId,
      minAttendanceDays,
      minThreshold,
      maxCap,
      effectiveFrom,
      effectiveTo,
      isActive,
    } = req.body;

    const existing = await prisma.payrollComponentConfig.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Component not found");
    if (isBasicLocked(existing.code, existing.name)) {
      throw AppError.forbidden(
        "Basic wages are system-driven from Wage Rates & overrides (skill/state-wise) and are non-editable."
      );
    }
    if (isBasicLocked(req.body?.code, name)) {
      throw AppError.forbidden(
        "Basic wages are system-driven from Wage Rates & overrides (skill/state-wise) and are non-editable."
      );
    }

    const updated = await prisma.payrollComponentConfig.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(kind ? { kind } : {}),
        ...(calcType ? { calcType } : {}),
        ...(value !== undefined ? { value: Number(value) } : {}),
        ...(sourceField !== undefined ? { sourceField: sourceField || null } : {}),
        ...(pct !== undefined ? { pct: Number(pct) } : {}),
        ...(formula !== undefined ? { formula: formula || null } : {}),
        ...(metric !== undefined ? { metric: metric || null } : {}),
        ...(slabs !== undefined ? { slabs: slabs as Prisma.InputJsonValue } : {}),
        ...(applicableCategory ? { applicableCategory } : {}),
        ...(percentageFrom !== undefined ? { percentageFrom: percentageFrom || null } : {}),
        ...(priority !== undefined ? { priority: Number(priority) } : {}),
        ...(locationId !== undefined ? { locationId: locationId || null } : {}),
        ...(contractorId !== undefined ? { contractorId: contractorId || null } : {}),
        ...(minAttendanceDays !== undefined ? { minAttendanceDays: Number(minAttendanceDays) } : {}),
        ...(minThreshold !== undefined ? { minThreshold: Number(minThreshold) } : {}),
        ...(maxCap !== undefined ? { maxCap: Number(maxCap) } : {}),
        ...(effectiveFrom ? { effectiveFrom: new Date(effectiveFrom) } : {}),
        ...(effectiveTo !== undefined ? { effectiveTo: effectiveTo ? new Date(effectiveTo) : null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteComponent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const existing = await prisma.payrollComponentConfig.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Component not found");
    if (isBasicLocked(existing.code, existing.name)) {
      throw AppError.forbidden(
        "Basic wages are system-driven from Wage Rates & overrides (skill/state-wise) and are non-deletable."
      );
    }
    await prisma.payrollComponentConfig.update({ where: { id }, data: { isActive: false } });
    res.json({ message: "Component deactivated successfully" });
  } catch (err) {
    next(err);
  }
}
