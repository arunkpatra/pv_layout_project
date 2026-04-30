-- AlterTable
ALTER TABLE "entitlements" ALTER COLUMN "productId" DROP DEFAULT;

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "licenseKeyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_licenseKeyId_fkey" FOREIGN KEY ("licenseKeyId") REFERENCES "license_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
