import { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import * as xlsx from "xlsx";

export async function listProduction(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, year, employeeId } = req.query;
    const m = month ? Number(month) : new Date().getMonth() + 1;
    const y = year ? Number(year) : new Date().getFullYear();

    const records = await prisma.productionRecord.findMany({
      where: {
        month: m,
        year: y,
        ...(employeeId ? { employeeId: String(employeeId) } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            skillType: true,
          },
        },
      },
      orderBy: { unitsProduced: "desc" },
    });

    res.json({
      data: records.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeCode: r.employee.employeeCode,
        employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
        department: r.employee.department?.name ?? "—",
        skillType: r.employee.skillType ?? "Skilled",
        month: r.month,
        year: r.year,
        unitsProduced: r.unitsProduced,
        targetUnits: r.targetUnits ?? 1000,
        achievementPct: Math.round((r.unitsProduced / (r.targetUnits || 1000)) * 100),
        remarks: r.remarks,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createOrUpdateProduction(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId, month, year, unitsProduced, targetUnits, remarks } = req.body;
    if (!employeeId || month === undefined || year === undefined || unitsProduced === undefined) {
      throw AppError.badRequest("Employee, month, year, and units produced are required");
    }

    const record = await prisma.productionRecord.upsert({
      where: {
        employeeId_month_year: {
          employeeId,
          month: Number(month),
          year: Number(year),
        },
      },
      create: {
        employeeId,
        month: Number(month),
        year: Number(year),
        unitsProduced: Number(unitsProduced),
        targetUnits: targetUnits !== undefined ? Number(targetUnits) : 1000,
        remarks: remarks || null,
      },
      update: {
        unitsProduced: Number(unitsProduced),
        targetUnits: targetUnits !== undefined ? Number(targetUnits) : 1000,
        remarks: remarks || null,
      },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
    });

    res.status(200).json({ data: record });
  } catch (err) {
    next(err);
  }
}

export async function uploadProductionFile(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) throw AppError.badRequest("Please upload an Excel or CSV file");

    const month = req.body.month ? Number(req.body.month) : new Date().getMonth() + 1;
    const year = req.body.year ? Number(req.body.year) : new Date().getFullYear();

    const workbook = xlsx.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rawRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]);

    let imported = 0;
    const employees = await prisma.employee.findMany({
      select: { id: true, employeeCode: true },
    });
    const empByCode = new Map(employees.map((e) => [e.employeeCode.toUpperCase(), e.id]));

    for (const row of rawRows) {
      const code = String(row["Employee Code"] || row["employeeCode"] || row["Code"] || row["EmpId"] || "").trim().toUpperCase();
      const units = Number(row["Units"] || row["Units Produced"] || row["unitsProduced"] || row["Quantity"] || 0);
      const target = Number(row["Target"] || row["Target Units"] || row["targetUnits"] || 1000);
      const remarks = String(row["Remarks"] || "");

      const empId = empByCode.get(code);
      if (empId && !isNaN(units)) {
        await prisma.productionRecord.upsert({
          where: { employeeId_month_year: { employeeId: empId, month, year } },
          create: { employeeId: empId, month, year, unitsProduced: units, targetUnits: target, remarks },
          update: { unitsProduced: units, targetUnits: target, remarks },
        });
        imported += 1;
      }
    }

    res.json({ message: `Successfully imported production records for ${imported} workers.`, count: imported });
  } catch (err) {
    next(err);
  }
}
