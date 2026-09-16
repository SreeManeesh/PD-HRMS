import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../../lib/prisma";
import { syncUploadLeaveRequests, isUploadSyncedLeaveRequest } from "../leave/leave.service";
import { AppError } from "../../lib/errors";
import { writeAuditLog } from "../../services/audit.service";
import { serializeAttendanceList, serializeTeamSummary } from "../../serializers/attendance.serializer";
import { formatDate } from "../../serializers/helpers";
import { reconcileEmployees } from "../payroll/reconciliation.service";
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
  day?: number;
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

  if (filters.year) {
    const y = filters.year;
    if (filters.month) {
      const m = filters.month;
      if (filters.day) {
        where.punchDate = {
          gte: new Date(Date.UTC(y, m - 1, filters.day)),
          lt: new Date(Date.UTC(y, m - 1, filters.day + 1)),
        };
      } else {
        where.punchDate = {
          gte: new Date(Date.UTC(y, m - 1, 1)),
          lt: new Date(Date.UTC(y, m, 1)),
        };
      }
    } else {
      where.punchDate = {
        gte: new Date(Date.UTC(y, 0, 1)),
        lt: new Date(Date.UTC(y + 1, 0, 1)),
      };
    }
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
    // One batched reconciliation (6 queries total) instead of N per-employee
    // reconciliations — the exact same classification, just loaded together.
    const results = await reconcileEmployees(employees.map((e) => e.id), year, month);
    for (const { daily } of results) {
      for (const d of daily) {
        // Non-employment and non-working days never count for anyone, and
        // "Scheduled" means the employee has no uploaded punches at all this
        // month — excluding it keeps the summary honest for partially
        // uploaded months instead of inflating absents.
        if (
          d.status === "Holiday" ||
          d.status === "Weekend" ||
          d.status === "Not Hired" ||
          d.status === "Exited" ||
          d.status === "Scheduled"
        ) continue;
        total += 1;
        if (d.status === "Present" || d.status === "Night Shift") counts.present += 1;
        else if (d.status === "Late") counts.late += 1;
        else if (d.status === "WFH") counts.wfh += 1;
        else if (d.status === "Half Day") counts.present += 1;
        else if (d.status === "Paid Leave") counts.onLeave += 1;
        else if (d.status === "Weekly Off Worked" || d.status === "Holiday Worked") counts.present += 1;
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

// ═══ Bulk upload/Import from CSV ═══════════════════════════════════════════════════

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

/**
 * True when a cell is an explicit "no value" placeholder. Real-world exports
 * print "-", "–", "N/A" etc. into empty login/logout cells (almost always on
 * leave/absent days). Such cells mean "no time" — NOT an invalid-time error.
 */
function isTimePlaceholder(value: string): boolean {
  return /^(?:-{1,3}|–|—|n\/?a|null|nil|none|×|\s*)$/i.test((value ?? "").trim());
}

/** Normalise an employee ID so padded codes (`EMP0001`) always hit `EMP001`. */
function normalizeEmpCode(raw: string): string {
  const id = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const m = /^EMP0*(\d+)$/.exec(id);
  if (m) return `EMP${String(parseInt(m[1], 10)).padStart(3, "0")}`;
  return id;
}

/** Strict calendar check: rejects 2023-02-30, 2021-04-31, 0/13 months, etc. */
function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function rowCell(cells: string[], index: number): string {
  return index >= 0 && index < cells.length ? cells[index].trim() : "";
}

/**
 * Read an explicit day Status value ("Present" / "Absent" / "On Leave" /
 * "Late" / "WFH", with optional leading tokens like "Approved Leave") and map
 * it to the punch status the rest of the system understands. Returns null when
 * the cell is empty, a generic value, or a non-attendance label (e.g. a week
 * off or holiday, which the reconciliation layer already decides on its own).
 */
function classifyAttendanceStatus(value: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/(^|\s)(half\s*[- ]?day|hd)(\s|$|\\r|\\)/i.test(v)) return "Half Day";
  if (/(^|\s)(holiday\s*worked)(\s|$|\\r|\\)/i.test(v)) return "Holiday Worked";
  if (/(^|\s)((weekly\s*off|weekend|sunday)\s*worked)(\s|$|\\r|\\)/i.test(v)) return "Weekly Off Worked";
  if (/(^|\s)(night\s*shift)(\s|$|\\r|\\)/i.test(v)) return "Night Shift";
  if (/(^|\s)(on\s*[- ]?leave|leave|lwp|leave\s*without\s*pay)(\s|$|\\r|\\)/i.test(v)) return "Leave";
  if (/(^|\s)(wfh|work\s*from\s*home|remote|home\s*office)(\s|$|\\r|\\)/i.test(v)) return "WFH";
  if (/(^|\s)(present|in\s*office|office)(\s|$|\\r|\\)/i.test(v)) return "Present";
  if (/(^|\s)(late|delayed|delayed\s*in)(\s|$|\\r|\\)/i.test(v)) return "Late";
  if (/(^|\s)(absent|absence|no\s*show|na|missing)(\s|$|\\r|\\)/i.test(v)) return "Absent";
  return null;
}

/** Resolve an employee by id (EMP001 / 001 / code) and, if needed, by name. */
async function resolveUploadEmployee(idValue: string, nameValue: string) {
  const select = { id: true as const, employeeCode: true as const, firstName: true as const, lastName: true as const };
  const id = normalizeEmpCode(idValue);

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
  totalImported: number;
  skipped: number;
  errors: string[];
  unknownEmployees: Array<{ id: string; name: string; rows: number }>;
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
    "status", "leaveType", "days", "approvalStatus", "approvedBy",
    "date", "leave",
  ] as const;
  const headerRegex: Record<(typeof knownKeys)[number], RegExp> = {
    name: /\bname\b|^employee$/i,
    id: /employee\s*(id|code|number|no)|emp\s*\.?\s*id|\bid\b/i,
    date: /^date$|^date\s|date\b/i,
    login: /login|check\s?in|\bin($|\s)/i,
    logout: /logout|check\s?out|\bout($|\s)|punch\s?out/i,
    // an explicit day/attendance Status column ("Present / Absent"/"On Leave")
    // — kept ahead of approvalStatus so a plain "Status" header is read as the
    // classifer, while "Approval Status" still binds to approvalStatus.
    status: /^(attendance|day|punch|overall)?\s*(status|result)$/i,
    // attendance "Leave" flag (Yes/No) vs leave-type/status columns
    leave: /^leave$|^on\s*leave$|^leave\s*flag$|^is\s*leave$/i,
    leaveType: /leave\s*type|type\s*of\s*leave|leave\s*category|^type$/i,
    days: /no\.?\s*of\s*days|^days$|^no\s*days$|^days\s*count$/i,
    approvalStatus: /approv\w*\s*status|^approval$|^approval\s*status$|pending|^decision$/i,
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

  // Resolve employees ONCE into maps (no per-row DB lookups) so 100k+ rows
  // parse quickly.
  const employeeRows = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  });
  const byCode = new Map<string, (typeof employeeRows)[number]>();
  const byName = new Map<string, (typeof employeeRows)[number]>();
  for (const e of employeeRows) {
    byCode.set(e.employeeCode.toLowerCase(), e);
    byName.set(`${e.firstName.toLowerCase()} ${e.lastName.toLowerCase()}`.trim(), e);
  }
  const resolve = (idValue: string, nameValue: string): (typeof employeeRows)[number] | null => {
    const id = normalizeEmpCode(idValue).toLowerCase();
    if (id && byCode.has(id)) return byCode.get(id)!;
    const raw = (idValue || "").trim().toLowerCase();
    if (raw && byCode.has(raw)) return byCode.get(raw)!;
    const n = (nameValue || "").trim().toLowerCase();
    if (n && byName.has(n)) return byName.get(n)!;
    return null;
  };

  const hhmm = (d: Date | null): string | null => d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null;

  const seen = new Map<string, ImportCandidate>();

  // — Strict row validation with a bounded error report — green rows are
  // imported even when earlier rows failed, but a pathologically broken file is
  // stopped early so the server never grinds through hundreds of thousands of
  // garbage rows. `skipped` always counts every rejected row; `errors` only
  // keeps the first MAX_ERROR_REPORT messages (plus one summary tail entry).
  const MAX_ERROR_REPORT = 200;
  const MAX_INVALID_ROWS = 5000;
  let skipped = 0;
  const errors: string[] = [];
  const unknownEmployees = new Map<string, { id: string; name: string; rows: number }>();
  const recordError = (message: string) => {
    skipped += 1;
    if (errors.length < MAX_ERROR_REPORT) errors.push(message);
  };

  for (const [rowNo, cells] of dataRows.entries()) {
    if (skipped >= MAX_INVALID_ROWS) {
      errors.push(`Stopped early after ${MAX_INVALID_ROWS} invalid rows — fix the file and re-upload.`);
      break;
    }
    if (cells.every((c) => c === "")) continue;

    const name = rowCell(cells, colIndex("name"));
    const idValue = rowCell(cells, colIndex("id"));
    const dateValue = rowCell(cells, colIndex("date"));
    const loginValue = rowCell(cells, colIndex("login"));
    const logoutValue = rowCell(cells, colIndex("logout"));
    const statusValue = rowCell(cells, colIndex("status"));
    const leaveValue = rowCell(cells, colIndex("leave"));
    const leaveTypeValue = rowCell(cells, colIndex("leaveType"));
    const approvalValue = rowCell(cells, colIndex("approvalStatus"));
    const approvedByValue = rowCell(cells, colIndex("approvedBy"));

    const dateParts = parseDateParts(dateValue);
    if (!dateParts) {
      recordError(`Row ${rowNo + 1}: unrecognised date "${dateValue}"`);
      continue;
    }
    if (!isValidCalendarDate(dateParts.y, dateParts.m, dateParts.d)) {
      recordError(`Row ${rowNo + 1}: impossible date "${dateValue}"`);
      continue;
    }
    const employee = resolve(idValue, name);
    if (!employee) {
      recordError(`Row ${rowNo + 1}: no employee found for id "${idValue}" / name "${name}"`);
      const key = `${normalizeEmpCode(idValue)}|${name.trim().toLowerCase()}`;
      const tally = unknownEmployees.get(key) ?? { id: idValue, name: name.trim() || idValue, rows: 0 };
      tally.rows += 1;
      unknownEmployees.set(key, tally);
      continue;
    }

    // Strict time validation — a non-empty login/logout that can't be parsed is
    // a data error, not an excuse to silently classify the day as "Absent".
    // Explicit placeholders ("-", "–", "N/A", …) signify a day with no times —
    // overwhelmingly leave/absent days in real exports — and are treated as the
    // absence of a time instead of an error.
    const hasLogin = !!loginValue && !isTimePlaceholder(loginValue);
    const hasLogout = !!logoutValue && !isTimePlaceholder(logoutValue);
    const login = hasLogin ? parseTimeParts(loginValue) : null;
    if (hasLogin && login === null) {
      recordError(`Row ${rowNo + 1}: invalid login time "${loginValue}" (expected HH:MM)`);
      continue;
    }
    const logout = hasLogout ? parseTimeParts(logoutValue) : null;
    if (hasLogout && logout === null) {
      recordError(`Row ${rowNo + 1}: invalid logout time "${logoutValue}" (expected HH:MM)`);
      continue;
    }

    // Present is the default. A row is ONLY on leave when the leave column
    // itself says yes — filler in a leave-type column ("-") can never turn a
    // present day into a leave request. An explicit day/Status column
    // ("Present" / "Absent" / "On Leave" / "WFH" / "Late") takes precedence
    // over the inference so real-world exports mark days exactly as requested.
    // An explicitly marked leave reads as Leave (auto-approvable on import) so
    // it shows up in the Leave module; only an explicit rejection downgrades
    // it (Absent when no check-in/out — they were expected to work; Present
    // when times exist).
    const leaveIndicated =
      /^(y|yes|1|true|on\s*leave|leave|lwp)$/i.test(leaveValue) ||
      /^(from|start)/i.test(leaveValue);
    const leaveRejected = leaveIndicated && /reject|denied/i.test(approvalValue);

    const declaredStatus = classifyAttendanceStatus(statusValue);
    const status = declaredStatus ??
      (leaveIndicated && !leaveRejected
        ? "Leave"
        : login || logout
          ? "Present"
          : "Absent");

    const isoDate = `${dateParts.y}-${String(dateParts.m).padStart(2, "0")}-${String(dateParts.d).padStart(2, "0")}`;
    // Dedupe by (employee, date) — a later row for the same pair wins.
    seen.set(`${employee.id}|${isoDate}`, {
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

  if (skipped > errors.length) {
    errors.push(`… and ${skipped - errors.length} more invalid row(s) omitted from this report.`);
  }

  const candidates = [...seen.values()];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imported: any[] = [];

  // Which (employee, date) pairs already exist → split into insert vs update.
  const empIds = [...new Set(candidates.map((c) => c.employee.id))];
  const dateSet = [...new Set(candidates.map((c) => c.punchDate.getTime()))].map((t) => new Date(t));
  const existingSet = new Set<string>();
  if (candidates.length) {
    const existing = await prisma.attendancePunch.findMany({
      where: { employeeId: { in: empIds }, punchDate: { in: dateSet } },
      select: { employeeId: true, punchDate: true },
    });
    for (const p of existing) existingSet.add(`${p.employeeId}|${p.punchDate.getTime()}`);
  }

  const toInsert: ImportCandidate[] = [];
  const toUpdate: ImportCandidate[] = [];
  for (const c of candidates) {
    if (existingSet.has(`${c.employee.id}|${c.punchDate.getTime()}`)) toUpdate.push(c);
    else toInsert.push(c);
  }

  // Bulk inserts (new pairs) — createMany in chunks.
  const CHUNK = 2000;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK).map((c) => ({
      employeeId: c.employee.id,
      punchDate: c.punchDate,
      punchIn: c.punchIn,
      punchOut: c.punchOut,
      status: c.status,
      method: "Upload" as const,
    }));
    await prisma.attendancePunch.createMany({ data: chunk, skipDuplicates: true });
  }

  // Updates (existing pairs) — batched transactions.
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((c) => prisma.attendancePunch.update({
        where: { employeeId_punchDate: { employeeId: c.employee.id, punchDate: c.punchDate } },
        data: { punchIn: c.punchIn, punchOut: c.punchOut, status: c.status, method: "Upload" as const },
      }))
    );
  }

  // Return a bounded sample (frontend uses `imported` count; the records table
  // reloads from the API with its own pagination).
  const SAMPLE = 1000;
  const sample = [...toUpdate, ...toInsert].slice(0, SAMPLE).map((c) => ({
    id: "",
    employeeId: c.employee.employeeCode,
    employeeName: `${c.employee.firstName} ${c.employee.lastName}`.trim(),
    date: c.isoDate,
    checkIn: hhmm(c.punchIn),
    checkOut: hhmm(c.punchOut),
    status: c.status,
    leave: c.status === "Leave" ? "Yes" : "No",
    hoursWorked: c.punchIn && c.punchOut ? Math.round(((c.punchOut.getTime() - c.punchIn.getTime()) / 3_600_000) * 100) / 100 : 0,
  }));
  imported.push(...sample);

  // Leave sync is best-effort (attendance always imported regardless) and now
  // happens in ONE batched call instead of the old per-row loop (~4-8 queries
  // per employee-day row) — the file stays the ground truth: approved-Leave
  // rows produce an auto-approved request; every other row retires any stale
  // upload-synced request for that day.
  try {
    await syncUploadLeaveRequests(
      candidates.map((c) => ({
        employeeId: c.employee.id,
        employeeCode: c.employee.employeeCode,
        date: c.isoDate,
        isLeave: c.status === "Leave",
        leaveTypeValue: c.leaveTypeValue,
        approvalValue: c.approvalValue,
        approvedByValue: c.approvedByValue,
        reason: `${c.leaveValue ? `Leave: ${c.leaveValue}. ` : ""}${c.leaveTypeValue ? `${c.leaveTypeValue} on ${c.isoDate}` : "On leave per attendance file on " + c.isoDate}`.trim(),
      })),
    );
  } catch {
    // Leave sync is best-effort — attendance still imported.
  }

  return {
    imported: toInsert.length + toUpdate.length,
    totalImported: toInsert.length + toUpdate.length,
    skipped,
    errors,
    unknownEmployees: [...unknownEmployees.values()].sort((a, b) => b.rows - a.rows),
    data: imported,
  };
}

/**
 * Permanently remove uploaded attendance data ("Clear"). Every punch imported
 * from a file (method = "Upload") is deleted, along with the leave requests
 * that uploads synced into the leave module. Additionally all pending leave
 * requests (any origin) are removed so stale approvals don't linger.
 * Approved requests removed have their annual leave-balance used-days
 * restored. Seed / wizard / manual check-in / manual leave data is untouched.
 * Idempotent: calling it with nothing uploaded/clearable is a no-op.
 */
export async function clearUploadedAttendance() {
  const uploadPunches = await prisma.attendancePunch.findMany({
    where: { method: "Upload" },
    select: { employeeId: true, punchDate: true },
  });

  // ── 1. Upload-synced leave requests (matched by pair + import marker) ─────
  const pairSet = new Set(uploadPunches.map((p) => `${p.employeeId}|${p.punchDate.getTime()}`));
  const empIds = [...new Set(uploadPunches.map((p) => p.employeeId))];
  const dateSet = [...new Set(uploadPunches.map((p) => p.punchDate.getTime()))].map((t) => new Date(t));

  const uploadCandidates = await prisma.leaveRequest.findMany({
    where: { employeeId: { in: empIds }, startDate: { in: dateSet } },
    select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, status: true, reason: true, comments: true },
  });
  const uploadRequests = uploadCandidates.filter(
    (r) => pairSet.has(`${r.employeeId}|${r.startDate.getTime()}`) && isUploadSyncedLeaveRequest(r),
  );

  // ── 2. All pending leave requests (any origin) ───────────────────────────
  const pendingRequests = await prisma.leaveRequest.findMany({
    where: { status: "Pending" },
    select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, status: true, reason: true, comments: true },
  });
  const pendingIds = new Set(pendingRequests.map((r) => r.id));

  // Merge: upload-synced + pending (deduplicated).
  const toDelete = [...uploadRequests, ...pendingRequests.filter((r) => !pendingIds.has(r.id) || !uploadRequests.some((u) => u.id === r.id))];
  const allToDeleteIds = new Set(toDelete.map((r) => r.id));

  // Restore used-days for every approved request being removed.
  const balanceDeltas = new Map<string, number>();
  for (const r of toDelete) {
    if (r.status !== "Approved") continue;
    const key = `${r.employeeId}|${r.leaveTypeId}|${r.startDate.getUTCFullYear()}`;
    balanceDeltas.set(key, (balanceDeltas.get(key) ?? 0) + 1);
  }

  const punchCount = uploadPunches.length;
  const requestCount = allToDeleteIds.size;

  await prisma.$transaction(async (tx) => {
    if (requestCount > 0) {
      await tx.leaveRequest.deleteMany({ where: { id: { in: [...allToDeleteIds] } } });
    }
    if (punchCount > 0) {
      await tx.attendancePunch.deleteMany({ where: { method: "Upload" } });
    }
    for (const [key, delta] of balanceDeltas) {
      const [employeeId, leaveTypeId, year] = key.split("|");
      const balance = await tx.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: Number(year) } },
      });
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { usedDays: Math.max(0, Number(balance.usedDays) - delta) },
        });
      }
    }
  });

  writeAuditLog({
    action: "DELETE",
    entityType: "AttendanceUpload",
    entityId: "",
    newValue: { punches: punchCount, leaveRequests: requestCount },
  });

  return { punches: punchCount, leaveRequests: requestCount };
}
