import type {
  Employee,
  Department,
  Designation,
  Location,
  SalaryStructure,
} from "@prisma/client";
import { toNumber, formatDate } from "./helpers";
import { hashStringToRange } from "./helpers";

type EmployeeWithRelations = Employee & {
  department?: Department | null;
  designation?: Designation | null;
  location?: Location | null;
  user?: { email: string | null } | null;
  reportingManager?: { employeeCode: string; firstName: string; lastName: string } | null;
  salaryStructures?: SalaryStructure[];
};

export interface SerializationContext {
  isPrivileged?: boolean;
  isSelf?: boolean;
}

function maskSensitive(val: string | null | undefined, visibleTrailing: number = 4): string {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (trimmed.length <= visibleTrailing) return "••••" + trimmed;
  const maskedLength = Math.max(0, trimmed.length - visibleTrailing);
  return "•".repeat(maskedLength) + trimmed.slice(-visibleTrailing);
}

export function sanitizeWizardData(wizardData: any, context?: SerializationContext): any {
  if (!wizardData || typeof wizardData !== "object") return null;

  // Privileged viewers (HR/Admin) and self-service employees see raw details
  if (context?.isPrivileged || context?.isSelf) {
    return wizardData;
  }

  // Deep copy to avoid mutating source in-place
  const copy = JSON.parse(JSON.stringify(wizardData));

  if (copy.bankDetails) {
    if (copy.bankDetails.accountNumber) {
      copy.bankDetails.accountNumber = maskSensitive(copy.bankDetails.accountNumber, 4);
    }
    if (copy.bankDetails.ifscCode) {
      copy.bankDetails.ifscCode = maskSensitive(copy.bankDetails.ifscCode, 3);
    }
  }

  if (copy.statutoryDetails) {
    if (copy.statutoryDetails.panNumber) {
      copy.statutoryDetails.panNumber = maskSensitive(copy.statutoryDetails.panNumber, 2);
    }
    if (copy.statutoryDetails.aadhaarNumber) {
      copy.statutoryDetails.aadhaarNumber = maskSensitive(copy.statutoryDetails.aadhaarNumber, 4);
    }
    if (copy.statutoryDetails.uanNumber) {
      copy.statutoryDetails.uanNumber = maskSensitive(copy.statutoryDetails.uanNumber, 4);
    }
  }

  if (copy.accountNumber) copy.accountNumber = maskSensitive(copy.accountNumber, 4);
  if (copy.panNumber) copy.panNumber = maskSensitive(copy.panNumber, 2);
  if (copy.aadhaarNumber) copy.aadhaarNumber = maskSensitive(copy.aadhaarNumber, 4);

  return copy;
}

/**
 * Maps a DB employee row to the frontend contract (see docs/API.md + mock/employees.js).
 * Note: `id` is the human-readable employee_code (EMP001), NOT the UUID PK.
 */
export function serializeEmployee(emp: EmployeeWithRelations, context?: SerializationContext) {
  const activeStructure = emp.salaryStructures?.find((s) => s.isActive);
  const structureSalary = activeStructure
    ? toNumber(activeStructure.basicSalary) +
      toNumber(activeStructure.hra) +
      toNumber(activeStructure.conveyanceAllowance) +
      toNumber(activeStructure.medicalAllowance) +
      toNumber(activeStructure.performanceBonus) +
      toNumber(activeStructure.otherAllowances)
    : 0;
  const salarySource = emp.annualSalary != null ? toNumber(emp.annualSalary) : structureSalary;

  const genderPath = emp.gender?.toLowerCase() === "female" ? "women" : "men";
  const avatarId = hashStringToRange(emp.employeeCode, 1, 99);

  return {
    id: emp.employeeCode,
    employeeCode: emp.employeeCode,
    pk: emp.id,
    avatar: emp.photoUrl || `https://randomuser.me/api/portraits/${genderPath}/${avatarId}.jpg`,
    photoUrl: emp.photoUrl || null,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.user?.email ?? emp.personalEmail ?? "",
    phone: emp.personalMobile ?? "",
    designation: emp.designation?.title ?? "",
    department: emp.department?.name ?? "",
    location: emp.location?.name ?? "",
    state: emp.state ?? "",
    country: emp.country ?? "",
    employmentType: emp.employmentType,
    status: emp.status,
    joinDate: formatDate(emp.dateOfJoining),
    salary: Math.round(salarySource),
    annualSalary: Math.round(salarySource),
    managerId: emp.reportingManager?.employeeCode ?? null,
    gender: emp.gender ?? "",
    skillType: emp.skillType ?? "",
    dob: emp.dateOfBirth ? formatDate(emp.dateOfBirth) : null,
    wizardData: sanitizeWizardData((emp as any).wizardData, context),
  };
}

export function serializeEmployeeList(employees: EmployeeWithRelations[], context?: SerializationContext) {
  return employees.map((emp) => serializeEmployee(emp, context));
}
