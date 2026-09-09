import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import * as attendanceService from "./attendance.service";
import { AppError } from "../../lib/errors";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await attendanceService.listAttendance(
    {
      employeeId: q.employeeId,
      month: q.month ? Number(q.month) : undefined,
      year: q.year ? Number(q.year) : undefined,
    },
    req.auth?.employeeId,
    req.auth?.role
  );
  sendSuccess(res, result.data);
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await attendanceService.getTeamSummary({
    month: q.month ? Number(q.month) : undefined,
    year: q.year ? Number(q.year) : undefined,
  });
  sendSuccess(res, result.data);
});

export const doCheckIn = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw AppError.unauthorized();
  const employeeId = req.body.employeeId ?? req.auth.employeeCode;
  if (!employeeId) throw AppError.badRequest("employeeId is required");
  const result = await attendanceService.checkIn(employeeId, req.auth.employeeId, req.body.method);
  sendSuccess(res, result.data, undefined, 201);
});

export const doCheckOut = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw AppError.unauthorized();
  const employeeId = req.body.employeeId ?? req.auth.employeeCode;
  if (!employeeId) throw AppError.badRequest("employeeId is required");
  const result = await attendanceService.checkOut(employeeId, req.auth.employeeId);
  sendSuccess(res, result.data);
});

export const uploadAttendance = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest("No file uploaded. Attach a CSV, Excel or delimited-text attendance file.");
  const result = await attendanceService.importAttendanceFromCsv(req.file);
  sendSuccess(res, result);
});
