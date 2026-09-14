import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Updating employees to Indian States & realistic locations...");

  // Indian locations map
  const stateMappings: Record<string, { state: string; city: string; skillType: string }> = {
    EMP001: { state: "Maharashtra", city: "Pune", skillType: "Skilled" },
    EMP002: { state: "Delhi", city: "Delhi", skillType: "Skilled" },
    EMP003: { state: "Karnataka", city: "Bengaluru", skillType: "Semi-Skilled" },
    EMP004: { state: "Maharashtra", city: "Mumbai", skillType: "Skilled" },
    EMP005: { state: "Gujarat", city: "Ahmedabad", skillType: "Skilled" },
    EMP006: { state: "Uttar Pradesh", city: "Noida", skillType: "Unskilled" },
    EMP007: { state: "Delhi", city: "Delhi", skillType: "Skilled" },
    EMP008: { state: "Gujarat", city: "Surat", skillType: "Semi-Skilled" },
    EMP009: { state: "Tamil Nadu", city: "Chennai", skillType: "Skilled" },
    EMP010: { state: "Maharashtra", city: "Pune", skillType: "Skilled" },
    EMP011: { state: "Telangana", city: "Hyderabad", skillType: "Semi-Skilled" },
    EMP012: { state: "Karnataka", city: "Bengaluru", skillType: "Skilled" },
    EMP013: { state: "Maharashtra", city: "Mumbai", skillType: "Semi-Skilled" },
    EMP014: { state: "Telangana", city: "Hyderabad", skillType: "Semi-Skilled" },
    EMP015: { state: "Tamil Nadu", city: "Chennai", skillType: "Unskilled" },
    EMP016: { state: "Delhi", city: "Delhi", skillType: "Skilled" },
    EMP017: { state: "Haryana", city: "Gurugram", skillType: "Semi-Skilled" },
    EMP018: { state: "Uttar Pradesh", city: "Noida", skillType: "Unskilled" },
    EMP019: { state: "Kerala", city: "Kochi", skillType: "Skilled" },
    EMP020: { state: "West Bengal", city: "Kolkata", skillType: "Skilled" },
  };

  const emps = await prisma.employee.findMany();
  for (const emp of emps) {
    const mapping = stateMappings[emp.employeeCode];
    if (mapping) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: {
          state: mapping.state,
          country: "India",
          skillType: mapping.skillType,
          address: `${emp.address ? emp.address.split(",")[0] : "Unit 12"}, ${mapping.city}, ${mapping.state}, India`,
        },
      });
      console.log(`Updated ${emp.employeeCode} (${emp.firstName} ${emp.lastName}) -> ${mapping.state} (${mapping.skillType})`);
    }
  }

  console.log("Employees updated successfully.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
