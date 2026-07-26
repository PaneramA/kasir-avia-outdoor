ALTER TABLE "public"."Item"
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Item_tenantId_branchId_archivedAt_createdAt_idx"
ON "public"."Item"("tenantId", "branchId", "archivedAt", "createdAt");
