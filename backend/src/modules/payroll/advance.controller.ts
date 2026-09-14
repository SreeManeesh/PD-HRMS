import { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import { toNumber } from "../../serializers/helpers";

export async function listAdvances(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId, status } = req.query;
    const advances = await prisma.salaryAdvance.findMany({
      where: {
        ...(employeeId ? { employeeId: String(employeeId) } : {}),
        ...(status ? { status: String(status) } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { disbursedOn: "desc" },
    });

    res.json({
      data: advances.map((a) => {
        const amount = toNumber(a.amount);
        const recovered = toNumber(a.recoveredAmount);
        const outstanding = Math.max(amount - recovered, 0);
        return {
          id: a.id,
          employeeId: a.employeeId,
          employeeCode: a.employee.employeeCode,
          employeeName: `${a.employee.firstName} ${a.employee.lastName}`.trim(),
          department: a.employee.department?.name ?? "—",
          amount,
          monthlyDeduction: toNumber(a.monthlyDeduction),
          recoveredAmount: recovered,
          outstandingAmount: outstanding,
          disbursedOn: a.disbursedOn,
          status: a.status,
          reason: a.reason,
          createdAt: a.createdAt,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

export async function createAdvance(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId, amount, monthlyDeduction, reason, disbursedOn } = req.body;
    if (!employeeId || amount === undefined || monthlyDeduction === undefined) {
      throw AppError.badRequest("Employee, advance amount, and monthly deduction are required");
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound("Employee not found");

    const advance = await prisma.salaryAdvance.create({
      data: {
        employeeId,
        amount: Number(amount),
        monthlyDeduction: Number(monthlyDeduction),
        recoveredAmount: 0,
        disbursedOn: disbursedOn ? new Date(disbursedOn) : new Date(),
        status: "Active",
        reason: reason || "Salary Advance",
      },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
    });

    await writeAuditLog({
      action: "CREATE",
      entityType: "SalaryAdvance",
      entityId: advance.id,
      actorUserId: req.auth?.sub,
      newValue: { employeeId, amount, monthlyDeduction },
    });

    res.status(201).json({
      data: {
        id: advance.id,
        employeeId: advance.employeeId,
        employeeCode: advance.employee.employeeCode,
        employeeName: `${advance.employee.firstName} ${advance.employee.lastName}`.trim(),
        amount: toNumber(advance.amount),
        monthlyDeduction: toNumber(advance.monthlyDeduction),
        recoveredAmount: 0,
        outstandingAmount: toNumber(advance.amount),
        status: advance.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateAdvance(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { monthlyDeduction, status, reason } = req.body;

    const existing = await prisma.salaryAdvance.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Salary advance not found");

    const updated = await prisma.salaryAdvance.update({
      where: { id },
      data: {
        ...(monthlyDeduction !== undefined ? { monthlyDeduction: Number(monthlyDeduction) } : {}),
        ...(status ? { status } : {}),
        ...(reason !== undefined ? { reason } : {}),
      },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}
