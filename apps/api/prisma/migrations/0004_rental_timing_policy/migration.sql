-- AlterTable
ALTER TABLE "public"."TenantSettings"
ADD COLUMN IF NOT EXISTS "rentalDayCountMode" TEXT NOT NULL DEFAULT 'ROLLING_24H',
ADD COLUMN IF NOT EXISTS "rentalCutoffHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN IF NOT EXISTS "rentalCutoffMinute" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Rental"
ADD COLUMN IF NOT EXISTS "plannedReturnDate" TIMESTAMP(3);

-- Backfill planned return date for legacy rows.
UPDATE "public"."Rental"
SET "plannedReturnDate" = "date" + ("duration" * INTERVAL '1 day')
WHERE "plannedReturnDate" IS NULL;
