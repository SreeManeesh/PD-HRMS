import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import * as payrollService from "./payroll.service";
import * as payslipStatementService from "./payslipStatement";
import * as distributionService from "../payslipDistribution/distribution.service";
import { AppError } from "../../lib/errors";

export const runs = asyncHandler(async (_req: Request, res: Response) => {
  const result = await payrollService.listPayrollRuns();
  sendSuccess(res, result.data);
});

export const runDetail = asyncHandler(async (req: Request, res: Response) => {
  const result = await payrollService.getPayrollRun(req.params.id);
  sendSuccess(res, result.data);
});

export const employeeSummary = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const requested = q.employeeId!.trim();
  const actor = req.auth;
  // Employees can only see their own payroll summary.
  const employeeId = actor?.role === "EMPLOYEE"
    ? (actor.employeeCode ?? requested)
    : requested;
  if (actor?.role === "EMPLOYEE" && actor.employeeCode && requested !== actor.employeeCode) {
    throw AppError.forbidden("Employees can only view their own payroll summary");
  }
  const result = await payrollService.getEmployeePayrollSummary(employeeId, Number(q.month), Number(q.year));
  sendSuccess(res, result.data);
});

export const payslips = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await payrollService.listPayslips(q.employeeId);
  sendSuccess(res, result.data);
});

export const runPayslips = asyncHandler(async (req: Request, res: Response) => {
  const result = await payrollService.listRunPayslips(req.params.id);
  sendSuccess(res, result.data);
});

export const payslipDetail = asyncHandler(async (req: Request, res: Response) => {
  const result = await payrollService.getPayslip(req.params.id);
  sendSuccess(res, result.data);
});

export const payslipPdf = asyncHandler(async (req: Request, res: Response) => {
  const { buffer, filename } = await payrollService.getPayslipPdf(req.params.id, {
    role: req.auth?.role,
    employeeCode: req.auth?.employeeCode,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

export const process = asyncHandler(async (req: Request, res: Response) => {
  const result = await payrollService.processPayrollRun(req.params.id, req.auth?.sub);
  sendSuccess(res, result.data);
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth?.employeeId) throw AppError.forbidden("Approver must be linked to an employee record");
  const result = await payrollService.approvePayrollRun(req.params.id, req.auth.employeeId, req.auth.sub);
  sendSuccess(res, result.data);
});

export const payslipStatement = asyncHandler(async (req: Request, res: Response) => {
  const result = await payslipStatementService.buildPayslipStatement(req.params.id, {
    role: req.auth?.role,
    employeeCode: req.auth?.employeeCode,
  });
  sendSuccess(res, result.data);
});

// ── Payslip Distribution ──────────────────────────────────────────────────

export const distribute = asyncHandler(async (req: Request, res: Response) => {
  const result = await distributionService.startDistribution(
    req.params.id,
    (req.body?.channels ?? {}) as Parameters<typeof distributionService.startDistribution>[1],
    {
      employeeIds: req.body?.employeeIds,
      templateId: req.body?.templateId,
    },
    req.auth?.employeeId
  );
  sendSuccess(res, result.data);
});

export const distributionStatus = asyncHandler(async (req: Request, res: Response) => {
  const result = await distributionService.distributionStatus(req.params.id);
  sendSuccess(res, result.data);
});

export const distributionRetry = asyncHandler(async (req: Request, res: Response) => {
  const result = await distributionService.retryFailedDeliveries(req.params.id, req.body?.employeeIds);
  sendSuccess(res, result.data);
});

export const distributionReport = asyncHandler(async (req: Request, res: Response) => {
  const csv = await distributionService.distributionReport(req.params.id);
  const runId = req.params.id;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="delivery_report_${runId}.csv"`);
  res.send(csv);
});

export const distributionHistory = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await distributionService.distributionHistory(Number(q.month), Number(q.year));
  sendSuccess(res, result.data);
});

export const payslipViewed = asyncHandler(async (req: Request, res: Response) => {
  const result = await distributionService.markPayslipViewed(req.params.id, {
    employeeId: req.auth?.employeeId,
    role: req.auth?.role,
  });
  sendSuccess(res, result.data);
});
