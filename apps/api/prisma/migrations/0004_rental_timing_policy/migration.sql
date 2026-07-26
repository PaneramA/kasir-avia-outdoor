-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantSettings" (
    "tenantId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "addressLines" JSONB NOT NULL,
    "phone" TEXT,
    "legalFooterLines" JSONB NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "rentalDayCountMode" TEXT NOT NULL DEFAULT 'ROLLING_24H',
    "rentalCutoffHour" INTEGER NOT NULL DEFAULT 8,
    "rentalCutoffMinute" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "public"."BranchSettings" (
    "branchId" TEXT NOT NULL,
    "storeName" TEXT,
    "addressLines" JSONB,
    "phone" TEXT,
    "legalFooterLines" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchSettings_pkey" PRIMARY KEY ("branchId")
);

-- CreateTable
CREATE TABLE "public"."UserMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserBranchAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'kasir',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "public"."Category"
ADD COLUMN "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Item"
ADD COLUMN "tenantId" TEXT NOT NULL,
ADD COLUMN "branchId" TEXT;

-- AlterTable
ALTER TABLE "public"."Customer"
ADD COLUMN "tenantId" TEXT NOT NULL,
ADD COLUMN "branchId" TEXT,
ADD COLUMN "address" TEXT;

-- AlterTable
ALTER TABLE "public"."Rental"
ADD COLUMN "tenantId" TEXT NOT NULL,
ADD COLUMN "branchId" TEXT NOT NULL,
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'LUNAS',
ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'TUNAI',
ADD COLUMN "paidAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "plannedReturnDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."ReturnRecord"
ADD COLUMN "tenantId" TEXT NOT NULL,
ADD COLUMN "branchId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."AuditLog"
ADD COLUMN "tenantId" TEXT NOT NULL,
ADD COLUMN "branchId" TEXT NOT NULL;

-- Backfill planned return date for legacy rows.
UPDATE "public"."Rental"
SET "plannedReturnDate" = "date" + ("duration" * INTERVAL '1 day')
WHERE "plannedReturnDate" IS NULL;

-- Rebuild obsolete single-tenant unique indexes.
DROP INDEX IF EXISTS "public"."Category_name_key";
DROP INDEX IF EXISTS "public"."Customer_phone_key";

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "public"."Tenant"("slug");

-- CreateIndex
CREATE INDEX "Category_tenantId_idx" ON "public"."Category"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantId_name_key" ON "public"."Category"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_code_key" ON "public"."Branch"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Branch_tenantId_status_idx" ON "public"."Branch"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserMembership_userId_tenantId_key" ON "public"."UserMembership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "UserMembership_tenantId_role_status_idx" ON "public"."UserMembership"("tenantId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserBranchAccess_userId_branchId_key" ON "public"."UserBranchAccess"("userId", "branchId");

-- CreateIndex
CREATE INDEX "UserBranchAccess_branchId_role_idx" ON "public"."UserBranchAccess"("branchId", "role");

-- CreateIndex
CREATE INDEX "Item_tenantId_branchId_idx" ON "public"."Item"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Item_tenantId_branchId_createdAt_idx" ON "public"."Item"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_phone_key" ON "public"."Customer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Customer_tenantId_branchId_idx" ON "public"."Customer"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_branchId_updatedAt_idx" ON "public"."Customer"("tenantId", "branchId", "updatedAt");

-- CreateIndex
CREATE INDEX "Rental_tenantId_branchId_idx" ON "public"."Rental"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Rental_tenantId_branchId_deletedAt_date_idx" ON "public"."Rental"("tenantId", "branchId", "deletedAt", "date");

-- CreateIndex
CREATE INDEX "ReturnRecord_tenantId_branchId_idx" ON "public"."ReturnRecord"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "ReturnRecord_tenantId_branchId_returnDate_idx" ON "public"."ReturnRecord"("tenantId", "branchId", "returnDate");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_branchId_idx" ON "public"."AuditLog"("tenantId", "branchId");

-- AddForeignKey
ALTER TABLE "public"."Branch"
ADD CONSTRAINT "Branch_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantSettings"
ADD CONSTRAINT "TenantSettings_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BranchSettings"
ADD CONSTRAINT "BranchSettings_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserMembership"
ADD CONSTRAINT "UserMembership_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserMembership"
ADD CONSTRAINT "UserMembership_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserBranchAccess"
ADD CONSTRAINT "UserBranchAccess_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserBranchAccess"
ADD CONSTRAINT "UserBranchAccess_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
