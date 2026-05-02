-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "id" SET DEFAULT '';

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'RUNNING',
ALTER COLUMN "id" SET DEFAULT '';

-- Backfill: every persisted Run today has a result blob → completed.
-- New rows going forward use the column default 'RUNNING'.
-- Source: B27 memo 2026-05-02-002 §A.1 (refund-on-cancel policy).
UPDATE "runs" SET "status" = 'DONE';

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "id" SET DEFAULT '';

-- AlterTable
ALTER TABLE "usage_records" ADD COLUMN     "count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'charge',
ADD COLUMN     "refundsRecordId" TEXT;

-- CreateIndex
CREATE INDEX "runs_status_idx" ON "runs"("status");

-- CreateIndex
CREATE INDEX "usage_records_userId_kind_idx" ON "usage_records"("userId", "kind");

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_refundsRecordId_fkey" FOREIGN KEY ("refundsRecordId") REFERENCES "usage_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
