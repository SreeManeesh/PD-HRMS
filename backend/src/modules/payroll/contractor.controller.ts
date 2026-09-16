import { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import { toNumber, round2 } from "../../serializers/helpers";
import { resolveEmployeeWageRate } from "./payroll.service";

export async function listContractors(req: Request, res: Response, next: NextFunction) {
  try {
    const contractors = await prisma.contractor.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { employees: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json({
      data: contractors.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        contactPerson: c.contactPerson,
        phone: c.phone,
        email: c.email,
        serviceChargePct: toNumber(c.serviceChargePct),
        gstNumber: c.gstNumber,
        workerCount: c._count.employees,
        isActive: c.isActive,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createContractor(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, code, contactPerson, phone, email, serviceChargePct, gstNumber } = req.body;
    if (!name || !code) throw AppError.badRequest("Contractor name and code are required");

    const contractor = await prisma.contractor.create({
      data: {
        name,
        code: String(code).toUpperCase().trim(),
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        serviceChargePct: serviceChargePct !== undefined ? Number(serviceChargePct) : 10.0,
        gstNumber: gstNumber || null,
        isActive: true,
      },
    });

    await writeAuditLog({
      action: "CREATE",
      entityType: "Contractor",
      entityId: contractor.id,
      actorUserId: req.auth?.sub,
      newValue: { name, code, serviceChargePct },
    });

    res.status(201).json({ data: contractor });
  } catch (err) {
    next(err);
  }
}

export async function updateContractor(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { name, contactPerson, phone, email, serviceChargePct, gstNumber, isActive } = req.body;

    const updated = await prisma.contractor.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(contactPerson !== undefined ? { contactPerson } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(serviceChargePct !== undefined ? { serviceChargePct: Number(serviceChargePct) } : {}),
        ...(gstNumber !== undefined ? { gstNumber } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * Contractor-wise Payroll & Invoicing Report (Scenario 15).
 * Aggregates workers, payable days, wages, deductions, net pay, contractor service charges, and billing total.
 */
export async function getContractorPayrollReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, year, contractorId } = req.query;
    const m = month ? Number(month) : new Date().getMonth() + 1;
    const y = year ? Number(year) : new Date().getFullYear();

    // Find payroll run for this month/year
    const run = await prisma.payrollRun.findUnique({
      where: { month_year: { month: m, year: y } },
      include: {
        payslips: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                skillType: true,
                contractorId: true,
                contractor: { select: { id: true, name: true, code: true, serviceChargePct: true } },
              },
            },
          },
        },
      },
    });

    // Group payslips by contractor
    const contractors = await prisma.contractor.findMany({
      where: {
        isActive: true,
        ...(contractorId ? { id: String(contractorId) } : {}),
      },
    });

    // Fetch active employees assigned to contractors for dynamic preview when runs are not yet finalized
    const activeContractorEmps = await prisma.employee.findMany({
      where: {
        status: { in: ["Active", "ACTIVE", "active"] },
        contractorId: { not: null },
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        skillType: true,
        salaryType: true,
        state: true,
        locationId: true,
        dailyWageRate: true,
        annualSalary: true,
        contractorId: true,
      },
    });

    // Wage rates come from the DB only (no static/hardcoded fallback) — the
    // same state/skill/location/contractor resolution payroll uses, so the
    // contractor preview matches the eventual payslip.
    const wageRates = await prisma.wageRate.findMany({ where: { isActive: true } });

    const report = contractors.map((c) => {
      const contractorSlips = (run?.payslips ?? []).filter((s) => s.employee.contractorId === c.id);
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      let totalPayableDays = 0;
      let workersList: any[] = [];

      if (contractorSlips.length > 0) {
        for (const slip of contractorSlips) {
          const earnings = (slip.earnings as Record<string, number>) || {};
          const deductions = (slip.deductions as Record<string, number>) || {};
          const att = (slip.attendanceSummary as Record<string, number>) || {};
          totalGross += earnings.total || 0;
          totalDeductions += deductions.total || 0;
          totalNet += toNumber(slip.netPay);
          totalPayableDays += att.payableDays || att.presentDays || 0;
        }
        workersList = contractorSlips.map((s) => {
          const e = (s.earnings as Record<string, number>) || {};
          const d = (s.deductions as Record<string, number>) || {};
          const att = (s.attendanceSummary as Record<string, number>) || {};
          return {
            employeeCode: s.employee.employeeCode,
            employeeName: `${s.employee.firstName} ${s.employee.lastName}`.trim(),
            skillType: s.employee.skillType || "Skilled",
            payableDays: att.payableDays || att.presentDays || 0,
            gross: e.total || 0,
            deductions: d.total || 0,
            netPay: toNumber(s.netPay),
          };
        });
      } else {
        const assignedEmps = activeContractorEmps.filter((e) => e.contractorId === c.id);
        for (const emp of assignedEmps) {
          // Dynamic only: the employee's own wage (override, else the fetched
          // wage-rate table for their skill/state/location/contractor). No
          // static fallback — an unconfigured rate yields 0 and shows as such.
          const wageDailyRate = resolveEmployeeWageRate(emp, wageRates).dailyRate;
          const monthly = toNumber(emp.annualSalary)
            ? round2(toNumber(emp.annualSalary) / 12)
            : round2(wageDailyRate * 26);
          const ded = round2(monthly * 0.12);
          const net = round2(monthly - ded);
          totalGross += monthly;
          totalDeductions += ded;
          totalNet += net;
          totalPayableDays += 26;
          workersList.push({
            employeeCode: emp.employeeCode,
            employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
            skillType: emp.skillType || "Skilled",
            payableDays: 26,
            gross: monthly,
            deductions: ded,
            netPay: net,
          });
        }
      }

      const serviceChargePct = toNumber(c.serviceChargePct);
      const serviceChargeAmount = round2((totalGross * serviceChargePct) / 100);
      const invoiceTotal = round2(totalGross + serviceChargeAmount);

      return {
        contractorId: c.id,
        contractorName: c.name,
        contractorCode: c.code,
        serviceChargePct,
        headcount: workersList.length,
        totalPayableDays: round2(totalPayableDays),
        totalGrossWage: round2(totalGross),
        totalGross: round2(totalGross),
        totalDeductions: round2(totalDeductions),
        totalNetPayToWorkers: round2(totalNet),
        totalNetPay: round2(totalNet),
        serviceChargeAmount,
        serviceFee: serviceChargeAmount,
        invoiceBillingTotal: invoiceTotal,
        totalBilling: invoiceTotal,
        workers: workersList,
      };
    });

    res.json({
      period: `${m}/${y}`,
      month: m,
      year: y,
      data: report,
    });
  } catch (err) {
    next(err);
  }
}
