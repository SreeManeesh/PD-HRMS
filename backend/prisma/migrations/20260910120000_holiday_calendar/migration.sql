-- AlterTable
ALTER TABLE "companies" ADD COLUMN "weekly_off_days" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "date" DATE NOT NULL,
    "country" VARCHAR(60) NOT NULL DEFAULT 'India',
    "state" VARCHAR(60),
    "type" VARCHAR(30) NOT NULL DEFAULT 'Public',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holidays_country_state_date_key" ON "holidays"("country", "state", "date");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");