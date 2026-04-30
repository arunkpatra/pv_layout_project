-- AlterTable
ALTER TABLE "entitlements" ADD COLUMN "projectQuota" INTEGER NOT NULL DEFAULT 0;

-- Backfill from products. Pre-B19 rows have projectQuota = 0 by default;
-- this UPDATE snapshots the current Product.projectQuota for each one so
-- B8 / getProjectQuotaState can read off Entitlement directly without a JOIN.
UPDATE "entitlements"
SET "projectQuota" = "products"."projectQuota"
FROM "products"
WHERE "entitlements"."productId" = "products"."id";
