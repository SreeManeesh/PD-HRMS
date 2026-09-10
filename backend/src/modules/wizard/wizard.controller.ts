import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import { getWizardSessionToken, buildWizardUrl } from "./wizard.service";
import { env } from "../../config/env";

/** GET /api/wizard/session — mint a wizard JWT and return the embeddable URL. */
export const session = asyncHandler(async (_req: Request, res: Response) => {
  const token = await getWizardSessionToken();
  sendSuccess(res, { url: buildWizardUrl(token), wizardUrl: env.WIZARD_URL });
});