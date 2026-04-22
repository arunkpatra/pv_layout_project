-- AlterTable: add stripeCustomerId to users
ALTER TABLE "users" ADD COLUMN "stripeCustomerId" TEXT;

-- CreateIndex: stripeCustomerId unique
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- AlterTable: drop product column from license_keys
ALTER TABLE "license_keys" DROP COLUMN "product";

-- AlterTable: rename product to productId in entitlements (drop + add)
ALTER TABLE "entitlements" DROP COLUMN "product";
ALTER TABLE "entitlements" ADD COLUMN "productId" TEXT NOT NULL DEFAULT '';

-- CreateTable: products
CREATE TABLE "products" (
    "id" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceAmount" INTEGER NOT NULL,
    "priceCurrency" TEXT NOT NULL DEFAULT 'usd',
    "calculations" INTEGER NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable: product_features
CREATE TABLE "product_features" (
    "id" TEXT NOT NULL DEFAULT '',
    "productId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "product_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable: checkout_sessions
CREATE TABLE "checkout_sessions" (
    "id" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripeCheckoutSessionUrl" TEXT NOT NULL,
    "status" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: products
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE UNIQUE INDEX "products_stripePriceId_key" ON "products"("stripePriceId");

-- CreateIndex: product_features
CREATE UNIQUE INDEX "product_features_productId_featureKey_key" ON "product_features"("productId", "featureKey");

-- CreateIndex: checkout_sessions
CREATE UNIQUE INDEX "checkout_sessions_stripeCheckoutSessionId_key" ON "checkout_sessions"("stripeCheckoutSessionId");

-- AddForeignKey: product_features -> products
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: entitlements -> products
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: checkout_sessions -> users
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
