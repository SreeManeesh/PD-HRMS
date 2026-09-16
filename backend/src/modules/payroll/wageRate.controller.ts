import { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import { toNumber } from "../../serializers/helpers";

/**
 * Wage rates are DYNAMIC ONLY — every row comes from the Wage Rates & Overrides
 * UI/API (state/skill/location/contractor scope or an employee override).
 * Nothing is ever auto-seeded or synthesised here; this helper merely backfills
 * the legacy `state: null` rows to the explicit "All States (Default)" label so
 * they stay addressable as the fallback scope.
 */
async function ensureDefaultWageRates() {
  await prisma.wageRate.updateMany({
    where: { state: null },
    data: { state: "All States (Default)" },
  });
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

/**
 * GET /api/payroll/employee-wages — single source of truth joining
 * employees ↔ wage rates (+ per-employee override) ↔ earning components.
 *
 * Doctrine (applied everywhere, backend + frontend):
 *   monthly salary (base pay) = Basic (locked state/skill minimum wage) + allowances
 *   gross earnings === monthly salary, always.
 * E.g. monthly ₹40,000 with a ₹22,000 state minimum → basic ₹22,000 and the
 * ₹18,000 remainder is divided into the allowance components.
 */
export async function getEmployeeWages(req: Request, res: Response, next: NextFunction) {
  try {
    const { basicMonthlyWage, splitMonthlyPackage } = await import("./payroll.service");
    const [employees, wageRates, components] = await Promise.all([
      prisma.employee.findMany({
        where: { status: { in: ["Active", "On Leave"] } },
        select: {
          id: true, employeeCode: true, firstName: true, lastName: true,
          skillType: true, state: true, locationId: true, contractorId: true,
          dailyWageRate: true, annualSalary: true, salaryType: true,
          location: { select: { name: true } },
        },
        orderBy: { employeeCode: "asc" },
      }),
      prisma.wageRate.findMany({ where: { isActive: true } }),
      prisma.payrollComponentConfig.findMany({ where: { isActive: true, kind: "earning" } }),
    ]);

    const norm = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
    const isBasicKey = (c: { code?: string | null; name?: string | null }) =>
      norm(c.code).includes("basic") || norm(c.name).includes("basic");
    const fromGross = (c: { sourceField?: string | null; percentageFrom?: string | null }) =>
      String(c.sourceField || "").toLowerCase() === "ctc" ||
      String(c.percentageFrom || "").toLowerCase().includes("gross");

    const data = employees.map((e) => {
      const wage = basicMonthlyWage(
        {
          skillType: e.skillType, locationId: e.locationId, contractorId: e.contractorId,
          dailyWageRate: e.dailyWageRate, state: e.state,
          location: e.location ? { name: e.location.name } : null,
        },
        wageRates as unknown as Parameters<typeof basicMonthlyWage>[1],
      );
      const base = {
        employeeId: e.id,
        employeeCode: e.employeeCode,
        name: `${e.firstName} ${e.lastName}`.trim(),
        skillType: e.skillType || "Skilled",
        state: e.state || e.location?.name || "",
        salaryType: e.salaryType || (toNumber(e.dailyWageRate) > 0 && !toNumber(e.annualSalary) ? "Daily" : "Monthly"),
        dailyRate: wage.dailyRate,
        hourlyRate: wage.hourlyRate,
        basicMonthly: wage.basicMonthly,
        wageSource: wage.source,
        isOverride: wage.isOverride,
        storedAnnual: toNumber(e.annualSalary),
      };
      // Base pay (monthly income) is strictly employee-defined and NEVER
      // sourced from wage rates: monthly staff carry it as annualSalary/12,
      // daily staff as dailyRate × 26 (the wage rate IS a daily worker's pay
      // basis). A monthly employee with no package has NO monthly — the wage
      // table contributes ONLY their Basic line, never a monthly.
      const isDaily =
        String(e.salaryType || "").trim().toLowerCase() === "daily" ||
        (toNumber(e.dailyWageRate) > 0 && !toNumber(e.annualSalary));
      const storedMonthly = Math.round(toNumber(e.annualSalary) / 12);
      if (!isDaily && storedMonthly <= 0) {
        return {
          ...base,
          monthlySalary: null,
          monthlyGross: null,
          allowanceRemainder: 0,
          allowanceEnvelope: null,
          configuredAllowanceTotal: null,
          allowanceExcess: null,
          nonCompliant: true,
          needsPackage: true,
          monthlyDefined: false,
          annualDerived: 0,
        };
      }
      const empSkill = norm(e.skillType || "Skilled");
      const applicable = components.filter((c) => {
        if (isBasicKey(c)) return false; // basic is locked, never double-counted
        if (c.calcType !== "fixed" && c.calcType !== "percentage") return false;
        const cat = norm(c.applicableCategory || "ALL");
        if (cat !== "all" && cat !== empSkill) return false;
        if (c.locationId && c.locationId !== e.locationId) return false;
        if (c.contractorId && c.contractorId !== e.contractorId) return false;
        return true;
      });
      // Monthly salary envelope — employee-defined only: stored CTC for
      // monthly staff; the basic-anchored minimum for daily staff (whose pay
      // basis IS the daily rate). This branch is unreachable for monthly
      // staff without a package (returned above).
      const fixedWeights = applicable
        .filter((c) => c.calcType === "fixed")
        .map((c) => {
          let w = toNumber(c.value ?? 0);
          if (c.maxCap != null && toNumber(c.maxCap) > 0 && w > toNumber(c.maxCap)) w = Math.round(toNumber(c.maxCap));
          return { key: String(c.code || c.name), weight: Math.max(0, w) };
        });
      const basicPctParts = applicable
        .filter((c) => c.calcType === "percentage" && !fromGross(c))
        .map((c) => {
          let amt = Math.round((wage.basicMonthly * toNumber(c.pct ?? 0)) / 100);
          if (c.maxCap != null && toNumber(c.maxCap) > 0 && amt > toNumber(c.maxCap)) amt = Math.round(toNumber(c.maxCap));
          return { key: String(c.code || c.name), amount: Math.max(0, amt) };
        });
      // %‑of‑gross parts need the envelope: the stored monthly for monthly
      // staff, the basic-anchored minimum for daily staff (no CTC).
      const envelopeForPct =
        storedMonthly > 0
          ? storedMonthly
          : (() => {
              const pctGrossRatio = applicable
                .filter((c) => c.calcType === "percentage" && fromGross(c))
                .reduce((s, c) => s + toNumber(c.pct ?? 0) / 100, 0);
              const fixedSum = fixedWeights.reduce((s, w) => s + w.weight, 0);
              const denom = 1 - pctGrossRatio;
              return denom > 0
                ? Math.round((wage.basicMonthly + basicPctParts.reduce((s, p) => s + p.amount, 0) + fixedSum) / denom)
                : Math.round(wage.basicMonthly + basicPctParts.reduce((s, p) => s + p.amount, 0) + fixedSum);
            })();
      const grossPctParts = applicable
        .filter((c) => c.calcType === "percentage" && fromGross(c))
        .map((c) => {
          let amt = Math.round((envelopeForPct * toNumber(c.pct ?? 0)) / 100);
          if (c.maxCap != null && toNumber(c.maxCap) > 0 && amt > toNumber(c.maxCap)) amt = Math.round(toNumber(c.maxCap));
          return { key: String(c.code || c.name), amount: Math.max(0, amt) };
        });
      const otherRule = applicable.find(
        (c) => !isBasicKey(c) && /other/i.test(String(c.code || c.name)),
      );
      // Full-month view (q = 1): basic locked, remainder split into allowances.
      const split = splitMonthlyPackage({
        target: storedMonthly > 0 ? storedMonthly : envelopeForPct,
        basic: wage.basicMonthly,
        fixedWeights,
        basicPctParts,
        grossPctParts,
        otherKey: otherRule ? String(otherRule.code || otherRule.name) : "otherAllowances",
      });
      const monthlyGross = split.gross;
      const annualDerived = monthlyGross * 12;
      // Envelope telemetry: how much the CONFIGURED non-basic components draw
      // vs the allowance pool (target − basic). allowanceExcess > 0 means the
      // config over-drew and the parts were scaled pro-rata so that
      // gross earnings === monthly gross (the payroll doctrine). Callers use
      // this to surface a "gross would exceed monthly gross" disclaimer.
      const targetEnvelope = storedMonthly > 0 ? storedMonthly : envelopeForPct;
      const configuredAllowanceTotal =
        basicPctParts.reduce((s, p) => s + p.amount, 0) +
        grossPctParts.reduce((s, p) => s + p.amount, 0) +
        fixedWeights.reduce((s, w) => s + w.weight, 0);
      const allowanceEnvelope = Math.max(targetEnvelope - wage.basicMonthly, 0);
      return {
        ...base,
        basicMonthly: split.basic,
        monthlyGross,
        monthlySalary: monthlyGross,
        monthlyDefined: true,
        needsPackage: false,
        allowanceRemainder: Math.max(monthlyGross - split.basic, 0),
        allowanceEnvelope,
        configuredAllowanceTotal,
        allowanceExcess: Math.max(configuredAllowanceTotal - allowanceEnvelope, 0),
        nonCompliant: split.nonCompliant,
        annualDerived,
      };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
}
