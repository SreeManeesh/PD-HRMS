import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { requirePermission } from "../../middlewares/rbac";
import * as wizardController from "./wizard.controller";

const router = Router();

router.get("/session", authenticate, requirePermission("employees:write"), wizardController.session);

router.post("/mirror", wizardController.mirror);

router.get("/org-data", wizardController.orgData);

router.post("/consent-policies", authenticate, requirePermission("consents:manage"), wizardController.createConsentPolicy);

export default router;
