import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";

export interface HolidayInput {
  name: string;
  date: string;
  country?: string;
  state?: string;
  type?: string;
}

/** Normalize a Date to its YYYY-MM-DD calendar string in UTC. */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Day classification for the reconciliation engine. */
export interface DayInfo {
  date: Date;
  dateKey: string;
  weekday: number; // 0 = Sunday
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  isWorkingDay: boolean;
}

/** Classify a single calendar day against weekly offs + named holidays. */
export function classifyDay(
  date: Date,
  weeklyOffDays: number[],
  holidays: Array<{ date: Date; name: string }>
): DayInfo {
  const key = dateKey(date);
  const holiday = holidays.find((h) => dateKey(h.date) === key);
  const isWeekend = weeklyOffDays.includes(date.getUTCDay());
  const isHoliday = Boolean(holiday);
  return {
    date,
    dateKey: key,
    weekday: date.getUTCDay(),
    isWeekend,
    isHoliday,
    holidayName: holiday?.name ?? null,
    isWorkingDay: !isWeekend && !isHoliday,
  };
}

async function loadWeeklyOff(): Promise<number[]> {
  const company = await prisma.company.findFirst({
    where: { isActive: true },
    select: { weeklyOffDays: true },
    orderBy: { createdAt: "asc" },
  });
  const raw = (company?.weeklyOffDays ?? []) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

async function loadHolidays(from: Date, to: Date, country?: string, state?: string) {
  const where: Prisma.HolidayWhereInput = {
    isActive: true,
    date: { gte: from, lte: to },
  };
  if (country) where.country = country;
  if (state) {
    where.OR = [{ state: state }, { state: null }];
  } else {
    where.state = null;
  }
  return prisma.holiday.findMany({ where, orderBy: { date: "asc" } });
}

export async function listHolidays(filters: { year?: number; country?: string; state?: string }) {
  const year = filters.year ?? new Date().getFullYear();
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const holidays = await loadHolidays(from, to, filters.country, filters.state);
  return {
    data: holidays.map((h) => ({
      id: h.id,
      name: h.name,
      date: dateKey(h.date),
      country: h.country,
      state: h.state,
      type: h.type,
    })),
  };
}

export async function createHoliday(input: HolidayInput) {
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw AppError.badRequest("Invalid date — use YYYY-MM-DD");

  const state = input.state ?? null;
  const existing = await prisma.holiday.findFirst({
    where: {
      country: input.country ?? "India",
      state: state === null ? { equals: null } : state,
      date,
    },
  });
  if (existing) throw AppError.conflict("A holiday already exists for this date/location");

  const created = await prisma.holiday.create({
    data: {
      name: input.name,
      date,
      country: input.country ?? "India",
      state: input.state ?? null,
      type: input.type ?? "Public",
      isActive: true,
    },
  });

  return {
    data: {
      id: created.id,
      name: created.name,
      date: dateKey(created.date),
      country: created.country,
      state: created.state,
      type: created.type,
    },
  };
}

export async function deleteHoliday(id: string) {
  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Holiday not found");
  await prisma.holiday.delete({ where: { id } });
  return { data: { id } };
}

/** Monthly working-day calendar: every day flagged weekend/holiday/working. */
export async function workingDays(filters: { year?: number; month?: number; country?: string; state?: string }) {
  const now = new Date();
  const year = filters.year ?? now.getUTCFullYear();
  const month = filters.month ?? now.getUTCMonth() + 1;
  if (month < 1 || month > 12) throw AppError.badRequest("Invalid month");

  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const [weeklyOff, holidays] = await Promise.all([
    loadWeeklyOff(),
    loadHolidays(from, to, filters.country, filters.state),
  ]);

  const days: DayInfo[] = [];
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(classifyDay(new Date(d), weeklyOff, holidays));
  }

  return {
    data: {
      year,
      month,
      workingDays: days.filter((d) => d.isWorkingDay).length,
      weekendDays: days.filter((d) => d.isWeekend).length,
      holidayDays: days.filter((d) => d.isHoliday && !d.isWeekend).length,
      days: days.map((d) => ({
        date: d.dateKey,
        weekday: d.weekday,
        isWeekend: d.isWeekend,
        holiday: d.isHoliday ? d.holidayName : null,
        isWorkingDay: d.isWorkingDay,
      })),
    },
  };
}

export async function getWeeklyOff() {
  return { data: { weeklyOffDays: await loadWeeklyOff() } };
}

export async function updateWeeklyOff(days: number[]) {
  if (!Array.isArray(days) || days.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) {
    throw AppError.badRequest("weeklyOffDays must be an array of integers 0-6");
  }
  const company = await prisma.company.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!company) throw AppError.notFound("Active company not found");
  const updated = await prisma.company.update({
    where: { id: company.id },
    data: { weeklyOffDays: [...new Set(days)].sort() },
  });
  return { data: { weeklyOffDays: updated.weeklyOffDays as unknown as number[] } };
}