import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import { AppError } from "../../lib/errors";
import { getWizardSessionToken, buildWizardUrl, mirrorWizardRegistration } from "./wizard.service";
import { env } from "../../config/env";

/** GET /api/wizard/session — mint a wizard JWT and return the embeddable URL. */
export const session = asyncHandler(async (_req: Request, res: Response) => {
  const token = await getWizardSessionToken();
  sendSuccess(res, { url: buildWizardUrl(token), wizardUrl: env.WIZARD_URL });
});

const mirrorSchema = z.object({
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  designation: z.string().trim().optional(),
  department: z.string().trim().optional(),
  employmentType: z.string().trim().optional(),
  dateOfJoining: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().optional(),
});

/**
 * POST /api/wizard/mirror — server-to-server write used by the wizard API after a
 * successful registration so the record appears in the HRMS Employees list.
 * Guarded by the shared WIZARD_SERVICE_SECRET (no browser admin token involved).
 */
export const mirror = asyncHandler(async (req: Request, res: Response) => {
  const secret = req.get("x-wizard-secret") ?? "";
  if (!env.WIZARD_SERVICE_SECRET || secret !== env.WIZARD_SERVICE_SECRET) {
    throw new AppError(401, "Invalid wizard service secret");
  }
  const parsed = mirrorSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw AppError.badRequest(`Validation failed: ${parsed.error.message}`);
  }
  const result = await mirrorWizardRegistration(parsed.data);
  sendSuccess(res, result, undefined, 201);
});