import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/rbac";
import * as controller from "./companyConfig.controller";

const router = Router();

// Reads are allowed for any authenticated user.
router.get("/payroll-config", authenticate, controller.get);

// Writes are restricted to HR/Admin.
router.put("/payroll-config", authenticate, requireRole("ADMIN", "HR"), controller.update);

// Dynamic UI text labels
router.get("/ui-labels", authenticate, controller.getUiLabels);
router.put("/ui-labels", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), controller.updateUiLabels);

export default router;