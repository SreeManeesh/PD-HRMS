import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { authenticate } from "../../middlewares/auth";
import { requirePermission, requireRole } from "../../middlewares/rbac";
import { validate } from "../../middlewares/validate";
import * as controller from "./policies.controller";

const router = Router();
router.use(authenticate);

const policyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const uuid = z.string().uuid();
const versionBody = z.object({
  effectiveDate: z.coerce.date(),
  ackDeadlineDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  requiresReacknowledgement: z.boolean().default(true),
  summary: z.string().trim().min(3).max(20000),
  content: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
});
const createBody = z.object({
  title: z.string().trim().min(3).max(180),
  category: z.enum(["HR", "Conduct", "IT & Security", "Safety", "Finance"]),
  scope: z.string().trim().min(3).max(150).default("Company-wide"),
  mandatoryAcknowledgement: z.boolean().default(true),
  reviewCycleMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  effectiveDate: z.coerce.date(),
  ackDeadlineDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  summary: z.string().trim().min(3).max(20000),
  content: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
});

router.get("/", requirePermission("policies:read"), controller.list);
router.get("/acknowledgements/me", requirePermission("policies:read"), controller.mine);
router.get("/compliance", requirePermission("policies:read"), requireRole("HR", "ADMIN"), controller.compliance);
router.post("/upload", requireRole("HR", "ADMIN"), policyUpload.single("file"), controller.upload);
router.post("/", requireRole("HR", "ADMIN"), validate({ body: createBody }), controller.create);
router.post("/:id/versions", requireRole("HR", "ADMIN"), validate({ params: z.object({ id: uuid }), body: versionBody }), controller.addVersion);
router.post("/:id/publish", requireRole("HR", "ADMIN"), validate({ params: z.object({ id: uuid }) }), controller.publish);
router.post("/:id/acknowledge", requirePermission("policies:read"), validate({ params: z.object({ id: uuid }), body: z.object({ versionId: uuid }) }), controller.acknowledge);

export default router;
