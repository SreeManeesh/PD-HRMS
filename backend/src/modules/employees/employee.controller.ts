import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import { AppError } from "../../lib/errors";
import * as employeeService from "./employee.service";
import { parseEmployeeFile } from "./employeeImport";
import { prisma } from "../../lib/prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve an `id` param that may be a UUID or an employee code to the DB PK. */
async function resolveEmployeeId(idOrCode: string): Promise<string> {
  if (UUID_RE.test(idOrCode)) return idOrCode;
  const emp = await prisma.employee.findUnique({ where: { employeeCode: idOrCode }, select: { id: true } });
  if (!emp) throw AppError.notFound("Employee not found");
  return emp.id;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const result = await employeeService.listEmployees({
    search: q.search,
    department: q.department,
    status: q.status,
    page: q.page ? Number(q.page) : undefined,
    limit: q.limit ? Number(q.limit) : undefined,
  });
  res.json({ data: result.data, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  // Accept either the UUID PK or the human-readable employee code.
  const result = UUID_RE.test(id)
    ? await employeeService.getEmployeeById(id)
    : await employeeService.getEmployeeByCode(id);
  sendSuccess(res, result.data);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeeService.createEmployee(req.body, { autoCreateRefs: true });
  sendSuccess(res, result.data, undefined, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const pk = await resolveEmployeeId(req.params.id);
  const result = await employeeService.updateEmployee(pk, req.body);
  sendSuccess(res, result.data);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const pk = await resolveEmployeeId(req.params.id);
  const actingUserId = req.auth?.sub ?? null;
  const result = await employeeService.deleteEmployee(pk, actingUserId);
  sendSuccess(res, result.data);
});

/** POST /api/employees/bulk/preview — parse and preview spreadsheet rows without importing. */
export const bulkPreview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest("A spreadsheet file is required (.xlsx, .csv, .tsv, …)");
  const rows = parseEmployeeFile(req.file);
  const result = await employeeService.previewEmployeesBulk(rows);
  sendSuccess(res, result);
});

/** POST /api/employees/bulk — spreadsheet import. Skips duplicates & invalid rows. */
export const bulk = asyncHandler(async (req: Request, res: Response) => {
  let rows: any[] = [];
  if (req.file) {
    rows = parseEmployeeFile(req.file);
  } else if (Array.isArray(req.body?.rows)) {
    rows = req.body.rows;
  } else {
    throw AppError.badRequest("A spreadsheet file or rows payload is required");
  }
  const result = await employeeService.createEmployeesBulk(rows);
  sendSuccess(res, result);
});

/** POST /api/employees/bulk/undo — undo a recent bulk import batch within window. */
export const bulkUndo = asyncHandler(async (req: Request, res: Response) => {
  const { batchId } = req.body ?? {};
  if (!batchId) throw AppError.badRequest("batchId is required for undo");
  const result = await employeeService.undoEmployeesBulk(String(batchId));
  sendSuccess(res, result);
});

/** POST /api/employees/:id/photo — upload an employee profile photo. */
export const uploadPhoto = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest("A photo file is required");
  const pk = await resolveEmployeeId(req.params.id);
  const result = await employeeService.uploadEmployeePhoto(pk, req.file);
  sendSuccess(res, result.data);
});
