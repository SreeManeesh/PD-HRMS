-- AlterTable
ALTER TABLE "compliance_cases" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "compliance_obligations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "compliance_retention_records" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "annual_salary" DECIMAL(14,2),
ADD COLUMN     "country" VARCHAR(60),
ADD COLUMN     "state" VARCHAR(60);

-- AlterTable
ALTER TABLE "policies" ALTER COLUMN "updated_at" DROP DEFAULT;
