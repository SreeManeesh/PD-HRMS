import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import * as payrollController from "./payroll.controller";
import * as wageRateController from "./wageRate.controller";
import * as componentController from "./payrollComponent.controller";
import * as advanceController from "./advance.controller";
import * as productionController from "./production.controller";
import * as contractorController from "./contractor.controller";
import { attendanceUpload } from "../../middlewares/attendanceUpload";

const router = Router();

const payslipQuerySchema = z.object({
  employeeId: z.string().optional(),
});

const employeeSummaryQuerySchema = z.object({
  employeeId: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

const employeeSummariesQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

// GET /api/payroll/runs — payroll:read
router.get("/runs", authenticate, requirePermission("payroll:read"), payrollController.runs);

// GET /api/payroll/years — payroll:read (distinct years across runs + attendance + leave)
router.get("/years", authenticate, requirePermission("payroll:read"), payrollController.years);

// POST /api/payroll/runs — payroll:write (create a Draft run for a month/year)
const createRunBodySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});
router.post("/runs", authenticate, requirePermission("payroll:write"), validate({ body: createRunBodySchema }), payrollController.createRun);

// GET /api/payroll/employee-summary — payroll:read (computed gross/deductions/net with leave deduction)
router.get(
  "/employee-summary",
  authenticate,
  requirePermission("payroll:read"),
  validate({ query: employeeSummaryQuerySchema }),
  payrollController.employeeSummary
);

// GET /api/payroll/employee-summaries — payroll:read (batched summaries for
// all active employees in one request; staff only — employees use their own)
router.get(
  "/employee-summaries",
  authenticate,
  requirePermission("payroll:read"),
  validate({ query: employeeSummariesQuerySchema }),
  payrollController.employeeSummaries
);

// GET /api/payroll/runs/:id — payroll:read
router.get("/runs/:id", authenticate, requirePermission("payroll:read"), payrollController.runDetail);

// GET /api/payroll/runs/:id/payslips — payroll:read (stored payslips for a run)
router.get("/runs/:id/payslips", authenticate, requirePermission("payroll:read"), payrollController.runPayslips);

// ── Payslip Distribution ──────────────────────────────────────────────────
// POST /api/payroll/runs/:id/distribute — payroll:write (dispatch payslips)
const distributeBodySchema = z.object({
  employeeIds: z.array(z.string()).optional(),
  templateId: z.string().optional(),
  channels: z
    .object({
      email: z.object({ enabled: z.boolean().optional(), template: z.string().optional() }).optional(),
      whatsapp: z.object({ enabled: z.boolean().optional() }).optional(),
      portal: z.object({ enabled: z.boolean().optional(), notify: z.boolean().optional() }).optional(),
      sms: z.object({ enabled: z.boolean().optional(), fallback: z.boolean().optional() }).optional(),
    })
    .optional(),
});
router.post("/runs/:id/distribute", authenticate, requirePermission("payroll:write"), validate({ body: distributeBodySchema }), payrollController.distribute);

// GET /api/payroll/runs/:id/distribution/status — payroll:read
router.get("/runs/:id/distribution/status", authenticate, requirePermission("payroll:read"), payrollController.distributionStatus);

// POST /api/payroll/runs/:id/distribution/retry — payroll:write (retry failed)
const retryBodySchema = z.object({ employeeIds: z.array(z.string()).optional() });
router.post("/runs/:id/distribution/retry", authenticate, requirePermission("payroll:write"), validate({ body: retryBodySchema }), payrollController.distributionRetry);

// GET /api/payroll/runs/:id/distribution/report — payroll:read (CSV download)
router.get("/runs/:id/distribution/report", authenticate, requirePermission("payroll:read"), payrollController.distributionReport);

// POST /api/payroll/payslips/:id/view — payroll:read (track employee view)
router.post("/payslips/:id/view", authenticate, requirePermission("payroll:read"), payrollController.payslipViewed);

// POST /api/payroll/runs/:id/process — payroll:write (Admin only in frontend matrix)
router.post("/runs/:id/process", authenticate, requirePermission("payroll:write"), payrollController.process);

// POST /api/payroll/run-skill-group — payroll:write (run payroll for entire skill category or all)
const runSkillGroupSchema = z.object({
  skillType: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});
router.post(
  "/run-skill-group",
  authenticate,
  requirePermission("payroll:write"),
  validate({ body: runSkillGroupSchema }),
  payrollController.runSkillGroup
);

// POST /api/payroll/run-employee — payroll:write (run payroll for individual worker)
const runIndividualSchema = z.object({
  employeeId: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});
router.post(
  "/run-employee",
  authenticate,
  requirePermission("payroll:write"),
  validate({ body: runIndividualSchema }),
  payrollController.runIndividualEmployee
);

// POST /api/payroll/runs/:id/approve — payroll:approve (four-eyes)
router.post("/runs/:id/approve", authenticate, requirePermission("payroll:approve"), payrollController.approve);

// GET /api/payroll/payslips — payroll:read
router.get("/payslips", authenticate, requirePermission("payroll:read"), validate({ query: payslipQuerySchema }), payrollController.payslips);

// GET /api/payroll/payslips/:id — payroll:read
router.get("/payslips/:id", authenticate, requirePermission("payroll:read"), payrollController.payslipDetail);

// GET /api/payroll/payslips/:id/statement — payroll:read (structured payslip data
// consumed by the reusable PayslipTemplate; employees scoped to their own).
router.get("/payslips/:id/statement", authenticate, requirePermission("payroll:read"), payrollController.payslipStatement);

// GET /api/payroll/distribution/history — payroll:read (past payslip transactions by month/year)
router.get("/distribution/history", authenticate, requirePermission("payroll:read"), payrollController.distributionHistory);

// ── Wage Rates (Category / Location / Contractor) ──────────────────────────
router.get("/wage-rates", authenticate, requirePermission("payroll:read"), wageRateController.listWageRates);
// Joined per-employee Basic + monthly gross (wage rates + overrides + earnings).
router.get("/employee-wages", authenticate, requirePermission("payroll:read"), wageRateController.getEmployeeWages);
router.post("/wage-rates", authenticate, requirePermission("payroll:write"), wageRateController.createWageRate);
router.put("/wage-rates/:id", authenticate, requirePermission("payroll:write"), wageRateController.updateWageRate);
router.delete("/wage-rates/:id", authenticate, requirePermission("payroll:write"), wageRateController.deleteWageRate);

// ── Configurable Payroll Components & Slabs ────────────────────────────────
router.get("/components", authenticate, requirePermission("payroll:read"), componentController.listComponents);
router.post("/components", authenticate, requirePermission("payroll:write"), componentController.createComponent);
router.put("/components/:id", authenticate, requirePermission("payroll:write"), componentController.updateComponent);
router.delete("/components/:id", authenticate, requirePermission("payroll:write"), componentController.deleteComponent);

// ── Salary Advances & Loan Recovery ────────────────────────────────────────
router.get("/advances", authenticate, requirePermission("payroll:read"), advanceController.listAdvances);
router.post("/advances", authenticate, requirePermission("payroll:write"), advanceController.createAdvance);
router.put("/advances/:id", authenticate, requirePermission("payroll:write"), advanceController.updateAdvance);

// ── Production Records & Slabs ─────────────────────────────────────────────
router.get("/production", authenticate, requirePermission("payroll:read"), productionController.listProduction);
router.post("/production", authenticate, requirePermission("payroll:write"), productionController.createOrUpdateProduction);
router.post("/production/upload", authenticate, requirePermission("payroll:write"), attendanceUpload.single("file"), productionController.uploadProductionFile);

// ── Contractors & Contractor-wise Payroll Reports ──────────────────────────
router.get("/contractors", authenticate, requirePermission("payroll:read"), contractorController.listContractors);
router.post("/contractors", authenticate, requirePermission("payroll:write"), contractorController.createContractor);
router.put("/contractors/:id", authenticate, requirePermission("payroll:write"), contractorController.updateContractor);
router.get("/contractors/report", authenticate, requirePermission("payroll:read"), contractorController.getContractorPayrollReport);

export default router;
