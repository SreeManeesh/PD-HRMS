/**
 * Multer wiring for company payslip branding assets (logo + signature).
 * Files are buffered in memory and pushed to MinIO by the service (same
 * pattern as lmsUpload). Allowed: PNG, JPG, JPEG, SVG.
 */
import multer from "multer";

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (ALLOWED.includes(file.mimetype)) return cb(null, true);
  return cb(new Error("Only PNG, JPG, JPEG and SVG images are supported."));
};

export const companyBrandingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter,
});