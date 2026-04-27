-- Wipe transactional data (test data only; permitted by spec)
TRUNCATE TABLE usage_records, entitlements, license_keys, checkout_sessions, users RESTART IDENTITY CASCADE;

-- Drop money columns from checkout_sessions (move to transactions)
ALTER TABLE "checkout_sessions" DROP COLUMN "amountTotal";
ALTER TABLE "checkout_sessions" DROP COLUMN "currency";

-- Create transactions table
CREATE TABLE "transactions" (
  "id"                   TEXT PRIMARY KEY,
  "userId"               TEXT NOT NULL,
  "productId"            TEXT NOT NULL,
  "source"               TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'COMPLETED',
  "amount"               INTEGER NOT NULL,
  "currency"             TEXT NOT NULL DEFAULT 'usd',
  "purchasedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentMethod"        TEXT,
  "externalReference"    TEXT,
  "notes"                TEXT,
  "createdByUserId"      TEXT,
  "checkoutSessionId"    TEXT,
  CONSTRAINT "transactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transactions_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transactions_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "transactions_checkoutSessionId_fkey"
    FOREIGN KEY ("checkoutSessionId") REFERENCES "checkout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "transactions_checkoutSessionId_key" ON "transactions"("checkoutSessionId");
CREATE INDEX "transactions_userId_purchasedAt_idx" ON "transactions"("userId", "purchasedAt" DESC);
CREATE INDEX "transactions_source_idx" ON "transactions"("source");
CREATE INDEX "transactions_purchasedAt_idx" ON "transactions"("purchasedAt");

-- Add transactionId to entitlements (NOT NULL safe because table was just truncated)
ALTER TABLE "entitlements"
  ADD COLUMN "transactionId" TEXT NOT NULL,
  ADD CONSTRAINT "entitlements_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
