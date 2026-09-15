-- ============================================================
-- Corrective migration: departments.business_unit_id + updated_at
-- ============================================================
-- Context: migration 20260823140000_add_organization_module added
-- `business_unit_id UUID NOT NULL` and `updated_at TIMESTAMP NOT NULL`
-- to "departments" without a DEFAULT or backfill — this fails against
-- a populated table.
--
-- This migration is SAFE to apply against a populated database:
-- 1. It backfills any NULL rows before tightening to NOT NULL.
-- 2. If the columns already have values for all rows (fresh install that
--    ran seed.ts), the UPDATE is a no-op and the ALTER succeeds immediately.
-- ============================================================

DO $$
DECLARE
  v_default_bu_id UUID;
BEGIN
  -- Step 1: Ensure columns are nullable so we can backfill safely.
  -- (They may already be NOT NULL on a fresh install; ALTER IF EXISTS is safe.)
  BEGIN
    ALTER TABLE "departments" ALTER COLUMN "business_unit_id" DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;

  BEGIN
    ALTER TABLE "departments" ALTER COLUMN "updated_at" DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;

  -- Step 2: Backfill updated_at for any NULL rows.
  UPDATE "departments"
  SET "updated_at" = NOW()
  WHERE "updated_at" IS NULL;

  -- Step 3: Backfill business_unit_id for any NULL rows.
  -- Attempt to find the first active business unit for the company of each department.
  UPDATE "departments" d
  SET "business_unit_id" = (
    SELECT bu.id
    FROM "business_units" bu
    WHERE bu.company_id = d.company_id
      AND bu.is_active = true
    LIMIT 1
  )
  WHERE d.business_unit_id IS NULL;

  -- Step 4: If any departments still have NULL business_unit_id
  -- (because no business units exist yet), create a default one.
  IF EXISTS (SELECT 1 FROM "departments" WHERE "business_unit_id" IS NULL) THEN
    -- Insert a default business unit for each company that needs one.
    INSERT INTO "business_units" (company_id, name, is_active, created_at, updated_at)
    SELECT DISTINCT d.company_id, 'Default Business Unit', true, NOW(), NOW()
    FROM "departments" d
    WHERE d.business_unit_id IS NULL
    ON CONFLICT DO NOTHING;

    -- Now backfill again.
    UPDATE "departments" d
    SET "business_unit_id" = (
      SELECT bu.id
      FROM "business_units" bu
      WHERE bu.company_id = d.company_id
      LIMIT 1
    )
    WHERE d.business_unit_id IS NULL;
  END IF;

  -- Step 5: Re-apply NOT NULL constraints now that all rows are populated.
  ALTER TABLE "departments" ALTER COLUMN "business_unit_id" SET NOT NULL;
  ALTER TABLE "departments" ALTER COLUMN "updated_at" SET NOT NULL;

END $$;

-- Add DEFAULT for updated_at to prevent this issue on future INSERT without explicit value.
ALTER TABLE "departments"
  ALTER COLUMN "updated_at" SET DEFAULT NOW();
