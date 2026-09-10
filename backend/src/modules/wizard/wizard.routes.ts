import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import * as wizardController from "./wizard.controller";

const router = Router();

router.get(
  "/session",
  authenticate,
  requirePermission("employees:write"),
  wizardController.session
);

export default router;