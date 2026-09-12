import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import * as configService from "./companyConfig.service";

export const get = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, (await configService.getConfig()).data);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const result = await configService.updateConfig(req.body || {}, req.auth?.sub);
  sendSuccess(res, result.data);
});