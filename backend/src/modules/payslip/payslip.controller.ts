import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import type { Blueprint } from "./lib/types";
import * as payslipService from "./payslip.service";
import { AppError } from "../../lib/errors";

const isBlueprint = (v: unknown): v is Blueprint => Boolean(v && typeof v === "object" && "components" in (v as object));

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const result = await payslipService.listTemplates();
  sendSuccess(res, result.data);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const result = await payslipService.getTemplate(req.params.id);
  sendSuccess(res, result.data);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await payslipService.createTemplate(req.body, req.auth?.employeeId);
  sendSuccess(res, result.data, undefined, 201);
});

export const saveDraft = asyncHandler(async (req: Request, res: Response) => {
  if (!isBlueprint(req.body.blueprint)) throw AppError.badRequest("A valid blueprint is required");
  const result = await payslipService.saveDraft(req.params.id, req.body.blueprint, req.auth?.employeeId, req.body.summary);
  sendSuccess(res, result.data);
});

export const versions = asyncHandler(async (req: Request, res: Response) => {
  const result = await payslipService.listVersions(req.params.id);
  sendSuccess(res, result.data);
});

export const versionDetail = asyncHandler(async (req: Request, res: Response) => {
  const result = await payslipService.getVersion(req.params.id, Number(req.params.version));
  sendSuccess(res, result.data);
});

export const autoConfig = asyncHandler(async (req: Request, res: Response) => {
  const result = await payslipService.resolveAutoConfig(req.query as never);
  sendSuccess(res, result.data);
});

export const calculate = asyncHandler(async (req: Request, res: Response) => {
  const { blueprint, base = {}, external = {} } = req.body;
  if (!isBlueprint(blueprint)) throw AppError.badRequest("A valid blueprint is required");
  const result = payslipService.computePayroll(blueprint, base, external);
  sendSuccess(res, result);
});

export const calculateTax = asyncHandler(async (req: Request, res: Response) => {
  const { blueprint, base = {}, regime } = req.body;
  if (!isBlueprint(blueprint)) throw AppError.badRequest("A valid blueprint is required");
  const calc = payslipService.computePayroll(blueprint, base, {});
  const r = regime === "OLD" || regime === "NEW" ? regime : "NEW";
  const tax = payslipService.computeTax(blueprint, calc, base, r);
  sendSuccess(res, tax);
});

export const compare = asyncHandler(async (req: Request, res: Response) => {
  const { blueprint, base = {} } = req.body;
  if (!isBlueprint(blueprint)) throw AppError.badRequest("A valid blueprint is required");
  const calc = payslipService.computePayroll(blueprint, base, {});
  const tax = payslipService.compareTax(blueprint, calc, base);
  sendSuccess(res, tax);
});

export const validate = asyncHandler(async (req: Request, res: Response) => {
  const { blueprint } = req.body;
  if (!isBlueprint(blueprint)) throw AppError.badRequest("A valid blueprint is required");
  sendSuccess(res, payslipService.validate(blueprint));
});

export const preview = asyncHandler(async (req: Request, res: Response) => {
  const result = await payslipService.previewPayslip(req.params.id, {
    employeeId: req.query.employeeId as string | undefined,
    month: Number(req.query.month ?? new Date().getMonth() + 1),
    year: Number(req.query.year ?? new Date().getFullYear()),
  });
  sendSuccess(res, result.data);
});

export const publish = asyncHandler(async (req: Request, res: Response) => {
  const result = await payslipService.publishVersion(req.params.id, req.body.version ?? undefined);
  sendSuccess(res, result.data);
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const result = await payslipService.restoreVersion(req.params.id, Number(req.params.version), req.auth?.employeeId);
  sendSuccess(res, result.data);
});

export const pdf = asyncHandler(async (req: Request, res: Response) => {
  const { buffer, filename } = await payslipService.generatePdf(req.params.id, {
    employeeId: req.query.employeeId as string | undefined,
    month: Number(req.query.month ?? new Date().getMonth() + 1),
    year: Number(req.query.year ?? new Date().getFullYear()),
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

export const taxSelectionGet = asyncHandler(async (req: Request, res: Response) => {
  const employeeId = (req.query.employeeId as string) || req.auth?.employeeCode || "";
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
  const regime = employeeId ? await payslipService.getEmployeeTaxSelection(employeeId, year) : null;
  sendSuccess(res, { employeeId, financialYear: year, regime });
});

export const taxSelectionSet = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { employeeId?: string; regime?: string; year?: number };
  const target = (body.employeeId || req.auth?.employeeCode) as string;
  const regime = (body.regime === "OLD" || body.regime === "NEW" ? body.regime : "NEW") as "OLD" | "NEW";
  const result = await payslipService.setEmployeeTaxSelection(target, regime, body.year, req.auth?.employeeCode);
  sendSuccess(res, result.data);
});

export const catalog = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, payslipService.COMPONENT_CATALOG.map((c) => ({
    id: c.id,
    label: c.label,
    kind: c.kind,
    defaultNestId: c.defaultNestId,
    logic: c.logic,
  })));
});

export const nests = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, payslipService.DEFAULT_NESTS);
});