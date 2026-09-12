/// <reference types="node" />
import { PrismaClient, Prisma } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

// Seed static demo records (org master, employees, attendance, payroll, leave,
// recruitment, compliance, helpdesk, LMS, assets…) only when SEED_DEMO_DATA=true.
// OFF by default so the app starts empty and is driven entirely by data you create
// or upload. RBAC roles/permissions, leave types, holidays, the general shift and a
// single bootstrap admin are always seeded.
const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA === "true";

// ── Permissions (mirrors frontend/src/context/AuthContext.jsx ROLE_PERMISSIONS) ──

const PERMISSIONS = [
  "dashboard:read",
  "employees:read", "employees:write", "employees:delete",
  "attendance:read", "attendance:write",
  "leave:read", "leave:write", "leave:approve",
  "payroll:read", "payroll:write", "payroll:approve",
  "recruitment:read", "recruitment:write",
  "performance:read", "performance:write",
  "reports:read", "reports:export",
  "security:read", "security:write",
  "orgmanagement:read", "orgmanagement:write",
  "compliance:read", "compliance:write",
  "onboarding:read", "onboarding:write",
  "lms:read", "lms:write",
  "assets:read", "assets:write",
  "tasks:read", "tasks:write",
  "expenses:read", "expenses:write", "expenses:approve",
  "travel:read", "travel:write", "travel:approve",
  "ess:read", "ess:write",
  "policies:read", "policies:write",
  "helpdesk:read", "helpdesk:write",
  "separation:read", "separation:write",
  "workflows:read", "workflows:write", "workflows:approve",
  "notifications:read",
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    "dashboard:read",
    "employees:read", "employees:write", "employees:delete",
    "attendance:read", "attendance:write",
    "leave:read", "leave:write", "leave:approve",
    "payroll:read", "payroll:write", "payroll:approve",
    "recruitment:read", "recruitment:write",
    "performance:read", "performance:write",
    "reports:read", "reports:export",
    "security:read", "security:write",
    "orgmanagement:read", "orgmanagement:write",
    "compliance:read", "compliance:write",
    "onboarding:read", "lms:read","lms:write", "assets:read", "assets:write",
    "tasks:read", "expenses:read", "travel:read", "policies:read", "policies:write",
    "helpdesk:read", "helpdesk:write", "separation:read",
    "workflows:read", "workflows:write", "workflows:approve", "notifications:read",
  ],
  HR: [
    "dashboard:read",
    "employees:read", "employees:write",
    "attendance:read", "attendance:write",
    "leave:read", "leave:write", "leave:approve",
    "payroll:read",
    "recruitment:read", "recruitment:write",
    "onboarding:read", "onboarding:write",
    "performance:read",
    "reports:read", "reports:export",
    "compliance:read", "compliance:write",
    "policies:read", "policies:write",
    "helpdesk:read", "helpdesk:write",
    "separation:read", "separation:write",
    "lms:read", "lms:write",
    "workflows:read", "workflows:write", "workflows:approve",
    "notifications:read",
  ],
  MANAGER: [
    "dashboard:read",
    "employees:read",
    "attendance:read",
    "leave:read", "leave:approve",
    "payroll:read",
    "performance:read", "performance:write",
    "tasks:read", "tasks:write",
    "reports:read",
    "expenses:read", "expenses:approve",
    "travel:read", "travel:approve",
    "lms:read","lms:write",
    "helpdesk:read", "helpdesk:write",
    "policies:read",
    "separation:read",
    "workflows:read", "workflows:approve",
    "notifications:read",
  ],
  EMPLOYEE: [
    "dashboard:read",
    "attendance:read", "attendance:write",
    "leave:read", "leave:write",
    "payroll:read",
    "ess:read", "ess:write",
    "helpdesk:read", "helpdesk:write",
    "policies:read",
    "performance:read", "performance:write",
    "lms:read","lms:write",
    "assets:read", "assets:write",
    "tasks:read", "tasks:write",
    "expenses:read", "expenses:write",
    "travel:read", "travel:write",
    "separation:read",
    "workflows:read", "workflows:approve",
    "notifications:read",
  ],
};

// ── Organization master data (mirrors mock/employees.js) ──

const DEPARTMENTS = [
  "Engineering", "Product", "Design", "Analytics",
  "Human Resources", "Finance", "Marketing", "Executive",
];

const LOCATIONS = [
  { name: "New York", address: "200 Fifth Avenue, New York, NY" },
  { name: "Delhi", address: "DLF Cyber City, Gurugram, Haryana" },
  { name: "Austin", address: "400 Congress Ave, Austin, TX" },
  { name: "Seattle", address: "1200 4th Ave, Seattle, WA" },
  { name: "Chicago", address: "230 S LaSalle St, Chicago, IL" },
  { name: "Boston", address: "1 Federal St, Boston, MA" },
  { name: "Miami", address: "600 Brickell Ave, Miami, FL" },
  { name: "London", address: "1 Canada Square, Canary Wharf, London" },
  { name: "Remote", address: null },
];

const DESIGNATIONS = [
  "Senior Software Engineer", "Product Manager", "UX Designer", "DevOps Engineer",
  "Engineering Manager", "Data Analyst", "VP of Product", "HR Specialist",
  "Head of Analytics", "CEO", "HR Manager", "Backend Engineer",
  "Marketing Manager", "Frontend Engineer", "Finance Analyst",
];

interface EmployeeSeed {
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  location: string;
  employmentType: string;
  status: string;
  joinDate: string;
  salary: number;
  state: string;
  country: string;
  managerId: string | null;
  gender: string;
  dob: string;
  role: string;
  isDepartmentHead: boolean;
}

const EMPLOYEES: EmployeeSeed[] = [
  { code: "EMP001", firstName: "Matsya", lastName: "Singh", email: "matsya.singh@company.com", phone: "+1-555-0101", designation: "Senior Software Engineer", department: "Engineering", location: "New York", employmentType: "Full-Time", status: "Active", joinDate: "2021-03-15", salary: 95000, state: "New York", country: "USA", managerId: "EMP005", gender: "Female", dob: "1990-07-22", role: "EMPLOYEE", isDepartmentHead: false },
  { code: "EMP002", firstName: "Vijay", lastName: "Mudgal", email: "vijay.mudgal@company.com", phone: "+91-921-3217-008", designation: "Product Manager", department: "Product", location: "Delhi", employmentType: "Full-Time", status: "Active", joinDate: "2020-08-01", salary: 110000, state: "Delhi", country: "India", managerId: "EMP007", gender: "Male", dob: "1988-02-14", role: "EMPLOYEE", isDepartmentHead: true },
  { code: "EMP003", firstName: "Vikas", lastName: "Agarwal", email: "vikas.agarwal@company.com", phone: "+1-555-0103", designation: "UX Designer", department: "Design", location: "Austin", employmentType: "Full-Time", status: "Active", joinDate: "2022-01-10", salary: 85000, state: "Texas", country: "USA", managerId: "EMP002", gender: "Male", dob: "1993-11-30", role: "EMPLOYEE", isDepartmentHead: false },
  { code: "EMP004", firstName: "Rohan", lastName: "Sharma", email: "rohan.sharma@company.com", phone: "+1-555-0104", designation: "DevOps Engineer", department: "Engineering", location: "Seattle", employmentType: "Full-Time", status: "Active", joinDate: "2019-11-05", salary: 105000, state: "Washington", country: "USA", managerId: "EMP005", gender: "Male", dob: "1987-05-18", role: "EMPLOYEE", isDepartmentHead: false },
  { code: "EMP005", firstName: "Anjali", lastName: "Desai", email: "anjali.desai@company.com", phone: "+1-555-0105", designation: "Engineering Manager", department: "Engineering", location: "New York", employmentType: "Full-Time", status: "Active", joinDate: "2018-06-20", salary: 135000, state: "New York", country: "USA", managerId: "EMP010", gender: "Female", dob: "1985-03-07", role: "MANAGER", isDepartmentHead: true },
  { code: "EMP006", firstName: "Rahul", lastName: "Verma", email: "rahul.verma@company.com", phone: "+1-555-0106", designation: "Data Analyst", department: "Analytics", location: "Chicago", employmentType: "Full-Time", status: "On Leave", joinDate: "2021-09-14", salary: 78000, state: "Illinois", country: "USA", managerId: "EMP009", gender: "Male", dob: "1991-08-25", role: "EMPLOYEE", isDepartmentHead: false },
  { code: "EMP007", firstName: "Sneha", lastName: "Kapoor", email: "sneha.kapoor@company.com", phone: "+1-555-0107", designation: "VP of Product", department: "Product", location: "Delhi", employmentType: "Full-Time", status: "Active", joinDate: "2017-04-01", salary: 160000, state: "Delhi", country: "India", managerId: "EMP010", gender: "Female", dob: "1983-12-01", role: "EMPLOYEE", isDepartmentHead: true },
  { code: "EMP008", firstName: "Amit", lastName: "Patel", email: "amit.patel@company.com", phone: "+1-555-0108", designation: "HR Specialist", department: "Human Resources", location: "New York", employmentType: "Full-Time", status: "Active", joinDate: "2022-06-01", salary: 70000, state: "New York", country: "USA", managerId: "EMP011", gender: "Male", dob: "1994-09-12", role: "EMPLOYEE", isDepartmentHead: false },
  { code: "EMP009", firstName: "Priya", lastName: "Mehta", email: "priya.mehta@company.com", phone: "+1-555-0109", designation: "Head of Analytics", department: "Analytics", location: "Boston", employmentType: "Full-Time", status: "Active", joinDate: "2019-07-22", salary: 125000, state: "Massachusetts", country: "USA", managerId: "EMP010", gender: "Female", dob: "1986-04-18", role: "EMPLOYEE", isDepartmentHead: true },
  { code: "EMP010", firstName: "Robert", lastName: "King", email: "robert.king@company.com", phone: "+1-555-0110", designation: "CEO", department: "Executive", location: "New York", employmentType: "Full-Time", status: "Active", joinDate: "2015-01-01", salary: 300000, state: "New York", country: "USA", managerId: null, gender: "Male", dob: "1975-10-05", role: "ADMIN", isDepartmentHead: false },
  { code: "EMP011", firstName: "Sunita", lastName: "Reddy", email: "sunita.reddy@company.com", phone: "+1-555-0111", designation: "HR Manager", department: "Human Resources", location: "New York", employmentType: "Full-Time", status: "Active", joinDate: "2018-03-12", salary: 95000, state: "New York", country: "USA", managerId: "EMP010", gender: "Female", dob: "1984-06-28", role: "HR", isDepartmentHead: true },
  { code: "EMP012", firstName: "Manish", lastName: "Gupta", email: "manish.gupta@company.com", phone: "+1-555-0112", designation: "Backend Engineer", department: "Engineering", location: "Remote", employmentType: "Full-Time", status: "Active", joinDate: "2023-02-06", salary: 88000, state: "Karnataka", country: "India", managerId: "EMP005", gender: "Male", dob: "1995-01-14", role: "EMPLOYEE", isDepartmentHead: false },
  { code: "EMP013", firstName: "Neha", lastName: "Joshi", email: "neha.joshi@company.com", phone: "+1-555-0113", designation: "Marketing Manager", department: "Marketing", location: "Miami", employmentType: "Full-Time", status: "Active", joinDate: "2020-11-15", salary: 92000, state: "Florida", country: "USA", managerId: "EMP010", gender: "Female", dob: "1989-07-03", role: "EMPLOYEE", isDepartmentHead: false },
  { code: "EMP014", firstName: "Kiran", lastName: "Kumar", email: "kiran.kumar@company.com", phone: "+1-555-0114", designation: "Frontend Engineer", department: "Engineering", location: "Remote", employmentType: "Contract", status: "Active", joinDate: "2023-07-01", salary: 75000, state: "Telangana", country: "India", managerId: "EMP005", gender: "Male", dob: "1996-03-22", role: "EMPLOYEE", isDepartmentHead: false },
  { code: "EMP015", firstName: "Pooja", lastName: "Iyer", email: "pooja.iyer@company.com", phone: "+1-555-0115", designation: "Finance Analyst", department: "Finance", location: "London", employmentType: "Full-Time", status: "Inactive", joinDate: "2021-04-19", salary: 80000, state: "England", country: "UK", managerId: "EMP010", gender: "Female", dob: "1992-11-08", role: "EMPLOYEE", isDepartmentHead: false },
];

const LEAVE_TYPES = [
  { code: "LT01", name: "Casual Leave", maxDays: 6, carryForward: false },
  { code: "LT02", name: "Sick Leave", maxDays: 12, carryForward: false },
  { code: "LT03", name: "Earned Leave", maxDays: 18, carryForward: true },
  { code: "LT04", name: "Privilege Leave", maxDays: 20, carryForward: true },
  { code: "LT05", name: "Emergency Leave", maxDays: 5, carryForward: false },
  { code: "LT06", name: "Comp-Off", maxDays: 10, carryForward: false },
  { code: "LT07", name: "Leave Without Pay", maxDays: 30, carryForward: false },
  { code: "LT08", name: "Maternity Leave", maxDays: 180, carryForward: false },
  { code: "LT09", name: "Paternity Leave", maxDays: 15, carryForward: false },
  { code: "LT10", name: "Adoption Leave", maxDays: 60, carryForward: false },
  { code: "LT11", name: "Bereavement Leave", maxDays: 5, carryForward: false },
  { code: "LT12", name: "Marriage Leave", maxDays: 5, carryForward: false },
  { code: "LT13", name: "Medical Leave", maxDays: 12, carryForward: false },
  { code: "LT14", name: "Hospitalization Leave", maxDays: 14, carryForward: false },
  { code: "LT15", name: "Accident Leave", maxDays: 15, carryForward: false },
  { code: "LT16", name: "Injury Leave", maxDays: 15, carryForward: false },
  { code: "LT17", name: "Family Emergency Leave", maxDays: 10, carryForward: false },
  { code: "LT18", name: "Child Care Leave", maxDays: 10, carryForward: false },
  { code: "LT19", name: "Family Care Leave", maxDays: 10, carryForward: false },
  { code: "LT20", name: "Religious Leave", maxDays: 3, carryForward: false },
  { code: "LT21", name: "Festival Leave", maxDays: 3, carryForward: false },
  { code: "LT22", name: "National Holiday", maxDays: 3, carryForward: false },
  { code: "LT23", name: "Restricted Holiday", maxDays: 3, carryForward: false },
  { code: "LT24", name: "Half-Day Leave", maxDays: 12, carryForward: false },
  { code: "LT25", name: "Short Leave", maxDays: 6, carryForward: false },
  { code: "LT26", name: "On-Duty", maxDays: 4, carryForward: false },
  { code: "LT27", name: "Training Leave", maxDays: 15, carryForward: false },
  { code: "LT28", name: "Exam Leave", maxDays: 10, carryForward: false },
  { code: "LT29", name: "Relocation Leave", maxDays: 4, carryForward: false },
  { code: "LT30", name: "Transfer Joining Leave", maxDays: 6, carryForward: false },
  { code: "LT31", name: "Quarantine/Isolation Leave", maxDays: 10, carryForward: false },
  { code: "LT32", name: "Natural Calamity Leave", maxDays: 10, carryForward: false },
  { code: "LT33", name: "Weather/Heat Leave", maxDays: 5, carryForward: false },
  { code: "LT34", name: "Union/Representative Leave", maxDays: 10, carryForward: false },
  { code: "LT35", name: "Special Leave", maxDays: 15, carryForward: false },
  { code: "LT36", name: "Study Leave", maxDays: 30, carryForward: false },
  { code: "LT37", name: "Volunteer Leave", maxDays: 5, carryForward: false },
  { code: "LT38", name: "Leave for Government Duty", maxDays: 10, carryForward: false },
];

async function main() {
  console.log("🌱 Seeding database…");

  // Wipe in FK-safe order
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.organizationAuditLog.deleteMany();
  await prisma.notificationDelivery.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.notificationTemplate.deleteMany();
  await prisma.policyAcknowledgement.deleteMany();
  await prisma.policyVersion.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.candidateDocument.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.interviewScorecard.deleteMany();
  await prisma.interviewPanel.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.application.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.jobRequisition.deleteMany();
  await prisma.helpdeskComment.deleteMany();
  await prisma.helpdeskTicket.deleteMany();
  await prisma.onboardingChecklistItem.deleteMany();
  await prisma.onboarding.deleteMany();
  await prisma.courseContentProgress.deleteMany();
  await prisma.courseCertificate.deleteMany();
  await prisma.courseQuizAttemptAnswer.deleteMany();
  await prisma.courseQuizAttempt.deleteMany();
  await prisma.courseQuizOption.deleteMany();
  await prisma.courseQuizQuestion.deleteMany();
  await prisma.courseContent.deleteMany();
  await prisma.courseEnrollment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.taskTimeEntry.deleteMany();
  await prisma.taskHistory.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskMilestone.deleteMany();
  await prisma.taskProjectMember.deleteMany();
  await prisma.taskProject.deleteMany();
  await prisma.assetHistory.deleteMany();
  await prisma.assetRequest.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.alumni.deleteMany();
  await prisma.separationSettlement.deleteMany();
  await prisma.exitInterview.deleteMany();
  await prisma.separationClearance.deleteMany();
  await prisma.separation.deleteMany();
  await prisma.complianceActivity.deleteMany();
  await prisma.complianceRetentionRecord.deleteMany();
  await prisma.complianceCase.deleteMany();
  await prisma.complianceObligation.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.costCenter.deleteMany();
  await prisma.workflowEvent.deleteMany();
  await prisma.workflowInstanceStep.deleteMany();
  await prisma.workflowInstance.deleteMany();
  await prisma.workflowDefinitionStep.deleteMany();
  await prisma.workflowDefinition.deleteMany();
  await prisma.performanceReviewItem.deleteMany();
  await prisma.performanceReview.deleteMany();
  await prisma.performanceKeyResult.deleteMany();
  await prisma.performanceGoal.deleteMany();
  await prisma.performanceFeedback.deleteMany();
  await prisma.performanceOneOnOneAgenda.deleteMany();
  await prisma.performanceOneOnOneAction.deleteMany();
  await prisma.performanceOneOnOne.deleteMany();
  await prisma.performanceRatingHistory.deleteMany();
  await prisma.performanceReviewCycle.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.salaryStructure.deleteMany();
  await prisma.attendancePunch.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.attendanceShift.deleteMany();
  await prisma.designation.deleteMany();
  await prisma.location.deleteMany();
  await prisma.department.deleteMany();
  await prisma.businessUnit.deleteMany();
  await prisma.company.deleteMany();

  // Company
  const company = await prisma.company.create({
    data: {
      name: "Proteccio Technologies Pvt. Ltd.",
      registrationNumber: "U72900TG2023PTC123456",
      country: "India",
      currency: "INR",
      weeklyOffDays: [0, 6], // Sunday + Saturday -> Mon-Fri working week
    },
  });

  // Business Unit
  const bu = await prisma.businessUnit.create({
    data: { companyId: company.id, name: "Core Business" },
  });

  // Departments / Locations / Designations (demo only — manage via Org Management)
  const deptByName = new Map<string, string>();
  const locByName = new Map<string, string>();
  const desigByTitle = new Map<string, string>();
  if (SEED_DEMO_DATA) {
    for (const name of DEPARTMENTS) {
      const d = await prisma.department.create({ data: { companyId: company.id, businessUnitId: bu.id, name } });
      deptByName.set(name, d.id);
    }

    for (const l of LOCATIONS) {
      const loc = await prisma.location.create({ data: { companyId: company.id, name: l.name, address: l.address } });
      locByName.set(l.name, loc.id);
    }

    for (const title of DESIGNATIONS) {
      const d = await prisma.designation.create({ data: { title, grade: title === "CEO" ? "L1" : "L2" } });
      desigByTitle.set(title, d.id);
    }
  }

  // Roles + Permissions
  const roles: Record<string, string> = {};
  for (const name of ["ADMIN", "HR", "MANAGER", "EMPLOYEE"]) {
    const role = await prisma.role.create({ data: { name, description: `${name} role` } });
    roles[name] = role.id;
  }

  const permByCode = new Map<string, string>();
  for (const code of PERMISSIONS) {
    const p = await prisma.permission.create({ data: { code, description: code } });
    permByCode.set(code, p.id);
  }

  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    for (const code of perms) {
      const permId = permByCode.get(code);
      if (permId) {
        await prisma.rolePermission.create({ data: { roleId: roles[roleName], permissionId: permId } });
      }
    }
  }

  // Bootstrap admin account (the single login when demo data is disabled)
  const adminUser = await prisma.user.create({
    data: { email: "admin@proteccio.com", passwordHash: await hashPassword("Admin@123"), roleId: roles["ADMIN"] },
  });
  void adminUser;

  // Leave types
  const leaveTypeByCode = new Map<string, string>();
  for (const lt of LEAVE_TYPES) {
    const t = await prisma.leaveType.create({
      data: { name: lt.name, code: lt.code, defaultAnnualDays: lt.maxDays, carryForward: lt.carryForward },
    });
    leaveTypeByCode.set(lt.code, t.id);
  }

  // Holiday calendar (public + company holidays for FY 2026)
  const HOLIDAYS_2026: Array<{ name: string; date: string; country?: string; state?: string; type?: string }> = [
    { name: "Makar Sankranti", date: "2026-01-14", country: "India", type: "National" },
    { name: "Republic Day", date: "2026-01-26", country: "India", type: "National" },
    { name: "Holi", date: "2026-03-04", country: "India", type: "National" },
    { name: "Good Friday", date: "2026-04-03", country: "India", type: "Public" },
    { name: "Eid al-Fitr", date: "2026-03-21", country: "India", type: "Public" },
    { name: "Dr. Ambedkar Jayanti", date: "2026-04-14", country: "India", type: "National" },
    { name: "May Day", date: "2026-05-01", country: "India", type: "National" },
    { name: "Independence Day", date: "2026-08-15", country: "India", type: "National" },
    { name: "Gandhi Jayanti", date: "2026-10-02", country: "India", type: "National" },
    { name: "Dussehra", date: "2026-10-20", country: "India", type: "National" },
    { name: "Diwali", date: "2026-11-08", country: "India", type: "National" },
    { name: "Christmas", date: "2026-12-25", country: "India", type: "National" },
    { name: "Karaga Jayanthi", date: "2026-04-26", country: "India", state: "Karnataka", type: "State" },
  ];
  for (const h of HOLIDAYS_2026) {
    await prisma.holiday.create({
      data: {
        name: h.name,
        date: new Date(`${h.date}T00:00:00.000Z`),
        country: h.country ?? "India",
        state: h.state ?? null,
        type: h.type ?? "Public",
        isActive: true,
      },
    });
  }

  // Attendance shift
  const shift = await prisma.attendanceShift.create({
    data: { name: "General Shift", startTime: new Date("1970-01-01T09:00:00"), endTime: new Date("1970-01-01T18:00:00") },
  });
  void shift;

  // ── Static demo records (only when SEED_DEMO_DATA=true; the rest of this
  //    function seeds demo employees and everything dependent on them) ──
  if (SEED_DEMO_DATA) {
    // Users + Employees
    const empByCode = new Map<string, string>(); // code -> employee PK
    const passwordHash = await hashPassword("Password@123");

  for (const e of EMPLOYEES) {
    const user = await prisma.user.create({
      data: { email: e.email.toLowerCase(), passwordHash, roleId: roles[e.role] },
    });
    const emp = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: e.code,
        firstName: e.firstName,
        lastName: e.lastName,
        dateOfBirth: new Date(`${e.dob}T00:00:00Z`),
        gender: e.gender,
        personalEmail: e.email.toLowerCase(),
        personalMobile: e.phone,
        address: `${e.location}, ${e.department}`,
        departmentId: deptByName.get(e.department),
        designationId: desigByTitle.get(e.designation),
        locationId: locByName.get(e.location),
        dateOfJoining: new Date(`${e.joinDate}T00:00:00Z`),
        employmentType: e.employmentType,
        status: e.status,
        isDepartmentHead: e.isDepartmentHead,
        state: e.state,
        country: e.country,
        annualSalary: e.salary,
      },
    });
    empByCode.set(e.code, emp.id);
  }

  const seededUsers = await prisma.user.findMany();
  const userByEmail = new Map(seededUsers.map((u) => [u.email, u.id]));

  // Assign managers (self-referencing FK)
  for (const e of EMPLOYEES) {
    if (e.managerId) {
      const managerId = empByCode.get(e.managerId);
      if (managerId) {
        await prisma.employee.update({
          where: { id: empByCode.get(e.code)! },
          data: { reportingManagerId: managerId },
        });
      }
    }
  }

  // Salary structures: NOT seeded — the payroll module starts empty and only
  // shows amounts once an admin configures a salary structure per employee.
  // (Previously this block synthesized monthly components from annual salary.)
  const empPKByCode = empByCode;

  // Leave balances (2026) — mirror mock/leave.js for EMP001, defaults for the rest
  const year = 2026;
  const mockBalances: Record<string, Record<string, { total: number; used: number }>> = {
    EMP001: {
      LT01: { total: 18, used: 4 },
      LT02: { total: 12, used: 2 },
      LT03: { total: 6, used: 1 },
      LT04: { total: 3, used: 0 },
    },
  };
  for (const e of EMPLOYEES) {
    const balances = mockBalances[e.code] ?? { LT01: { total: 18, used: 1 }, LT02: { total: 12, used: 0 }, LT03: { total: 6, used: 0 } };
    for (const [ltCode, b] of Object.entries(balances)) {
      await prisma.leaveBalance.create({
        data: { employeeId: empPKByCode.get(e.code)!, leaveTypeId: leaveTypeByCode.get(ltCode)!, year, totalDays: b.total, usedDays: b.used },
      });
    }
    // Leave Without Pay has no paid entitlement; used for payroll deduction demo.
    await prisma.leaveBalance.create({
      data: { employeeId: empPKByCode.get(e.code)!, leaveTypeId: leaveTypeByCode.get("LT07")!, year, totalDays: 30, usedDays: 0 },
    });
  }

  // Leave requests (mirror mock/leave.js LR001–LR006) — only Pending/Rejected
  // rows are seeded; APPROVED requests are omitted so they never feed payroll
  // reconciliation's paid-leave days with static demo data.
  const requests = [
    { id: "LR001", emp: "EMP001", type: "LT01", start: "2026-07-28", end: "2026-07-30", reason: "Personal vacation", status: "Pending", approver: "EMP005", applied: "2026-07-20", approvedOn: null, comments: "" },
    { id: "LR004", emp: "EMP002", type: "LT01", start: "2026-07-27", end: "2026-07-27", reason: "Family event", status: "Pending", approver: "EMP007", applied: "2026-07-19", approvedOn: null, comments: "" },
    { id: "LR006", emp: "EMP003", type: "LT01", start: "2026-07-22", end: "2026-07-23", reason: "Travel", status: "Rejected", approver: "EMP002", applied: "2026-07-18", approvedOn: "2026-07-19", comments: "Sprint deadline. Please reschedule." },
  ];
  for (const r of requests) {
    await prisma.leaveRequest.create({
      data: {
        employeeId: empPKByCode.get(r.emp)!,
        leaveTypeId: leaveTypeByCode.get(r.type)!,
        startDate: new Date(`${r.start}T00:00:00Z`),
        endDate: new Date(`${r.end}T00:00:00Z`),
        reason: r.reason,
        status: r.status,
        approvedBy: r.approver ? empPKByCode.get(r.approver) ?? null : null,
        approvedOn: r.approvedOn ? new Date(`${r.approvedOn}T00:00:00Z`) : null,
        comments: r.comments,
        createdAt: new Date(`${r.applied}T00:00:00Z`),
      },
    });
  }

  // Attendance: NOT seeded — punches are only created via attendance uploads
  // or manual check-in/out, so payroll reconciliation starts from a clean
  // slate instead of a static demo month. (Previously seeded 17 Web-method
  // punches for EMP001 in July 2026 that survived "clear uploaded data".)
  const emp001 = empPKByCode.get("EMP001")!;

  // Workflow Engine definitions (mirror mock/workflowEngine.js)
  const workflowDefs = [
    {
      requestType: "Leave Request — Extended",
      steps: [
        { name: "Manager Approval", approverRule: "Direct Reporting Manager", slaHours: 24, parallelGroup: null, condition: null },
        { name: "Second-Level Approval", approverRule: "Department Head", slaHours: 24, parallelGroup: null, condition: { field: "duration_days", operator: ">", value: 5 } },
      ],
    },
    {
      requestType: "Job Requisition",
      steps: [
        { name: "Hiring Manager Sign-off", approverRule: "Direct Reporting Manager", slaHours: 48, parallelGroup: "A", condition: null },
        { name: "Finance Sign-off", approverRule: "Named Role: Finance", slaHours: 48, parallelGroup: "A", condition: null },
      ],
    },
    {
      requestType: "Salary Change",
      steps: [
        { name: "Manager Approval", approverRule: "Direct Reporting Manager", slaHours: 24, parallelGroup: null, condition: null },
        { name: "Finance Approval (over band only)", approverRule: "Named Role: Finance", slaHours: 24, parallelGroup: null, condition: { field: "amount", operator: ">", value: 2000000 } },
      ],
    },
  ];
  for (const [i, def] of workflowDefs.entries()) {
    await prisma.workflowDefinition.create({
      data: {
        requestType: def.requestType,
        status: "Active",
        createdAt: new Date(`2026-0${i + 1}-${i === 0 ? "10" : i === 1 ? "01" : "15"}T00:00:00Z`),
        steps: {
          create: def.steps.map((s, idx) => ({
            name: s.name,
            approverRule: s.approverRule,
            slaHours: s.slaHours,
            parallelGroup: s.parallelGroup,
            condition: s.condition ? (s.condition as Prisma.InputJsonValue) : undefined,
            orderIndex: idx,
          })),
        },
      },
    });
  }

  // Performance Management seed data (Module 10)
  const q3Cycle = await prisma.performanceReviewCycle.create({
    data: {
      name: "Q3 2026 Performance Review",
      cycleCode: "Q3-2026",
      phase: "Goal Setting",
      goalSettingStart: new Date("2026-07-01T00:00:00Z"),
      goalSettingEnd: new Date("2026-07-10T00:00:00Z"),
      selfAssessmentStart: new Date("2026-09-15T00:00:00Z"),
      selfAssessmentEnd: new Date("2026-09-22T00:00:00Z"),
      managerReviewStart: new Date("2026-09-23T00:00:00Z"),
      managerReviewEnd: new Date("2026-09-30T00:00:00Z"),
      is360Enabled: true,
      isActive: true,
    },
  });

  const emp004 = empPKByCode.get("EMP004")!;
  const emp005 = empPKByCode.get("EMP005")!;

  const g1 = await prisma.performanceGoal.create({
    data: {
      employeeId: emp001,
      reviewCycleId: q3Cycle.id,
      title: "Improve API response times across core services",
      category: "Technical",
      status: "Locked",
      createdAt: new Date("2026-07-02T00:00:00Z"),
      keyResults: {
        create: [
          { text: "Reduce p95 latency on /employees endpoint to <200ms", progress: 70 },
          { text: "Add caching layer for payroll queries", progress: 40 },
        ],
      },
    },
  });

  const g2 = await prisma.performanceGoal.create({
    data: {
      employeeId: emp001,
      reviewCycleId: q3Cycle.id,
      title: "Mentor two junior engineers",
      category: "Leadership",
      status: "Locked",
      createdAt: new Date("2026-07-02T00:00:00Z"),
      keyResults: {
        create: [
          { text: "Weekly 1:1s with 2 mentees", progress: 85 },
          { text: "Pair on at least 4 features together", progress: 50 },
        ],
      },
    },
  });

  await prisma.performanceGoal.create({
    data: {
      employeeId: emp001,
      reviewCycleId: q3Cycle.id,
      title: "Own the migration to the new deployment pipeline",
      category: "Technical",
      status: "Pending Approval",
      createdAt: new Date("2026-07-20T00:00:00Z"),
      keyResults: {
        create: [
          { text: "Draft migration plan and get manager sign-off", progress: 100 },
          { text: "Migrate 3 services to the new pipeline", progress: 20 },
        ],
      },
    },
  });

  // Self-assessment for EMP001
  const selfRev = await prisma.performanceReview.create({
    data: {
      employeeId: emp001,
      reviewerId: emp001,
      reviewCycleId: q3Cycle.id,
      reviewType: "Self",
      status: "Submitted",
      submittedAt: new Date("2026-09-20T00:00:00Z"),
      items: {
        create: [
          { goalId: g1.id, rating: 4, comments: "Made strong progress on latency work; caching layer is in progress and on track." },
          { goalId: g2.id, rating: 5, comments: "Both mentees shipped their first independent features this quarter." },
        ],
      },
    },
  });

  // Feedback for EMP001
  await prisma.performanceFeedback.createMany({
    data: [
      {
        fromEmployeeId: emp005,
        toEmployeeId: emp001,
        type: "Praise",
        goalTag: "Improve API response times across core services",
        message: "Great debugging work isolating the payroll query bottleneck — saved the team real time this sprint.",
        isPrivate: false,
        createdAt: new Date("2026-07-18T00:00:00Z"),
      },
      {
        fromEmployeeId: emp004,
        toEmployeeId: emp001,
        type: "Constructive",
        goalTag: null,
        message: "Would help to get PR descriptions a bit more detailed for the deployment pipeline changes.",
        isPrivate: false,
        createdAt: new Date("2026-07-22T00:00:00Z"),
      },
      {
        fromEmployeeId: emp001,
        toEmployeeId: emp005,
        type: "General",
        goalTag: null,
        message: "Thanks for the quick unblock on staging environment access yesterday.",
        isPrivate: false,
        createdAt: new Date("2026-07-25T00:00:00Z"),
      },
    ],
  });

  // 1-on-1 notes for EMP001
  await prisma.performanceOneOnOne.create({
    data: {
      employeeId: emp001,
      managerId: emp005,
      date: new Date("2026-07-15T00:00:00Z"),
      notes: "Discussed the deployment migration timeline and agreed to prioritize service A and B first.",
      agendas: {
        create: [
          { itemText: "Migration plan review", orderIndex: 0 },
          { itemText: "Career growth check-in", orderIndex: 1 },
        ],
      },
      actionItems: {
        create: [
          { text: "Share migration doc with platform team", done: true },
          { text: "Look into staff-engineer track requirements", done: false },
        ],
      },
    },
  });

  await prisma.performanceOneOnOne.create({
    data: {
      employeeId: emp001,
      managerId: emp005,
      date: new Date("2026-07-01T00:00:00Z"),
      notes: "Set final Q3 goals; agreed on mentoring two junior engineers this quarter.",
      agendas: {
        create: [
          { itemText: "Q3 goal setting", orderIndex: 0 },
          { itemText: "Mentee pairing", orderIndex: 1 },
        ],
      },
      actionItems: {
        create: [
          { text: "Finalize Q3 OKRs", done: true },
        ],
      },
    },
  });

  // Ratings History
  await prisma.performanceRatingHistory.createMany({
    data: [
      {
        employeeId: emp001,
        reviewCycleId: q3Cycle.id,
        cycleName: "Q1 2026",
        selfRating: 4,
        originalManagerRating: 4,
        finalRating: 4,
        calibrationAdjusted: false,
        increment: "8%",
        promotion: false,
        appraisalLetterUrl: "#",
        releasedOn: new Date("2026-04-15T00:00:00Z"),
      },
      {
        employeeId: emp001,
        reviewCycleId: q3Cycle.id,
        cycleName: "Q4 2025",
        selfRating: 5,
        originalManagerRating: 3,
        finalRating: 4,
        calibrationAdjusted: true,
        increment: "6%",
        promotion: false,
        appraisalLetterUrl: "#",
        releasedOn: new Date("2026-01-15T00:00:00Z"),
      },
    ],
  });

  // ═══ Organization module (cost centers, grades, audit log) ═══
  for (const g of [
    { code: "L1", name: "Executive", sortOrder: 1 },
    { code: "L2", name: "Leadership", sortOrder: 2 },
    { code: "L3", name: "Senior Professional", sortOrder: 3 },
    { code: "L4", name: "Professional", sortOrder: 4 },
    { code: "L5", name: "Associate", sortOrder: 5 },
  ]) {
    await prisma.grade.create({ data: g });
  }

  const costCenterByDept: Record<string, string> = {};
  for (const cc of [
    { code: "CC-ENG", name: "Engineering" },
    { code: "CC-PROD", name: "Product" },
    { code: "CC-DES", name: "Design" },
    { code: "CC-ANL", name: "Analytics" },
    { code: "CC-HR", name: "Human Resources" },
    { code: "CC-FIN", name: "Finance" },
    { code: "CC-MKT", name: "Marketing" },
    { code: "CC-EXE", name: "Executive" },
  ]) {
    const row = await prisma.costCenter.create({ data: { code: cc.code, name: cc.name } });
    costCenterByDept[cc.name] = row.id;
  }
  for (const dep of DEPARTMENTS) {
    const ccId = costCenterByDept[dep];
    const depId = deptByName.get(dep);
    if (ccId && depId) {
      await prisma.department.update({
        where: { id: depId },
        data: { costCenters: { connect: { id: ccId } } },
      });
    }
  }

  const adminEmpId = empPKByCode.get("EMP010")!;
  const hrEmpId = empPKByCode.get("EMP011")!;
  const engManagerId = empPKByCode.get("EMP005")!;
  await prisma.organizationAuditLog.createMany({
    data: [
      { entityType: "Department", entityId: deptByName.get("Engineering")!, field: "name", oldValue: null, newValue: "Engineering", actorId: adminEmpId, createdAt: new Date("2026-01-15T00:00:00Z") },
      { entityType: "Department", entityId: deptByName.get("Analytics")!, field: "head", oldValue: null, newValue: "EMP009", actorId: adminEmpId, createdAt: new Date("2026-02-01T00:00:00Z") },
      { entityType: "Company", entityId: company.id, field: "currency", oldValue: "INR", newValue: "INR", actorId: adminEmpId, createdAt: new Date("2026-03-10T00:00:00Z") },
    ],
  });

  // ═══ Compliance Management ═══
  const obligations = [
    { title: "Income Tax TDS Returns (Q2)", category: "Tax", dueDate: "2026-10-15", owner: "Finance Team", recurrence: "Quarterly", status: "Pending" },
    { title: "GST Monthly Return (GSTR-3B)", category: "Tax", dueDate: "2026-10-20", owner: "Finance Team", recurrence: "Monthly", status: "Pending" },
    { title: "EPF Employer Contribution Filing", category: "Statutory", dueDate: "2026-10-25", owner: "HR & Payroll", recurrence: "Monthly", status: "Pending" },
    { title: "ESI Monthly Contribution Filing", category: "Statutory", dueDate: "2026-10-25", owner: "HR & Payroll", recurrence: "Monthly", status: "Pending" },
    { title: "Annual Shops & Establishment Renewal", category: "Regulatory", dueDate: "2026-12-31", owner: "Legal & Compliance", recurrence: "Annual", status: "Pending" },
    { title: "Data Protection Registration (DPDP Act)", category: "Privacy", dueDate: "2026-08-30", owner: "Legal & Compliance", recurrence: "One-off", status: "Filed" },
  ];
  for (const o of obligations) {
    await prisma.complianceObligation.create({
      data: {
        title: o.title,
        category: o.category,
        dueDate: new Date(`${o.dueDate}T00:00:00Z`),
        owner: o.owner,
        recurrence: o.recurrence,
        status: o.status,
        filedAt: o.status === "Filed" ? new Date("2026-08-25T00:00:00Z") : null,
        filedByUserId: o.status === "Filed" ? userByEmail.get("sunita.reddy@company.com") : null,
        createdByUserId: userByEmail.get("sunita.reddy@company.com"),
      },
    });
  }

  const complianceCases = [
    { caseNumber: "CC-2026-001", category: "Data Privacy", status: "Under Investigation", summary: "Internal review of an alleged unauthorized export of customer data by a former contractor.", investigatorEmployeeIds: [empPKByCode.get("EMP011"), empPKByCode.get("EMP009")], openedAt: "2026-07-05", retentionUntil: "2028-07-05", legalHold: true, legalHoldReason: "Pending forensic review", legalHoldBy: "Legal & Compliance" },
    { caseNumber: "CC-2026-002", category: "Harassment", status: "Closed", summary: "Informal complaint about workplace conduct; resolved through mediation with no findings of misconduct.", investigatorEmployeeIds: [empPKByCode.get("EMP011")], openedAt: "2026-05-20", closedAt: "2026-06-12", retentionUntil: "2028-06-12", legalHold: false },
  ];
  for (const c of complianceCases) {
    await prisma.complianceCase.create({
      data: {
        caseNumber: c.caseNumber,
        category: c.category,
        status: c.status,
        summary: c.summary,
        investigatorEmployeeIds: c.investigatorEmployeeIds as Prisma.InputJsonValue,
        openedAt: new Date(`${c.openedAt}T00:00:00Z`),
        closedAt: c.closedAt ? new Date(`${c.closedAt}T00:00:00Z`) : null,
        retentionUntil: new Date(`${c.retentionUntil}T00:00:00Z`),
        legalHold: c.legalHold,
        legalHoldReason: c.legalHoldReason,
        legalHoldBy: c.legalHoldBy,
      },
    });
  }

  await prisma.complianceRetentionRecord.createMany({
    data: [
      { sourceModule: "Payroll", recordType: "Payslip", label: "Payslips (FY 2025-26)", retentionExpiresAt: new Date("2031-03-31T00:00:00Z"), classification: "Recognized", legalHold: false, jobStatus: null },
      { sourceModule: "Attendance", recordType: "Attendance Punch", label: "Attendance punches for 2026", retentionExpiresAt: new Date("2031-12-31T00:00:00Z"), classification: "Recognized", legalHold: false, jobStatus: null },
      { sourceModule: "Recruitment", recordType: "Candidate Resume", label: "Resumes of rejected candidates 2026", retentionExpiresAt: new Date("2028-06-30T00:00:00Z"), classification: "Recognized", legalHold: true, legalHoldReason: "CC-2026-001", legalHoldBy: "Legal & Compliance", jobStatus: "Retained" },
      { sourceModule: "Identity", recordType: "Access Log", label: "VPN access logs", retentionExpiresAt: new Date("2027-07-01T00:00:00Z"), classification: "Unrecognized", legalHold: false, jobStatus: null },
    ],
  });

  await prisma.complianceActivity.createMany({
    data: [
      { actorName: "Sunita Reddy", action: "created", category: "Obligation", details: "Created 'Data Protection Registration (DPDP Act)' and marked as filed.", severity: "info", createdAt: new Date("2026-08-25T00:00:00Z") },
      { actorName: "Legal & Compliance", action: "flag", category: "Case", details: "Legal hold applied on candidate resumes due to CC-2026-001.", severity: "warning", createdAt: new Date("2026-07-06T00:00:00Z") },
      { actorName: "Priya Mehta", action: "purged", category: "Retention", details: "Purged duplicate entry logs older than 12 months.", severity: "info", createdAt: new Date("2026-07-20T00:00:00Z") },
    ],
  });

  // ═══ Policy Management ═══
  const policyDefs = [
    { title: "Code of Conduct & Ethics", category: "Ethics", scope: "Company-wide", mandatory: true, reviewCycleMonths: 12, status: "Published", nextReviewDate: "2027-01-15", summary: "Sets expectations for professional behaviour, conflicts of interest, and confidentiality." },
    { title: "Information Security Policy", category: "Security", scope: "Company-wide", mandatory: true, reviewCycleMonths: 6, status: "Published", nextReviewDate: "2027-01-10", summary: "Defines acceptable use of company systems, data classification, and incident reporting." },
    { title: "Parental Leave Policy", category: "Leave", scope: "Company-wide", mandatory: true, reviewCycleMonths: 24, status: "Published", nextReviewDate: "2028-08-01", summary: "Outlines maternity, paternity, and adoption leave entitlements." },
    { title: "Remote & Hybrid Work Policy", category: "Workplace", scope: "Company-wide", mandatory: false, reviewCycleMonths: 12, status: "Draft", nextReviewDate: "2026-12-01", summary: "Guidelines for remote, hybrid, and in-office work arrangements." },
  ];
  const policyByTitle = new Map<string, string>();
  const publishedPolicies: string[] = [];
  for (const p of policyDefs) {
    const policy = await prisma.policy.create({
      data: {
        title: p.title,
        category: p.category,
        scope: p.scope,
        mandatoryAcknowledgement: p.mandatory,
        reviewCycleMonths: p.reviewCycleMonths,
        status: p.status,
        nextReviewDate: new Date(`${p.nextReviewDate}T00:00:00Z`),
        createdByUserId: userByEmail.get("robert.king@company.com") ?? userByEmail.get("sunita.reddy@company.com"),
        versions: {
          create: [{
            versionNumber: 1,
            effectiveDate: new Date("2026-01-01T00:00:00Z"),
            acknowledgementDeadlineDays: 30,
            requiresReacknowledgement: true,
            summary: p.summary,
            createdByName: "Robert King",
            publishedAt: new Date("2026-01-01T00:00:00Z"),
          }],
        },
      },
      include: { versions: true },
    });
    policyByTitle.set(p.title, policy.id);
    if (p.status === "Published") publishedPolicies.push(policy.versions[0].id);
  }
  for (const emp of EMPLOYEES) {
    if (emp.status !== "Active") continue;
    const empId = empPKByCode.get(emp.code)!;
    for (const versionId of publishedPolicies) {
      await prisma.policyAcknowledgement.create({
        data: { versionId, employeeId: empId, acknowledgedAt: new Date("2026-01-05T00:00:00Z"), device: "Web Application" },
      });
    }
  }

  // ═══ Recruitment / ATS ═══
  const requisitionSpecs = [
    { code: "REQ-2026-001", title: "Senior Software Engineer", dep: "Engineering", des: "Senior Software Engineer", grade: "L3", openings: 2, salaryMin: 90000, salaryMax: 130000, justification: "Backfill for two open headcounts as the platform team expands.", status: "Open", raisedBy: engManagerId, loc: "New York" },
    { code: "REQ-2026-002", title: "Product Designer", dep: "Design", des: "UX Designer", grade: "L4", openings: 1, salaryMin: 80000, salaryMax: 110000, justification: "New design seat to support the mobile app initiative.", status: "Open", raisedBy: empPKByCode.get("EMP002")!, loc: "Austin" },
    { code: "REQ-2026-003", title: "Data Analyst", dep: "Analytics", des: "Data Analyst", grade: "L4", openings: 1, salaryMin: 70000, salaryMax: 95000, justification: "Additional analytics capacity for the self-serve reporting project.", status: "Open", raisedBy: empPKByCode.get("EMP009")!, loc: "Chicago" },
    { code: "REQ-2026-004", title: "Frontend Engineer", dep: "Engineering", des: "Frontend Engineer", grade: "L4", openings: 1, salaryMin: 75000, salaryMax: 100000, justification: "Planned hire for the design systems workstream.", status: "Draft", raisedBy: engManagerId, loc: "Remote" },
  ];
  const reqByCode = new Map<string, string>();
  for (const r of requisitionSpecs) {
    const req = await prisma.jobRequisition.create({
      data: {
        requisitionCode: r.code,
        title: r.title,
        departmentId: deptByName.get(r.dep),
        designationId: desigByTitle.get(r.des),
        grade: r.grade,
        openings: r.openings,
        salaryMin: r.salaryMin,
        salaryMax: r.salaryMax,
        justification: r.justification,
        status: r.status,
        raisedBy: r.raisedBy,
        locationId: locByName.get(r.loc),
      },
    });
    reqByCode.set(r.code, req.id);
  }

  const candidateSpecs = [
    { candidateCode: "CAN-001", firstName: "Aditi", lastName: "Rao", email: "aditi.rao@example.com", phone: "+91-98100-11111", resumeSummary: "5 years building scalable Node.js APIs. Ex-Flipkart.", appliedTo: "REQ-2026-001", appliedOn: "2026-08-10", stage: "Screening", rating: 4, notes: "Strong systems design background.", approvalStatus: "HR Review" },
    { candidateCode: "CAN-002", firstName: "Brian", lastName: "O'Neil", email: "brian.oneil@example.com", phone: "+1-555-2002", resumeSummary: "Backend engineer with Go and Postgres experience.", appliedTo: "REQ-2026-001", appliedOn: "2026-08-12", stage: "Interview", rating: 5, notes: "Passed first technical round.", approvalStatus: "First Approved" },
    { candidateCode: "CAN-003", firstName: "Sofia", lastName: "Martinez", email: "sofia.martinez@example.com", phone: "+1-555-2003", resumeSummary: "Product designer with fintech portfolio.", appliedTo: "REQ-2026-002", appliedOn: "2026-08-14", stage: "Applied", rating: 0, notes: "", approvalStatus: "HR Review" },
    { candidateCode: "CAN-004", firstName: "Daniel", lastName: "Kim", email: "daniel.kim@example.com", phone: "+1-555-2004", resumeSummary: "Data analyst, SQL + Python, 3 years at a logistics firm.", appliedTo: "REQ-2026-003", appliedOn: "2026-08-18", stage: "Offer", rating: 4, notes: "Compensation agreed.", approvalStatus: "Second Approved" },
    { candidateCode: "CAN-005", firstName: "Meera", lastName: "Nair", email: "meera.nair@example.com", phone: "+91-98200-22222", resumeSummary: "Senior frontend engineer, React specialist.", appliedTo: "REQ-2026-004", appliedOn: "2026-08-20", stage: "Screening", rating: 3, notes: "", approvalStatus: "HR Review" },
    { candidateCode: "CAN-006", firstName: "Tom", lastName: "Baker", email: "tom.baker@example.com", phone: "+1-555-2006", resumeSummary: "Backend generalist; rejected after first round.", appliedTo: "REQ-2026-001", appliedOn: "2026-07-28", stage: "Rejected", rating: 2, notes: "Below bar on concurrency.", approvalStatus: "Rejected" },
  ];
  const appByCandidate = new Map<string, string>();
  for (const c of candidateSpecs) {
    const cand = await prisma.candidate.create({
      data: {
        candidateCode: c.candidateCode,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        resumeSummary: c.resumeSummary,
      },
    });
    const app = await prisma.application.create({
      data: {
        candidateId: cand.id,
        requisitionId: reqByCode.get(c.appliedTo)!,
        stage: c.stage,
        rating: c.rating,
        notes: c.notes,
        approvalStatus: c.approvalStatus,
        appliedOn: new Date(`${c.appliedOn}T00:00:00Z`),
      },
    });
    appByCandidate.set(c.candidateCode, app.id);
  }

  const interviewSpecs = [
    { cand: "CAN-002", round: "Technical Round 1", scheduledAt: "2026-08-25T10:00:00Z", status: "Completed", interviewers: [empPKByCode.get("EMP001"), empPKByCode.get("EMP004")], scorecards: [{ interviewer: "EMP001", rating: 5, notes: "Excellent API design.", submitted: true }, { interviewer: "EMP004", rating: 4, notes: "Solid deployment knowledge.", submitted: true }] },
    { cand: "CAN-002", round: "Hiring Manager", scheduledAt: "2026-08-28T14:00:00Z", status: "Scheduled", interviewers: [empPKByCode.get("EMP005"), empPKByCode.get("EMP010")], scorecards: [] },
    { cand: "CAN-004", round: "Analytical Case Study", scheduledAt: "2026-08-22T09:00:00Z", status: "Completed", interviewers: [empPKByCode.get("EMP009")], scorecards: [{ interviewer: "EMP009", rating: 4, notes: "Clear communication.", submitted: true }] },
  ];
  for (const iv of interviewSpecs) {
    const appId = appByCandidate.get(iv.cand)!;
    const interview = await prisma.interview.create({
      data: {
        applicationId: appId,
        round: iv.round,
        scheduledAt: new Date(iv.scheduledAt),
        status: iv.status,
      },
    });
    for (const interviewerId of iv.interviewers) {
      await prisma.interviewPanel.create({ data: { interviewId: interview.id, interviewerId } });
    }
    for (const sc of iv.scorecards) {
      await prisma.interviewScorecard.create({
        data: { interviewId: interview.id, interviewerId: sc.interviewer === "EMP001" ? emp001 : sc.interviewer === "EMP004" ? empPKByCode.get("EMP004")! : sc.interviewer === "EMP009" ? empPKByCode.get("EMP009")! : empPKByCode.get("EMP005")!, rating: sc.rating, notes: sc.notes, submitted: sc.submitted, submittedAt: new Date("2026-08-26T00:00:00Z") },
      });
    }
  }

  const offerAppId = appByCandidate.get("CAN-004")!;
  await prisma.offer.create({
    data: {
      applicationId: offerAppId,
      proposedSalary: 92000,
      status: "Sent",
      consentOnFile: true,
      sentAt: new Date("2026-08-30T00:00:00Z"),
      decisionAt: new Date("2026-09-02T00:00:00Z"),
      joiningDate: new Date("2026-10-05T00:00:00Z"),
    },
  });

  await prisma.candidateDocument.createMany({
    data: [
      { applicationId: appByCandidate.get("CAN-002")!, documentType: "Resume", fileName: "brian-oneil-resume.pdf", fileUrl: "/uploads/candidates/brian-oneil-resume.pdf", status: "Verified", verifiedBy: empPKByCode.get("EMP011"), verifiedAt: new Date("2026-08-13T00:00:00Z"), createdAt: new Date("2026-08-13T00:00:00Z") },
      { applicationId: appByCandidate.get("CAN-002")!, documentType: "Degree Certificate", fileName: "brian-degree.pdf", fileUrl: "/uploads/candidates/brian-degree.pdf", status: "Pending Verification", createdAt: new Date("2026-08-15T00:00:00Z") },
      { applicationId: appByCandidate.get("CAN-004")!, documentType: "Resume", fileName: "daniel-kim-resume.pdf", fileUrl: "/uploads/candidates/daniel-kim-resume.pdf", status: "Pending Verification", createdAt: new Date("2026-08-19T00:00:00Z") },
    ],
  });

  // ═══ Helpdesk ═══
  const slaDeadline = (base: string, hours: number) => new Date(new Date(base).getTime() + hours * 60 * 60 * 1000);
  const ticketSpecs = [
    { num: "HD-10001", requester: "EMP001", assignedTo: "EMP008", category: "HR Tickets", queue: "HR", subject: "Update bank details in payroll", description: "Please update my bank account details effective next payroll run.", priority: "Medium", status: "Resolved", createdAt: "2026-07-01T09:15:00Z", sla: 24, resolutionNotes: "Bank details updated.", resolvedAt: "2026-07-01T11:00:00Z", closedAt: "2026-07-01T11:05:00Z" },
    { num: "HD-10002", requester: "EMP002", assignedTo: "EMP004", category: "IT Tickets", queue: "IT Support", subject: "VPN not connecting from Delhi office", description: "Cannot establish VPN session after the network switch changed.", priority: "High", status: "In Progress", createdAt: "2026-08-02T07:30:00Z", sla: 8, resolutionNotes: null, resolvedAt: null, closedAt: null },
    { num: "HD-10003", requester: "EMP003", assignedTo: null, category: "HR - Grievance/Confidential", queue: "HR-Compliance (Restricted)", subject: "Confidential grievance on team conduct", description: "I would like to file a confidential concern about team conduct during reviews.", priority: "High", status: "Open", isConfidential: true, createdAt: "2026-08-05T10:00:00Z", sla: 24, resolutionNotes: null, resolvedAt: null, closedAt: null },
    { num: "HD-10004", requester: "EMP005", assignedTo: "EMP008", category: "Asset Support", queue: "Asset Support Team", subject: "Requesting docking station for new joinee", description: "Need an extra docking station for the new hire joining next month.", priority: "Low", status: "Closed", createdAt: "2026-06-20T08:00:00Z", sla: 16, resolutionNotes: "Docking station allocated from inventory.", resolvedAt: "2026-06-21T09:30:00Z", closedAt: "2026-06-21T09:35:00Z" },
    { num: "HD-10005", requester: "EMP012", assignedTo: "EMP013", category: "Finance Tickets", queue: "Finance", subject: "Reimbursement for client travel", description: "Submit claim for flight and cab expenses for the client visit.", priority: "Medium", status: "Open", createdAt: "2026-08-10T12:00:00Z", sla: 24, resolutionNotes: null, resolvedAt: null, closedAt: null },
  ];
  for (const t of ticketSpecs) {
    await prisma.helpdeskTicket.create({
      data: {
        ticketNumber: t.num,
        requesterId: empPKByCode.get(t.requester)!,
        assignedToId: t.assignedTo ? empPKByCode.get(t.assignedTo) ?? null : null,
        category: t.category,
        queue: t.queue,
        subject: t.subject,
        description: t.description,
        priority: t.priority,
        status: t.status,
        isConfidential: t.isConfidential ?? false,
        slaDeadline: slaDeadline(t.createdAt, t.sla),
        resolutionNotes: t.resolutionNotes,
        resolvedAt: t.resolvedAt ? new Date(t.resolvedAt) : null,
        closedAt: t.closedAt ? new Date(t.closedAt) : null,
        createdAt: new Date(t.createdAt),
      },
    });
  }

  await prisma.helpdeskComment.createMany({
    data: [
      { ticketId: (await prisma.helpdeskTicket.findUnique({ where: { ticketNumber: "HD-10002" } }))!.id, authorId: empPKByCode.get("EMP004")!, message: "Investigating the network switch change. Checking firewall rules now.", isInternal: false, createdAt: new Date("2026-08-02T08:10:00Z") },
      { ticketId: (await prisma.helpdeskTicket.findUnique({ where: { ticketNumber: "HD-10002" } }))!.id, authorId: empPKByCode.get("EMP002")!, message: "Thanks, please keep me posted.", isInternal: false, createdAt: new Date("2026-08-02T08:30:00Z") },
      { ticketId: (await prisma.helpdeskTicket.findUnique({ where: { ticketNumber: "HD-10003" } }))!.id, authorId: empPKByCode.get("EMP011")!, message: "Flagging to HR-Compliance (Restricted) queue for confidential handling.", isInternal: true, createdAt: new Date("2026-08-05T11:00:00Z") },
    ],
  });

  // ═══ Onboarding ═══
  const obEmp = empPKByCode.get("EMP014")!;
  await prisma.onboarding.create({
    data: {
      employeeId: obEmp,
      joinDate: new Date("2026-09-01T00:00:00Z"),
      probationEndDate: new Date("2027-03-01T00:00:00Z"),
      buddy: "EMP001",
      status: "IN_PROGRESS",
      checklistItems: {
        create: [
          { title: "ID badge & access card", category: "Admin", owner: "Facilities", dueDate: new Date("2026-08-28T00:00:00Z"), status: "Complete", completedAt: new Date("2026-08-28T00:00:00Z") },
          { title: "Laptop provisioning & setup", category: "IT", owner: "IT Support", dueDate: new Date("2026-08-29T00:00:00Z"), status: "Pending_Procurement", blockedReason: "Waiting for the new laptop batch" },
          { title: "Accounts & email creation", category: "IT", owner: "IT Support", dueDate: new Date("2026-08-30T00:00:00Z"), status: "Complete", completedAt: new Date("2026-08-30T00:00:00Z") },
          { title: "HR induction & policy briefing", category: "HR", owner: "HR Team", dueDate: new Date("2026-09-03T00:00:00Z"), status: "Pending" },
          { title: "Buddy introduction & team meet", category: "HR", owner: "Buddy", dueDate: new Date("2026-09-04T00:00:00Z"), status: "Pending" },
        ],
      },
    },
  });

  const obEmp2 = empPKByCode.get("EMP012")!;
  await prisma.onboarding.create({
    data: {
      employeeId: obEmp2,
      joinDate: new Date("2026-08-01T00:00:00Z"),
      probationEndDate: new Date("2027-02-01T00:00:00Z"),
      buddy: "EMP004",
      status: "COMPLETED",
      checklistItems: {
        create: [
          { title: "ID badge & access card", category: "Admin", owner: "Facilities", dueDate: new Date("2026-07-26T00:00:00Z"), status: "Complete", completedAt: new Date("2026-07-26T00:00:00Z") },
          { title: "Laptop provisioning & setup", category: "IT", owner: "IT Support", dueDate: new Date("2026-07-27T00:00:00Z"), status: "Complete", completedAt: new Date("2026-07-28T00:00:00Z") },
          { title: "Accounts & email creation", category: "IT", owner: "IT Support", dueDate: new Date("2026-07-28T00:00:00Z"), status: "Complete", completedAt: new Date("2026-07-28T00:00:00Z") },
          { title: "HR induction & policy briefing", category: "HR", owner: "HR Team", dueDate: new Date("2026-08-04T00:00:00Z"), status: "Complete", completedAt: new Date("2026-08-04T00:00:00Z") },
        ],
      },
    },
  });

  // ═══ LMS ═══
  const courseSpecs = [
    {
      title: "Information Security Awareness",
      description: "Foundational security training covering phishing, passwords, and data handling.",
      isCompliance: true,
      expiryMonths: 12,
      passThreshold: 80,
      status: "PUBLISHED",
      contentModules: ["Introduction", "Password Hygiene", "Phishing & Social Engineering", "Data Classification", "Reporting Incidents", "Final Quiz"],
      contents: [
        { moduleName: "Introduction", title: "Welcome to Security Awareness", type: "TEXT", content: "Why security matters and who to contact when something looks wrong.", order: 0 },
        { moduleName: "Password Hygiene", title: "Creating Strong Passwords", type: "TEXT", content: "Use a passphrase, a password manager, and enable MFA everywhere.", order: 1 },
        { moduleName: "Phishing & Social Engineering", title: "Spotting Phishing Emails", type: "VIDEO", fileUrl: "/uploads/lms/phishing.mp4", order: 2 },
        { moduleName: "Data Classification", title: "Handling Confidential Data", type: "TEXT", content: "Know the classification levels: Public, Internal, Confidential, Restricted.", order: 3 },
        { moduleName: "Reporting Incidents", title: "How to Report", type: "LINK", fileUrl: "https://security.service-now.com", order: 4 },
        { moduleName: "Final Quiz", title: "Knowledge Check", type: "TEXT", content: "Complete the quiz to pass this course.", order: 5 },
      ],
      questions: [
        { question: "What is the strongest defense against phishing?", order: 0, options: [["Never click suspicious links; verify the sender", true], ["Click everything to test filters", false], ["Only corporate emails are safe", false], ["Ask IT once a year", false]] },
        { question: "Which is the best password practice?", order: 1, options: [["Reuse one strong password", false], ["Use a unique passphrase + manager", true], ["Write passwords in a notebook", false], ["Use your name and birth year", false]] },
        { question: "Data labelled 'Confidential' should be…", order: 2, options: [["Shared freely", false], ["Encrypted and access-controlled", true], ["Posted on the company wiki", false], ["Emailed to external parties", false]] },
        { question: "You receive a prize email from an unknown sender. You should…", order: 3, options: [["Report it and delete", true], ["Open the attachment", false], ["Forward to colleagues", false], ["Reply with your details", false]] },
        { question: "Mastering this course is required…", order: 4, options: [["Only once, forever", false], ["Every year due to compliance expiry", true], ["Never", false], ["Only at login", false]] },
      ],
    },
    {
      title: "Prevention of Sexual Harassment (POSH)",
      description: "Mandatory compliance course on the POSH act, respectful workplaces, and reporting channels.",
      isCompliance: true,
      expiryMonths: 12,
      passThreshold: 80,
      status: "PUBLISHED",
      contentModules: ["Overview", "What Constitutes Harassment", "Internal Committee", "Reporting & Redressal"],
      contents: [
        { moduleName: "Overview", title: "About this training", type: "TEXT", content: "An overview of the POSH Act and our zero-tolerance policy.", order: 0 },
        { moduleName: "What Constitutes Harassment", title: "Recognizing Unacceptable Behaviour", type: "TEXT", content: "Definitions, examples, and gray areas.", order: 1 },
        { moduleName: "Internal Committee", title: "The ICC & Your Contacts", type: "TEXT", content: "Who sits on the committee and how to reach them.", order: 2 },
        { moduleName: "Reporting & Redressal", title: "How to File a Complaint", type: "TEXT", content: "Step by step walkthrough of the complaint process.", order: 3 },
      ],
      questions: [
        { question: "A complaint under POSH is…", order: 0, options: [["Kept anonymous to the extent possible", true], ["Always published internally", false], ["Handled by the violating employee", false], ["Ignored if verbal", false]] },
        { question: "Who is covered by the POSH policy?", order: 1, options: [["Only full-time employees", false], ["All employees, contractors, and interns", true], ["Only managers", false], ["Only women", false]] },
        { question: "Where can you raise a concern?", order: 2, options: [["Internal Committee / HR-Compliance queue", true], ["Only verbally to your manager", false], ["Social media", false], ["Nowhere", false]] },
      ],
    },
    {
      title: "React & Modern Frontend Development",
      description: "Hands-on course for building scalable React applications with Vite and Tailwind.",
      isCompliance: false,
      passThreshold: 70,
      status: "PUBLISHED",
      contentModules: ["Getting Started", "React Fundamentals", "State Management", "Project Patterns"],
      contents: [
        { moduleName: "Getting Started", title: "Tooling & Setup", type: "TEXT", content: "Scaffold a Vite + React + TS project.", order: 0 },
        { moduleName: "React Fundamentals", title: "Components & Hooks", type: "VIDEO", fileUrl: "/uploads/lms/react-hooks.mp4", order: 1 },
        { moduleName: "State Management", title: "TanStack Query Basics", type: "TEXT", content: "Server state, caching and invalidation.", order: 2 },
        { moduleName: "Project Patterns", title: "Folder & Component Patterns", type: "TEXT", content: "Colocation, composition, and routing patterns.", order: 3 },
      ],
      questions: [
        { question: "Which hook caches remote data?", order: 0, options: [["useState", false], ["useQuery", true], ["useEffect", false], ["useRef", false]] },
        { question: "What is Vite used for?", order: 1, options: [["Dev server & bundling", true], ["Database migrations", false], ["Email delivery", false], ["CSS only", false]] },
        { question: "A component should…", order: 2, options: [["Do one thing well", true], ["Mix many concerns", false], ["Always throw errors", false], ["Never re-render", false]] },
      ],
    },
  ];
  const enrolledSpecs = [
    { courseTitle: "Information Security Awareness", emp: "EMP001", status: "PASSED", attempts: 1, score: 90, certified: true },
    { courseTitle: "Information Security Awareness", emp: "EMP002", status: "IN_PROGRESS", attempts: 1, score: 60, certified: false },
    { courseTitle: "Information Security Awareness", emp: "EMP003", status: "NOT_STARTED", attempts: 0, score: null, certified: false },
    { courseTitle: "Information Security Awareness", emp: "EMP004", status: "PASSED", attempts: 1, score: 85, certified: true },
    { courseTitle: "Prevention of Sexual Harassment (POSH)", emp: "EMP001", status: "PASSED", attempts: 1, score: 100, certified: true },
    { courseTitle: "Prevention of Sexual Harassment (POSH)", emp: "EMP005", status: "IN_PROGRESS", attempts: 0, score: null, certified: false },
    { courseTitle: "React & Modern Frontend Development", emp: "EMP001", status: "IN_PROGRESS", attempts: 0, score: null, certified: false },
    { courseTitle: "React & Modern Frontend Development", emp: "EMP014", status: "NOT_STARTED", attempts: 0, score: null, certified: false },
  ];
  const courseByTitle = new Map<string, { id: string; contents: { id: string }[] }>();
  for (const cs of courseSpecs) {
    const course = await prisma.course.create({
      data: {
        title: cs.title,
        description: cs.description,
        contentModules: cs.contentModules as Prisma.InputJsonValue,
        isCompliance: cs.isCompliance,
        expiryMonths: cs.expiryMonths,
        passThreshold: cs.passThreshold,
        status: cs.status,
        version: 1,
        contents: { create: cs.contents.map((c) => ({ moduleName: c.moduleName, title: c.title, type: c.type, content: c.content, fileUrl: c.fileUrl, order: c.order })) },
        questions: {
          create: cs.questions.map((q) => ({
            question: q.question,
            order: q.order,
            options: { create: q.options.map(([optionText, isCorrect]) => ({ optionText, isCorrect })) },
          })),
        },
      },
      include: { contents: { select: { id: true } } },
    });
    courseByTitle.set(cs.title, { id: course.id, contents: course.contents });
  }
  let certSeq = 1;
  for (const es of enrolledSpecs) {
    const courseId = courseByTitle.get(es.courseTitle)!.id;
    const empId = empPKByCode.get(es.emp)!;
    const contentIds = courseByTitle.get(es.courseTitle)!.contents.map((c) => c.id);
    const enrollment = await prisma.courseEnrollment.create({
      data: {
        courseId,
        employeeId: empId,
        employeeName: `${es.emp} Employee`,
        status: es.status,
        attempts: es.attempts,
        score: es.score,
        certifiedAt: es.certified ? new Date("2026-08-15T00:00:00Z") : null,
        expiresAt: es.certified ? new Date("2027-08-15T00:00:00Z") : null,
      },
    });
    if (es.status === "IN_PROGRESS" && contentIds.length > 0) {
      await prisma.courseContentProgress.create({
        data: { enrollmentId: enrollment.id, contentId: contentIds[0], status: "COMPLETED", startedAt: new Date("2026-08-01T00:00:00Z"), completedAt: new Date("2026-08-02T00:00:00Z") },
      });
    }
    if (es.certified) {
      await prisma.courseCertificate.create({
        data: {
          enrollmentId: enrollment.id,
          certificateNumber: `CERT-2026-${String(certSeq).padStart(4, "0")}`,
          status: "ISSUED",
          issuedAt: new Date("2026-08-15T00:00:00Z"),
          expiresAt: new Date("2027-08-15T00:00:00Z"),
          verificationToken: `tok${certSeq}${Buffer.from(`${es.courseTitle}${es.emp}`).toString("hex").slice(0, 24)}`,
          generatedAt: new Date("2026-08-15T00:00:00Z"),
        },
      });
      certSeq += 1;
    }
  }

  // ═══ Task Management ═══
  const proj1 = await prisma.taskProject.create({
    data: { name: "Payroll Module Overhaul", members: { create: [{ employeeId: emp001 }, { employeeId: empPKByCode.get("EMP012")! }, { employeeId: empPKByCode.get("EMP014")! }, { employeeId: empPKByCode.get("EMP011")! }] } },
  });
  const proj2 = await prisma.taskProject.create({
    data: { name: "Q3 Product Launch", members: { create: [{ employeeId: empPKByCode.get("EMP002")! }, { employeeId: empPKByCode.get("EMP003")! }, { employeeId: empPKByCode.get("EMP001")! }] } },
  });
  const mile1 = await prisma.taskMilestone.create({ data: { projectId: proj1.id, title: "Data Migration & Validation", dueDate: new Date("2026-09-15T00:00:00Z") } });
  const mile2 = await prisma.taskMilestone.create({ data: { projectId: proj2.id, title: "Beta Release Cutoff", dueDate: new Date("2026-09-30T00:00:00Z") } });
  const taskSpecs = [
    { projectId: proj1.id, milestoneId: mile1.id, title: "Design payroll ledger schema", assignee: "EMP001", status: "Done", priority: "High", dueDate: "2026-08-20" },
    { projectId: proj1.id, milestoneId: mile1.id, title: "Build migration script for FY26 payslips", assignee: "EMP012", status: "In Progress", priority: "High", dueDate: "2026-09-10" },
    { projectId: proj1.id, milestoneId: mile1.id, title: "Validation report vs ERP extract", assignee: "EMP011", status: "Todo", priority: "Medium", dueDate: "2026-09-12" },
    { projectId: proj1.id, milestoneId: null, title: "UI for payroll runs list", assignee: "EMP014", status: "In Progress", priority: "Medium", dueDate: "2026-09-20" },
    { projectId: proj2.id, milestoneId: mile2.id, title: "Marketing splash page", assignee: "EMP003", status: "Done", priority: "High", dueDate: "2026-09-25" },
    { projectId: proj2.id, milestoneId: mile2.id, title: "Feature walkthrough recording", assignee: "EMP002", status: "Todo", priority: "Medium", dueDate: "2026-09-28" },
  ];
  const taskIds: string[] = [];
  for (const t of taskSpecs) {
    const task = await prisma.task.create({
      data: {
        projectId: t.projectId,
        milestoneId: t.milestoneId ?? undefined,
        title: t.title,
        assigneeId: empPKByCode.get(t.assignee)!,
        status: t.status,
        priority: t.priority,
        dueDate: new Date(`${t.dueDate}T00:00:00Z`),
      },
    });
    taskIds.push(task.id);
    await prisma.taskHistory.create({
      data: { taskId: task.id, action: "created", detail: "Task created", actorId: empPKByCode.get(t.assignee), actorName: `${t.assignee}`, createdAt: new Date(`${t.dueDate}T00:00:00Z`) },
    });
  }
  if (taskIds.length > 1) {
    await prisma.taskDependency.create({ data: { taskId: taskIds[1], blockerId: taskIds[0] } });
    await prisma.taskDependency.create({ data: { taskId: taskIds[2], blockerId: taskIds[1] } });
  }
  const timeSpecs = [
    { taskId: taskIds[0], emp: "EMP001", date: "2026-08-18", hours: 4, note: "Schema draft" },
    { taskId: taskIds[0], emp: "EMP001", date: "2026-08-19", hours: 3, note: "Review with EM" },
    { taskId: taskIds[1], emp: "EMP012", date: "2026-08-22", hours: 6, note: "Migrator scaffolding" },
  ];
  for (const ts of timeSpecs) {
    await prisma.taskTimeEntry.create({
      data: { taskId: ts.taskId, employeeId: empPKByCode.get(ts.emp)!, date: new Date(`${ts.date}T00:00:00Z`), hours: ts.hours, note: ts.note },
    });
  }

  // ═══ Asset Management ═══
  const assetSpecs = [
    { serial: "LTZ-2026-0001", category: "Laptop", make: "Apple", model: "MacBook Pro 14\" M3", status: "ASSIGNED", currentHolderId: emp001, acknowledged: true },
    { serial: "LTZ-2026-0002", category: "Laptop", make: "Dell", model: "XPS 15", status: "ASSIGNED", currentHolderId: empPKByCode.get("EMP005"), acknowledged: true },
    { serial: "LTZ-2026-0003", category: "Laptop", make: "Lenovo", model: "ThinkPad T14", status: "ASSIGNED", currentHolderId: empPKByCode.get("EMP004"), acknowledged: false },
    { serial: "LTZ-2026-0004", category: "Laptop", make: "HP", model: "EliteBook 840", status: "IN_STOCK" },
    { serial: "MN-2026-0001", category: "Monitor", make: "Dell", model: "U2723QE 27\"", status: "ASSIGNED", currentHolderId: emp001, acknowledged: true },
    { serial: "SW-2026-0001", category: "Software License", make: "JetBrains", model: "All Products Pack", status: "IN_STOCK", seats: 12, licenseExpiry: new Date("2027-06-30T00:00:00Z") },
    { serial: "DOCK-2026-0001", category: "Accessory", make: "CalDigit", model: "TS4 Dock", status: "MAINTENANCE" },
  ];
  const assetBySerial = new Map<string, string>();
  for (const a of assetSpecs) {
    const asset = await prisma.asset.create({
      data: {
        serial: a.serial,
        category: a.category,
        make: a.make,
        model: a.model,
        status: a.status,
        currentHolderId: a.currentHolderId,
        acknowledged: a.acknowledged,
        seats: a.seats,
        licenseExpiry: a.licenseExpiry,
      },
    });
    assetBySerial.set(a.serial, asset.id);
  }
  const assetReqSpecs = [
    { emp: "EMP003", category: "Laptop", justification: "My 2019 laptop shows hardware faults; need replacement for design work.", status: "PENDING_APPROVAL" },
    { emp: "EMP004", category: "Monitor", justification: "Second monitor for productivity at home desk.", status: "APPROVED", approvedBy: empPKByCode.get("EMP005"), approvedAt: "2026-07-10" },
    { emp: "EMP001", category: "Laptop", justification: "Upgrade from MBA 13 to MacBook Pro 14 for build workloads.", status: "FULFILLED", approvedBy: empPKByCode.get("EMP005"), approvedAt: "2026-06-15", fulfilledAt: "2026-06-20", assetId: assetBySerial.get("LTZ-2026-0001") },
  ];
  for (const r of assetReqSpecs) {
    await prisma.assetRequest.create({
      data: {
        employeeId: empPKByCode.get(r.emp)!,
        category: r.category,
        justification: r.justification,
        status: r.status,
        raisedAt: new Date("2026-06-10T00:00:00Z"),
        approvedBy: r.approvedBy,
        approvedAt: r.approvedAt ? new Date(`${r.approvedAt}T00:00:00Z`) : null,
        fulfilledAt: r.fulfilledAt ? new Date(`${r.fulfilledAt}T00:00:00Z`) : null,
        assetId: r.assetId,
      },
    });
  }
  await prisma.assetHistory.createMany({
    data: [
      { assetId: assetBySerial.get("LTZ-2026-0001")!, employeeId: emp001, action: "assign", detail: "Assigned to Matsya Singh", createdAt: new Date("2026-06-20T00:00:00Z") },
      { assetId: assetBySerial.get("LTZ-2026-0003")!, employeeId: empPKByCode.get("EMP004"), action: "assign", detail: "Assigned to Rohan Sharma", createdAt: new Date("2026-06-21T00:00:00Z") },
      { assetId: assetBySerial.get("DOCK-2026-0001")!, employeeId: null, action: "maintenance", detail: "Sent for port repair", createdAt: new Date("2026-07-05T00:00:00Z") },
    ],
  });

  // ═══ Separation ═══
  const sepEmp1 = empPKByCode.get("EMP015")!;
  const sep1 = await prisma.separation.create({
    data: {
      employeeId: sepEmp1,
      type: "Resignation",
      reason: "Relocating to another city for family reasons",
      submittedOn: new Date("2026-05-15T00:00:00Z"),
      lastWorkingDay: new Date("2026-06-30T00:00:00Z"),
      noticePeriodDays: 45,
      status: "Completed",
      exitInterviewCompleted: true,
      accessRevoked: true,
      clearanceItems: {
        create: [
          { item: "Return company laptop", owner: "IT Support", status: "Completed", notes: "Data wiped and device received.", completedAt: new Date("2026-06-30T00:00:00Z") },
          { item: "Return ID badge & access card", owner: "Facilities", status: "Completed", notes: "Badge returned at exit.", completedAt: new Date("2026-06-30T00:00:00Z") },
          { item: "Clear outstanding reimbursements", owner: "Finance", status: "Completed", notes: "Cleared in final settlement.", completedAt: new Date("2026-07-01T00:00:00Z") },
        ],
      },
    },
  });
  await prisma.exitInterview.create({
    data: {
      separationId: sep1.id,
      responses: {
        reason: "Relocating to another city",
        feedback: "Great team culture; would recommend the company.",
        improvement: "More structured career progression paths.",
        rehireLikely: "Yes",
      } as Prisma.InputJsonValue,
      conductedBy: "Sunita Reddy",
      conductedAt: new Date("2026-06-28T00:00:00Z"),
    },
  });
  await prisma.separationSettlement.create({
    data: {
      separationId: sep1.id,
      pendingSalary: 6667,
      leaveEncashment: 4615,
      reimbursements: 1200,
      recoveries: 500,
      netSettlement: 11982,
      approvedAt: new Date("2026-07-02T00:00:00Z"),
    },
  });
  await prisma.alumni.create({
    data: {
      separationId: sep1.id,
      employeeId: sepEmp1,
      name: "Pooja Iyer",
      role: "Finance Analyst",
      tenure: "2 years 2 months",
      eligibleForRehire: true,
      exitedOn: new Date("2026-06-30T00:00:00Z"),
    },
  });

  const sepEmp2 = empPKByCode.get("EMP003")!;
  await prisma.separation.create({
    data: {
      employeeId: sepEmp2,
      type: "Resignation",
      reason: "Accepted a role at another firm",
      submittedOn: new Date("2026-08-18T00:00:00Z"),
      lastWorkingDay: new Date("2026-09-18T00:00:00Z"),
      noticePeriodDays: 30,
      status: "Notice Period",
      exitInterviewCompleted: false,
      accessRevoked: false,
      clearanceItems: {
        create: [
          { item: "Return company laptop", owner: "IT Support", status: "Pending" },
          { item: "Handover design system conventions", owner: "Design Team", status: "Pending" },
        ],
      },
    },
  });

  // ═══ Notifications ═══
  await prisma.notificationPreference.createMany({
    data: [
      { userId: userByEmail.get("robert.king@company.com")!, category: "Leave", emailEnabled: false, inAppEnabled: true },
      { userId: userByEmail.get("robert.king@company.com")!, category: "Payroll", emailEnabled: true, inAppEnabled: true },
      { userId: userByEmail.get("sunita.reddy@company.com")!, category: "Leave", emailEnabled: true, inAppEnabled: true },
      { userId: userByEmail.get("sunita.reddy@company.com")!, category: "Compliance", emailEnabled: true, inAppEnabled: true },
      { userId: userByEmail.get("anjali.desai@company.com")!, category: "Leave", emailEnabled: true, inAppEnabled: true },
    ],
  });
  await prisma.notificationTemplate.createMany({
    data: [
      { name: "Leave Approved", category: "Leave", body: "Your leave request {leaveType} ({startDate} - {endDate}) has been approved.", status: "Active", createdByUserId: userByEmail.get("sunita.reddy@company.com") },
      { name: "Payroll Generated", category: "Payroll", body: "Your payslip for {month} is now available.", status: "Active", createdByUserId: userByEmail.get("sunita.reddy@company.com") },
      { name: "Policy Published", category: "Policy", body: "A new policy version of {policyTitle} requires your acknowledgement.", status: "Active", createdByUserId: userByEmail.get("robert.king@company.com") },
    ],
  });
  await prisma.notification.createMany({
    data: [
      { userId: userByEmail.get("matsya.singh@company.com")!, title: "Leave approved", body: "Your Sick Leave request (10 Jun - 11 Jun) was approved.", category: "Leave", link: "/leave", isRead: true, readAt: new Date("2026-06-10T12:00:00Z"), createdAt: new Date("2026-06-10T09:00:00Z") },
      { userId: userByEmail.get("vijay.mudgal@company.com")!, title: "New task assigned", body: "You have been assigned 'Feature walkthrough recording'.", category: "Tasks", link: "/tasks", isRead: false, createdAt: new Date("2026-08-10T08:00:00Z") },
      { userId: userByEmail.get("anjali.desai@company.com")!, title: "Leave request awaiting approval", body: "Matsya Singh requested Earned Leave (28 Jul - 30 Jul).", category: "Leave", link: "/leave/approvals", isRead: false, createdAt: new Date("2026-07-20T10:00:00Z") },
      { userId: userByEmail.get("sunita.reddy@company.com")!, title: "Compliance obligation due", body: "GST Monthly Return (GSTR-3B) is due on 2026-10-20.", category: "Compliance", link: "/compliance", isRead: false, createdAt: new Date("2026-08-01T09:00:00Z") },
      { userId: userByEmail.get("robert.king@company.com")!, title: "Policy acknowledgement reminder", body: "Please acknowledge the updated Information Security Policy.", category: "Policy", link: "/policies", isRead: true, readAt: new Date("2026-01-06T09:00:00Z"), createdAt: new Date("2026-01-02T09:00:00Z") },
    ],
  });

  } // end SEED_DEMO_DATA

  console.log("✅ Seed complete.");
  if (SEED_DEMO_DATA) {
    console.log("🔑 Login credentials (all): email from list below / Password@123");
    console.log("   ADMIN  → robert.king@company.com (Robert King, CEO)");
    console.log("   HR     → sunita.reddy@company.com (Sunita Reddy, HR Manager)");
    console.log("   MANAGER→ anjali.desai@company.com (Anjali Desai, Engineering Manager)");
    console.log("   EMP    → matsya.singh@company.com (Matsya Singh, Senior Software Engineer)");
  } else {
    console.log("🔑 Login: admin@proteccio.com / Admin@123 — create data via the app or bulk uploads.");
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
