import { prisma } from "../lib/prisma";

async function main() {
  const comps = await prisma.payrollComponentConfig.findMany();
  console.log("Payroll Component Configs in DB (" + comps.length + "):");
  for (const c of comps) {
    console.log(JSON.stringify({
      id: c.id,
      code: c.code,
      name: c.name,
      kind: c.kind,
      calcType: c.calcType,
      metric: c.metric,
      slabs: c.slabs,
      value: c.value,
      isActive: c.isActive,
    }, null, 2));
  }

  const shifts = await prisma.attendanceShift.findMany();
  console.log("\nAttendance Shifts in DB (" + shifts.length + "):");
  for (const s of shifts) {
    console.log({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime });
  }

  const company = await prisma.company.findFirst({
    include: { companyConfig: true },
  });
  console.log("\nCompany Config (Overtime / Shift):", {
    shiftStartMinutes: company?.companyConfig?.shiftStartMinutes,
    shiftEndMinutes: company?.companyConfig?.shiftEndMinutes,
    overtimeMultiplier: company?.companyConfig?.overtimeMultiplier,
    weeklyOffOtMultiplier: company?.companyConfig?.weeklyOffOtMultiplier,
    holidayOtMultiplier: company?.companyConfig?.holidayOtMultiplier,
    nightOtMultiplier: company?.companyConfig?.nightOtMultiplier,
    minOtMinutesThreshold: company?.companyConfig?.minOtMinutesThreshold,
    maxOtHoursMonthly: company?.companyConfig?.maxOtHoursMonthly,
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
