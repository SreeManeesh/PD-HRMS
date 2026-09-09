import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../../lib/prisma";
import { upsertLeaveRequestFromUpload } from "../leave/leave.service";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import { serializeAttendanceList, serializeTeamSummary } from "../../serializers/attendance.serializer";
import { formatDate } from "../../serializers/helpers";
import { reconcileEmployee } from "../payroll/reconciliation.service";
import { startOfDay } from "../../serializers/helpers";

const PUNCH_INCLUDE = {
  employee: { select: { employeeCode: true, firstName: true, lastName: true } },
} satisfies Prisma.AttendancePunchInclude;

/** Resolve an employee code (EMP001) to the DB PK, with scope guard.
 *  If actorEmployeeId is given, the resolved employee must match the actor
 *  (employees can only check-in/out for themselves). HR/Admin callers
 *  pass undefined to bypass. */
export async function resolveEmployeeId(employeeCode: string, actorEmployeeId?: string): Promise<string> {
  const emp = await prisma.employee.findUnique({ where: { employeeCode }, select: { id: true } });
  if (!emp) throw AppError.notFound("Employee not found");
  if (actorEmployeeId && emp.id !== actorEmployeeId) {
    throw AppError.forbidden("You can only manage your own attendance");
  }
  return emp.id;
}

export interface AttendanceFilters {
  employeeId?: string;
  month?: number;
  year?: number;
}

export async function listAttendance(filters: AttendanceFilters, actorEmployeeId?: string, role?: string) {
  const where: Prisma.AttendancePunchWhereInput = {};

  if (filters.employeeId) {
    where.employee = { employeeCode: filters.employeeId };
  } else if (actorEmployeeId && role === "EMPLOYEE") {
    // Employees always see their own records.
    where.employee = { id: actorEmployeeId };
  }
  // Staff (admin/HR/manager) without an explicit employeeId see the whole team.

  if (filters.month && filters.year) {
    const month = filters.month;
    const year = filters.year;
    where.punchDate = {
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lt: new Date(Date.UTC(year, month, 1)),
    };
  }

  const rows = await prisma.attendancePunch.findMany({
    where,
    include: PUNCH_INCLUDE,
    orderBy: { punchDate: "desc" },
  });

  return { data: serializeAttendanceList(rows) };
}

const TRACKED_STATUSES = ["Present", "Late", "WFH", "Absent"];

export async function getTeamSummary(filters: { month?: number; year?: number } = {}) {
  // When month/year are supplied, summarize the whole calendar month per
  // active employee-day (reusing the attendance-reconciliation classification
  // so Present / Late / WFH / Absent / Leave match the payroll engine and the
  // records table). Otherwise fall back to today ("Present Today" quick view).
  if (filters.month && filters.year) {
    const month = filters.month;
    const year = filters.year;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const employees = await prisma.employee.findMany({ where: { status: "Active" }, select: { id: true } });
    const counts = { present: 0, late: 0, wfh: 0, absent: 0, onLeave: 0 };
    let total = 0;
    const results = await Promise.all(employees.map((emp) => reconcileEmployee(emp.id, year, month)));
    for (const { daily } of results) {
      for (const d of daily) {
        if (d.status === "Holiday" || d.status === "Weekend") continue;
        total += 1;
        if (d.status === "Present") counts.present += 1;
        else if (d.status === "Late") counts.late += 1;
        else if (d.status === "WFH") counts.wfh += 1;
        else if (d.status === "Leave") counts.onLeave += 1;
        else counts.absent += 1; // Absent + LOP (unpaid)
      }
    }
    return {
      data: serializeTeamSummary({
        date: formatDate(start) ?? "",
        present: counts.present,
        late: counts.late,
        absent: counts.absent,
        onLeave: counts.onLeave,
        wfh: counts.wfh,
        total,
      }),
    };
  }

  // Fallback: single-day quick view (today).
  const start = startOfDay(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const date = formatDate(start) ?? "";

  const [punches, leaves] = await Promise.all([
    prisma.attendancePunch.findMany({
      where: { punchDate: { gte: start, lt: end } },
      include: { employee: { select: { employeeCode: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: "Approved",
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true },
    }),
  ]);

  const present = punches.filter((p) => p.status === "Present").length;
  const late = punches.filter((p) => p.status === "Late").length;
  const wfh = punches.filter((p) => p.status === "WFH").length;
  // Only working-status punches factor into total/absent so Holiday/Weekend
  // records don't inflate the "absent" count.
  const tracked = punches.filter((p) => TRACKED_STATUSES.includes(p.status)).length;
  const onLeave = leaves.length;
  const total = tracked + onLeave;

  return {
    data: serializeTeamSummary({
      date,
      present,
      late,
      absent: Math.max(0, total - present - late - wfh - onLeave),
      onLeave,
      wfh,
      total,
    }),
  };
}

export async function checkIn(employeeCode: string, actorEmployeeId?: string, method = "Web") {
  const empId = await resolveEmployeeId(employeeCode, actorEmployeeId);
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const existing = await prisma.attendancePunch.findUnique({
    where: { employeeId_punchDate: { employeeId: empId, punchDate: today } },
  });
  if (existing?.punchIn) {
    throw AppError.conflict("Already checked in today");
  }

  const now = new Date();
  const punch = await prisma.attendancePunch.upsert({
    where: { employeeId_punchDate: { employeeId: empId, punchDate: today } },
    update: { punchIn: now, punchOut: null, method },
    create: {
      employeeId: empId,
      punchDate: today,
      punchIn: now,
      method,
      status: "Present",
    },
    include: PUNCH_INCLUDE,
  });

  writeAuditLog({
    action: "CREATE",
    entityType: "AttendancePunch",
    entityId: punch.id,
    newValue: { employeeId: empId, date: formatDate(today), action: "CHECK_IN" },
  });

  const serialized = serializeAttendanceList([punch])[0];
  return { data: { employeeId: employeeCode, date: serialized.date, checkIn: serialized.checkIn, status: serialized.status } };
}

export async function checkOut(employeeCode: string, actorEmployeeId?: string) {
  const empId = await resolveEmployeeId(employeeCode, actorEmployeeId);
  const today = startOfDay(new Date());

  const punch = await prisma.attendancePunch.findUnique({
    where: { employeeId_punchDate: { employeeId: empId, punchDate: today } },
  });
  if (!punch?.punchIn) {
    throw AppError.badRequest("Check in first before checking out");
  }
  if (punch.punchOut) {
    throw AppError.conflict("Already checked out today");
  }

  const updated = await prisma.attendancePunch.update({
    where: { id: punch.id },
    data: { punchOut: new Date() },
    include: PUNCH_INCLUDE,
  });

  writeAuditLog({
    action: "UPDATE",
    entityType: "AttendancePunch",
    entityId: updated.id,
    newValue: { employeeId: empId, date: formatDate(today), action: "CHECK_OUT" },
  });

  const serialized = serializeAttendanceList([updated])[0];
  return { data: { employeeId: employeeCode, checkOut: serialized.checkOut } };
}

// ═══ Bulk upload from CSV ═══════════════════════════════════════════════════

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Minimal delimited-text parser that handles quoted fields ("" escapes a quote). */
function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = ""; rows.push(row); row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  // Trim whitespace and drop fully-empty rows.
  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ""));
}

/** Space/whitespace-delimited parser for .prn "formatted text" files. */
function parsePrn(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((r) => r.some((c) => c !== ""));
}

// Spreadsheet extension → read type + optional field separator for xlsx.read.
const TAB_DELIMITED_EXTS = new Set(["tsv", "txt"]);

function extOf(filename: string): string {
  const m = /\.([^.]+)$/.exec(filename.trim().toLowerCase());
  return m ? m[1] : "";
}

/** Normalize any supported upload (binary spreadsheet or delimited text) into
 *  a 2D string grid. SheetJS auto-detects the actual format from the bytes. */
function parseUploadToRows(file: { originalname: string; buffer: Buffer }): string[][] {
  const ext = extOf(file.originalname);

  if (ext === "csv" || ext === "prn" || TAB_DELIMITED_EXTS.has(ext)) {
    const text = file.buffer.toString("utf-8");
    if (ext === "prn") return parsePrn(text);
    if (TAB_DELIMITED_EXTS.has(ext)) return parseDelimited(text, "\t");
    return parseDelimited(text, ",");
  }

  // Binary/legacy/spreadsheet formats (xlsx, xlsm, xlsb, xls, xml, dif, slk, …)
  try {
    const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    // Raw grids for every sheet (raw:false → display text; avoids Date/timezone quirks).
    const grids = workbook.SheetNames
      .map((sheetName) => {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false, dateNF: "yyyy-mm-dd" });
        return grid
          .map((row) => row.map((c) => String(c ?? "").trim()))
          .filter((r) => r.some((c) => c !== ""));
      })
      .filter((g) => g.length > 0);

    if (grids.length === 0) return [];

    // Pick the sheet that most looks like attendance data (most rows carrying
    // a recognizable date), so cover/instructions sheets are skipped.
    const scored = grids.map((grid) => {
      let score = 0;
      for (const row of grid) {
        if (row.some((c) => /^(19|20)\d{2}-\d{1,2}-\d{1,2}$/.test(c))) score += 2;
        if (row.some((c) => /^\d{1,2}[\/.\-][A-Za-z]{3}[\/.\-](19|20)\d{2}$/.test(c))) score += 2;
        if (row.some((c) => /\b(emp\d{3,})\b/i.test(c))) score += 1;
      }
      return { grid, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].grid;
  } catch {
    throw AppError.badRequest(`Could not read ${ext.toUpperCase()} file. Check that it is a valid spreadsheet.`);
  }
}

/** Determine the finish extension of a sheet's export for extension check. */
export function spreadsheetExtensions(): string[] {
  return [
    "xlsx", "xlsm", "xltx", "xltm", "xlam",
    "xlsb", "xls", "xlt", "xla", "xlw",
    "csv", "tsv", "txt", "prn", "dif", "slk", "xml",
  ];
}

/** Parse a flexible date string → { y, m, d }. Supports many common formats. */
function parseDateParts(value: string): { y: number; m: number; d: number } | null {
  const v = value.trim();
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };

  const toks = v.replace(/,/g, " ").trim().split(/[\s\-/./\\]+/).filter(Boolean);
  if (toks.length >= 3) {
    const mon = MONTH_NAMES[toks[0].toLowerCase()];
    if (mon) {
      const d = parseInt(toks[1], 10);
      const y = parseInt(toks[2], 10) < 100 ? parseInt(toks[2], 10) + 2000 : parseInt(toks[2], 10);
      if (d >= 1 && d <= 31) return { y, m: mon, d };
    }
    const endMon = MONTH_NAMES[toks[toks.length - 2]?.toLowerCase()];
    if (toks.length === 3 && endMon) {
      const d = parseInt(toks[0], 10);
      const y = parseInt(toks[2], 10) < 100 ? parseInt(toks[2], 10) + 2000 : parseInt(toks[2], 10);
      if (d >= 1 && d <= 31) return { y, m: endMon, d };
    }
    const a = parseInt(toks[0], 10);
    const b = parseInt(toks[1], 10);
    const c = parseInt(toks[2], 10);
    if (a >= 1 && b >= 1 && c >= 1 && toks[2].length === 4) {
      let m = a; let d = b;
      if (m > 12 && d <= 12) { const t = m; m = d; d = t; }
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y: c, m, d };
    }
  }
  return null;
}

/** Parse a 24h (or 12h) time string → { hours, minutes } | null. */
function parseTimeParts(value: string): { hours: number; minutes: number } | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[4]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function rowCell(cells: string[], index: number): string {
  return index >= 0 && index < cells.length ? cells[index].trim() : "";
}

/** Resolve an employee by id (EMP001 / 001 / code) and, if needed, by name. */
async function resolveUploadEmployee(idValue: string, nameValue: string) {
  const select = { id: true as const, employeeCode: true as const, firstName: true as const, lastName: true as const };
  const id = idValue.trim().toUpperCase().replace(/\s+/g, "");

  if (/^EMP\d+$/.test(id)) {
    return prisma.employee.findUnique({ where: { employeeCode: id }, select });
  }
  if (/^\d+$/.test(id)) {
    const padded = `EMP${id.padStart(3, "0")}`;
    const hit = await prisma.employee.findUnique({ where: { employeeCode: padded }, select });
    if (hit) return hit;
  }
  const byCode = await prisma.employee.findFirst({ where: { employeeCode: { equals: id, mode: "insensitive" } }, select });
  if (byCode) return byCode;

  const nameParts = nameValue.trim().split(/\s+/);
  if (nameParts.length >= 1 && nameParts[0]) {
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");
    return prisma.employee.findFirst({
      where: {
        firstName: { equals: firstName, mode: "insensitive" },
        ...(lastName ? { lastName: { equals: lastName, mode: "insensitive" } } : {}),
      },
      select,
    });
  }
  return null;
}

export interface AttendanceUploadResult {
  imported: number;
  skipped: number;
  errors: string[];
  data: ReturnType<typeof serializeAttendanceList>;
}

/** Import attendance from an uploaded spreadsheet / delimited-text file and upsert punches. */
export async function importAttendanceFromCsv(file: { originalname: string; buffer: Buffer }): Promise<AttendanceUploadResult> {
  const rows = parseUploadToRows(file);
  if (rows.length === 0) throw AppError.badRequest("Uploaded file is empty");

  // Detect column layout from the header row. Real-world exports often have
  // title/footer rows above the table, so scan the first rows for the header.
  // NOTE: key order matters — more specific/longer names are matched first so
  // "No of Days" isn't swallowed by the "date" regex, etc.
  const knownKeys = [
    "name", "id", "login", "logout",
    "leaveType", "days", "approvalStatus", "approvedBy",
    "date", "leave",
  ] as const;
  const headerRegex: Record<(typeof knownKeys)[number], RegExp> = {
    name: /\bname\b|^employee$/i,
    id: /employee\s*(id|code|number|no)|emp\s*\.?\s*id|\bid\b/i,
    date: /^date$|^date\s|date\b/i,
    login: /login|check\s?in|\bin($|\s)/i,
    logout: /logout|check\s?out|\bout($|\s)|punch\s?out/i,
    // attendance "Leave" flag (Yes/No) vs leave-type/status columns
    leave: /^leave$|^on\s*leave$|^leave\s*flag$|^is\s*leave$/i,
    leaveType: /leave\s*type|type\s*of\s*leave|leave\s*category|^type$/i,
    days: /no\.?\s*of\s*days|^days$|^no\s*days$|^days\s*count$/i,
    approvalStatus: /approv\w*\s*status|^approval$|^approval\s*status$|^status$|pending|^decision$/i,
    approvedBy: /approv\w*\s*by|^by\s*|^approver$|^approved\s*by$/i,
  };

  const SCAN_LIMIT = Math.min(rows.length, 20);
  let headerRowIdx = -1;
  let bestHits = 0;
  for (let i = 0; i < SCAN_LIMIT; i++) {
    const cells = rows[i].map((c) => c.toLowerCase());
    let hits = 0;
    for (const h of cells) {
      for (const key of knownKeys) { if (headerRegex[key].test(h)) { hits += 1; break; } }
    }
    if (hits > bestHits) { bestHits = hits; headerRowIdx = i; }
  }

  const hasHeader = headerRowIdx >= 0 && bestHits >= 2;
  const headerCells = rows[headerRowIdx]?.map((c) => c.toLowerCase()) || [];
  const detected: Partial<Record<(typeof knownKeys)[number], number>> = {};
  if (hasHeader) {
    headerCells.forEach((h, i) => {
      for (const key of knownKeys) {
        if (detected[key] !== undefined) continue;
        if (headerRegex[key].test(h)) { detected[key] = i; break; }
      }
    });
  }

  // Map a key to its column index. If no header detected, use the fixed order.
  const colIndex = (key: (typeof knownKeys)[number]): number => {
    if (!hasHeader) return knownKeys.indexOf(key);
    if (detected[key] !== undefined) return detected[key] as number;
    return -1;
  };

  // Drop any title/footer rows above the header before importing.
  let dataStart = hasHeader ? headerRowIdx + 1 : 0;
  // Repair rows where an UNQUOTED date like "Sep 08, 2026" got split into two
  // cells by the comma (the second cell is a bare 4-digit year). Merge them so
  // the remaining columns realign with the header.
  const dateIdx = colIndex("date");
  const dataRows = rows.slice(dataStart).map((cells) => {
    if (
      dateIdx >= 0 &&
      dateIdx + 1 < cells.length &&
      !/\d{4}/.test(cells[dateIdx]) &&
      /^\d{4}$/.test(cells[dateIdx + 1].trim())
    ) {
      const next = cells.slice();
      next[dateIdx] = `${next[dateIdx].trim()} ${next[dateIdx + 1].trim()}`;
      next.splice(dateIdx + 1, 1);
      return next;
    }
    return cells;
  });

  type ImportCandidate = {
    employee: NonNullable<Awaited<ReturnType<typeof resolveUploadEmployee>>>;
    dateParts: { y: number; m: number; d: number };
    isoDate: string;
    punchDate: Date;
    punchIn: Date | null;
    punchOut: Date | null;
    status: string;
    leaveIndicated: boolean;
    leaveValue: string;
    leaveTypeValue: string;
    approvalValue: string;
    approvedByValue: string;
  };

  const imported: ReturnType<typeof serializeAttendanceList> = [];
  const errors: string[] = [];
  const candidates: ImportCandidate[] = [];

  for (const [rowNo, cells] of dataRows.entries()) {
    if (cells.every((c) => c === "")) continue;

    const name = rowCell(cells, colIndex("name"));
    const idValue = rowCell(cells, colIndex("id"));
    const dateValue = rowCell(cells, colIndex("date"));
    const loginValue = rowCell(cells, colIndex("login"));
    const logoutValue = rowCell(cells, colIndex("logout"));
    const leaveValue = rowCell(cells, colIndex("leave"));
    const leaveTypeValue = rowCell(cells, colIndex("leaveType"));
    const approvalValue = rowCell(cells, colIndex("approvalStatus"));
    const approvedByValue = rowCell(cells, colIndex("approvedBy"));

    const dateParts = parseDateParts(dateValue);
    if (!dateParts) {
      errors.push(`Row ${rowNo + 1}: unrecognised date "${dateValue}"`);
      continue;
    }
    const employee = await resolveUploadEmployee(idValue, name);
    if (!employee) {
      errors.push(`Row ${rowNo + 1}: no employee found for id "${idValue}" / name "${name}"`);
      continue;
    }

    // A row counts as paid leave ONLY when an admin has approved it. Without
    // approval (or with the row just sitting in the file) and no login/logout,
    // the employee is treated as Absent, not On Leave.
    const leaveIndicated =
      /^(y|yes|1|true|on\.leave|leave|leave\s*wop|lwp)$/i.test(leaveValue) ||
      /^(from|start)/i.test(leaveValue) ||
      Boolean(leaveTypeValue.trim());
    const approvedLeave = leaveIndicated && /approv/i.test(approvalValue) && !/pending|reject/i.test(approvalValue);

    const login = parseTimeParts(loginValue);
    const logout = parseTimeParts(logoutValue);
    const status = login || logout ? "Present" : approvedLeave ? "Leave" : "Absent";

    const isoDate = `${dateParts.y}-${String(dateParts.m).padStart(2, "0")}-${String(dateParts.d).padStart(2, "0")}`;
    candidates.push({
      employee,
      dateParts,
      isoDate,
      punchDate: new Date(Date.UTC(dateParts.y, dateParts.m - 1, dateParts.d)),
      punchIn: login ? new Date(dateParts.y, dateParts.m - 1, dateParts.d, login.hours, login.minutes) : null,
      punchOut: logout ? new Date(dateParts.y, dateParts.m - 1, dateParts.d, logout.hours, logout.minutes) : null,
      status,
      leaveIndicated,
      leaveValue,
      leaveTypeValue,
      approvalValue,
      approvedByValue,
    });
  }

  // Import EVERY parsed row — do not drop duplicates/skip data. Rows are
  // upserted per (employee, date); a later row for the same employee/date
  // overwrites the earlier one, but every distinct row in the file is shown.
  const selected = candidates;
  const deduped = 0;

  for (const c of selected) {
    const punch = await prisma.attendancePunch.upsert({
      where: { employeeId_punchDate: { employeeId: c.employee.id, punchDate: c.punchDate } },
      update: { punchIn: c.punchIn, punchOut: c.punchOut, status: c.status, method: "Upload" },
      create: { employeeId: c.employee.id, punchDate: c.punchDate, punchIn: c.punchIn, punchOut: c.punchOut, status: c.status, method: "Upload" },
      include: PUNCH_INCLUDE,
    });

    imported.push(serializeAttendanceList([punch])[0]);

    if (c.leaveIndicated && c.leaveTypeValue.trim()) {
      try {
        await upsertLeaveRequestFromUpload({
          employeeId: c.employee.id,
          employeeCode: c.employee.employeeCode,
          date: c.isoDate,
          leaveTypeValue: c.leaveTypeValue,
          approvalValue: c.approvalValue,
          approvedByValue: c.approvedByValue,
          reason: `${c.leaveValue ? `Leave: ${c.leaveValue}. ` : ""}${c.leaveTypeValue} on ${c.isoDate}`.trim(),
        });
      } catch {
        // Leave sync is best-effort — attendance still imported.
      }
    }
  }

  return { imported: imported.length, skipped: errors.length + deduped, errors, data: imported };
}
