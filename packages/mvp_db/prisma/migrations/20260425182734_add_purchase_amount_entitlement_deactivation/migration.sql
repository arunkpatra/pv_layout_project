-- AlterTable
ALTER TABLE "checkout_sessions" ADD COLUMN     "amountTotal" INTEGER,
ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "entitlements" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);
