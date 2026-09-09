-- CreateTable
CREATE TABLE "payslip_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "country" VARCHAR(60) NOT NULL DEFAULT 'India',
    "state" VARCHAR(60),
    "financial_year" INTEGER NOT NULL DEFAULT 2026,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "payslip_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_template_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "blueprint" JSONB NOT NULL,
    "change_summary" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "rule_type" VARCHAR(30) NOT NULL DEFAULT 'COMPONENT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "version" VARCHAR(20) NOT NULL DEFAULT '1.0',
    "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country" VARCHAR(60) NOT NULL DEFAULT 'India',
    "state" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "rule_type" VARCHAR(30) NOT NULL DEFAULT 'COMPONENT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "version" VARCHAR(20) NOT NULL DEFAULT '1.0',
    "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "state_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country" VARCHAR(60) NOT NULL DEFAULT 'India',
    "regime" VARCHAR(20) NOT NULL,
    "rule_type" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slab_order" INTEGER NOT NULL DEFAULT 0,
    "slab_min" DECIMAL(16,2),
    "slab_max" DECIMAL(16,2),
    "rate" DECIMAL(8,4),
    "amount" DECIMAL(16,2),
    "limit_value" DECIMAL(16,2),
    "section" VARCHAR(30),
    "formula" TEXT,
    "financial_year" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "version" VARCHAR(20) NOT NULL DEFAULT '1.0',
    "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tax_selections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "regime" VARCHAR(20) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'EMPLOYEE',
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "employee_tax_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "component_id" VARCHAR(80) NOT NULL,
    "system_assignment" VARCHAR(120) NOT NULL,
    "manual_override" VARCHAR(120) NOT NULL,
    "override_reason" TEXT,
    "overridden_by_id" UUID,
    "overridden_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payslip_templates_status_idx" ON "payslip_templates"("status");

-- CreateIndex
CREATE INDEX "payslip_template_versions_status_idx" ON "payslip_template_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_template_versions_template_id_version_no_key" ON "payslip_template_versions"("template_id", "version_no");

-- CreateIndex
CREATE INDEX "country_rules_country_status_idx" ON "country_rules"("country", "status");

-- CreateIndex
CREATE INDEX "state_rules_country_state_status_idx" ON "state_rules"("country", "state", "status");

-- CreateIndex
CREATE INDEX "tax_rules_country_regime_financial_year_status_idx" ON "tax_rules"("country", "regime", "financial_year", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tax_selections_employee_id_financial_year_key" ON "employee_tax_selections"("employee_id", "financial_year");

-- CreateIndex
CREATE INDEX "template_overrides_template_id_idx" ON "template_overrides"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_overrides_template_id_component_id_key" ON "template_overrides"("template_id", "component_id");

-- AddForeignKey
ALTER TABLE "payslip_templates" ADD CONSTRAINT "payslip_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_template_versions" ADD CONSTRAINT "payslip_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "payslip_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_template_versions" ADD CONSTRAINT "payslip_template_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tax_selections" ADD CONSTRAINT "employee_tax_selections_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tax_selections" ADD CONSTRAINT "employee_tax_selections_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_overrides" ADD CONSTRAINT "template_overrides_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "payslip_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_overrides" ADD CONSTRAINT "template_overrides_overridden_by_id_fkey" FOREIGN KEY ("overridden_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
