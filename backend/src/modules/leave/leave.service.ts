import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import {
  serializeLeaveTypeList,
  serializeLeaveBalanceList,
  serializeLeaveRequest,
  serializeLeaveRequestList,
} from "../../serializers/leave.serializer";
import { countWeekdays, startOfDay } from "../../serializers/helpers";
import type { AccessTokenPayload } from "../../lib/jwt";

const REQUEST_INCLUDE = {
  employee: { select: { employeeCode: true, firstName: true, lastName: true } },
  leaveType: true,
  approver: { select: { employeeCode: true, firstName: true, lastName: true } },
} satisfies Prisma.LeaveRequestInclude;

const BALANCE_INCLUDE = { leaveType: true } satisfies Prisma.LeaveBalanceInclude;

export async function listLeaveTypes() {
  const types = await prisma.leaveType.findMany({ orderBy: { name: "asc" } });
  return { data: serializeLeaveTypeList(types) };
}

export interface BalanceFilters {
  employeeId?: string;
  year?: number;
}

/**
 * Pairs of (employee, punch date) that were uploaded AND classified as Leave.
 * A leave request only exists for a day the file itself marks as approved
 * leave; Present/Absent days never carry a request. Clear removes exactly what
 * the module displays.
 */
async function uploadLeavePairKeys(): Promise<Set<string>> {
  const punches = await prisma.attendancePunch.findMany({
    where: { method: "Upload", status: "Leave" },
    select: { employeeId: true, punchDate: true },
  });
  return new Set(punches.map((p) => `${p.employeeId}|${p.punchDate.getTime()}`));
}

export async function getLeaveBalance(filters: BalanceFilters, actor?: AccessTokenPayload) {
  const year = filters.year ?? new Date().getFullYear();
  const requestedEmployeeCode = ["ADMIN", "HR"].includes(actor?.role ?? "")
    ? filters.employeeId
    : actor?.employeeCode;
  const employee = requestedEmployeeCode
    ? await prisma.employee.findUnique({ where: { employeeCode: requestedEmployeeCode }, select: { id: true } })
    : null;
  if (requestedEmployeeCode && !employee) throw AppError.notFound("Employee not found");

  const pairKeys = await uploadLeavePairKeys();

  // Only upload-synced requests drive the balance — the module is purely
  // dynamic from uploaded attendance data.
  const requests = await prisma.leaveRequest.findMany({
    where: {
      ...(employee ? { employeeId: employee.id } : {}),
      startDate: { gte: new Date(`${year}-01-01T00:00:00Z`) },
    },
    select: { employeeId: true, leaveTypeId: true, startDate: true, status: true, reason: true, comments: true },
  });
  const uploadRequests = requests.filter(
    (r) => pairKeys.has(`${r.employeeId}|${r.startDate.getTime()}`) && isUploadSyncedLeaveRequest(r),
  );

  const usedByType = new Map<string, number>();
  const pendingByType = new Map<string, number>();
  for (const req of uploadRequests) {
    const days = countWeekdays(req.startDate, req.startDate);
    if (req.status === "Approved") usedByType.set(req.leaveTypeId, (usedByType.get(req.leaveTypeId) ?? 0) + days);
    else if (req.status === "Pending") pendingByType.set(req.leaveTypeId, (pendingByType.get(req.leaveTypeId) ?? 0) + days);
  }

  // No upload activity → empty overview (clear has fully reset the module).
  const activeTypeIds = [...new Set([...usedByType.keys(), ...pendingByType.keys()])];
  if (activeTypeIds.length === 0) return { data: [] };

  const types = await prisma.leaveType.findMany({ where: { id: { in: activeTypeIds } } });
  const existing = await prisma.leaveBalance.findMany({
    where: { year, leaveTypeId: { in: activeTypeIds }, ...(employee ? { employeeId: employee.id } : {}) },
  });
  const existingByType = new Map(existing.map((b) => [b.leaveTypeId, b]));

  const data = types.map((lt) => {
    const stored = existingByType.get(lt.id);
    return {
      ...(stored ?? {}),
      employeeId: employee?.id ?? stored?.employeeId ?? "",
      leaveTypeId: lt.id,
      year,
      totalDays: stored?.totalDays ?? lt.defaultAnnualDays,
      usedDays: usedByType.get(lt.id) ?? 0,
      pendingDays: pendingByType.get(lt.id) ?? 0,
      leaveType: lt,
    };
  }).sort((a, b) => (a.leaveType?.name ?? "").localeCompare(b.leaveType?.name ?? ""));

  return { data: serializeLeaveBalanceList(data as never) };
}

export interface AttendanceDigestFilters {
  month?: number;
  year?: number;
}

/**
 * True when a leave request was created (or sync-updated) by an attendance
 * file upload. Mirrored by clearUploadedAttendance so "Clear Uploaded Data"
 * removes exactly the requests this digest counts.
 */
export function isUploadSyncedLeaveRequest(r: {
  reason: string | null;
  comments: string | null;
  startDate: Date;
}): boolean {
  const reason = r.reason ?? "";
  const day = r.startDate.toISOString().slice(0, 10);
  return (
    reason.startsWith("Leave: ") ||
    reason.includes("per attendance file") ||
    reason.includes("requested via attendance upload") ||
    reason.endsWith(` on ${day}`) ||
    r.comments === "Auto-approved on import." ||
    r.comments === "Reset to Pending by re-uploaded attendance."
  );
}

/**
 * Per-employee digest of attendance + leave decisions drawn from the uploaded
 * files (attendance punches and leave requests). Powers the summary section on
 * the Leave page: how many days each person was present / absent / on leave,
 * and how many leave requests were approved vs still pending. Only data that
 * came from file uploads is counted, so clearing uploaded data empties it.
 */
export async function getAttendanceDigest(
  filters: AttendanceDigestFilters = {},
  actor?: AccessTokenPayload,
) {
  const { month, year } = filters;
  const range =
    year !== undefined
      ? month !== undefined
        ? { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) }
        : { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }
      : null;

  const punches = await prisma.attendancePunch.findMany({
    where: { method: "Upload", ...(range ? { punchDate: range } : {}) },
    select: { employeeId: true, punchDate: true, status: true },
  });
  const requests = await prisma.leaveRequest.findMany({
    where: range ? { startDate: range } : {},
    select: { employeeId: true, startDate: true, status: true, reason: true, comments: true },
  });

  // Upload-synced leave requests must match a punch classified as Leave (a day
  // absent or present never carries a request) and carry an import marker — the
  // same criterion clearUploadedAttendance uses.
  const leavePunchPairKeys = new Set(
    punches.filter((p) => p.status === "Leave").map((p) => `${p.employeeId}|${p.punchDate.getTime()}`),
  );
  const uploadRequests = requests.filter(
    (r) =>
      leavePunchPairKeys.has(`${r.employeeId}|${r.startDate.getTime()}`) && isUploadSyncedLeaveRequest(r),
  );

  const scoped = new Set<string>();
  if (actor?.role === "EMPLOYEE") {
    if (!actor.employeeId) throw AppError.forbidden("Employee account is not linked");
    scoped.add(actor.employeeId);
  } else if (actor?.role === "MANAGER") {
    if (!actor.employeeId) throw AppError.forbidden("Manager account is not linked");
    scoped.add(actor.employeeId);
    const reports = await prisma.employee.findMany({
      where: { reportingManagerId: actor.employeeId },
      select: { id: true },
    });
    for (const r of reports) scoped.add(r.id);
  }

  const rows = new Map<string, {
    employeeId: string;
    present: number;
    absent: number;
    leave: number;
    wfhLate: number;
    approved: number;
    pending: number;
  }>();
  const ensure = (id: string) => {
    let row = rows.get(id);
    if (!row) {
      row = { employeeId: id, present: 0, absent: 0, leave: 0, wfhLate: 0, approved: 0, pending: 0 };
      rows.set(id, row);
    }
    return row;
  };

  for (const p of punches) {
    if (scoped.size > 0 && !scoped.has(p.employeeId)) continue;
    const row = ensure(p.employeeId);
    if (p.status === "Present") row.present += 1;
    else if (p.status === "Absent") row.absent += 1;
    else if (p.status === "Leave") row.leave += 1;
    else row.wfhLate += 1; // WFH / Late also count as a present-day attendance
  }
  for (const r of uploadRequests) {
    if (scoped.size > 0 && !scoped.has(r.employeeId)) continue;
    const row = ensure(r.employeeId);
    if (r.status === "Approved") row.approved += 1;
    else if (r.status === "Pending") row.pending += 1;
  }

  const employeeIds = Array.from(rows.keys());
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  });
  const byId = new Map(employees.map((e) => [e.id, e]));

  const data = Array.from(rows.values())
    .map((row) => {
      const emp = byId.get(row.employeeId);
      return {
        employeeCode: emp?.employeeCode ?? "",
        employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : "Unknown",
        attended: row.present + row.wfhLate,
        present: row.present,
        lateWfh: row.wfhLate,
        absent: row.absent,
        leave: row.leave,
        approved: row.approved,
        pending: row.pending,
        days: row.present + row.wfhLate + row.absent + row.leave,
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return { data };
}

export interface RequestFilters {
  employeeId?: string;
  status?: string;
}

export async function listLeaveRequests(filters: RequestFilters, actor?: AccessTokenPayload) {
  const isStaff = ["ADMIN", "HR"].includes(actor?.role ?? "");

  // ── Staff (ADMIN/HR): Leave Requests & Approvals is derived directly from
  //    the uploaded attendance data. Only approved-leave days and absent days
  //    appear — a Present day (leave column "No", check-in/out present) never
  //    produces a row.
  if (isStaff) {
    const punches = await prisma.attendancePunch.findMany({
      where: { method: "Upload" },
      select: {
        employeeId: true,
        punchDate: true,
        status: true,
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
      orderBy: { punchDate: "desc" },
    });

    let visible = punches.filter((p) => p.status === "Leave" || p.status === "Absent");
    if (filters.employeeId) visible = visible.filter((p) => p.employee?.employeeCode === filters.employeeId);
    if (filters.status) visible = visible.filter((p) => p.status === filters.status);

    const decisionPunches = visible.filter((p) => p.status === "Leave" || p.status === "Absent");
    const syncedRows = decisionPunches.length
      ? await prisma.leaveRequest.findMany({
          where: { OR: decisionPunches.map((p) => ({ employeeId: p.employeeId, startDate: p.punchDate })) },
          include: REQUEST_INCLUDE,
        })
      : [];
    const syncedByKey = new Map(syncedRows.map((r) => [`${r.employeeId}|${r.startDate.getTime()}`, r]));

    const data = visible.map((p) => {
      const key = `${p.employeeId}|${p.punchDate.getTime()}`;
      const req = syncedByKey.get(key);
      const employeeRef = p.employee
        ? { employeeCode: p.employee.employeeCode, firstName: p.employee.firstName, lastName: p.employee.lastName }
        : null;
      if (p.status === "Leave") {
        return serializeLeaveRequest({
          id: req?.id ?? "",
          employee: employeeRef,
          leaveType: req?.leaveType ?? null,
          approver: req?.approver ?? null,
          leaveTypeId: req?.leaveTypeId ?? "",
          startDate: p.punchDate,
          endDate: p.punchDate,
          reason: req?.reason ?? "On leave per uploaded attendance",
          status: "Approved",
          createdAt: req?.createdAt ?? p.punchDate,
          approvedOn: req?.approvedOn ?? p.punchDate,
          comments: req?.comments ?? "Auto-approved on import.",
        } as never);
      }
      // Absent — a day with no check-in/out and no approval in the file.
      // If a decision (approve/reject) was recorded for it, surface that
      // instead of the neutral "Absent" row so the table shows the outcome.
      if (req) {
        return serializeLeaveRequest({
          id: req.id,
          employee: employeeRef,
          leaveType: req.leaveType ?? null,
          approver: req.approver ?? null,
          leaveTypeId: req.leaveType?.code ?? "",
          startDate: p.punchDate,
          endDate: p.punchDate,
          reason: req.reason ?? "No check-in/out in uploaded attendance",
          status: req.status,
          createdAt: req.createdAt ?? p.punchDate,
          approvedOn: req.approvedOn ?? null,
          comments: req.comments ?? "",
        } as never);
      }
      return serializeLeaveRequest({
        id: "",
        employee: employeeRef,
        leaveType: null,
        approver: null,
        leaveTypeId: "",
        startDate: p.punchDate,
        endDate: p.punchDate,
        reason: "No check-in/out in uploaded attendance",
        status: "Absent",
        createdAt: p.punchDate,
        approvedOn: null,
        comments: "",
      } as never);
    });

    return { data, total: data.length };
  }

  // ── Employees & managers: first-party visibility of their own requests
  //    (manual applications) plus leaves approved through the uploaded file.
  const where: Prisma.LeaveRequestWhereInput = {};
  if (actor?.role === "EMPLOYEE") {
    if (!actor.employeeId) throw AppError.forbidden("Employee account is not linked");
    where.employeeId = actor.employeeId;
  } else if (actor?.role === "MANAGER") {
    if (!actor.employeeId) throw AppError.forbidden("Manager account is not linked");
    where.OR = [
      { employeeId: actor.employeeId },
      { employee: { reportingManagerId: actor.employeeId } },
    ];
  } else if (filters.employeeId) {
    where.employee = { employeeCode: filters.employeeId };
  }
  if (filters.status) where.status = filters.status;

  const rows = await prisma.leaveRequest.findMany({
    where,
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  // Upload-synced requests only surface when they match an approved-leave day
  // in the uploaded data; anything else (manual applications) is always shown.
  const pairKeys = await uploadLeavePairKeys();
  const visible = rows.filter((r) =>
    isUploadSyncedLeaveRequest(r)
      ? pairKeys.has(`${r.employeeId}|${r.startDate.getTime()}`)
      : true,
  );

  return { data: serializeLeaveRequestList(visible), total: visible.length };
}

export interface ApplyLeaveInput {
  employeeId?: string;
  leaveTypeId: string; // the public leave type code (LT01)
  startDate: string;
  endDate: string;
  reason?: string;
  days?: number;
  attachment?: any;
  reasonCategory?: string;
  isHalfDay?: boolean;
  halfDaySession?: string;
  handoverTo?: string;
  emergencyContact?: string;
}

export async function applyLeave(input: ApplyLeaveInput, actor?: AccessTokenPayload) {
  const start = new Date(`${input.startDate}T00:00:00Z`);
  const end = new Date(`${input.endDate}T00:00:00Z`);
  if (end < start) throw AppError.badRequest("End date cannot be before start date");

  const fullDays = countWeekdays(start, end);
  if (fullDays <= 0) throw AppError.badRequest("Leave period contains no working days");
  const days = input.isHalfDay ? 0.5 : fullDays;

  // Never trust client: employee is resolved from the authenticated user unless
  // the caller is HR/admin and explicitly applies on behalf of someone.
  let employee = actor?.employeeId
    ? await prisma.employee.findUnique({ where: { id: actor.employeeId }, select: { id: true } })
    : null;

  if (input.employeeId && input.employeeId !== "") {
    const canApplyForOthers = ["ADMIN", "HR"].includes(actor?.role ?? "");
    if (!canApplyForOthers && input.employeeId !== actor?.employeeCode) {
      throw AppError.forbidden("You cannot apply for leave on behalf of another employee");
    }
    const target = await prisma.employee.findUnique({ where: { employeeCode: input.employeeId }, select: { id: true } });
    if (!target) throw AppError.notFound("Employee not found");
    employee = target;
  }
  if (!employee) throw AppError.badRequest("Employee could not be determined");

  const leaveType = await prisma.leaveType.findUnique({ where: { code: input.leaveTypeId } });
  if (!leaveType) throw AppError.notFound("Leave type not found");

  // Overlap check: no other non-rejected request spanning this range.
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: { notIn: ["Rejected", "Cancelled"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  if (overlap) throw AppError.conflict("You already have a leave request overlapping these dates");

  // Balance check for the current year.
  const year = start.getUTCFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: leaveType.id, year } },
  });
  const used = balance ? Number(balance.usedDays) : 0;
  const available = balance ? Number(balance.totalDays) - used : leaveType.defaultAnnualDays;
  if (days > available) {
    throw AppError.conflict(`Insufficient leave balance for ${leaveType.name} (${available} day(s) available, ${days} requested)`);
  }

  const serializedReason = (input.reasonCategory || input.attachment || input.handoverTo || input.emergencyContact || input.isHalfDay)
    ? JSON.stringify({
        summary: input.reason || "",
        category: input.reasonCategory || "General",
        isHalfDay: input.isHalfDay || false,
        halfDaySession: input.halfDaySession || "First Half",
        handoverTo: input.handoverTo || "",
        emergencyContact: input.emergencyContact || "",
        attachment: input.attachment || null,
      })
    : input.reason ?? null;

  const request = await prisma.leaveRequest.create({
    data: {
      employeeId: employee.id,
      leaveTypeId: leaveType.id,
      startDate: start,
      endDate: end,
      reason: serializedReason,
      status: "Pending",
    },
    include: REQUEST_INCLUDE,
  });

  writeAuditLog({
    action: "CREATE",
    entityType: "LeaveRequest",
    entityId: request.id,
    newValue: { leaveType: leaveType.code, start: input.startDate, end: input.endDate, days },
  });

  return { data: serializeLeaveRequestList([request])[0] };
}

async function getRequestForAction(requestId: string) {
  const request = await prisma.leaveRequest.findUnique({ where: { id: requestId }, include: REQUEST_INCLUDE });
  if (!request) throw AppError.notFound("Leave request not found");
  return request;
}

export async function approveLeave(requestId: string, approverEmployeeId: string, comments?: string) {
  const request = await getRequestForAction(requestId);
  if (request.status !== "Pending") throw AppError.conflict(`Only pending requests can be approved (current: ${request.status})`);

  // No self-approval (maker-checker).
  if (request.employeeId === approverEmployeeId) {
    throw AppError.forbidden("You cannot approve your own leave request");
  }

  const days = countWeekdays(request.startDate, request.endDate);
  const updated = await prisma.$transaction(async (tx) => {
    const year = request.startDate.getUTCFullYear();
    const updatedReq = await tx.leaveRequest.update({
      where: { id: request.id },
      data: {
        status: "Approved",
        approvedBy: approverEmployeeId,
        approvedOn: new Date(),
        comments: comments ?? null,
      },
      include: REQUEST_INCLUDE,
    });

    await tx.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year } },
      create: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year, totalDays: request.leaveType.defaultAnnualDays, usedDays: days },
      update: { usedDays: { increment: days } },
    });

    return updatedReq;
  });

  writeAuditLog({
    action: "APPROVE",
    entityType: "LeaveRequest",
    entityId: request.id,
    oldValue: { status: "Pending" },
    newValue: { status: "Approved", comments: comments ?? null },
  });

  return { data: { id: updated.id, status: "Approved", comments: comments ?? "" } };
}

export async function rejectLeave(requestId: string, approverEmployeeId: string, comments?: string) {
  const rejectionReason = comments?.trim();
  if (!rejectionReason) throw AppError.badRequest("Rejection reason is required");
  const request = await getRequestForAction(requestId);
  if (request.status !== "Pending") throw AppError.conflict(`Only pending requests can be rejected (current: ${request.status})`);

  if (request.employeeId === approverEmployeeId) {
    throw AppError.forbidden("You cannot reject your own leave request");
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { status: "Rejected", approvedBy: approverEmployeeId, approvedOn: new Date(), comments: rejectionReason },
    include: REQUEST_INCLUDE,
  });

  writeAuditLog({
    action: "REJECT",
    entityType: "LeaveRequest",
    entityId: request.id,
    oldValue: { status: "Pending" },
    newValue: { status: "Rejected", comments: rejectionReason },
  });

  return { data: { id: updated.id, status: "Rejected", comments: rejectionReason } };
}

export interface DecideAbsentInput {
  employeeId: string;  // employee code (EMP001)
  date: string;        // YYYY-MM-DD
  action: "approve" | "reject";
  comments?: string;
}

/** Record an approver's decision on an uploaded Absent day (rows that carry no
 *  leave request). Approving upserts an Approved leave request so the
 *  reconciliation engine counts the day as paid leave instead of LOP;
 *  rejecting records an explicit Rejected request so the day stays unpaid.
 *  Both stamps are tied to the punch date, never the system clock, mirroring
 *  the upload-sync path. */
export async function decideAbsentLeave(input: DecideAbsentInput, approverEmployeeId: string) {
  if (input.action === "reject" && !input.comments?.trim()) {
    throw AppError.badRequest("Rejection reason is required");
  }
  const start = new Date(`${input.date}T00:00:00Z`);

  const employee = await prisma.employee.findUnique({ where: { employeeCode: input.employeeId }, select: { id: true } });
  if (!employee) throw AppError.notFound("Employee not found");
  if (employee.id === approverEmployeeId) {
    throw AppError.forbidden("You cannot decide on your own absence");
  }

  // The day must genuinely be an uploaded Absent punch.
  const punch = await prisma.attendancePunch.findUnique({
    where: { employeeId_punchDate: { employeeId: employee.id, punchDate: start } },
    select: { status: true, method: true },
  });
  if (!punch || punch.status !== "Absent" || punch.method !== "Upload") {
    throw AppError.conflict("No uploaded absent day found for this employee and date");
  }

  // Absence is sanctioned as the company's default (earned) leave type —
  // resolveLeaveTypeByText("") falls back to LT03 just like the upload path.
  let leaveType = await resolveLeaveTypeByText("");
  if (!leaveType) leaveType = await prisma.leaveType.findFirst({ orderBy: { name: "asc" } });
  if (!leaveType) throw AppError.conflict("No leave type configured to record an approved absence");

  const status: "Approved" | "Rejected" = input.action === "approve" ? "Approved" : "Rejected";
  const existing = await prisma.leaveRequest.findFirst({
    where: { employeeId: employee.id, startDate: start },
    select: { id: true, status: true, leaveTypeId: true },
  });

  const request = await prisma.$transaction(async (tx) => {
    const wasApproved = existing?.status === "Approved";
    const nowApproved = status === "Approved";
    const delta = (nowApproved ? 1 : 0) - (wasApproved ? 1 : 0);
    const year = start.getUTCFullYear();

    const data = {
      leaveTypeId: leaveType.id,
      startDate: start,
      endDate: start,
      reason: input.action === "approve"
        ? `Absence approved as ${leaveType.name} on ${input.date}`
        : `Absence recorded as unapproved on ${input.date}`,
      status,
      approvedBy: approverEmployeeId,
      approvedOn: start,
      createdAt: start,
      comments: input.action === "approve"
        ? input.comments?.trim() || "Absence approved on decision."
        : input.comments!.trim(),
    };

    let saved;
    if (existing) {
      saved = await tx.leaveRequest.update({
        where: { id: existing.id },
        data,
        include: REQUEST_INCLUDE,
      });
    } else {
      saved = await tx.leaveRequest.create({
        data: { employeeId: employee.id, ...data },
        include: REQUEST_INCLUDE,
      });
    }

    if (delta !== 0) {
      await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: leaveType.id, year } },
        create: {
          employeeId: employee.id, leaveTypeId: leaveType.id, year,
          totalDays: leaveType.defaultAnnualDays, usedDays: delta > 0 ? 1 : 0,
        },
        update: { usedDays: { increment: delta } },
      });
    }
    return saved;
  });

  writeAuditLog({
    action: input.action === "approve" ? "APPROVE" : "REJECT",
    entityType: "LeaveRequest",
    entityId: request.id,
    oldValue: { status: "Absent" },
    newValue: { status, comments: request.comments },
  });

  return { data: serializeLeaveRequestList([request])[0] };
}

/** Resolve a leave type from a display name/code (e.g. "Sick Leave", "SL",
 *  "Emergency", "LT02"). Creates an "Emergency Leave" type on demand. */
export async function resolveLeaveTypeByText(value: string) {
  const v = (value ?? "").trim();
  const lower = v.toLowerCase();
  if (!lower) return prisma.leaveType.findUnique({ where: { code: "LT03" } });

  if (/^lt\d+$/i.test(lower)) {
    const byCode = await prisma.leaveType.findUnique({ where: { code: v.toUpperCase() } });
    if (byCode) return byCode;
  }
  const byName = await prisma.leaveType.findFirst({ where: { name: { equals: v, mode: "insensitive" } } });
  if (byName) return byName;
  const byContains = await prisma.leaveType.findFirst({ where: { name: { contains: v, mode: "insensitive" } } });
  if (byContains) return byContains;

  if (/emergence|emergency/i.test(lower)) {
    return prisma.leaveType.upsert({
      where: { code: "LT08" },
      update: {},
      create: { code: "LT08", name: "Emergency Leave", defaultAnnualDays: 5, carryForward: false },
    });
  }

  // A genuine leave-type value the catalog doesn't know yet (as mentioned in the
  // uploaded attendance file) is created on demand so the leave distribution
  // reflects exactly what the file says instead of collapsing into Casual Leave.
  if (v.length >= 2 && v.length <= 50 && !/^[-\u2014.]+$/.test(v)) {
    const numericCodes = await prisma.leaveType.findMany({ select: { code: true } });
    let next = 1;
    for (const c of numericCodes) {
      const m = /^LT(\d+)$/i.exec(c.code);
      if (m) next = Math.max(next, Number(m[1]) + 1);
    }
    const code = `LT${String(next).padStart(2, "0")}`;
    try {
      return await prisma.leaveType.upsert({
        where: { code },
        update: {},
        create: { code, name: v.slice(0, 50), defaultAnnualDays: 5, carryForward: false },
      });
    } catch {
      // Fall through to the default type on any conflict/race.
    }
  }

  return prisma.leaveType.findUnique({ where: { code: "LT03" } });
}

/** Resolve an approver employee PK from a human-readable "Approved By" value
 *  (role names like Manager / CEO / HR, or an employee code / name). */
export async function resolveApproverIdFromText(value: string, employeeId: string) {
  const v = (value ?? "").trim();
  if (!v) return null;
  const lower = v.toLowerCase();

  if (/ceo/i.test(lower)) {
    const ceo = await prisma.employee.findFirst({
      where: { designation: { title: { contains: "CEO", mode: "insensitive" } } },
      select: { id: true },
    });
    if (ceo) return ceo.id;
  }
  if (/\bhr\b|human\s?resources/i.test(lower)) {
    const hr = await prisma.employee.findFirst({
      where: { designation: { title: { contains: "HR", mode: "insensitive" } } },
      select: { id: true },
    });
    if (hr) return hr.id;
  }
  if (/manager|mgr/i.test(lower)) {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { reportingManagerId: true } });
    if (emp?.reportingManagerId) return emp.reportingManagerId;
  }
  if (/^emp\d+$/i.test(lower)) {
    const byCode = await prisma.employee.findUnique({ where: { employeeCode: v.toUpperCase() }, select: { id: true } });
    if (byCode) return byCode.id;
  }
  const byName = await prisma.employee.findFirst({
    where: {
      OR: [
        { firstName: { contains: v, mode: "insensitive" } },
        { lastName: { contains: v, mode: "insensitive" } },
        { employeeCode: { equals: v, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return byName?.id ?? null;
}

/**
 * Create a leave request from an uploaded attendance row, or update the
 * decision of an already-imported request when that row is re-uploaded
 * (re-uploading a row whose decision changed flips the request to match the
 * file — Approved stays approved, Pending stays/resets to pending).
 * Imported rows are left "Pending" unless the file explicitly marks them
 * approved — the Leave Requests & Approvals table then shows Approve/Reject.
 * Emergency leave is always imported as Pending so it requires a decision.
 */
export interface UploadedLeaveInput {
  employeeId: string;          // PK
  employeeCode: string;
  date: string;                // YYYY-MM-DD
  leaveTypeValue?: string;
  approvalValue?: string;      // e.g. Approved | Pending | empty
  approvedByValue?: string;    // Manager | CEO | HR | code | name | empty
  reason?: string;
}

export async function upsertLeaveRequestFromUpload(input: UploadedLeaveInput) {
  const leaveType = await resolveLeaveTypeByText(input.leaveTypeValue ?? "");
  if (!leaveType) return null;

  // Called only for upload rows the import classified as approved Leave, so the
  // synced request is always auto-approved (+1 used day on the annual balance).
  const status: "Pending" | "Approved" = "Approved";

  const start = new Date(`${input.date}T00:00:00Z`);
  const end = start;

  const existing = await prisma.leaveRequest.findFirst({
    where: { employeeId: input.employeeId, leaveTypeId: leaveType.id, startDate: start, endDate: end },
    select: { id: true, status: true },
  });

  const approvedBy = status === "Approved"
    ? await resolveApproverIdFromText(input.approvedByValue ?? "", input.employeeId)
    : null;

  const request = await prisma.$transaction(async (tx) => {
    if (existing) {
      // Round-trip: the file now dictates the decision — update the request
      // and keep the annual balance in sync (Approved == +1 used day).
      const wasApproved = existing.status === "Approved";
      const nowApproved = status === "Approved";
      const delta = (nowApproved ? 1 : 0) - (wasApproved ? 1 : 0);

      const updated = await tx.leaveRequest.update({
        where: { id: existing.id },
        data: {
          status,
          approvedBy,
          // Keep applied/approved stamps tied to the FILE's leave date, never the
          // system clock — otherwise uploaded historical rows show the current
          // year (e.g. a 2025 leave marked "applied 2026").
          createdAt: start,
          approvedOn: nowApproved ? start : null,
          comments: nowApproved
            ? "Auto-approved on import."
            : status === "Pending"
              ? "Reset to Pending by re-uploaded attendance."
              : null,
          reason: input.reason?.trim() || undefined,
        },
        include: REQUEST_INCLUDE,
      });

      if (delta !== 0) {
        const year = start.getUTCFullYear();
        await tx.leaveBalance.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId: input.employeeId, leaveTypeId: leaveType.id, year } },
          create: {
            employeeId: input.employeeId, leaveTypeId: leaveType.id, year,
            totalDays: leaveType.defaultAnnualDays, usedDays: delta > 0 ? 1 : 0,
          },
          update: { usedDays: { increment: delta } },
        });
      }
      return updated;
    }

    const created = await tx.leaveRequest.create({
      data: {
        employeeId: input.employeeId,
        leaveTypeId: leaveType.id,
        startDate: start,
        endDate: end,
        reason: input.reason?.trim() || `${leaveType.name} requested via attendance upload`,
        status,
        approvedBy,
        createdAt: start,
        approvedOn: status === "Approved" ? start : null,
        comments: status === "Approved" ? "Auto-approved on import." : null,
      },
      include: REQUEST_INCLUDE,
    });

    if (status === "Approved") {
      const year = start.getUTCFullYear();
      await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: input.employeeId, leaveTypeId: leaveType.id, year } },
        create: {
          employeeId: input.employeeId, leaveTypeId: leaveType.id, year,
          totalDays: leaveType.defaultAnnualDays, usedDays: 1,
        },
        update: { usedDays: { increment: 1 } },
      });
    }
    return created;
  });

  return serializeLeaveRequestList([request])[0];
}

/**
 * Remove any upload-synced leave request for an (employee, date) that the file
 * no longer marks as approved leave (Present / Absent / unapproved). Reverses
 * the annual-balance used day when the removed request was Approved. Keeps the
 * leave module exactly mirrored to the uploaded data.
 */
export async function retireUploadLeaveRequest(employeeId: string, date: string) {
  const start = new Date(`${date}T00:00:00Z`);
  const existing = await prisma.leaveRequest.findFirst({
    where: { employeeId, startDate: start },
    select: { id: true, status: true, leaveTypeId: true, reason: true, comments: true, startDate: true },
  });
  if (!existing || !isUploadSyncedLeaveRequest(existing)) return;

  const wasApproved = existing.status === "Approved";
  await prisma.$transaction(async (tx) => {
    if (wasApproved) {
      await tx.leaveBalance.updateMany({
        where: { employeeId, leaveTypeId: existing.leaveTypeId, year: start.getUTCFullYear() },
        data: { usedDays: { decrement: 1 } },
      });
    }
    await tx.leaveRequest.delete({ where: { id: existing.id } });
  });
}

export function normalizeDateRange(start: Date, end: Date): { start: Date; end: Date } {
  return { start: startOfDay(start), end: startOfDay(end) };
}

// ═══ Batched upload leave-sync ═══════════════════════════════════════════
// Replaces the old per-row upsert/retire loop (4-8 queries × row) with a
// handful of bulk operations + in-memory type/approver resolution, so re-import
// of a 100k-row file doesn't explode the DB.

export interface UploadedLeaveBatchEntry {
  employeeId: string;
  employeeCode: string;
  date: string; // YYYY-MM-DD
  isLeave: boolean;
  leaveTypeValue?: string;
  approvalValue?: string;
  approvedByValue?: string;
  reason?: string;
}

interface LeaveTypeLite {
  id: string;
  name: string;
  code: string;
  defaultAnnualDays: number;
}

interface ApproverCandidate {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  reportingManagerId: string | null;
  designationTitle: string | null;
}

function resolveLeaveTypeInMemory(value: string, byCode: Map<string, LeaveTypeLite>, byName: Map<string, LeaveTypeLite>): LeaveTypeLite | null {
  const v = (value ?? "").trim();
  const lower = v.toLowerCase();
  if (!lower) return byCode.get("LT03") ?? null;

  if (/^lt\d+$/i.test(lower)) {
    const hit = byCode.get(v.toUpperCase());
    if (hit) return hit;
  }
  const byNameExact = byName.get(lower);
  if (byNameExact) return byNameExact;
  let contains: LeaveTypeLite | null = null;
  for (const t of byName.values()) {
    if (t.name.toLowerCase().includes(lower)) { contains = t; break; }
  }
  if (contains) return contains;
  if (/emergence|emergency/i.test(lower)) return { id: "LT08", name: "Emergency Leave", code: "LT08", defaultAnnualDays: 5 };
  if (v.length >= 2 && v.length <= 50 && !/^[-\u2014.]+$/.test(v)) {
    return { id: "", name: v.slice(0, 50), code: "", defaultAnnualDays: 5 };
  }
  return byCode.get("LT03") ?? null;
}

function resolveApproverInMemory(
  value: string,
  employeeId: string,
  ctx: {
    ceoId: string | null;
    hrId: string | null;
    byCode: Map<string, ApproverCandidate>;
    byNameFirst: Map<string, string[]>;
    byNameLast: Map<string, string[]>;
    employees: ApproverCandidate[];
  },
): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const lower = v.toLowerCase();

  if (/ceo/i.test(lower)) return ctx.ceoId;
  if (/\bhr\b|human\s?resources/i.test(lower)) return ctx.hrId;
  if (/manager|mgr/i.test(lower)) {
    const emp = ctx.employees.find((e) => e.id === employeeId);
    return emp?.reportingManagerId ?? null;
  }
  if (/^emp\d+$/i.test(lower)) {
    return ctx.byCode.get(v.toUpperCase())?.id ?? null;
  }
  const nameHits = ctx.byNameFirst.get(lower) ?? [];
  const lastHits = ctx.byNameLast.get(lower) ?? [];
  const hit = nameHits[0] ?? lastHits[0];
  if (hit) return hit;
  const partial = ctx.employees.find((e) =>
    e.firstName.toLowerCase().includes(lower) ||
    e.lastName.toLowerCase().includes(lower) ||
    e.employeeCode.toLowerCase().includes(lower),
  );
  return partial?.id ?? null;
}

const LEAVE_SYNC_CHUNK = 500;

/** Apply an entire upload file's leave/absent decisions in batch: creates or
 *  updates the auto-approved leave requests the file dictates, retires stale
 *  upload-synced requests for days no longer marked as leave, and keeps every
 *  annual leave-balance in sync. Mirrors the per-row semantics exactly, but
 *  with O(1) queries per distinct type/approver instead of per row. */
export async function syncUploadLeaveRequests(entries: UploadedLeaveBatchEntry[]) {
  if (entries.length === 0) return { created: 0, updated: 0, retired: 0 };

  const dateOf = (d: string) => new Date(`${d}T00:00:00Z`);

  // ── In-memory lookup context (3 bulk queries total) ─────────────────────
  const leaveTypes = await prisma.leaveType.findMany();
  const typeByCode = new Map<string, LeaveTypeLite>(leaveTypes.map((t) => [t.code, { id: t.id, name: t.name, code: t.code, defaultAnnualDays: t.defaultAnnualDays }]));
  const typeByName = new Map<string, LeaveTypeLite>();
  for (const t of leaveTypes) typeByName.set(t.name.toLowerCase(), { id: t.id, name: t.name, code: t.code, defaultAnnualDays: t.defaultAnnualDays });

  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      reportingManagerId: true,
      designation: { select: { title: true } },
    },
  });
  const approverCtx: {
    ceoId: string | null;
    hrId: string | null;
    byCode: Map<string, ApproverCandidate>;
    byNameFirst: Map<string, string[]>;
    byNameLast: Map<string, string[]>;
    employees: ApproverCandidate[];
  } = {
    ceoId: null,
    hrId: null,
    byCode: new Map(),
    byNameFirst: new Map(),
    byNameLast: new Map(),
    employees: [],
  };
  for (const e of employees) {
    const title = e.designation?.title?.toLowerCase() ?? "";
    const cand: ApproverCandidate = {
      id: e.id,
      employeeCode: e.employeeCode,
      firstName: e.firstName ?? "",
      lastName: e.lastName ?? "",
      reportingManagerId: e.reportingManagerId,
      designationTitle: e.designation?.title ?? null,
    };
    if (!approverCtx.ceoId && title.includes("ceo")) approverCtx.ceoId = e.id;
    if (!approverCtx.hrId && (title.includes("hr") || title.includes("human")) ) approverCtx.hrId = e.id;
    approverCtx.employees.push(cand);
    approverCtx.byCode.set(e.employeeCode.toUpperCase(), cand);
    const first = e.firstName?.toLowerCase();
    const last = e.lastName?.toLowerCase();
    if (first) {
      const arr = approverCtx.byNameFirst.get(first) ?? [];
      arr.push(e.id);
      approverCtx.byNameFirst.set(first, arr);
    }
    if (last) {
      const arr = approverCtx.byNameLast.get(last) ?? [];
      arr.push(e.id);
      approverCtx.byNameLast.set(last, arr);
    }
  }

  // ── Resolve leave types, creating only unknown ones on demand ───────────
  const resolvedTypes = new Map<number, LeaveTypeLite>();
  const onDemandNeeded = new Map<string, LeaveTypeLite>(); // code or "__name__:..." -> type
  const LT08 = { id: "LT08", name: "Emergency Leave", code: "LT08", defaultAnnualDays: 5 };
  for (const [i, entry] of entries.entries()) {
    if (!entry.isLeave) continue;
    let resolved = resolveLeaveTypeInMemory(entry.leaveTypeValue ?? "", typeByCode, typeByName);
    if (!resolved) resolved = typeByCode.get("LT03")!;
    resolvedTypes.set(i, resolved);
    if (resolved.code === "LT08" && !typeByCode.has("LT08") && !onDemandNeeded.has("LT08")) {
      onDemandNeeded.set("LT08", LT08);
    }
    if (resolved.id === "" && !typeByCode.has(resolved.name) && !onDemandNeeded.has(`name:${resolved.name}`)) {
      onDemandNeeded.set(`name:${resolved.name}`, resolved);
    }
  }

  if (onDemandNeeded.size > 0) {
    let nextCodeNum = 1;
    for (const t of leaveTypes) {
      const m = /^LT(\d+)$/i.exec(t.code);
      if (m) nextCodeNum = Math.max(nextCodeNum, Number(m[1]) + 1);
    }
    const pendingCode = (): string => `LT${String(nextCodeNum).padStart(2, "0")}`;
    for (const needed of onDemandNeeded.values()) {
      const code = needed.code === "LT08" ? "LT08" : pendingCode();
      try {
        const created = await prisma.leaveType.upsert({
          where: { code },
          update: {},
          create: { code, name: needed.name, defaultAnnualDays: 5, carryForward: false },
          select: { id: true, name: true, code: true, defaultAnnualDays: true },
        });
        typeByCode.set(code, { id: created.id, name: created.name, code: created.code, defaultAnnualDays: created.defaultAnnualDays });
        typeByName.set(created.name.toLowerCase(), { id: created.id, name: created.name, code: created.code, defaultAnnualDays: created.defaultAnnualDays });
        if (needed.name !== created.name) {
          typeByName.set(needed.name.toLowerCase(), { id: created.id, name: needed.name, code: created.code, defaultAnnualDays: 5 });
        }
        nextCodeNum += 1;
      } catch {
        // Conflict race: ignore, the default next resolution below still works.
      }
    }
    // Re-resolve after bulk creation (catches races / name collisions).
    for (const [i, entry] of entries.entries()) {
      if (!entry.isLeave) continue;
      const previously = resolvedTypes.get(i);
      if (previously && previously.id !== "" && typeByCode.has(previously.code)) continue;
      const re = resolveLeaveTypeInMemory(entry.leaveTypeValue ?? "", typeByCode, typeByName) ?? typeByCode.get("LT03")!;
      resolvedTypes.set(i, re);
    }
  }

  // ── Split leave vs retire, resolve approvers, build one-shot queries ────
  const leaveRows: Array<{ i: number; entry: UploadedLeaveBatchEntry; leaveType: LeaveTypeLite; start: Date; end: Date }> = [];
  const retireRows: Array<{ entry: UploadedLeaveBatchEntry; start: Date }> = [];
  const allEmpIds = new Set<string>();
  const allDates = new Map<number, Date>();

  for (const [i, entry] of entries.entries()) {
    const start = dateOf(entry.date);
    allEmpIds.add(entry.employeeId);
    allDates.set(i, start);
    if (entry.isLeave) {
      const leaveType = resolvedTypes.get(i) ?? typeByCode.get("LT03")!;
      leaveRows.push({ i, entry, leaveType, start, end: start });
    } else {
      retireRows.push({ entry, start });
    }
  }

  const empIdList = [...allEmpIds];
  const dateList = [...new Set([...allDates.values()].map((d) => d.getTime()))].map((t) => new Date(t));

  const [existingRequests, syncExisting] = await Promise.all([
    leaveRows.length > 0
      ? prisma.leaveRequest.findMany({
          where: { employeeId: { in: empIdList }, startDate: { in: dateList } },
          select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, endDate: true, status: true, reason: true, comments: true },
        })
      : Promise.resolve([]),
    retireRows.length > 0
      ? prisma.leaveRequest.findMany({
          where: { employeeId: { in: empIdList }, startDate: { in: dateList } },
          select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, status: true, reason: true, comments: true },
        })
      : Promise.resolve([]),
  ]);

  const existingByKey = new Map<string, (typeof existingRequests)[number]>();
  for (const r of existingRequests) {
    existingByKey.set(`${r.employeeId}|${r.leaveTypeId}|${r.startDate.getTime()}|${r.endDate.getTime()}`, r);
  }

  // ── Build update/create/retire plans + balance deltas ───────────────────
  const toCreate: Array<{
    employeeId: string;
    leaveTypeId: string;
    start: Date;
    end: Date;
    approverId: string | null;
    reason: string;
  }> = [];
  const toUpdate: Array<{
    id: string;
    approverId: string | null;
    start: Date;
    reason: string;
  }> = [];
  const balanceDeltas = new Map<string, number>(); // employeeId|leaveTypeId|year -> delta
  const balanceCreateTotalDays = new Map<string, number>();

  for (const { entry, leaveType, start } of leaveRows) {
    const approverId = resolveApproverInMemory(entry.approvedByValue ?? "", entry.employeeId, approverCtx);
    const existing = existingByKey.get(`${entry.employeeId}|${leaveType.id}|${start.getTime()}|${start.getTime()}`);
    const yearKey = `${entry.employeeId}|${leaveType.id}|${start.getUTCFullYear()}`;
    const reason = entry.reason?.trim() || `${leaveType.name} requested via attendance upload`;

    if (existing) {
      toUpdate.push({ id: existing.id, approverId, start, reason });
      if (existing.status !== "Approved") {
        balanceDeltas.set(yearKey, (balanceDeltas.get(yearKey) ?? 0) + 1);
        balanceCreateTotalDays.set(yearKey, leaveType.defaultAnnualDays);
      }
    } else {
      toCreate.push({ employeeId: entry.employeeId, leaveTypeId: leaveType.id, start, end: start, approverId, reason });
      balanceDeltas.set(yearKey, (balanceDeltas.get(yearKey) ?? 0) + 1);
      balanceCreateTotalDays.set(yearKey, leaveType.defaultAnnualDays);
    }
  }

  const retiredIds: string[] = [];
  for (const { entry, start } of retireRows) {
    const found = syncExisting.filter(
      (r) => r.employeeId === entry.employeeId && r.startDate.getTime() === start.getTime() && isUploadSyncedLeaveRequest(r),
    );
    for (const r of found) {
      retiredIds.push(r.id);
      if (r.status === "Approved") {
        const yearKey = `${r.employeeId}|${r.leaveTypeId}|${r.startDate.getUTCFullYear()}`;
        balanceDeltas.set(yearKey, (balanceDeltas.get(yearKey) ?? 0) - 1);
      }
    }
  }

  // ── Apply in a single transaction ───────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    if (toCreate.length > 0) {
      for (let i = 0; i < toCreate.length; i += LEAVE_SYNC_CHUNK) {
        const chunk = toCreate.slice(i, i + LEAVE_SYNC_CHUNK).map((c) => ({
          employeeId: c.employeeId,
          leaveTypeId: c.leaveTypeId,
          startDate: c.start,
          endDate: c.end,
          reason: c.reason,
          status: "Approved" as const,
          approvedBy: c.approverId,
          createdAt: c.start,
          approvedOn: c.start,
          comments: "Auto-approved on import.",
        }));
        await tx.leaveRequest.createMany({ data: chunk });
      }
    }
    for (let i = 0; i < toUpdate.length; i += LEAVE_SYNC_CHUNK) {
      const chunk = toUpdate.slice(i, i + LEAVE_SYNC_CHUNK);
      for (const u of chunk) {
        await tx.leaveRequest.update({
          where: { id: u.id },
          data: {
            status: "Approved",
            approvedBy: u.approverId,
            createdAt: u.start,
            approvedOn: u.start,
            comments: "Auto-approved on import.",
            reason: u.reason,
          },
        });
      }
    }
    if (retiredIds.length > 0) {
      await tx.leaveRequest.deleteMany({ where: { id: { in: retiredIds } } });
    }

    for (const [key, delta] of balanceDeltas) {
      if (delta === 0) continue;
      const [employeeId, leaveTypeId, yearStr] = key.split("|");
      const year = Number(yearStr);
      const totalDays = balanceCreateTotalDays.get(key) ?? 0;
      const balance = await tx.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
        select: { id: true },
      });
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { usedDays: { increment: delta } },
        });
      } else if (delta > 0) {
        await tx.leaveBalance.create({
          data: { employeeId, leaveTypeId, year, totalDays, usedDays: delta },
        });
      }
    }
  });

  return { created: toCreate.length, updated: toUpdate.length, retired: retiredIds.length };
}
