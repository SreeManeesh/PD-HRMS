import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requirePermission, requireRole } from "../../middlewares/rbac";
import { attendanceUpload } from "../../middlewares/attendanceUpload";
import * as attendanceController from "./attendance.controller";

const router = Router();

const listQuerySchema = z.object({
  employeeId: z.string().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  day: z.coerce.number().int().min(1).max(31).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

const checkInBodySchema = z.object({
  employeeId: z.string().optional(),
  method: z.enum(["Web", "Biometric", "GPS"]).optional(),
});

const checkOutBodySchema = z.object({
  employeeId: z.string().optional(),
});

// GET /api/attendance — attendance:read
router.get("/", authenticate, requirePermission("attendance:read"), validate({ query: listQuerySchema }), attendanceController.list);

// GET /api/attendance/summary — attendance:read (team summary)
router.get("/summary", authenticate, requirePermission("attendance:read"), attendanceController.summary);

// POST /api/attendance/check-in — attendance:write
router.post("/check-in", authenticate, requirePermission("attendance:write"), validate({ body: checkInBodySchema }), attendanceController.doCheckIn);

// POST /api/attendance/check-out — attendance:write
router.post("/check-out", authenticate, requirePermission("attendance:write"), validate({ body: checkOutBodySchema }), attendanceController.doCheckOut);

// POST /api/attendance/upload — attendance:write (bulk CSV / Excel / text import)
router.post("/upload", authenticate, requirePermission("attendance:write"), attendanceUpload.single("file"), attendanceController.uploadAttendance);

// POST /api/attendance/clear-upload — ADMIN/HR only: permanently remove imported data
router.post("/clear-upload", authenticate, requireRole("ADMIN", "HR"), requirePermission("attendance:write"), attendanceController.clearUpload);

export default router;
