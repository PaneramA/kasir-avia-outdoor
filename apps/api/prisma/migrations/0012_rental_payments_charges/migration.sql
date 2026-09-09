-- CreateTable
CREATE TABLE "RentalPayment" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalCharge" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "chargedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalCharge_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Rental" ALTER COLUMN "paymentStatus" SET DEFAULT 'BELUM_BAYAR';

-- CreateIndex
CREATE UNIQUE INDEX "RentalPayment_tenantId_idempotencyKey_key" ON "RentalPayment"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "RentalPayment_rentalId_paidAt_idx" ON "RentalPayment"("rentalId", "paidAt");

-- CreateIndex
CREATE INDEX "RentalPayment_tenantId_branchId_paidAt_idx" ON "RentalPayment"("tenantId", "branchId", "paidAt");

-- CreateIndex
CREATE INDEX "RentalPayment_createdByUserId_idx" ON "RentalPayment"("createdByUserId");

-- CreateIndex
CREATE INDEX "RentalCharge_rentalId_chargedAt_idx" ON "RentalCharge"("rentalId", "chargedAt");

-- CreateIndex
CREATE INDEX "RentalCharge_tenantId_branchId_chargedAt_idx" ON "RentalCharge"("tenantId", "branchId", "chargedAt");

-- CreateIndex
CREATE INDEX "RentalCharge_createdByUserId_idx" ON "RentalCharge"("createdByUserId");

-- AddForeignKey
ALTER TABLE "RentalPayment" ADD CONSTRAINT "RentalPayment_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalPayment" ADD CONSTRAINT "RentalPayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalCharge" ADD CONSTRAINT "RentalCharge_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalCharge" ADD CONSTRAINT "RentalCharge_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "RentalPayment" (
  "id", "rentalId", "tenantId", "branchId", "amount", "method",
  "paidAt", "note", "idempotencyKey", "createdByUserId", "createdAt"
)
SELECT
  'legacy-payment-' || r."id", r."id", r."tenantId", r."branchId",
  CASE
    WHEN UPPER(r."paymentStatus") = 'LUNAS' AND r."paidAmount" = 0
      THEN COALESCE(r."finalTotal", r."total")
    ELSE r."paidAmount"
  END,
  CASE WHEN UPPER(r."paymentMethod") IN ('TUNAI', 'QRIS', 'BANK') THEN UPPER(r."paymentMethod") ELSE 'TUNAI' END,
  r."date", 'Migrasi pembayaran lama', 'legacy:' || r."id", NULL, r."createdAt"
FROM "Rental" r
WHERE r."paidAmount" > 0 OR UPPER(r."paymentStatus") = 'LUNAS'
ON CONFLICT ("tenantId", "idempotencyKey") DO NOTHING;

INSERT INTO "RentalCharge" (
  "id", "rentalId", "tenantId", "branchId", "type", "description",
  "quantity", "unitAmount", "amount", "chargedAt", "createdByUserId", "createdAt"
)
SELECT
  'legacy-charge-' || r."id", r."id", r."tenantId", r."branchId",
  'LEGACY_ADDITIONAL_FEE', 'Denda/biaya tambahan lama', 1,
  r."additionalFee", r."additionalFee", COALESCE(r."returnDate", r."updatedAt"), NULL, r."createdAt"
FROM "Rental" r
WHERE r."additionalFee" > 0
ON CONFLICT ("id") DO NOTHING;