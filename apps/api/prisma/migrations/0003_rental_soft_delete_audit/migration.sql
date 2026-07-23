-- AlterTable
ALTER TABLE "public"."Rental"
ADD COLUMN "deletedByUserId" TEXT,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deleteReason" TEXT;

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "snapshotBefore" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rental_deletedAt_idx" ON "public"."Rental"("deletedAt");

-- CreateIndex
CREATE INDEX "Rental_deletedByUserId_idx" ON "public"."Rental"("deletedByUserId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "public"."AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "public"."AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."Rental" ADD CONSTRAINT "Rental_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

