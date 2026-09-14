import { prisma } from "../../lib/prisma";
import { classifyDay, dateKey, type DayInfo } from "../calendar/calendar.service";
import { countWeekdays } from "../../serializers/helpers";

export interface AttendanceSummary {
  workingDays: number; // calendar working days in period
  presentDays: number; // punches marked Present/Late/WFH (includes 0.5 for Half Day)
  halfDays: number;
  lateDays: number;
  paidLeaveDays: number; // approved paid leave overlapping the period
  unpaidLeaveDays: number; // working days with no punch and no approved leave (LOP)
  holidayDays: number; // named holidays on working-week days
  weekendDays: number;
  weeklyOffWorkedDays: number; // weekend punches
  holidayWorkedDays: number; // holiday punches
  nightShiftCount: number; // night shifts worked
  overtimeHours: number; // total OT hours (capped if monthly max set)
  normalOtHours: number; // OT on normal working days
  weeklyOffOtHours: number; // OT on weekly off days
  holidayOtHours: number; // OT on public holidays
  nightOtHours: number; // OT on night shifts
  payableDays: number; // calculated business payable days
}

export interface EmployeeReconciliation {
  employeeId: string;
  employeeCode: string;
  year: number;
  month: number;
  periodStart: Date;
  periodEnd: Date;
  hiredWithinPeriod: boolean;
  shiftHours: number; // scheduled shift duration in hours (used for OT rate)
  summary: AttendanceSummary;
  daily: Array<{ date: string; weekday: number; status: string }>;
}

export interface ShiftWindow {
  startMinutes: number;
  endMinutes: number;
}

export interface OvertimeRuleConfig {
  minOtMinutes?: number;
  maxOtHoursMonthly?: number;
}

export type Punch = { punchDate: Date; status: string; punchIn: Date | null; punchOut: Date | null };

export interface ApprovedLeave {
  startDate: Date;
  endDate: Date;
  isPaid?: boolean;
  leaveTypeCode?: string;
  leaveTypeName?: string;
}

export function isLeavePaid(code?: string | null, name?: string | null): boolean {
  const norm = `${code ?? ""} ${name ?? ""}`.toLowerCase();
  if (
    norm.includes("lop") ||
    norm.includes("lwp") ||
    norm.includes("unpaid") ||
    norm.includes("loss of pay") ||
    norm.includes("without pay")
  ) {
    return false;
  }
  return true;
}

type CompanyWithConfig = {
  weeklyOffDays: unknown;
  companyConfig: {
    shiftStartMinutes: number;
    shiftEndMinutes: number;
    weeklyOffDays: unknown;
    minOtMinutesThreshold?: number;
    maxOtHoursMonthly?: unknown;
  } | null;
};

function filterDayNumbers(value: unknown): number[] {
  return Array.isArray(value)
    ? (value as unknown[]).filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6)
    : [];
}

function weeklyOffDays(row: CompanyWithConfig): number[] {
  const fromConfig = filterDayNumbers(row.companyConfig?.weeklyOffDays);
  if (fromConfig.length) return fromConfig;
  return filterDayNumbers(row.weeklyOffDays);
}

function monthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

/** Pure reconciliation logic — given punches, approved leaves, holiday/weekoff
 *  context, joining/exit dates and OT configuration, derives working/present/paid-leave/LOP days,
 *  weekly-off/holiday worked, night shifts, granular overtime hours and business payable days.
 *  Scenario 4: Interconnects Attendance -> Leave Records -> Holiday Calendar -> Payroll.
 *  Does not treat every absence as unpaid leave. Approved leave -> No LOP. Unauthorized absence -> LOP. */
export function reconcile(
  punches: Punch[],
  leaves: ApprovedLeave[],
  holidays: DayInfo[],
  joiningDate: Date | null,
  exitDate?: Date | null,
  shift?: ShiftWindow | null,
  otConfig?: OvertimeRuleConfig | null,
): { summary: AttendanceSummary; daily: Array<{ date: string; weekday: number; status: string }> } {
  const punchByDate = new Map<string, Punch>();
  for (const p of punches) punchByDate.set(dateKey(p.punchDate), p);

  const leaveDayMap = new Map<string, ApprovedLeave>();
  for (const l of leaves) {
    for (let d = new Date(l.startDate); d <= l.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      leaveDayMap.set(dateKey(new Date(d)), l);
    }
  }

  let presentDays = 0;
  let halfDays = 0;
  let lateDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let weeklyOffWorkedDays = 0;
  let holidayWorkedDays = 0;
  let nightShiftCount = 0;
  let normalOtMinutes = 0;
  let weeklyOffOtMinutes = 0;
  let holidayOtMinutes = 0;
  let nightOtMinutes = 0;
  const daily: Array<{ date: string; weekday: number; status: string }> = [];

  const hasRecordedPunches = punches.length > 0;
  const shiftMinutes = shift ? Math.max(shift.endMinutes - shift.startMinutes, 60) : 8 * 60;
  const minOtThresh = otConfig?.minOtMinutes ?? 30;

  for (const day of holidays) {
    const dayDate = new Date(day.date);
    const hired = joiningDate ? dayDate >= joiningDate : true;
    const exited = exitDate ? dayDate > exitDate : false;
    const inEmployment = hired && !exited;

    if (!inEmployment) {
      const status = !hired ? "Not Hired" : "Exited";
      daily.push({ date: day.dateKey, weekday: day.weekday, status });
      continue;
    }

    const punch = punchByDate.get(day.dateKey);
    const approvedLeave = leaveDayMap.get(day.dateKey);
    const onLeave = Boolean(approvedLeave);
    const isPaidLeave = approvedLeave ? approvedLeave.isPaid !== false : false;

    let status: string;

    // Check night shift flag from punch status or punch hours (in IST 20:00 to 06:00)
    let isNightShift = false;
    if (punch !== undefined) {
      if (punch.status === "Night Shift") {
        isNightShift = true;
      } else if (punch.punchIn !== null) {
        const istMinutes = (punch.punchIn.getUTCHours() * 60 + punch.punchIn.getUTCMinutes() + 330) % 1440;
        const istHour = istMinutes / 60;
        if (istHour >= 20 || istHour < 6) {
          isNightShift = true;
        } else if (punch.punchOut !== null && punch.punchOut.getTime() < punch.punchIn.getTime()) {
          isNightShift = true;
        }
      }
    }
    if (isNightShift) {
      nightShiftCount += 1;
    }

    if (!day.isWorkingDay) {
      const isPresentKind =
        punch !== undefined &&
        (punch.status === "Present" ||
          punch.status === "WFH" ||
          punch.status === "Late" ||
          punch.status === "Night Shift" ||
          punch.status === "Half Day");

      if (punch && (isPresentKind || punch.punchIn !== null)) {
        if (day.isWeekend) {
          status = "Weekly Off Worked";
          weeklyOffWorkedDays += 1;
          let workedMins = shiftMinutes;
          if (punch.punchIn && punch.punchOut) {
            workedMins = Math.max((punch.punchOut.getTime() - punch.punchIn.getTime()) / 60000, 0);
          }
          weeklyOffOtMinutes += workedMins;
        } else {
          status = "Holiday Worked";
          holidayWorkedDays += 1;
          let workedMins = shiftMinutes;
          if (punch.punchIn && punch.punchOut) {
            workedMins = Math.max((punch.punchOut.getTime() - punch.punchIn.getTime()) / 60000, 0);
          }
          holidayOtMinutes += workedMins;
        }
      } else {
        status = day.isWeekend ? "Weekend" : "Holiday";
      }
    } else {
      // Normal working day:
      // Scenario 4 pipeline: Attendance -> Leave Records -> Holiday Calendar -> Payroll
      // Check leave records before treating any absence or no-show as unpaid LOP.
      if (punch) {
        const isPresentKind =
          punch.status === "Present" ||
          punch.status === "WFH" ||
          punch.status === "Late" ||
          punch.status === "Night Shift";

        if (punch.status === "Half Day") {
          status = "Half Day";
          presentDays += 0.5;
          halfDays += 1;
        } else if (isPresentKind) {
          status = punch.status;
          presentDays += 1;
          if (punch.status === "Late") lateDays += 1;

          // Overtime minutes past scheduled shift end or working duration beyond shift
          if (shift && punch.punchOut) {
            let otMins = 0;
            if (punch.punchIn && punch.punchOut) {
              const workedMins = Math.max((punch.punchOut.getTime() - punch.punchIn.getTime()) / 60000, 0);
              if (workedMins > shiftMinutes) {
                otMins = workedMins - shiftMinutes;
              }
            } else if (!punch.punchIn && punch.punchOut && !isNightShift) {
              const outMin = punch.punchOut.getUTCHours() * 60 + punch.punchOut.getUTCMinutes();
              if (outMin > shift.endMinutes) {
                otMins = outMin - shift.endMinutes;
              }
            }
            if (otMins >= minOtThresh) {
              if (isNightShift) nightOtMinutes += otMins;
              else normalOtMinutes += otMins;
            }
          }
        } else {
          // Punch with non-present status (e.g. Absent) on working day
          // Check if employee has an approved leave for this date
          if (onLeave) {
            if (isPaidLeave) {
              // Kumar -> Approved Leave -> No LOP
              status = "Paid Leave";
              paidLeaveDays += 1;
            } else {
              // Approved LWP / LOP
              status = "LOP";
              unpaidLeaveDays += 1;
            }
          } else {
            // Suresh -> Unauthorized Absence -> LOP
            status = "LOP";
            unpaidLeaveDays += 1;
          }
        }
      } else if (onLeave) {
        // Working day, no punch, but has approved leave record
        if (isPaidLeave) {
          // Approved Leave -> No LOP
          status = "Paid Leave";
          paidLeaveDays += 1;
        } else {
          status = "LOP";
          unpaidLeaveDays += 1;
        }
      } else if (!hasRecordedPunches) {
        status = "Scheduled";
      } else {
        // Working day, no punch, no approved leave -> Unauthorized Absence -> LOP
        status = "LOP";
        unpaidLeaveDays += 1;
      }
    }

    daily.push({ date: day.dateKey, weekday: day.weekday, status });
  }

  const workingDaysCount = holidays.filter((d) => {
    const dt = new Date(d.date);
    const hired = joiningDate ? dt >= joiningDate : true;
    const exited = exitDate ? dt > exitDate : false;
    return d.isWorkingDay && hired && !exited;
  }).length;

  const normalOtHours = Math.round((normalOtMinutes / 60) * 100) / 100;
  const weeklyOffOtHours = Math.round((weeklyOffOtMinutes / 60) * 100) / 100;
  const holidayOtHours = Math.round((holidayOtMinutes / 60) * 100) / 100;
  const nightOtHours = Math.round((nightOtMinutes / 60) * 100) / 100;
  let totalOt = Math.round((normalOtHours + weeklyOffOtHours + holidayOtHours + nightOtHours) * 100) / 100;

  if (otConfig?.maxOtHoursMonthly && totalOt > otConfig.maxOtHoursMonthly) {
    totalOt = otConfig.maxOtHoursMonthly;
  }

  // Business payable days: Present (inc 0.5 half) + Paid Leave + Weekly Off Worked + Holiday Worked
  const payableDays =
    !hasRecordedPunches
      ? workingDaysCount
      : Math.round((presentDays + paidLeaveDays + weeklyOffWorkedDays + holidayWorkedDays) * 100) / 100;

  const summary: AttendanceSummary = {
    workingDays: workingDaysCount,
    presentDays: hasRecordedPunches ? presentDays : workingDaysCount,
    halfDays,
    lateDays,
    paidLeaveDays,
    unpaidLeaveDays,
    holidayDays: holidays.filter((d) => d.isHoliday && !d.isWeekend).length,
    weekendDays: holidays.filter((d) => d.isWeekend).length,
    weeklyOffWorkedDays,
    holidayWorkedDays,
    nightShiftCount,
    overtimeHours: totalOt,
    normalOtHours,
    weeklyOffOtHours,
    holidayOtHours,
    nightOtHours,
    payableDays,
  };

  return { summary, daily };
}

/** Fetch calendar context (holidays + weekly offs) for an employee's period. */
export async function loadCalendarContext(year: number, month: number, country?: string | null, state?: string | null) {
  const { start, end } = monthBounds(year, month);
  const [companys, holidays] = await Promise.all([
    prisma.company.findMany({
      where: { isActive: true },
      select: { weeklyOffDays: true, companyConfig: { select: { shiftStartMinutes: true, shiftEndMinutes: true, weeklyOffDays: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.holiday.findMany({
      where: {
        isActive: true,
        date: { gte: start, lte: end },
        ...(state ? { OR: [{ state }, { state: null }] } : { state: null }),
        ...(country ? { country } : {}),
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const companyRow = companys[0] as CompanyWithConfig | undefined;
  const weeklyOff: number[] = companyRow ? weeklyOffDays(companyRow) : [];

  const days: DayInfo[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(classifyDay(new Date(d), weeklyOff, holidays));
  }

  return { days, weeklyOff };
}

// ── Scheduled shift window (loaded once per batch) ────────────────────────

function parseShiftRow(
  shiftRow: { startTime: Date; endTime: Date } | null,
  fallback: ShiftWindow,
): ShiftWindow {
  if (shiftRow) {
    return {
      startMinutes: shiftRow.startTime.getHours() * 60 + shiftRow.startTime.getMinutes(),
      endMinutes: shiftRow.endTime.getHours() * 60 + shiftRow.endTime.getMinutes(),
    };
  }
  return fallback;
}

function defaultShiftWindow(cfg: CompanyWithConfig["companyConfig"]): ShiftWindow {
  return {
    startMinutes: cfg ? cfg.shiftStartMinutes : 9 * 60,
    endMinutes: cfg ? cfg.shiftEndMinutes : 18 * 60,
  };
}

/**
 * Batch-reconcile attendance + approved leave for N employees in a single
 * set of DB queries instead of N×6 (the old per-employee path).
 * Results are keyed by employee id for O(1) lookup; throws if any
 * requested id is missing (mirrors reconcileEmployee's own guard).
 */
export async function reconcileEmployees(
  employeeIds: string[],
  year: number,
  month: number,
): Promise<EmployeeReconciliation[]> {
  if (employeeIds.length === 0) return [];

  const { start, end } = monthBounds(year, month);
  const idSet = employeeIds;

  // ── Single batch of queries (6 total, independent of N) ────────────────
  const [companyRow, allHolidays, employees, allPunches, allLeaves, shiftRow] =
    await Promise.all([
      prisma.company.findFirst({
        where: { isActive: true },
        select: {
          weeklyOffDays: true,
          companyConfig: { select: { shiftStartMinutes: true, shiftEndMinutes: true, weeklyOffDays: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.holiday.findMany({
        where: { isActive: true, date: { gte: start, lte: end } },
        orderBy: { date: "asc" },
        select: { date: true, name: true, country: true, state: true },
      }),
      prisma.employee.findMany({
        where: { id: { in: idSet } },
        select: { id: true, employeeCode: true, dateOfJoining: true, dateOfExit: true, state: true, country: true },
      }),
      prisma.attendancePunch.findMany({
        where: { employeeId: { in: idSet }, punchDate: { gte: start, lte: end } },
        select: { employeeId: true, punchDate: true, status: true, punchIn: true, punchOut: true },
        orderBy: { punchDate: "asc" },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: idSet },
          status: "Approved",
          startDate: { lte: end },
          endDate: { gte: start },
        },
        select: {
          employeeId: true,
          startDate: true,
          endDate: true,
          leaveType: { select: { code: true, name: true } },
        },
      }),
      prisma.attendanceShift.findFirst(),
    ]);

  if (employees.length !== idSet.length) {
    const found = new Set(employees.map((e) => e.id));
    const missing = idSet.filter((id) => !found.has(id));
    throw new Error(`Employees not found: ${missing.join(", ")}`);
  }

  // ── Shared context (already loaded) ────────────────────────────────────
  const weeklyOff: number[] = companyRow ? weeklyOffDays(companyRow as CompanyWithConfig) : [];
  const shift = parseShiftRow(shiftRow, defaultShiftWindow((companyRow as CompanyWithConfig)?.companyConfig ?? null));
  const shiftHours = (shift.endMinutes - shift.startMinutes) / 60;
  const cfg = (companyRow as CompanyWithConfig)?.companyConfig;
  const otConfig: OvertimeRuleConfig = {
    minOtMinutes: cfg?.minOtMinutesThreshold ?? 30,
    maxOtHoursMonthly: cfg?.maxOtHoursMonthly ? Number(cfg.maxOtHoursMonthly) : undefined,
  };

  // Group punches / leaves by employeeId (O(M) where M = rows returned).
  const punchesByEmp = new Map<string, Punch[]>();
  for (const raw of allPunches) {
    const arr = punchesByEmp.get(raw.employeeId) ?? [];
    arr.push({ punchDate: raw.punchDate, status: raw.status, punchIn: raw.punchIn, punchOut: raw.punchOut });
    punchesByEmp.set(raw.employeeId, arr);
  }

  const leavesByEmp = new Map<string, ApprovedLeave[]>();
  for (const raw of allLeaves) {
    const arr = leavesByEmp.get(raw.employeeId) ?? [];
    const isPaid = isLeavePaid(raw.leaveType?.code, raw.leaveType?.name);
    arr.push({
      startDate: raw.startDate,
      endDate: raw.endDate,
      isPaid,
      leaveTypeCode: raw.leaveType?.code,
      leaveTypeName: raw.leaveType?.name,
    });
    leavesByEmp.set(raw.employeeId, arr);
  }

  // ── Per-employee classification (CPU-only, no DB) ──────────────────────
  const results: EmployeeReconciliation[] = [];

  for (const emp of employees) {
    // Filter holidays for this employee's state/country (in-memory).
    const empCountry = emp.country ?? "India";
    const empState = emp.state;
    const filteredHolidays = allHolidays.filter((h) => {
      if (h.country !== empCountry) return false;
      if (empState) return h.state === empState || h.state === null;
      return h.state === null;
    });

    const days: DayInfo[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(classifyDay(new Date(d), weeklyOff, filteredHolidays));
    }

    const punches = punchesByEmp.get(emp.id) ?? [];
    const leaves = leavesByEmp.get(emp.id) ?? [];
    const joining = emp.dateOfJoining ? new Date(emp.dateOfJoining.toISOString()) : null;
    const exiting = emp.dateOfExit ? new Date(emp.dateOfExit.toISOString()) : null;

    const { summary, daily } = reconcile(punches, leaves, days, joining, exiting, shift, otConfig);

    const clipped = [...daily].filter(
      (d) => new Date(`${d.date}T00:00:00.000Z`) >= new Date(start) && new Date(`${d.date}T00:00:00.000Z`) <= end,
    );

    results.push({
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      year,
      month,
      periodStart: start,
      periodEnd: end,
      hiredWithinPeriod: joining ? joining > start : false,
      shiftHours,
      summary,
      daily: clipped,
    });
  }

  return results;
}

/** Reconcile attendance + approved leave for one employee for a month. */
export async function reconcileEmployee(employeeId: string, year: number, month: number): Promise<EmployeeReconciliation> {
  const [result] = await reconcileEmployees([employeeId], year, month);
  return result;
}

/** Aggregate a reconciliation summary across paycheck-building helpers. */
export function paidLeaveDaysInPeriod(leave: ApprovedLeave[], year: number, month: number): number {
  const { start, end } = monthBounds(year, month);
  let days = 0;
  for (const l of leave) {
    const from = l.startDate > start ? l.startDate : start;
    const to = l.endDate < end ? l.endDate : end;
    if (to >= from) days += countWeekdays(from, to);
  }
  return days;
}