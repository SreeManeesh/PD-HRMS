-- DropForeignKey
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_salary_structure_id_fkey";

-- AlterTable
ALTER TABLE "payslips" ALTER COLUMN "salary_structure_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
