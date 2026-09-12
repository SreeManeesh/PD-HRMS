import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requirePermission, requireAnyPermission } from "../../middlewares/rbac";
import * as payslipController from "./payslip.controller";

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  financialYear: z.coerce.number().int().min(2000).max(2100).optional(),
  skillType: z.string().optional(),
});

const saveSchema = z.object({
  blueprint: z.record(z.unknown()),
  summary: z.string().max(500).optional(),
});

const publishSchema = z.object({ version: z.coerce.number().int().optional() });

const calcSchema = z.object({
  blueprint: z.record(z.unknown()),
  base: z.record(z.coerce.number()).optional(),
  external: z.record(z.coerce.number()).optional(),
});

const taxSchema = calcSchema.extend({ regime: z.enum(["OLD", "NEW"]).optional() });

// GET /api/payslip/templates — payroll:read
router.get("/templates", authenticate, requirePermission("payroll:read"), payslipController.list);
// GET /api/payslip/templates/:id — payroll:read
router.get("/templates/:id", authenticate, requirePermission("payroll:read"), payslipController.detail);
// POST /api/payslip/templates — payroll:write
router.post("/templates", authenticate, requirePermission("payroll:write"), validate({ body: createSchema }), payslipController.create);
// PUT /api/payslip/templates/:id — payroll:write
router.put("/templates/:id", authenticate, requirePermission("payroll:write"), validate({ body: saveSchema }), payslipController.saveDraft);

// GET versions
router.get("/templates/:id/versions", authenticate, requirePermission("payroll:read"), payslipController.versions);
router.get("/templates/:id/versions/:version", authenticate, requirePermission("payroll:read"), payslipController.versionDetail);

// POST publish / restore
router.post("/templates/:id/publish", authenticate, requirePermission("payroll:write"), validate({ body: publishSchema }), payslipController.publish);
router.post("/templates/:id/restore/:version", authenticate, requirePermission("payroll:write"), payslipController.restore);

// Engine endpoints (stateless over a submitted blueprint)
router.get("/catalog", authenticate, requirePermission("payroll:read"), payslipController.catalog);
router.get("/nests", authenticate, requirePermission("payroll:read"), payslipController.nests);
router.get("/auto-config", authenticate, requirePermission("payroll:read"), payslipController.autoConfig);
router.post("/calculate", authenticate, requirePermission("payroll:read"), validate({ body: calcSchema }), payslipController.calculate);
router.post("/calculate-tax", authenticate, requirePermission("payroll:read"), validate({ body: taxSchema }), payslipController.calculateTax);
router.post("/compare-tax", authenticate, requirePermission("payroll:read"), validate({ body: calcSchema }), payslipController.compare);
router.post("/validate", authenticate, requirePermission("payroll:read"), validate({ body: calcSchema }), payslipController.validate);

// Preview + PDF (use active template)
router.get("/templates/:id/preview", authenticate, requirePermission("payroll:read"), payslipController.preview);
router.get("/templates/:id/pdf", authenticate, requirePermission("payroll:read"), payslipController.pdf);

// Employee tax regime selection (self-service; admin can set for others)
const taxSelSchema = z.object({
  employeeId: z.string().optional(),
  regime: z.enum(["OLD", "NEW"]),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
router.get("/tax-selection", authenticate, requirePermission("payroll:read"), payslipController.taxSelectionGet);
router.put("/tax-selection", authenticate, requireAnyPermission("ess:write", "payroll:write"), validate({ body: taxSelSchema }), payslipController.taxSelectionSet);

export default router;