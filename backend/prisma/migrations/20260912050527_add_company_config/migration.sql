-- CreateTable
CREATE TABLE "company_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "shift_start_minutes" INTEGER NOT NULL DEFAULT 540,
    "shift_end_minutes" INTEGER NOT NULL DEFAULT 1080,
    "weekly_off_days" JSONB NOT NULL DEFAULT '[]',
    "epf_employer_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.13,
    "esi_employer_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.0325,
    "esi_gross_ceiling" DECIMAL(12,2) NOT NULL DEFAULT 21000,
    "gratuity_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.0481,
    "overtime_multiplier" DECIMAL(5,3) NOT NULL DEFAULT 1.5,
    "basic_salary_factor" DECIMAL(6,4) NOT NULL DEFAULT 0.5,
    "hra_factor" DECIMAL(6,4) NOT NULL DEFAULT 0.2,
    "conveyance_allowance" DECIMAL(12,2) NOT NULL DEFAULT 400,
    "medical_allowance" DECIMAL(12,2) NOT NULL DEFAULT 250,
    "provident_fund_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.12,
    "professional_tax" DECIMAL(12,2) NOT NULL DEFAULT 200,
    "income_tax_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.05,
    "health_insurance" DECIMAL(12,2) NOT NULL DEFAULT 180,
    "default_tax_regime" VARCHAR(10) NOT NULL DEFAULT 'NEW',
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "company_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_configs_company_id_key" ON "company_configs"("company_id");

-- AddForeignKey
ALTER TABLE "company_configs" ADD CONSTRAINT "company_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
