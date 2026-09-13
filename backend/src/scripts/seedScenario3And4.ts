import { prisma } from "../lib/prisma";

async function seedScenarios() {
  console.log("--- Setting up Scenario 3 & 4 data in PostgreSQL ---");

  // 1. Ensure Ramesh exists (EMP020)
  const emp20 = await prisma.employee.findUnique({ where: { employeeCode: "EMP020" } });
  if (emp20) {
    await prisma.employee.update({
      where: { employeeCode: "EMP020" },
      data: {
        firstName: "Ramesh",
        lastName: "Patel",
        salaryType: "Daily",
        dailyWageRate: 900,
        skillType: "Skilled",
      },
    });
  }

  // 2. Ensure Suresh (EMP017) is Monthly ₹24,000
  await prisma.employee.update({
    where: { employeeCode: "EMP017" },
    data: {
      firstName: "Suresh",
      lastName: "Sharma",
      salaryType: "Monthly",
      annualSalary: 288000,
      skillType: "Semi-Skilled",
    },
  });

  // 3. Ensure Ravi (EMP016) is Daily ₹900
  await prisma.employee.update({
    where: { employeeCode: "EMP016" },
    data: {
      firstName: "Ravi",
      lastName: "Kumar",
      salaryType: "Daily",
      dailyWageRate: 900,
      skillType: "Skilled",
    },
  });

  // 4. Ensure Kumar (EMP014) is Semi-Skilled
  await prisma.employee.update({
    where: { employeeCode: "EMP014" },
    data: {
      firstName: "Kumar",
      lastName: "Sanu",
      salaryType: "Monthly",
      annualSalary: 288000,
      skillType: "Semi-Skilled",
    },
  });

  const suresh = await prisma.employee.findUnique({ where: { employeeCode: "EMP017" } });
  const kumar = await prisma.employee.findUnique({ where: { employeeCode: "EMP014" } });
  const ravi = await prisma.employee.findUnique({ where: { employeeCode: "EMP016" } });
  const ramesh = await prisma.employee.findUnique({ where: { employeeCode: "EMP020" } });

  const casualLeaveType = await prisma.leaveType.findFirst({
    where: { name: { contains: "Casual", mode: "insensitive" } },
  });

  const sepStart = new Date(Date.UTC(2026, 8, 1));
  const sepEnd = new Date(Date.UTC(2026, 8, 30, 23, 59, 59));
  const targetIds = [suresh!.id, kumar!.id, ravi!.id, ramesh!.id];

  await prisma.attendancePunch.deleteMany({
    where: { employeeId: { in: targetIds }, punchDate: { gte: sepStart, lte: sepEnd } },
  });
  await prisma.leaveRequest.deleteMany({
    where: { employeeId: { in: targetIds }, startDate: { gte: sepStart, lte: sepEnd } },
  });

  // Seed Approved Leave for Kumar on 2026-09-08 (Tuesday)
  if (casualLeaveType) {
    await prisma.leaveRequest.create({
      data: {
        employeeId: kumar!.id,
        leaveTypeId: casualLeaveType.id,
        startDate: new Date(Date.UTC(2026, 8, 8)),
        endDate: new Date(Date.UTC(2026, 8, 8)),
        reason: "Personal / Family Event - Approved Casual Leave",
        status: "Approved",
        approvedOn: new Date(Date.UTC(2026, 8, 7)),
      },
    });
    console.log("Created Approved Casual Leave for Kumar on 2026-09-08 (No LOP)");
  }

  // Create attendance punches for September 1 to 30, 2026
  // General shift: 03:30 UTC to 12:30 UTC (9:00 AM to 6:00 PM IST)
  // Weekly off: Sunday (0) and Saturday (6)
  const punches = [];
  for (let day = 1; day <= 30; day++) {
    const d = new Date(Date.UTC(2026, 8, day));
    const weekday = d.getUTCDay();
    if (weekday === 0 || weekday === 6) continue; // weekend

    const pIn = new Date(Date.UTC(2026, 8, day, 3, 30));
    const pOut = new Date(Date.UTC(2026, 8, day, 12, 30));

    // Ravi: Present
    punches.push({
      employeeId: ravi!.id,
      punchDate: d,
      status: "Present",
      punchIn: pIn,
      punchOut: pOut,
      method: "Web",
    });

    // Ramesh: Present
    punches.push({
      employeeId: ramesh!.id,
      punchDate: d,
      status: "Present",
      punchIn: pIn,
      punchOut: pOut,
      method: "Web",
    });

    // Kumar: Absent on Sept 8 (with approved leave), Present on others
    if (day === 8) {
      punches.push({
        employeeId: kumar!.id,
        punchDate: d,
        status: "Absent",
        punchIn: null,
        punchOut: null,
        method: "Web",
      });
    } else {
      punches.push({
        employeeId: kumar!.id,
        punchDate: d,
        status: "Present",
        punchIn: pIn,
        punchOut: pOut,
        method: "Web",
      });
    }

    // Suresh: Absent on Sept 8, 9, 10 (3 days Unauthorized Absence -> 3 LOP days!), Present on others
    if (day === 8 || day === 9 || day === 10) {
      punches.push({
        employeeId: suresh!.id,
        punchDate: d,
        status: "Absent",
        punchIn: null,
        punchOut: null,
        method: "Web",
      });
    } else {
      punches.push({
        employeeId: suresh!.id,
        punchDate: d,
        status: "Present",
        punchIn: pIn,
        punchOut: pOut,
        method: "Web",
      });
    }
  }

  await prisma.attendancePunch.createMany({ data: punches });
  console.log("Seeded " + punches.length + " attendance punches for Sept 2026 (exact normal shift)");
}

seedScenarios()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
