import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import * as payrollService from "./payroll.service";
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

export const payslipDetail = asyncHandler(async (req: Request, res: Response) => {
  const result = await payrollService.getPayslip(req.params.id);
  sendSuccess(res, result.data);
});

export const payslipPdf = asyncHandler(async (req: Request, res: Response) => {
  const { buffer, filename } = await payrollService.getPayslipPdf(req.params.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

export const process = asyncHandler(async (req: Request, res: Response) => {
  const result = await payrollService.processPayrollRun(req.params.id, req.auth?.employeeId);
  sendSuccess(res, result.data);
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth?.employeeId) throw AppError.forbidden("Approver must be linked to an employee record");
  const result = await payrollService.approvePayrollRun(req.params.id, req.auth.employeeId);
  sendSuccess(res, result.data);
});
