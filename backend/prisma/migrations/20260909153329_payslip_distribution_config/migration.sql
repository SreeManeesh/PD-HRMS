-- AlterTable
ALTER TABLE "payslip_distribution_batches" ADD COLUMN     "config" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "template_id" UUID;
