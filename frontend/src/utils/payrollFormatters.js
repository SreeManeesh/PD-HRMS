/**
 * Master utility formatters and metadata for Payroll, Payslip Designer,
 * and Payslip Portal components.
 */

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/** Format an amount into standard Indian Rupees (INR) with currency symbol. */
export const inr = (n) => {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
};

export const fmt = inr;

export const payrollStatusMeta = {
  Draft: { label: "Draft", color: "#64748b", bg: "#f8fafc" },
  Processing: { label: "Processing", color: "#d97706", bg: "#fffbeb" },
  Approved: { label: "Approved", color: "#0284c7", bg: "#f0f9ff" },
  Paid: { label: "Paid", color: "#16a34a", bg: "#f0fdf4" },
  Failed: { label: "Failed", color: "#dc2626", bg: "#fef2f2" },
};

export const skillTypeMeta = {
  Skilled: {
    label: "Skilled",
    color: "#0284c7",
    bg: "#f0f9ff",
    border: "#bae6fd",
    iconColor: "#0369a1",
  },
  "Semi Skilled": {
    label: "Semi Skilled",
    color: "#0d9488",
    bg: "#f0fdfa",
    border: "#99f6e4",
    iconColor: "#0f766e",
  },
  Unskilled: {
    label: "Unskilled",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    iconColor: "#b45309",
  },
};

export const getSkillMeta = (skillType) => {
  const norm = String(skillType || "").trim().toLowerCase();
  if (norm.includes("semi")) return skillTypeMeta["Semi Skilled"];
  if (norm.includes("unskilled") || norm.includes("un-skilled")) return skillTypeMeta["Unskilled"];
  if (norm.includes("skill")) return skillTypeMeta["Skilled"];
  return {
    label: skillType || "Standard",
    color: "#64748b",
    bg: "#f8fafc",
    border: "#e2e8f0",
  };
};

export const pad2 = (n) => String(n).padStart(2, "0");
export const isoDate = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
