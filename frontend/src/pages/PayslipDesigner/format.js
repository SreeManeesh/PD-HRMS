/** Field Picker catalog — data bindings an HR user can choose without coding. */

export const FIELD_TREE = [
  {
    group: "Employee",
    fields: [
      { label: "Full Name", source: "employee.name", format: "text" },
      { label: "Employee ID", source: "employee.employeeId", format: "text" },
      { label: "Department", source: "employee.department", format: "text" },
      { label: "Designation", source: "employee.designation", format: "text" },
      { label: "Joining Date", source: "employee.joinDate", format: "date" },
      { label: "Employment Type", source: "employee.employmentType", format: "text" },
      { label: "Gender", source: "employee.gender", format: "text" },
      { label: "Company Name", source: "employee.companyName", format: "text" },
    ],
  },
  {
    group: "Payroll",
    fields: [
      { label: "Basic Salary", source: "payroll.earnings.basic", format: "currency" },
      { label: "HRA", source: "payroll.earnings.hra", format: "currency" },
      { label: "Special Allowance", source: "payroll.earnings.special_allowance", format: "currency" },
      { label: "Conveyance", source: "payroll.earnings.conveyance", format: "currency" },
      { label: "Gross Salary", source: "payroll.gross", format: "currency" },
      { label: "Net Salary", source: "payroll.net", format: "currency" },
      { label: "EPF (Employee)", source: "payroll.deductions.epf", format: "currency" },
      { label: "Professional Tax", source: "payroll.deductions.professional_tax", format: "currency" },
      { label: "TDS", source: "payroll.deductions.tds", format: "currency" },
      { label: "Total Deductions", source: "payroll.deductions.total", format: "currency" },
    ],
  },
  {
    group: "Attendance",
    fields: [
      { label: "Days Present", source: "attendance.present", format: "number" },
      { label: "Days Absent", source: "attendance.absent", format: "number" },
      { label: "Overtime Hours", source: "attendance.overtimeHours", format: "number" },
    ],
  },
  {
    group: "Leave",
    fields: [
      { label: "Balance", source: "leave.balance", format: "number" },
      { label: "Used", source: "leave.used", format: "number" },
      { label: "Available", source: "leave.available", format: "number" },
    ],
  },
];

/** Runtime data provided by the backend preview for binding resolution. */
export function resolveDynamicField(source, runtime) {
  const parts = (source || "").split(".");
  let node = runtime;
  for (const p of parts) {
    if (node == null) return "";
    node = node[p];
  }
  if (node == null) return "";
  return node;
}

export const inr = (n) => {
  if (n == null || isNaN(n)) return "—";
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
};