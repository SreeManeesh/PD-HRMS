import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/rbac";
import * as controller from "./companyConfig.controller";

const router = Router();

// Reads are allowed for any authenticated user.
router.get("/payroll-config", authenticate, controller.get);

// Writes are restricted to HR/Admin.
router.put("/payroll-config", authenticate, requireRole("ADMIN", "HR"), controller.update);

export default router;