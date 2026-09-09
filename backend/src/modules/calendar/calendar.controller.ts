import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import * as calendarService from "./calendar.service";

export const listHolidays = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await calendarService.listHolidays({
    year: q.year ? Number(q.year) : undefined,
    country: q.country,
    state: q.state,
  });
  sendSuccess(res, result.data);
});

export const createHoliday = asyncHandler(async (req: Request, res: Response) => {
  const result = await calendarService.createHoliday(req.body);
  sendSuccess(res, result.data, undefined, 201);
});

export const deleteHoliday = asyncHandler(async (req: Request, res: Response) => {
  const result = await calendarService.deleteHoliday(req.params.id);
  sendSuccess(res, result.data);
});

export const workingDays = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await calendarService.workingDays({
    year: q.year ? Number(q.year) : undefined,
    month: q.month ? Number(q.month) : undefined,
    country: q.country,
    state: q.state,
  });
  sendSuccess(res, result.data);
});

export const getWeeklyOff = asyncHandler(async (_req: Request, res: Response) => {
  const result = await calendarService.getWeeklyOff();
  sendSuccess(res, result.data);
});

export const updateWeeklyOff = asyncHandler(async (req: Request, res: Response) => {
  const result = await calendarService.updateWeeklyOff(req.body.weeklyOffDays);
  sendSuccess(res, result.data);
});