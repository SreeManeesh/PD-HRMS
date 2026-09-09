-- CreateTable
CREATE TABLE "payslip_distribution_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payroll_run_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
    "channels" JSONB NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "started_by" UUID,
    "started_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_distribution_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_distribution_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "channel" VARCHAR(30) NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_message" VARCHAR(500),
    "delivered_at" TIMESTAMP(6),
    "viewed_at" TIMESTAMP(6),
    "downloaded_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_distribution_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_distribution_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "record_id" UUID,
    "channel" VARCHAR(30) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "message" VARCHAR(500),
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_distribution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payslip_distribution_batches_payroll_run_id_idx" ON "payslip_distribution_batches"("payroll_run_id");

-- CreateIndex
CREATE INDEX "payslip_distribution_records_batch_id_idx" ON "payslip_distribution_records"("batch_id");

-- CreateIndex
CREATE INDEX "payslip_distribution_records_employee_id_idx" ON "payslip_distribution_records"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_distribution_records_batch_id_payslip_id_key" ON "payslip_distribution_records"("batch_id", "payslip_id");

-- CreateIndex
CREATE INDEX "payslip_distribution_logs_batch_id_idx" ON "payslip_distribution_logs"("batch_id");

-- AddForeignKey
ALTER TABLE "payslip_distribution_batches" ADD CONSTRAINT "payslip_distribution_batches_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_distribution_batches" ADD CONSTRAINT "payslip_distribution_batches_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_distribution_records" ADD CONSTRAINT "payslip_distribution_records_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "payslip_distribution_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_distribution_records" ADD CONSTRAINT "payslip_distribution_records_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_distribution_records" ADD CONSTRAINT "payslip_distribution_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_distribution_logs" ADD CONSTRAINT "payslip_distribution_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "payslip_distribution_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_distribution_logs" ADD CONSTRAINT "payslip_distribution_logs_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "payslip_distribution_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
