CREATE TABLE IF NOT EXISTS "Expense" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'TUNAI',
  "notes" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Expense_tenantId_branchId_date_idx" ON "Expense"("tenantId", "branchId", "date");
CREATE INDEX IF NOT EXISTS "Expense_tenantId_branchId_deletedAt_date_idx" ON "Expense"("tenantId", "branchId", "deletedAt", "date");
CREATE INDEX IF NOT EXISTS "Expense_createdByUserId_idx" ON "Expense"("createdByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Expense_tenantId_fkey'
  ) THEN
    ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Expense_branchId_fkey'
  ) THEN
    ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Expense_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
