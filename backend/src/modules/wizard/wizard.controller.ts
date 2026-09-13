import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/utils";
import { sendSuccess } from "../../lib/response";
import { AppError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { getWizardSessionToken, buildWizardUrl, mirrorWizardRegistration } from "./wizard.service";
import { env } from "../../config/env";

/**
 * POST /api/wizard/session
 * Mint a short-lived wizard session token via the shared service secret and return
 * the embeddable registration-wizard URL for the operator's HRMS session.
 * Guarded on the caller's side by requirePermission("employees:write") (routes) —
 * the token mint itself is a server-to-server call to the wizard API.
 */
export const session = asyncHandler(async (req: Request, res: Response) => {
  const token = await getWizardSessionToken();
  const operator = {
    name: req.body?.name,
    email: req.body?.email,
    role: req.body?.role,
  };
  const wizardUrl = buildWizardUrl(token, operator);
  sendSuccess(res, { url: wizardUrl, wizardUrl, token });
});

/**
 * POST /api/wizard/mirror
 * Server-to-server write fed by the wizard API after a successful employee
 * registration. Guarded by the shared WIZARD_SERVICE_SECRET header.
 */
export const mirror = asyncHandler(async (req: Request, res: Response) => {
  const secret = req.get("x-wizard-secret") ?? "";
  if (secret !== (env.WIZARD_SERVICE_SECRET || "")) {
    throw new AppError(401, "Invalid wizard service secret");
  }
  const employee = await mirrorWizardRegistration(req.body ?? {});
  sendSuccess(res, employee, undefined, 201);
});

/**
 * GET /api/wizard/org-data
 * Server-to-server read of the org-data snapshot (departments/designations/grades/
 * cost-centers) needed to pre-fill the wizard's step-2 selects — forwarded to the
 * wizard API and guarded by the shared WIZARD_SERVICE_SECRET.
 */

/**
 * POST /api/wizard/consent-policies
 * HR_ADMIN add-consent-type forward to the wizard API's consent-policy store.
 * Guarded by the same shared service secret. 201 on create.
 */
export const createConsentPolicy = asyncHandler(async (req: Request, res: Response) => {
  const secret = req.get("x-wizard-secret") ?? "";
  if (secret !== (env.WIZARD_SERVICE_SECRET || "")) {
    throw new AppError(401, "Invalid wizard service secret");
  }
  const wizardBase = (env.WIZARD_API_URL || "http://localhost:4100").replace(/\/$/, "");
  const wizardRes = await fetch(`${wizardBase}/api/consent-policies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wizard-secret": env.WIZARD_SERVICE_SECRET,
    },
    body: JSON.stringify(req.body ?? {}),
    signal: AbortSignal.timeout(8000),
  });
  const data = await wizardRes.json().catch(() => undefined);
  if (!wizardRes.ok) {
    const message =
      (data && typeof data === "object" && typeof (data as { message?: string }).message === "string"
        ? (data as { message?: string }).message
        : undefined) || "Wizard API could not create the consent policy";
    throw new AppError(wizardRes.status >= 500 ? 502 : wizardRes.status, message);
  }
  sendSuccess(res, data, undefined, 201);
});

/**
 * GET /api/wizard/org-data
 * Server-to-server read of the live HRMS org-data snapshot (departments /
 * designations / grades / cost-centers / locations / shifts) that pre-fills the
 * registration wizard's step-2 selects. Sourced directly from the HRMS database
 * so create/update/delete in Org Management reflects immediately in the wizard.
 * Guarded by the shared WIZARD_SERVICE_SECRET.
 */
export const orgData = asyncHandler(async (req: Request, res: Response) => {
  const secret = req.get("x-wizard-secret") ?? "";
  if (secret !== (env.WIZARD_SERVICE_SECRET || "")) {
    throw new AppError(401, "Invalid wizard service secret");
  }

  const [departments, designations, locations, grades, costCenters, shifts] =
    await Promise.all([
      prisma.department.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.designation.findMany({
        where: { isActive: true },
        orderBy: { title: "asc" },
        select: { id: true, title: true },
      }),
      prisma.location.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.grade.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.costCenter.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.attendanceShift.findMany({
        orderBy: { startTime: "asc" },
        select: { id: true, name: true, startTime: true, endTime: true },
      }),
    ]);

  sendSuccess(res, {
    departments,
    designations: designations.map((d) => ({ id: d.id, name: d.title })),
    locations,
    grades,
    costCenters,
    shifts: shifts.map((s) => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
  });
});
