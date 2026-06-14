-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceAmount" INTEGER NOT NULL DEFAULT 0,
    "pricePeriod" TEXT NOT NULL DEFAULT 'monthly',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."PlanFeature" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "billingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."TenantUsageSnapshot" (
    "id" TEXT NOT NULL,
    "tenantSubscriptionId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "branchCount" INTEGER NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyTransactionCount" INTEGER NOT NULL DEFAULT 0,
    "activeUserCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantUsageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Plan_code_key" ON "public"."Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PlanFeature_planId_key_key" ON "public"."PlanFeature"("planId", "key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlanFeature_key_idx" ON "public"."PlanFeature"("key");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TenantSubscription_tenantId_key" ON "public"."TenantSubscription"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TenantSubscription_planId_status_idx" ON "public"."TenantSubscription"("planId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TenantUsageSnapshot_tenantSubscriptionId_periodKey_key" ON "public"."TenantUsageSnapshot"("tenantSubscriptionId", "periodKey");

-- AddForeignKey
ALTER TABLE "public"."PlanFeature"
ADD CONSTRAINT "PlanFeature_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantSubscription"
ADD CONSTRAINT "TenantSubscription_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantSubscription"
ADD CONSTRAINT "TenantSubscription_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantUsageSnapshot"
ADD CONSTRAINT "TenantUsageSnapshot_tenantSubscriptionId_fkey"
FOREIGN KEY ("tenantSubscriptionId") REFERENCES "public"."TenantSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
