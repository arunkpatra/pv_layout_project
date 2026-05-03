-- DropForeignKey
ALTER TABLE "usage_records" DROP CONSTRAINT "usage_records_refundsRecordId_fkey";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "parsedKmz" JSONB;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_refundsRecordId_fkey" FOREIGN KEY ("refundsRecordId") REFERENCES "usage_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
