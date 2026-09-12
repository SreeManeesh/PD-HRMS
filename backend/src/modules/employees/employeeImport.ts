/**
 * Bulk employee import — parses an uploaded XLSX/CSV/TSV sheet into normalized
 * employee rows. Header detection mirrors the attendance importer: real-world
 * exports often carry title/footer rows above the table, so we scan the first
 * rows for the header that matches the most known column keywords.
 */
import * as XLSX from "xlsx";
import type { BulkEmployeeRow } from "./employee.service";

const KNOWN_KEYS = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "designation",
  "department",
  "annualSalary",
  "employeeCode",
  "phone",
  "state",
  "country",
  "location",
  "dateOfJoining",
  "employmentType",
] as const;

type KnownKey = (typeof KNOWN_KEYS)[number];

const HEADER_REGEX: Record<KnownKey, RegExp> = {
  firstName: /first.?name|given.?name|fname/i,
  lastName: /last.?name|surname|family.?name|lname/i,
  fullName: /^(employee\s+)?name$/i,
  email: /e-?mail|mail\s*id|official\s+email|work\s+email/i,
  designation: /designation|job.?title|position|role|rank/i,
  department: /department|dept|business.?unit|division|function/i,
  annualSalary: /annual.?salary|yearly.?salary|annual.?ctc|\bctc\b|package|salary/i,
  employeeCode: /employee.?code|emp.?code|emp.?id|employee.?id|emp\s*no|\bid\b/i,
  phone: /mobile|phone|contact\s*number|telephone/i,
  state: /state|region|province/i,
  country: /country/i,
  location: /location|work.?location|office.?location/i,
  dateOfJoining: /date.?of.?joining|joining.?date|\bdoj\b/i,
  employmentType: /employment.?type|employee.?type/i,
};

function rowCell(cells: string[], index: number): string {
  return index >= 0 && index < cells.length ? cells[index].trim() : "";
}

function toNumber(value: string): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[,\s₹]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseEmployeeFile(file: Express.Multer.File): BulkEmployeeRow[] {
  const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  // Detect the header row (the row matching the most known column keywords).
  let headerRowIdx = -1;
  let bestHits = 0;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = rows[i] ?? [];
    const hits = cells.filter((c) => KNOWN_KEYS.some((key) => HEADER_REGEX[key].test(String(c).toLowerCase()))).length;
    if (hits > bestHits) {
      bestHits = hits;
      headerRowIdx = i;
    }
  }

  const hasHeader = headerRowIdx >= 0 && bestHits >= 2;
  const headerCells = hasHeader ? (rows[headerRowIdx] ?? []).map((c) => String(c).toLowerCase()) : [];

  const detected: Partial<Record<KnownKey, number>> = {};
  if (hasHeader) {
    headerCells.forEach((h, i) => {
      for (const key of KNOWN_KEYS) {
        if (detected[key] !== undefined) continue;
        if (HEADER_REGEX[key].test(h)) {
          detected[key] = i;
        }
      }
    });
  }

  const colIndex = (key: KnownKey): number => (detected[key] !== undefined ? detected[key]! : -1);

  // Skip title/footer rows above the header before importing.
  const dataRows = hasHeader ? rows.slice(headerRowIdx + 1) : rows;
  const result: BulkEmployeeRow[] = [];

  for (const cells of dataRows) {
    if (!cells || cells.every((c) => String(c).trim() === "")) continue;

    const firstName = !hasHeader ? rowCell(cells, 0) : rowCell(cells, colIndex("firstName"));
    const lastName = !hasHeader ? rowCell(cells, 1) : rowCell(cells, colIndex("lastName"));
    const fullName = !hasHeader ? "" : rowCell(cells, colIndex("fullName"));

    // A single "Name" column (e.g. "Aarav Sharma") → split into first/last.
    let first = firstName;
    let last = lastName;
    if ((!first || !last) && fullName) {
      const parts = fullName.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        first = first || parts[0];
        last = last || parts.slice(1).join(" ");
      } else {
        first = first || fullName;
        last = last || "";
      }
    }

    result.push({
      employeeCode: !hasHeader ? "" : rowCell(cells, colIndex("employeeCode")),
      firstName: first,
      lastName: last,
      email: !hasHeader ? "" : rowCell(cells, colIndex("email")),
      designation: !hasHeader ? rowCell(cells, 2) : rowCell(cells, colIndex("designation")),
      department: !hasHeader ? rowCell(cells, 3) : rowCell(cells, colIndex("department")),
      annualSalary: toNumber(!hasHeader ? rowCell(cells, 4) : rowCell(cells, colIndex("annualSalary"))),
      phone: !hasHeader ? "" : rowCell(cells, colIndex("phone")),
      state: !hasHeader ? "" : rowCell(cells, colIndex("state")),
      country: !hasHeader ? "" : rowCell(cells, colIndex("country")),
      location: !hasHeader ? "" : rowCell(cells, colIndex("location")),
      dateOfJoining: !hasHeader ? "" : rowCell(cells, colIndex("dateOfJoining")),
      employmentType: !hasHeader ? "" : rowCell(cells, colIndex("employmentType")),
    });
  }

  return result;
}