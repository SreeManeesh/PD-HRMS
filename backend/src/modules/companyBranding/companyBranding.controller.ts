import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import * as branding from "./companyBranding.service";

export const get = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, (await branding.getBranding()).data);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const result = await branding.updateBranding(req.body || {}, req.auth?.sub);
  sendSuccess(res, result.data);
});

export const uploadLogo = asyncHandler(async (req: Request, res: Response) => {
  const result = await branding.uploadLogo(req.file!, req.auth?.sub);
  sendSuccess(res, result.data);
});

export const uploadSignature = asyncHandler(async (req: Request, res: Response) => {
  const result = await branding.uploadSignature(req.file!, req.auth?.sub);
  sendSuccess(res, result.data);
});

export const removeLogo = asyncHandler(async (req: Request, res: Response) => {
  const result = await branding.removeLogo(req.auth?.sub);
  sendSuccess(res, result.data);
});

export const removeSignature = asyncHandler(async (req: Request, res: Response) => {
  const result = await branding.removeSignature(req.auth?.sub);
  sendSuccess(res, result.data);
});