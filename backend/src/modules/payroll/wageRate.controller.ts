import { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import { toNumber } from "../../serializers/helpers";

export const DEFAULT_INDIAN_STATE_WAGE_RATES = [
  // Central / All States Default
  { skillCategory: "Skilled", dailyRate: 900, hourlyRate: 112.5, state: "All States (Default)" },
  { skillCategory: "Semi-Skilled", dailyRate: 750, hourlyRate: 93.75, state: "All States (Default)" },
  { skillCategory: "Unskilled", dailyRate: 650, hourlyRate: 81.25, state: "All States (Default)" },

  // Maharashtra
  { skillCategory: "Skilled", dailyRate: 920, hourlyRate: 115, state: "Maharashtra" },
  { skillCategory: "Semi-Skilled", dailyRate: 770, hourlyRate: 96.25, state: "Maharashtra" },
  { skillCategory: "Unskilled", dailyRate: 670, hourlyRate: 83.75, state: "Maharashtra" },

  // Delhi
  { skillCategory: "Skilled", dailyRate: 900, hourlyRate: 112.5, state: "Delhi" },
  { skillCategory: "Semi-Skilled", dailyRate: 750, hourlyRate: 93.75, state: "Delhi" },
  { skillCategory: "Unskilled", dailyRate: 650, hourlyRate: 81.25, state: "Delhi" },

  // Karnataka
  { skillCategory: "Skilled", dailyRate: 880, hourlyRate: 110, state: "Karnataka" },
  { skillCategory: "Semi-Skilled", dailyRate: 740, hourlyRate: 92.5, state: "Karnataka" },
  { skillCategory: "Unskilled", dailyRate: 640, hourlyRate: 80, state: "Karnataka" },

  // Gujarat
  { skillCategory: "Skilled", dailyRate: 870, hourlyRate: 108.75, state: "Gujarat" },
  { skillCategory: "Semi-Skilled", dailyRate: 730, hourlyRate: 91.25, state: "Gujarat" },
  { skillCategory: "Unskilled", dailyRate: 635, hourlyRate: 79.38, state: "Gujarat" },

  // Tamil Nadu
  { skillCategory: "Skilled", dailyRate: 860, hourlyRate: 107.5, state: "Tamil Nadu" },
  { skillCategory: "Semi-Skilled", dailyRate: 720, hourlyRate: 90, state: "Tamil Nadu" },
  { skillCategory: "Unskilled", dailyRate: 630, hourlyRate: 78.75, state: "Tamil Nadu" },

  // Uttar Pradesh
  { skillCategory: "Skilled", dailyRate: 850, hourlyRate: 106.25, state: "Uttar Pradesh" },
  { skillCategory: "Semi-Skilled", dailyRate: 710, hourlyRate: 88.75, state: "Uttar Pradesh" },
  { skillCategory: "Unskilled", dailyRate: 620, hourlyRate: 77.5, state: "Uttar Pradesh" },

  // Haryana
  { skillCategory: "Skilled", dailyRate: 910, hourlyRate: 113.75, state: "Haryana" },
  { skillCategory: "Semi-Skilled", dailyRate: 760, hourlyRate: 95, state: "Haryana" },
  { skillCategory: "Unskilled", dailyRate: 660, hourlyRate: 82.5, state: "Haryana" },

  // West Bengal
  { skillCategory: "Skilled", dailyRate: 860, hourlyRate: 107.5, state: "West Bengal" },
  { skillCategory: "Semi-Skilled", dailyRate: 720, hourlyRate: 90, state: "West Bengal" },
  { skillCategory: "Unskilled", dailyRate: 630, hourlyRate: 78.75, state: "West Bengal" },

  // Telangana
  { skillCategory: "Skilled", dailyRate: 890, hourlyRate: 111.25, state: "Telangana" },
  { skillCategory: "Semi-Skilled", dailyRate: 750, hourlyRate: 93.75, state: "Telangana" },
  { skillCategory: "Unskilled", dailyRate: 640, hourlyRate: 80, state: "Telangana" },

  // Rajasthan
  { skillCategory: "Skilled", dailyRate: 840, hourlyRate: 105, state: "Rajasthan" },
  { skillCategory: "Semi-Skilled", dailyRate: 700, hourlyRate: 87.5, state: "Rajasthan" },
  { skillCategory: "Unskilled", dailyRate: 610, hourlyRate: 76.25, state: "Rajasthan" },

  // Kerala
  { skillCategory: "Skilled", dailyRate: 930, hourlyRate: 116.25, state: "Kerala" },
  { skillCategory: "Semi-Skilled", dailyRate: 780, hourlyRate: 97.5, state: "Kerala" },
  { skillCategory: "Unskilled", dailyRate: 680, hourlyRate: 85, state: "Kerala" },

  // Madhya Pradesh
  { skillCategory: "Skilled", dailyRate: 830, hourlyRate: 103.75, state: "Madhya Pradesh" },
  { skillCategory: "Semi-Skilled", dailyRate: 690, hourlyRate: 86.25, state: "Madhya Pradesh" },
  { skillCategory: "Unskilled", dailyRate: 600, hourlyRate: 75, state: "Madhya Pradesh" },

  // Andhra Pradesh
  { skillCategory: "Skilled", dailyRate: 870, hourlyRate: 108.75, state: "Andhra Pradesh" },
  { skillCategory: "Semi-Skilled", dailyRate: 730, hourlyRate: 91.25, state: "Andhra Pradesh" },
  { skillCategory: "Unskilled", dailyRate: 630, hourlyRate: 78.75, state: "Andhra Pradesh" },

  // Punjab
  { skillCategory: "Skilled", dailyRate: 900, hourlyRate: 112.5, state: "Punjab" },
  { skillCategory: "Semi-Skilled", dailyRate: 750, hourlyRate: 93.75, state: "Punjab" },
  { skillCategory: "Unskilled", dailyRate: 650, hourlyRate: 81.25, state: "Punjab" },
];

async function ensureDefaultWageRates() {
  // 1. Backfill any existing rates with state == null to 'All States (Default)'
  await prisma.wageRate.updateMany({
    where: { state: null },
    data: { state: "All States (Default)" },
  });

  // 2. Ensure every state in DEFAULT_INDIAN_STATE_WAGE_RATES has its category rates present
  for (const r of DEFAULT_INDIAN_STATE_WAGE_RATES) {
    const existing = await prisma.wageRate.findFirst({
      where: {
        skillCategory: { equals: r.skillCategory, mode: "insensitive" },
        state: { equals: r.state, mode: "insensitive" },
        locationId: null,
        contractorId: null,
      },
    });
    if (!existing) {
      await prisma.wageRate.create({
        data: {
          skillCategory: r.skillCategory,
          dailyRate: r.dailyRate,
          hourlyRate: r.hourlyRate,
          state: r.state,
          isActive: true,
        },
      });
    }
  }
}

export async function listWageRates(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDefaultWageRates();
    const { category, locationId, contractorId, state } = req.query;
    const rates = await prisma.wageRate.findMany({
      where: {
        isActive: true,
        ...(category ? { skillCategory: { equals: String(category), mode: "insensitive" } } : {}),
        ...(locationId ? { locationId: String(locationId) } : {}),
        ...(contractorId ? { contractorId: String(contractorId) } : {}),
        ...(state && String(state) === "All States (Default)"
          ? { OR: [{ state: "All States (Default)" }, { state: null }] }
          : state && String(state) !== "All" && String(state) !== "All States (Default)"
          ? { state: { equals: String(state), mode: "insensitive" } }
          : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
        contractor: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ state: "asc" }, { skillCategory: "asc" }, { createdAt: "desc" }],
    });

    res.json({
      data: rates.map((r) => ({
        id: r.id,
        skillCategory: r.skillCategory,
        dailyRate: toNumber(r.dailyRate),
        hourlyRate: r.hourlyRate ? toNumber(r.hourlyRate) : Math.round((toNumber(r.dailyRate) / 8) * 100) / 100,
        state: r.state ?? "All States (Default)",
        locationId: r.locationId,
        locationName: r.location?.name ?? (r.state ? `${r.state} State Scale` : "All Locations (Company-Wide)"),
        contractorId: r.contractorId,
        contractorName: r.contractor?.name ?? "Direct / All Contractors",
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        isActive: r.isActive,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createWageRate(req: Request, res: Response, next: NextFunction) {
  try {
    const { skillCategory, dailyRate, hourlyRate, locationId, contractorId, state, effectiveFrom, effectiveTo } = req.body;
    if (!skillCategory || dailyRate === undefined) {
      throw AppError.badRequest("Skill category and daily rate are required");
    }

    const calculatedHourly = hourlyRate !== undefined ? hourlyRate : Math.round((Number(dailyRate) / 8) * 100) / 100;

    const rate = await prisma.wageRate.create({
      data: {
        skillCategory,
        dailyRate: Number(dailyRate),
        hourlyRate: calculatedHourly,
        state: state || null,
        locationId: locationId || null,
        contractorId: contractorId || null,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        isActive: true,
      },
      include: {
        location: { select: { id: true, name: true } },
        contractor: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      action: "CREATE",
      entityType: "WageRate",
      entityId: rate.id,
      actorUserId: req.auth?.sub,
      newValue: { skillCategory, dailyRate, locationId, contractorId, state },
    });

    res.status(201).json({
      data: {
        id: rate.id,
        skillCategory: rate.skillCategory,
        dailyRate: toNumber(rate.dailyRate),
        hourlyRate: toNumber(rate.hourlyRate),
        state: rate.state,
        locationId: rate.locationId,
        locationName: rate.location?.name ?? (rate.state ? `${rate.state} State Scale` : "All Locations"),
        contractorId: rate.contractorId,
        contractorName: rate.contractor?.name ?? "Direct",
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateWageRate(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { skillCategory, dailyRate, hourlyRate, locationId, contractorId, state, effectiveFrom, effectiveTo, isActive } = req.body;

    const existing = await prisma.wageRate.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Wage rate not found");

    const newDaily = dailyRate !== undefined ? Number(dailyRate) : toNumber(existing.dailyRate);
    const newHourly = hourlyRate !== undefined ? Number(hourlyRate) : Math.round((newDaily / 8) * 100) / 100;

    const updated = await prisma.wageRate.update({
      where: { id },
      data: {
        ...(skillCategory ? { skillCategory } : {}),
        dailyRate: newDaily,
        hourlyRate: newHourly,
        ...(state !== undefined ? { state: state || null } : {}),
        ...(locationId !== undefined ? { locationId: locationId || null } : {}),
        ...(contractorId !== undefined ? { contractorId: contractorId || null } : {}),
        ...(effectiveFrom ? { effectiveFrom: new Date(effectiveFrom) } : {}),
        ...(effectiveTo !== undefined ? { effectiveTo: effectiveTo ? new Date(effectiveTo) : null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
        contractor: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      action: "UPDATE",
      entityType: "WageRate",
      entityId: id,
      actorUserId: req.auth?.sub,
      oldValue: { dailyRate: toNumber(existing.dailyRate) },
      newValue: { dailyRate: newDaily },
    });

    res.json({
      data: {
        id: updated.id,
        skillCategory: updated.skillCategory,
        dailyRate: toNumber(updated.dailyRate),
        hourlyRate: toNumber(updated.hourlyRate),
        state: updated.state,
        locationId: updated.locationId,
        locationName: updated.location?.name ?? (updated.state ? `${updated.state} State Scale` : "All Locations"),
        contractorId: updated.contractorId,
        contractorName: updated.contractor?.name ?? "Direct",
        isActive: updated.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteWageRate(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await prisma.wageRate.update({ where: { id }, data: { isActive: false } });
    res.json({ message: "Wage rate deactivated successfully" });
  } catch (err) {
    next(err);
  }
}
