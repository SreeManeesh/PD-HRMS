import { prisma } from "../lib/prisma";

async function seedScenarios() {
  console.log("=== SEEDING SCENARIO 3, 4, 5, 6 IN POSTGRESQL ===");

  // 1. Update Company and CompanyConfig with advanced Overtime & Shift parameters
  const company = await prisma.company.findFirst({ where: { isActive: true } });
  if (!company) {
    throw new Error("No active company found. Run main seed first.");
  }

  await prisma.company.update({
    where: { id: company.id },
    data: { weeklyOffDays: [0] }, // Sunday only = 26 working days in Sept 2026
  });

    await prisma.companyConfig.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        shiftStartMinutes: 540, // 09:00 IST
        shiftEndMinutes: 1020,  // 17:00 IST (8 hours)
        weeklyOffDays: [0],
        overtimeMultiplier: 1.5,
        weeklyOffWorkedMultiplier: 2.0,
        holidayWorkedMultiplier: 2.0,
        nightShiftAllowance: 100,
        nightOtMultiplier: 2.0,
        weeklyOffOtMultiplier: 2.0,
        holidayOtMultiplier: 2.0,
        minOtMinutesThreshold: 30,
        maxOtHoursMonthly: 60,
      },
      update: {
        shiftStartMinutes: 540,
        shiftEndMinutes: 1020,
        weeklyOffDays: [0],
        overtimeMultiplier: 1.5,
        weeklyOffWorkedMultiplier: 2.0,
        holidayWorkedMultiplier: 2.0,
        nightShiftAllowance: 100,
        nightOtMultiplier: 2.0,
        weeklyOffOtMultiplier: 2.0,
        holidayOtMultiplier: 2.0,
        minOtMinutesThreshold: 30,
        maxOtHoursMonthly: 60,
      },
    });
    console.log("Updated Company & CompanyConfig (weeklyOffDays=[0], shift 8h, 1.5x Normal OT, 30 min min threshold, 60h max cap)");

  // Update AttendanceShift to standard 8h (03:30 to 11:30 UTC = 09:00 to 17:00 IST)
  await prisma.attendanceShift.updateMany({
    data: {
      startTime: new Date("1970-01-01T03:30:00.000Z"),
      endTime: new Date("1970-01-01T11:30:00.000Z"),
    },
  });

  // 2. Configure Custom Components (Scenario 6: ATT_BONUS, Scenario 7: NIGHT_ALLOW, Scenario 8: PROD_INC)
  const attBonusComp = await prisma.payrollComponentConfig.findFirst({ where: { code: "ATT_BONUS" } });
  const attBonusData = {
    code: "ATT_BONUS",
    name: "Attendance Bonus",
    kind: "earning",
    calcType: "slab",
    metric: "payableDays",
    slabs: [
      { min: 26, max: 999, value: 1500, amount: 1500 },
      { min: 24, max: 25.99, value: 750, amount: 750 },
      { min: 0, max: 23.99, value: 0, amount: 0 },
    ],
    isActive: true,
    effectiveFrom: new Date("2024-01-01T00:00:00Z"),
  };
  if (attBonusComp) {
    await prisma.payrollComponentConfig.update({ where: { id: attBonusComp.id }, data: attBonusData });
  } else {
    await prisma.payrollComponentConfig.create({ data: attBonusData });
  }

  // Scenario 7: NIGHT_ALLOW Component (₹100 per shift, minimum 10 night shifts threshold)
  const nightAllowComp = await prisma.payrollComponentConfig.findFirst({ where: { code: "NIGHT_ALLOW" } });
  const nightAllowData = {
    code: "NIGHT_ALLOW",
    name: "Night Shift Allowance",
    kind: "earning",
    calcType: "per_shift",
    metric: "nightShifts",
    value: 100,
    minThreshold: 10,
    isActive: true,
    effectiveFrom: new Date("2024-01-01T00:00:00Z"),
  };
  if (nightAllowComp) {
    await prisma.payrollComponentConfig.update({ where: { id: nightAllowComp.id }, data: nightAllowData });
  } else {
    await prisma.payrollComponentConfig.create({ data: nightAllowData });
  }

  // Scenario 8: PROD_INC Component (<800: 0, 800-999: 1000, 1000-1199: 2000, 1200+: 3000)
  const prodIncComp = await prisma.payrollComponentConfig.findFirst({ where: { code: "PROD_INC" } });
  const prodIncData = {
    code: "PROD_INC",
    name: "Production Incentive",
    kind: "earning",
    calcType: "slab",
    metric: "productionUnits",
    slabs: [
      { min: 1200, max: 999999, value: 3000, amount: 3000 },
      { min: 1000, max: 1199.99, value: 2000, amount: 2000 },
      { min: 800, max: 999.99, value: 1000, amount: 1000 },
      { min: 0, max: 799.99, value: 0, amount: 0 },
    ],
    isActive: true,
    effectiveFrom: new Date("2024-01-01T00:00:00Z"),
  };
  if (prodIncComp) {
    await prisma.payrollComponentConfig.update({ where: { id: prodIncComp.id }, data: prodIncData });
  } else {
    await prisma.payrollComponentConfig.create({ data: prodIncData });
  }

  // Ensure Location "Factory A" exists (Scenario 10 Location requirement)
  let factoryALoc = await prisma.location.findFirst({ where: { name: "Factory A" } });
  if (!factoryALoc) {
    factoryALoc = await prisma.location.create({
      data: { name: "Factory A", address: "Plant 1, Industrial Corridor, Sector 4", companyId: company.id },
    });
  }

  // Scenario 10: Food Allowance (Skilled, Factory A, ₹1,000, 25 days min, from 01-Apr-2026)
  const foodAllowComp = await prisma.payrollComponentConfig.findFirst({ where: { code: "FOOD_ALLOW" } });
  const foodAllowData = {
    code: "FOOD_ALLOW",
    name: "Food Allowance",
    kind: "earning",
    calcType: "fixed",
    value: 1000,
    applicableCategory: "Skilled",
    locationId: factoryALoc.id,
    minAttendanceDays: 25,
    maxCap: 1000,
    effectiveFrom: new Date("2026-04-01T00:00:00Z"),
    isActive: true,
  };
  if (foodAllowComp) {
    await prisma.payrollComponentConfig.update({ where: { id: foodAllowComp.id }, data: foodAllowData });
  } else {
    await prisma.payrollComponentConfig.create({ data: foodAllowData });
  }

  // Scenario 10: Transport Allowance (Fixed ₹1,500, ALL categories, from 01-Jan-2026)
  const transportAllowComp = await prisma.payrollComponentConfig.findFirst({ where: { code: "TRANSPORT_ALLOW" } });
  const transportAllowData = {
    code: "TRANSPORT_ALLOW",
    name: "Transport Allowance",
    kind: "earning",
    calcType: "fixed",
    value: 1500,
    applicableCategory: "ALL",
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    isActive: true,
  };
  if (transportAllowComp) {
    await prisma.payrollComponentConfig.update({ where: { id: transportAllowComp.id }, data: transportAllowData });
  } else {
    await prisma.payrollComponentConfig.create({ data: transportAllowData });
  }
  console.log("Configured Scenario 6, 7, 8 & 10 components in payrollComponentConfig");

  // 3. Configure Persona Employees
  // Suresh: EMP017 (Monthly ₹24,000, 22 payable days, 3 LOP days)
  await prisma.employee.update({
    where: { employeeCode: "EMP017" },
    data: {
      firstName: "Suresh",
      lastName: "Sharma",
      salaryType: "Monthly",
      annualSalary: 288000,
      skillType: "Semi-Skilled",
      dateOfJoining: new Date("2026-09-02T00:00:00Z"), // 25 working days
    },
  });

  // Kumar: EMP014 (Monthly ₹24,000, 25 payable days, 0 LOP)
  const kumarEmpRec = await prisma.employee.update({
    where: { employeeCode: "EMP014" },
    data: {
      firstName: "Kumar",
      lastName: "Sanu",
      salaryType: "Monthly",
      annualSalary: 288000,
      skillType: "Semi-Skilled",
      dateOfJoining: new Date("2026-09-02T00:00:00Z"), // 25 working days
    },
  });
  await prisma.salaryStructure.deleteMany({ where: { employeeId: kumarEmpRec.id } });
  await prisma.salaryStructure.create({
    data: {
      employeeId: kumarEmpRec.id,
      basicSalary: 12000,
      hra: 4800,
      conveyanceAllowance: 1600,
      medicalAllowance: 1250,
      performanceBonus: 0,
      otherAllowances: 4350,
      effectiveFrom: new Date("2024-01-01T00:00:00Z"),
      isActive: true,
    },
  });

  // Ravi: EMP016 (Daily ₹800 -> Hourly Rate ₹100/hr, 26 payable days, 5h OT)
  await prisma.employee.update({
    where: { employeeCode: "EMP016" },
    data: {
      firstName: "Ravi",
      lastName: "Kumar",
      salaryType: "Daily",
      dailyWageRate: 800, // 800 / 8 = 100/hr
      skillType: "Skilled",
      dateOfJoining: new Date("2024-01-01T00:00:00Z"),
    },
  });

  // Ramesh: EMP020 (Daily ₹900)
  const rameshEmp = await prisma.employee.findUnique({ where: { employeeCode: "EMP020" } });
  if (rameshEmp) {
    await prisma.employee.update({
      where: { employeeCode: "EMP020" },
      data: {
        firstName: "Ramesh",
        lastName: "Patel",
        salaryType: "Daily",
        dailyWageRate: 900,
        skillType: "Skilled",
        dateOfJoining: new Date("2024-01-01T00:00:00Z"),
      },
    });
  }

  // ── Scenario 9 Persona: Amit Verma (EMP018) ──
  // Basic: ₹18,000, HRA: ₹3,000, Transport: ₹1,500, Food: ₹1,000, Night: ₹1,200, OT: ₹2,000, Bonus: ₹1,500
  // Total Gross Earnings = ₹28,200
  // Deductions: PF, PT, Advance Recovery (₹2,000), LOP (₹0) -> Net = Gross - Deductions
  const amitEmp = await prisma.employee.findUnique({ where: { employeeCode: "EMP018" } });
  if (amitEmp) {
    await prisma.employee.update({
      where: { employeeCode: "EMP018" },
      data: {
        firstName: "Amit",
        lastName: "Verma",
        salaryType: "Monthly",
        annualSalary: 252000,
        skillType: "Skilled",
        locationId: factoryALoc.id,
        dailyWageRate: 1066.666667, // 1066.666667 / 8 = 133.3333/hr -> 1.5x OT = ₹200.00/hr
        dateOfJoining: new Date("2024-01-01T00:00:00Z"),
      },
    });

    const struct = await prisma.salaryStructure.findFirst({ where: { employeeId: amitEmp.id } });
    const structData = {
      basicSalary: 18000,
      hra: 3000,
      conveyanceAllowance: 0,
      medicalAllowance: 0,
      performanceBonus: 0,
      otherAllowances: 0,
      effectiveFrom: new Date("2024-01-01T00:00:00Z"),
      isActive: true,
    };
    if (struct) {
      await prisma.salaryStructure.update({ where: { id: struct.id }, data: structData });
    } else {
      await prisma.salaryStructure.create({ data: { employeeId: amitEmp.id, ...structData } });
    }

    // Active salary advance: ₹20,000 with monthly deduction of ₹2,000
    await prisma.salaryAdvance.deleteMany({ where: { employeeId: amitEmp.id } });
    await prisma.salaryAdvance.create({
      data: {
        employeeId: amitEmp.id,
        amount: 20000,
        monthlyDeduction: 2000,
        disbursedOn: new Date("2026-08-01T00:00:00Z"),
        recoveredAmount: 2000,
        status: "Active",
        reason: "Personal financial assistance loan (deduct ₹2,000/mo)",
      },
    });
  }

  const suresh = await prisma.employee.findUnique({ where: { employeeCode: "EMP017" } });
  const kumar = await prisma.employee.findUnique({ where: { employeeCode: "EMP014" } });
  const ravi = await prisma.employee.findUnique({ where: { employeeCode: "EMP016" } });
  const ramesh = await prisma.employee.findUnique({ where: { employeeCode: "EMP020" } });
  const amit = await prisma.employee.findUnique({ where: { employeeCode: "EMP018" } });

  const sepStart = new Date(Date.UTC(2026, 8, 1));
  const sepEnd = new Date(Date.UTC(2026, 8, 30, 23, 59, 59));
  const targetIds = [suresh!.id, kumar!.id, ravi!.id, ramesh!.id, amit?.id].filter(Boolean) as string[];

  await prisma.attendancePunch.deleteMany({
    where: { employeeId: { in: targetIds }, punchDate: { gte: sepStart, lte: sepEnd } },
  });
  await prisma.leaveRequest.deleteMany({
    where: { employeeId: { in: targetIds }, startDate: { gte: sepStart, lte: sepEnd } },
  });

  // Approved Leave for Kumar on Sept 8 (No LOP)
  const casualLeaveType = await prisma.leaveType.findFirst({
    where: { name: { contains: "Casual", mode: "insensitive" } },
  });
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
  }

  // Scenario 8: Production Records for September 2026
  // Ravi: 1,150 units produced (Slab: 1,000-1,199 -> ₹2,000 Production Incentive)
  await prisma.productionRecord.upsert({
    where: { employeeId_month_year: { employeeId: ravi!.id, month: 9, year: 2026 } },
    create: {
      employeeId: ravi!.id,
      month: 9,
      year: 2026,
      unitsProduced: 1150,
      targetUnits: 1000,
      remarks: "Scenario 8: 1,150 units produced against 1,000 target",
    },
    update: {
      unitsProduced: 1150,
      targetUnits: 1000,
      remarks: "Scenario 8: 1,150 units produced against 1,000 target",
    },
  });

  // Suresh: 950 units produced (Slab: 800-999 -> ₹1,000 Production Incentive)
  await prisma.productionRecord.upsert({
    where: { employeeId_month_year: { employeeId: suresh!.id, month: 9, year: 2026 } },
    create: {
      employeeId: suresh!.id,
      month: 9,
      year: 2026,
      unitsProduced: 950,
      targetUnits: 1000,
      remarks: "Scenario 8: 950 units produced against 1,000 target",
    },
    update: {
      unitsProduced: 950,
      targetUnits: 1000,
      remarks: "Scenario 8: 950 units produced against 1,000 target",
    },
  });
  console.log("Upserted Scenario 8 ProductionRecords for Ravi (1,150 units -> ₹2,000) and Suresh (950 units -> ₹1,000)");

  const punches = [];

  // 4. Attendance Punches for September 2026
  // Standard Shift: 8 hours (03:30 UTC to 11:30 UTC)
  for (let day = 1; day <= 30; day++) {
    const d = new Date(Date.UTC(2026, 8, day));
    const weekday = d.getUTCDay();
    const isSunday = weekday === 0;

    // Standard 8h punch: 03:30 to 11:30 UTC
    const pIn = new Date(Date.UTC(2026, 8, day, 3, 30));
    const pOut8h = new Date(Date.UTC(2026, 8, day, 11, 30));

    // Sundays are weekly-off
    if (isSunday) continue;

    // ── RAVI (Scenario 5 & Scenario 6) ──
    // Scenario 5:
    // 1st: 8h (0 OT)
    // 2nd: 10h (2 OT) -> 03:30 to 13:30 UTC
    // 3rd: 11h (3 OT) -> 03:30 to 14:30 UTC
    // 4th: 8h (0 OT)
    // Remaining days: 8h (0 OT)
    // Total OT = 5 hours.
    // Hourly rate = ₹100, Configured OT rate = 1.5x (₹150/hr). OT payment = ₹750.
    // Scenario 6:
    // Ravi works all 26 working days = 26 payable days!
    // Attendance Bonus = ₹1,500!
    let rOut = pOut8h;
    if (day === 2) rOut = new Date(Date.UTC(2026, 8, day, 13, 30)); // 10h -> 2h OT
    else if (day === 3) rOut = new Date(Date.UTC(2026, 8, day, 14, 30)); // 11h -> 3h OT

    punches.push({
      employeeId: ravi!.id,
      punchDate: d,
      status: "Present",
      punchIn: pIn,
      punchOut: rOut,
      method: "Web",
    });

    // ── KUMAR (Scenario 4 & Scenario 6) ──
    // Joined Sept 2 (25 working days total in month).
    // Sept 8: Approved Leave -> 1 paid leave day (0 LOP).
    // All other 24 working days: Present.
    // Payable days = 24 present + 1 paid leave = 25 payable days!
    // Attendance Bonus = ₹750!
    if (day >= 2) {
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
          punchOut: pOut8h,
          method: "Web",
        });
      }
    }

    // ── SURESH (Scenario 3, 4, 6) ──
    // Joined Sept 2 (25 working days total in month).
    // Sept 8, 9, 10: Absent without leave -> 3 LOP days!
    // LOP deduction: ₹800 × 3 = ₹2,400.
    // Gross payable salary: ₹24,000 − ₹2,400 = ₹21,600.
    // Suresh works remaining 22 working days = 22 payable days!
    // Attendance Bonus = ₹0!
    if (day >= 2) {
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
          punchOut: pOut8h,
          method: "Web",
        });
      }
    }

    // ── RAMESH (Scenario 7: 14 Night Shifts @ ₹100/shift or Slabs 10-14 -> ₹1,000) ──
    if (day <= 16) {
      punches.push({
        employeeId: ramesh!.id,
        punchDate: d,
        status: "Night Shift",
        punchIn: new Date(Date.UTC(2026, 8, day, 15, 30)), // 21:00 IST
        punchOut: new Date(Date.UTC(2026, 8, day, 23, 30)), // 05:00 IST (8 hours night shift)
        method: "Web",
      });
    }

    // ── AMIT (Scenario 9: Multiple Payroll Components Showcase) ──
    // 26 working days (12 night shifts @ ₹100 = ₹1,200, 10h OT = ₹2,000, 26 days -> ₹1,500 Att Bonus & ₹1,000 Food)
    if (amit) {
      if (day <= 14) {
        // 12 night shifts (excluding Sundays which are already skipped)
        punches.push({
          employeeId: amit.id,
          punchDate: d,
          status: "Night Shift",
          punchIn: new Date(Date.UTC(2026, 8, day, 15, 30)), // 21:00 IST
          punchOut: new Date(Date.UTC(2026, 8, day, 23, 30)), // 05:00 IST (8 hours night shift)
          method: "Web",
        });
      } else {
        // Remaining 14 day shifts; on days 15 to 19 work 10 hours (2h OT x 5 = 10h OT @ ₹200 = ₹2,000)
        let aOut = pOut8h;
        if (day >= 15 && day <= 19) {
          aOut = new Date(Date.UTC(2026, 8, day, 13, 30)); // 10 hours worked -> 2h OT
        }
        punches.push({
          employeeId: amit.id,
          punchDate: d,
          status: "Present",
          punchIn: pIn,
          punchOut: aOut,
          method: "Web",
        });
      }
    }
  }

  await prisma.attendancePunch.createMany({ data: punches });
  console.log("Successfully seeded " + punches.length + " attendance punches for September 2026!");
}

seedScenarios()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
