import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requirePermission, requireRole } from "../../middlewares/rbac";
import * as calendarController from "./calendar.controller";

const router = Router();

const listQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  country: z.string().optional(),
  state: z.string().optional(),
});

const workingDaysQuerySchema = listQuerySchema.extend({
  month: z.coerce.number().int().min(1).max(12).optional(),
});

const holidayBodySchema = z.object({
  name: z.string().min(1).max(120),
  date: z.string(),
  country: z.string().max(60).optional(),
  state: z.string().max(60).nullable().optional(),
  type: z.string().max(30).optional(),
});

const weeklyOffBodySchema = z.object({
  weeklyOffDays: z.array(z.number().int().min(0).max(6)),
});

// GET /api/calendar/holidays — any authenticated user (attendance reader)
router.get("/holidays", authenticate, requirePermission("attendance:read"), validate({ query: listQuerySchema }), calendarController.listHolidays);

// GET /api/calendar/working-days — used by payroll reconciliation
router.get("/working-days", authenticate, requirePermission("attendance:read"), validate({ query: workingDaysQuerySchema }), calendarController.workingDays);

// GET/PATCH /api/calendar/weekly-off
router.get("/weekly-off", authenticate, requirePermission("attendance:read"), calendarController.getWeeklyOff);
router.patch("/weekly-off", authenticate, requireRole("ADMIN", "HR"), validate({ body: weeklyOffBodySchema }), calendarController.updateWeeklyOff);

// POST/DELETE /api/calendar/holidays — HR/ADMIN only
router.post("/holidays", authenticate, requireRole("ADMIN", "HR"), validate({ body: holidayBodySchema }), calendarController.createHoliday);
router.delete("/holidays/:id", authenticate, requireRole("ADMIN", "HR"), calendarController.deleteHoliday);

export default router;