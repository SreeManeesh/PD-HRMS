import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/rbac";
import { companyBrandingUpload } from "./companyBranding.middleware";
import * as controller from "./companyBranding.controller";

const router = Router();

// Reads are allowed for any authenticated user (used to render payslips).
router.get("/branding", authenticate, controller.get);

// Writes (branding edits + asset upload/removal) are restricted to HR/Admin.
router.put("/branding", authenticate, requireRole("ADMIN", "HR"), controller.update);
router.post("/branding/logo", authenticate, requireRole("ADMIN", "HR"), companyBrandingUpload.single("file"), controller.uploadLogo);
router.post("/branding/signature", authenticate, requireRole("ADMIN", "HR"), companyBrandingUpload.single("file"), controller.uploadSignature);
router.delete("/branding/logo", authenticate, requireRole("ADMIN", "HR"), controller.removeLogo);
router.delete("/branding/signature", authenticate, requireRole("ADMIN", "HR"), controller.removeSignature);

export default router;