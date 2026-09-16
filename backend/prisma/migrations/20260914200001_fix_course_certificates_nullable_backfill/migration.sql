-- ============================================================
-- Corrective migration: course_certificates.updatedAt + verificationToken
-- ============================================================
-- Context: migration 20260826111029_add_production_course_certificates
-- added `updatedAt TIMESTAMP NOT NULL` and `verificationToken TEXT NOT NULL`
-- to "course_certificates" without a default value. Prisma's own generated
-- warning states: "This is not possible if the table is not empty."
--
-- This migration is SAFE to apply against a populated database:
-- 1. Temporarily allows NULL so backfill can succeed.
-- 2. Backfills any NULL rows before re-applying NOT NULL.
-- 3. Ensures unique verificationToken values via gen_random_uuid().
-- ============================================================

DO $$
BEGIN
  -- Step 1: Drop NOT NULL constraints temporarily if they are set.
  BEGIN
    ALTER TABLE "course_certificates" ALTER COLUMN "updatedAt" DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;

  BEGIN
    ALTER TABLE "course_certificates" ALTER COLUMN "verificationToken" DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;

  -- Step 2: Backfill updatedAt for any NULL rows.
  UPDATE "course_certificates"
  SET "updatedAt" = NOW()
  WHERE "updatedAt" IS NULL;

  -- Step 3: Backfill verificationToken with unique UUIDs for any NULL rows.
  -- Each row gets a unique token; gen_random_uuid() guarantees uniqueness.
  UPDATE "course_certificates"
  SET "verificationToken" = gen_random_uuid()::text
  WHERE "verificationToken" IS NULL;

  -- Step 4: Re-apply NOT NULL constraints.
  ALTER TABLE "course_certificates" ALTER COLUMN "updatedAt" SET NOT NULL;
  ALTER TABLE "course_certificates" ALTER COLUMN "verificationToken" SET NOT NULL;

END $$;

-- Add DEFAULT for updatedAt to prevent this issue on future rows.
ALTER TABLE "course_certificates"
  ALTER COLUMN "updatedAt" SET DEFAULT NOW();
