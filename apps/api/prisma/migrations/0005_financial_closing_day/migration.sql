ALTER TABLE "public"."TenantSettings"
ADD COLUMN IF NOT EXISTS "financialClosingDay" INTEGER NOT NULL DEFAULT 31;
