-- AlterTable
ALTER TABLE "payslips" ADD COLUMN "attendance_summary" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN "employer_contributions" JSONB NOT NULL DEFAULT '{}';