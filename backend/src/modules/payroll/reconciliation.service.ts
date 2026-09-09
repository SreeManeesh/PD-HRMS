import { prisma } from "../../lib/prisma";
import { classifyDay, dateKey, type DayInfo } from "../calendar/calendar.service";
import { countWeekdays } from "../../serializers/helpers";

export interface AttendanceSummary {
  workingDays: number; // calendar working days in period
  presentDays: number; // punches marked Present/Late/WFH
  lateDays: number;
  paidLeaveDays: number; // approved paid leave overlapping the period (Mon-Fri only)
  unpaidLeaveDays: number; // working days with no punch and no approved leave (LOP)
  holidayDays: number; // named holidays on working-week days
  weekendDays: number;
  overtimeHours: number; // filled by the overtime step
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

type Punch = { punchDate: Date; status: string; punchIn: Date | null; punchOut: Date | null };
type ApprovedLeave = { startDate: Date; endDate: Date };

function monthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

/** Pure reconciliation logic — given punches, approved leaves, holiday/weekoff
 *  context and a joining date, derive working/present/paid-leave/LOP days, plus
 *  overtime hours clocked beyond the scheduled shift end on present days. */
export function reconcile(
  punches: Punch[],
  leaves: ApprovedLeave[],
  holidays: DayInfo[],
  joiningDate: Date | null,
  shift?: ShiftWindow | null
): { summary: AttendanceSummary; daily: Array<{ date: string; weekday: number; status: string }> } {
  const punchByDate = new Map<string, Punch>();
  for (const p of punches) punchByDate.set(dateKey(p.punchDate), p);

  const leaveDaySet = new Set<string>();
  for (const l of leaves) {
    for (let d = new Date(l.startDate); d <= l.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      leaveDaySet.add(dateKey(new Date(d)));
    }
  }

  let presentDays = 0;
  let lateDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let overtimeMinutes = 0;
  const daily: Array<{ date: string; weekday: number; status: string }> = [];

  for (const day of holidays) {
    const punch = punchByDate.get(day.dateKey);
    const onLeave = leaveDaySet.has(day.dateKey);
    const hired = joiningDate ? new Date(day.date) >= joiningDate : true;

    let status: string;
    if (!day.isWorkingDay) {
      status = day.isWeekend ? "Weekend" : "Holiday";
    } else if (onLeave) {
      status = "Paid Leave";
      paidLeaveDays += 1;
    } else if (punch) {
      status = punch.status;
      if (punch.status === "Present" || punch.status === "WFH" || punch.status === "Late") {
        presentDays += 1;
        // Overtime: minutes worked past the scheduled shift end on a present day.
        if (shift && punch.punchOut) {
          const outMin = punch.punchOut.getUTCHours() * 60 + punch.punchOut.getUTCMinutes();
          if (outMin > shift.endMinutes) overtimeMinutes += outMin - shift.endMinutes;
        }
      } else {
        // Working-day punch without a present status (Absent/Weekend/Holiday/etc.)
        // still counts as an unpaid day for payroll purposes.
        unpaidLeaveDays += 1;
      }
      if (punch.status === "Late") lateDays += 1;
    } else {
      // Working day, no punch, not on leave -> LOP (skip if not yet hired)
      status = hired ? "LOP" : "Not Hired";
      if (hired) unpaidLeaveDays += 1;
    }

    daily.push({ date: day.dateKey, weekday: day.weekday, status });
  }

  const summary: AttendanceSummary = {
    workingDays: holidays.filter((d) => d.isWorkingDay).length,
    presentDays,
    lateDays,
    paidLeaveDays,
    unpaidLeaveDays,
    holidayDays: holidays.filter((d) => d.isHoliday && !d.isWeekend).length,
    weekendDays: holidays.filter((d) => d.isWeekend).length,
    overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
  };

  return { summary, daily };
}

/** Fetch calendar context (holidays + weekly offs) for an employee's period. */
export async function loadCalendarContext(year: number, month: number, country?: string | null, state?: string | null) {
  const { start, end } = monthBounds(year, month);
  const [companies, holidays] = await Promise.all([
    prisma.company.findMany({ where: { isActive: true }, select: { weeklyOffDays: true }, orderBy: { createdAt: "asc" } }),
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

  const weeklyOff: number[] = Array.isArray(companies[0]?.weeklyOffDays)
    ? (companies[0].weeklyOffDays as unknown as number[]).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];

  const days: DayInfo[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(classifyDay(new Date(d), weeklyOff, holidays));
  }

  return { days, weeklyOff };
}

/** Reconcile attendance + approved leave for one employee for a month. */
export async function reconcileEmployee(employeeId: string, year: number, month: number): Promise<EmployeeReconciliation> {
  const { start, end } = monthBounds(year, month);
  const { days } = await loadCalendarContext(year, month, "India", null);

  const [employee, punches, leaves] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, dateOfJoining: true, state: true, country: true },
    }),
    prisma.attendancePunch.findMany({
      where: { employeeId, punchDate: { gte: start, lte: end } },
      select: { punchDate: true, status: true, punchIn: true, punchOut: true },
      orderBy: { punchDate: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: "Approved",
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { startDate: true, endDate: true },
    }),
  ]);

  if (!employee) throw new Error(`Employee ${employeeId} not found`);

  // Re-load days with the employee's state so state holidays are respected.
  const stateDays = employee.state
    ? (await loadCalendarContext(year, month, employee.country ?? "India", employee.state)).days
    : days;

  // Scheduled shift (global for now — no per-employee assignment yet). Falls
  // back to a 09:00–18:00 window so overtime stays well-defined without config.
  // NOTE: Prisma returns `time` columns as wall-clock local time, so read them
  // with local getters — mirroring how punches (timestamp w/o tz) are read back
  // as UTC and therefore use UTC getters in the reconcile loop below.
  const shiftRow = await prisma.attendanceShift.findFirst();
  const shift: ShiftWindow | null = shiftRow
    ? {
        startMinutes: shiftRow.startTime.getHours() * 60 + shiftRow.startTime.getMinutes(),
        endMinutes: shiftRow.endTime.getHours() * 60 + shiftRow.endTime.getMinutes(),
      }
    : { startMinutes: 9 * 60, endMinutes: 18 * 60 };
  const shiftHours = shift ? (shift.endMinutes - shift.startMinutes) / 60 : 9;

  const joining = employee.dateOfJoining ? new Date(employee.dateOfJoining.toISOString()) : null;
  const { summary, daily } = reconcile(
    punches as Punch[],
    leaves as ApprovedLeave[],
    stateDays,
    joining?.toISOString() ? new Date(joining.toISOString()) : null,
    shift
  );

  const clipped = [...daily].filter(
    (d) => new Date(`${d.date}T00:00:00.000Z`) >= new Date(start) && new Date(`${d.date}T00:00:00.000Z`) <= end
  );

  return {
    employeeId,
    employeeCode: employee.employeeCode,
    year,
    month,
    periodStart: start,
    periodEnd: end,
    hiredWithinPeriod: joining ? joining > start : false,
    shiftHours,
    summary,
    daily: clipped,
  };
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