import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import { attendanceUpload } from "../../middlewares/attendanceUpload";
import { companyBrandingUpload } from "../companyBranding/companyBranding.middleware";
import * as employeeController from "./employee.controller";

const router = Router();

const optionalUuid = z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined);

const listQuerySchema = z.object({
  search: z.string().optional(),
  department: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(5000).optional(),
});

const createBodySchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("A valid email is required").optional().or(z.literal("")),
  phone: z.string().optional(),
  designationId: optionalUuid,
  departmentId: optionalUuid,
  locationId: optionalUuid,
  designation: z.string().optional(),
  department: z.string().optional(),
  location: z.string().optional(),
  managerId: z.string().optional(),
  employmentType: z.string().optional(),
  dateOfJoining: z.string().optional(),
  gender: z.string().optional(),
  skillType: z.string().optional(),
  dob: z.string().optional(),
  password: z.string().min(8).optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  annualSalary: z.coerce.number().nonnegative().optional(),
  status: z.enum(["Active", "On Leave", "Inactive", "Terminated"]).optional(),
  wizardData: z.unknown().optional(),
});

const updateBodySchema = createBodySchema.partial();

// GET /api/employees — employees:read
router.get(
  "/",
  authenticate,
  requirePermission("employees:read|dashboard:read"),
  validate({ query: listQuerySchema }),
  employeeController.list
);

// GET /api/employees/:id — employees:read
router.get("/:id", authenticate, requirePermission("employees:read|dashboard:read"), employeeController.getOne);

// POST /api/employees — employees:write
router.post("/", authenticate, requirePermission("employees:write"), validate({ body: createBodySchema }), employeeController.create);

// POST /api/employees/bulk/preview — employees:write (parse & preview spreadsheet rows)
router.post("/bulk/preview", authenticate, requirePermission("employees:write"), attendanceUpload.single("file"), employeeController.bulkPreview);

// POST /api/employees/bulk — employees:write (spreadsheet import, skips duplicates & invalid rows)
router.post("/bulk", authenticate, requirePermission("employees:write"), attendanceUpload.single("file"), employeeController.bulk);

// POST /api/employees/bulk/undo — employees:write (undo recent bulk import batch)
router.post("/bulk/undo", authenticate, requirePermission("employees:write"), employeeController.bulkUndo);

// POST /api/employees/:id/photo — employees:write (profile photo upload)
router.post("/:id/photo", authenticate, requirePermission("employees:write"), companyBrandingUpload.single("photo"), employeeController.uploadPhoto);

// PUT /api/employees/:id — employees:write
router.put("/:id", authenticate, requirePermission("employees:write"), validate({ body: updateBodySchema }), employeeController.update);

// DELETE /api/employees/:id — employees:delete (Admin only in frontend matrix)
router.delete("/:id", authenticate, requirePermission("employees:delete"), employeeController.remove);

export default router;
