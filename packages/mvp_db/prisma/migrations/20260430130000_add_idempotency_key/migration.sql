-- AlterTable
ALTER TABLE "usage_records" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "checkout_sessions" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_userId_idempotencyKey_key"
  ON "usage_records" ("userId", "idempotencyKey");
