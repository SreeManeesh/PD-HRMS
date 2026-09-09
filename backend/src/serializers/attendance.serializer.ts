import type { AttendancePunch, Employee } from "@prisma/client";
import { formatDate, formatTime, toNumber } from "./helpers";

type PunchWithEmployee = AttendancePunch & {
  employee?: { employeeCode: string; firstName: string; lastName: string } | null;
};

/**
 * Maps a DB attendance punch to the frontend contract (see mock/attendance.js).
 * checkIn/checkOut are "HH:MM" strings; hoursWorked is computed; leave is
 * "Yes" when the record was imported as a leave day.
 */
export function serializeAttendance(punch: PunchWithEmployee) {
  const hoursWorked =
    punch.punchIn && punch.punchOut
      ? Math.round(((punch.punchOut.getTime() - punch.punchIn.getTime()) / 3_600_000) * 100) / 100
      : 0;

  return {
    id: punch.id,
    employeeId: punch.employee?.employeeCode ?? "",
    employeeName: punch.employee
      ? `${punch.employee.firstName} ${punch.employee.lastName}`.trim()
      : "",
    date: formatDate(punch.punchDate),
    checkIn: formatTime(punch.punchIn),
    checkOut: formatTime(punch.punchOut),
    status: punch.status,
    leave: punch.status === "Leave" ? "Yes" : "No",
    hoursWorked,
  };
}

export function serializeAttendanceList(punches: PunchWithEmployee[]) {
  return punches.map(serializeAttendance);
}

export interface TeamSummary {
  date: string;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  wfh: number;
  total: number;
}

export function serializeTeamSummary(
  input: { date: string; present: number; late: number; absent: number; onLeave: number; wfh: number; total: number }
): TeamSummary {
  return input;
}

export function serializeEmployeeCode(emp: Employee | { employeeCode: string } | null): string | null {
  if (!emp) return null;
  return emp.employeeCode;
}

export { toNumber };
