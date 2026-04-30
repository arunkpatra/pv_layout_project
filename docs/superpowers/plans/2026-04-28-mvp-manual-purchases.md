# Manual Purchases & Unified Transaction Ledger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a unified `Transaction` ledger as the system of record for all purchases (Stripe + admin-recorded manual), add admin UI to record manual purchases, fix the kill-switch enforcement gap at `POST /usage/report`.

**Architecture:** New `Transaction` table FK'd from `Entitlement`; `CheckoutSession` shrinks to Stripe metadata. `clerkAuth` first-auth and Stripe `provisionEntitlement` both write Transaction rows. New admin routes + UI for manual purchases. Reporting aggregations swap from `CheckoutSession.amountTotal` to `Transaction.amount` filtered by `source IN ('STRIPE', 'MANUAL')`.

**Tech Stack:** Bun + Hono + Prisma + PostgreSQL on the API; Next.js 16 + React 19 + TanStack Query + shadcn/ui on the admin app. TDD via `bun:test` (mocked Prisma) and `vitest` + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-04-28-mvp-manual-purchases-design.md`. Read it before starting.

**Branch:** `mvp-manual-purchases`.

---

## File Structure Overview

### Schema & migration
- Modify: `packages/mvp_db/prisma/schema.prisma`
- Modify: `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`
- Create: `packages/mvp_db/prisma/migrations/2026XXXX_unify_transactions/migration.sql`

### Backend (apps/mvp_api)
- Create: `src/modules/transactions/transactions.service.ts`
- Create: `src/modules/transactions/transactions.routes.ts`
- Create: `src/modules/transactions/transactions.service.test.ts`
- Create: `src/modules/transactions/transactions.routes.test.ts`
- Create: `src/modules/transactions/types.ts` (Zod schemas + shared types)
- Create: `src/modules/billing/create-entitlement-and-transaction.ts` (shared helper)
- Modify: `src/modules/billing/provision.ts`
- Modify: `src/modules/billing/billing.provision.test.ts`
- Modify: `src/modules/billing/billing.routes.test.ts`
- Modify: `src/modules/webhooks/stripe.webhook.test.ts`
- Modify: `src/modules/usage/usage.service.ts`
- Modify: `src/modules/usage/usage.test.ts` (kill-switch fix tests)
- Modify: `src/middleware/clerk-auth.ts`
- Modify: `src/middleware/clerk-auth.test.ts`
- Modify: `src/modules/admin/admin.service.ts` (user search by email)
- Modify: `src/modules/admin/admin.routes.ts`
- Modify: `src/modules/admin/admin.routes.test.ts`
- Modify: `src/modules/admin/customer.service.ts` (total spend swap)
- Modify: `src/modules/admin/dashboard.service.ts` (aggregations swap + source split)
- Modify: `src/modules/admin/dashboard.service.test.ts`
- Modify: `src/modules/admin/dashboard.routes.ts` (response shape)
- Modify: `src/modules/admin/dashboard.routes.test.ts`
- Modify: `src/modules/admin/product.service.ts`
- Modify: `src/modules/admin/product.service.test.ts`
- Modify: `src/modules/admin/sales-utils.ts`
- Modify: `src/modules/admin/sales-utils.test.ts`
- Modify: `src/app.ts` (mount transactions routes)

### Admin app (apps/mvp_admin)
- Create: `app/(admin)/transactions/page.tsx`
- Create: `app/(admin)/transactions/_components/transactions-page-client.tsx`
- Create: `app/(admin)/transactions/_components/transactions-page-client.test.tsx`
- Create: `app/(admin)/transactions/new/page.tsx`
- Create: `app/(admin)/transactions/new/_components/new-transaction-form.tsx`
- Create: `app/(admin)/transactions/new/_components/new-transaction-form.test.tsx`
- Create: `app/(admin)/transactions/[id]/page.tsx`
- Create: `app/(admin)/transactions/[id]/_components/transaction-detail-client.tsx`
- Create: `lib/hooks/use-admin-transactions.ts`
- Create: `lib/hooks/use-admin-user-search.ts`
- Modify: `components/admin-sidebar.tsx` (add Transactions nav)
- Modify: `components/admin-sidebar.test.tsx`
- Modify: `app/(admin)/customers/[id]/_components/customer-detail-client.tsx` (Transactions section)
- Modify: `app/(admin)/dashboard/_components/dashboard-client.tsx` (subtitle on Revenue + Purchases cards)
- Modify: `app/(admin)/plans/[slug]/_components/product-detail-client.tsx` (subtitle on cards)
- Modify: `lib/api.ts` (add Transaction types if not auto-derived)

---

## Phase A — Schema, ID prefix, migration

### Task 1: Add Transaction semantic ID prefix

**Files:**
- Modify: `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`

- [ ] **Step 1: Edit the prefix registry**

Replace the `ID_PREFIXES` const with:

```typescript
export const ID_PREFIXES: Record<string, string> = {
  DownloadRegistration: "drg",
  ContactSubmission: "csb",
  User: "usr",
  LicenseKey: "lk",
  Product: "prod",
  ProductFeature: "pf",
  Entitlement: "ent",
  CheckoutSession: "cs",
  UsageRecord: "ur",
  Transaction: "txn",
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run typecheck --filter=@renewable-energy/mvp-db
```

Expected: PASS (no usages of `Transaction` model yet).

- [ ] **Step 3: Commit**

```bash
git add packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts
git commit -m "feat(mvp-db): register Transaction semantic ID prefix"
```

---

### Task 2: Update Prisma schema

**Files:**
- Modify: `packages/mvp_db/prisma/schema.prisma`

- [ ] **Step 1: Add the `Transaction` model**

Append to the schema (after `UsageRecord`):

```prisma
model Transaction {
  id                  String           @id @default("")
  userId              String
  user                User             @relation("TransactionUser", fields: [userId], references: [id])
  productId           String
  product             Product          @relation(fields: [productId], references: [id])
  source              String                                              // "STRIPE" | "MANUAL" | "FREE_AUTO"
  status              String           @default("COMPLETED")
  amount              Int                                                 // USD cents
  currency            String           @default("usd")
  purchasedAt         DateTime         @default(now())
  createdAt           DateTime         @default(now())
  paymentMethod       String?                                             // "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "OTHER"; nullable
  externalReference   String?
  notes               String?
  createdByUserId     String?
  createdByUser       User?            @relation("TransactionCreatedBy", fields: [createdByUserId], references: [id])
  checkoutSessionId   String?          @unique
  checkoutSession     CheckoutSession? @relation(fields: [checkoutSessionId], references: [id])
  entitlements        Entitlement[]

  @@index([userId, purchasedAt(sort: Desc)])
  @@index([source])
  @@index([purchasedAt])
  @@map("transactions")
}
```

- [ ] **Step 2: Update the `User` model relations**

Replace the existing `User` model relation lines:

```prisma
  licenseKeys      LicenseKey[]
  entitlements     Entitlement[]
  checkoutSessions CheckoutSession[]
  usageRecords     UsageRecord[]
```

with:

```prisma
  licenseKeys           LicenseKey[]
  entitlements          Entitlement[]
  checkoutSessions      CheckoutSession[]
  usageRecords          UsageRecord[]
  transactions          Transaction[]    @relation("TransactionUser")
  transactionsRecorded  Transaction[]    @relation("TransactionCreatedBy")
```

- [ ] **Step 3: Update the `Product` model relations**

Add to the `Product` model:

```prisma
  transactions  Transaction[]
```

- [ ] **Step 4: Update the `Entitlement` model**

Replace the `Entitlement` model body with:

```prisma
model Entitlement {
  id                String      @id @default("")
  userId            String
  user              User        @relation(fields: [userId], references: [id])
  productId         String
  product           Product     @relation(fields: [productId], references: [id])
  transactionId     String
  transaction       Transaction @relation(fields: [transactionId], references: [id])
  totalCalculations Int
  usedCalculations  Int         @default(0)
  purchasedAt       DateTime    @default(now())
  deactivatedAt     DateTime?

  @@map("entitlements")
}
```

- [ ] **Step 5: Update the `CheckoutSession` model**

Replace the `CheckoutSession` model body with (drops `amountTotal` and `currency`; adds back-ref):

```prisma
model CheckoutSession {
  id                       String       @id @default("")
  userId                   String
  user                     User         @relation(fields: [userId], references: [id])
  productSlug              String
  stripeCheckoutSessionId  String       @unique
  stripeCheckoutSessionUrl String
  status                   String?
  processedAt              DateTime?
  createdAt                DateTime     @default(now())
  transaction              Transaction?

  @@map("checkout_sessions")
}
```

- [ ] **Step 6: Validate the schema**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run mvp-db:validate
```

Expected: schema is valid.

- [ ] **Step 7: Generate Prisma client**

```bash
bun run mvp-db:generate
```

Expected: client regenerated; no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/mvp_db/prisma/schema.prisma
git commit -m "feat(mvp-db): add Transaction model, link Entitlement, shrink CheckoutSession"
```

---

### Task 3: Create the migration

**Files:**
- Create: `packages/mvp_db/prisma/migrations/<timestamp>_unify_transactions/migration.sql`

- [ ] **Step 1: Generate the migration scaffold**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run mvp-db:migrate -- --create-only --name unify_transactions
```

Expected: a new migration directory under `packages/mvp_db/prisma/migrations/` with a generated `migration.sql`.

- [ ] **Step 2: Replace the migration body**

Open the generated `migration.sql` and replace its entire content with:

```sql
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
```

- [ ] **Step 3: Apply the migration locally**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run mvp-db:migrate
```

Expected: migration applied; transactional data wiped; new schema active.

- [ ] **Step 4: Verify with mvp-db:status**

```bash
bun run mvp-db:status
```

Expected: all migrations applied; database in sync.

- [ ] **Step 5: Commit**

```bash
git add packages/mvp_db/prisma/migrations/
git commit -m "feat(mvp-db): migration to unify transactions and wipe test data"
```

---

### Task 4: Re-seed products (idempotent) and confirm DB state

**Files:** none

- [ ] **Step 1: Run seed**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bunx turbo run mvp-db:seed --filter=@renewable-energy/mvp-db
```

If that script doesn't exist, run directly:

```bash
cd packages/mvp_db && bun run prisma/seed-products.ts
```

Expected: 4 products upserted (free, basic, pro, pro-plus).

- [ ] **Step 2: Verify products via Prisma Studio (optional)**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run mvp-db:studio
```

Browse to `products` and confirm 4 rows. Close studio.

- [ ] **Step 3: No commit needed**

---

## Phase B — Kill-switch fix at `POST /usage/report`

### Task 5: Failing test — deactivated entitlement returns 402

**Files:**
- Modify: `apps/mvp_api/src/modules/usage/usage.test.ts`

- [ ] **Step 1: Read the existing test file to learn the existing mock pattern**

```bash
cat apps/mvp_api/src/modules/usage/usage.test.ts | head -120
```

Note the imports, the mock setup for `db`, and the existing test names so you can place new tests cohesively.

- [ ] **Step 2: Add a failing test for deactivated-only entitlement**

Append the following test inside the existing top-level `describe` block (or create one if none exists):

```typescript
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { reportUsage } from "./usage.service.js"

// Use the existing module-mock pattern from the file. If the file already mocks
// `../../lib/db.js`, append a new test that uses the same mock infrastructure.

describe("reportUsage — kill switch enforcement", () => {
  it("rejects with 402 when the only entitlement is deactivated", async () => {
    // Arrange: feature exists, one entitlement, deactivatedAt set, quota remaining
    const dbMock = {
      productFeature: {
        findFirst: mock(async () => ({ id: "pf_1", featureKey: "plant_layout" })),
      },
      entitlement: {
        findMany: mock(async () => []),  // EXPECT post-fix query to filter deactivatedAt
      },
    }
    mock.module("../../lib/db.js", () => ({ db: dbMock }))

    // Act + Assert
    await expect(
      reportUsage("usr_1", "lk_1", "plant_layout"),
    ).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
      statusCode: 402,
    })

    // Assert the DB call filtered deactivatedAt
    expect(dbMock.entitlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "usr_1",
          deactivatedAt: null,
        }),
      }),
    )
  })

  it("consumes only the active entitlement when stacked with a deactivated one", async () => {
    const activeEnt = {
      id: "ent_active",
      productId: "prod_pro",
      totalCalculations: 10,
      usedCalculations: 3,
      product: {
        displayOrder: 2,
        features: [{ featureKey: "plant_layout" }],
      },
    }
    // Deactivated entitlement with a lower displayOrder (would be selected first
    // pre-fix) MUST be excluded by the post-fix query and never be returned.
    const dbMock = {
      productFeature: {
        findFirst: mock(async () => ({ id: "pf_1", featureKey: "plant_layout" })),
      },
      entitlement: {
        findMany: mock(async ({ where }: { where: Record<string, unknown> }) => {
          // Post-fix: query MUST include deactivatedAt: null
          if (where.deactivatedAt !== null) {
            throw new Error("query did not filter deactivatedAt")
          }
          return [activeEnt]
        }),
      },
      $transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: mock(async () => 1),
          usageRecord: { create: mock(async () => ({})) },
        }
        return cb(tx)
      }),
    }
    mock.module("../../lib/db.js", () => ({ db: dbMock }))

    const result = await reportUsage("usr_1", "lk_1", "plant_layout")

    expect(result).toEqual({ recorded: true, remainingCalculations: 6 })
  })
})
```

- [ ] **Step 3: Run the tests; expect failure**

```bash
cd apps/mvp_api
bun test src/modules/usage/usage.test.ts
```

Expected: both new tests FAIL — current implementation does not filter `deactivatedAt` and the first test would silently consume; the assertion on `findMany` arg fails.

- [ ] **Step 4: Do NOT commit yet** (test must be paired with the fix in the same commit)

---

### Task 6: Apply the kill-switch fix

**Files:**
- Modify: `apps/mvp_api/src/modules/usage/usage.service.ts`

- [ ] **Step 1: Add `deactivatedAt: null` to the candidate query and to the atomic UPDATE**

Replace lines 22-30 (the `db.entitlement.findMany` call) with:

```typescript
  const entitlements = await db.entitlement.findMany({
    where: { userId, deactivatedAt: null },
    include: {
      product: {
        include: { features: true },
      },
    },
    orderBy: { product: { displayOrder: "asc" } },
  })
```

Replace the raw SQL UPDATE at lines 52-57 with (defends against deactivation between selection and update):

```typescript
    const rowsUpdated = await (
      tx as unknown as {
        $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
      }
    ).$executeRaw`
      UPDATE entitlements
      SET "usedCalculations" = "usedCalculations" + 1
      WHERE id = ${pool.id}
        AND "usedCalculations" < "totalCalculations"
        AND "deactivatedAt" IS NULL
    `
```

- [ ] **Step 2: Run the tests; expect pass**

```bash
cd apps/mvp_api
bun test src/modules/usage/usage.test.ts
```

Expected: both new kill-switch tests PASS. Existing tests in the file continue to pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_api/src/modules/usage/usage.service.ts apps/mvp_api/src/modules/usage/usage.test.ts
git commit -m "fix(mvp-api): enforce deactivatedAt at POST /usage/report"
```

---

### Task 7: Race-condition test for kill-switch UPDATE

**Files:**
- Modify: `apps/mvp_api/src/modules/usage/usage.test.ts`

- [ ] **Step 1: Add the race test**

Append to the same `describe("reportUsage — kill switch enforcement", ...)` block:

```typescript
it("returns 409 when entitlement is deactivated between selection and atomic UPDATE", async () => {
  const activeEnt = {
    id: "ent_1",
    productId: "prod_pro",
    totalCalculations: 10,
    usedCalculations: 3,
    product: {
      displayOrder: 1,
      features: [{ featureKey: "plant_layout" }],
    },
  }
  const dbMock = {
    productFeature: {
      findFirst: mock(async () => ({ id: "pf_1", featureKey: "plant_layout" })),
    },
    entitlement: {
      findMany: mock(async () => [activeEnt]),
    },
    $transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        // Simulate the entitlement being deactivated between selection and UPDATE:
        // the WHERE clause filters out the row, so 0 rows updated.
        $executeRaw: mock(async () => 0),
        usageRecord: { create: mock(async () => ({})) },
      }
      return cb(tx)
    }),
  }
  mock.module("../../lib/db.js", () => ({ db: dbMock }))

  await expect(
    reportUsage("usr_1", "lk_1", "plant_layout"),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    statusCode: 409,
  })
})
```

- [ ] **Step 2: Run; expect pass (the existing UPDATE error path already throws 409)**

```bash
cd apps/mvp_api
bun test src/modules/usage/usage.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_api/src/modules/usage/usage.test.ts
git commit -m "test(mvp-api): cover kill-switch race during atomic UPDATE"
```

---

## Phase C — `clerkAuth` middleware writes FREE_AUTO Transaction

### Task 8: Failing test — first-auth creates FREE_AUTO Transaction

**Files:**
- Modify: `apps/mvp_api/src/middleware/clerk-auth.test.ts`

- [ ] **Step 1: Read the existing file to understand the mocking pattern**

```bash
cat apps/mvp_api/src/middleware/clerk-auth.test.ts
```

Note how `verifyToken`, `createClerkClient`, and `db` are mocked.

- [ ] **Step 2: Append a new test asserting the FREE_AUTO Transaction write**

Inside the existing `describe` block, add:

```typescript
it("creates a FREE_AUTO Transaction linked to the free Entitlement on first auth", async () => {
  // Arrange — same mock setup as existing first-auth tests:
  //   verifyToken → returns payload with sub = "clerk_new"
  //   clerk.users.getUser → returns email + first/last name
  //   db.user.findFirst → null (first auth)
  //   db.user.upsert → returns the new user row
  //   db.product.findFirst({ where: { isFree: true } }) → returns free product
  //   db.$transaction → captures the callback and assertions about its operations

  const txCalls: string[] = []
  const dbMock = makeBaseDbMock(txCalls)  // helper from the existing test file
  // ... (use existing helper to wire mocks)

  // Act
  await runClerkAuthMiddleware({ token: "valid_jwt_for_clerk_new" })

  // Assert: inside the $transaction callback, the order MUST be:
  //   transaction.create({ source: "FREE_AUTO", amount: 0, ... }) FIRST
  //   then entitlement.create({ ..., transactionId: <new tx id> })
  //   then licenseKey.create({ ... })
  expect(txCalls).toEqual([
    "transaction.create",
    "entitlement.create",
    "licenseKey.create",
  ])

  expect(dbMock.transaction.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        userId: expect.any(String),
        productId: "prod_free_id",
        source: "FREE_AUTO",
        amount: 0,
        currency: "usd",
        paymentMethod: null,
        createdByUserId: null,
      }),
    }),
  )
})
```

If `makeBaseDbMock` and `runClerkAuthMiddleware` helpers don't yet exist, refactor the existing first-auth test to extract them, then base the new test on them. (This is a test-only refactor inside the same file.)

- [ ] **Step 3: Run; expect failure**

```bash
cd apps/mvp_api
bun test src/middleware/clerk-auth.test.ts
```

Expected: FAIL — current code does not call `transaction.create`.

- [ ] **Step 4: Do NOT commit yet**

---

### Task 9: Implement FREE_AUTO Transaction in `clerkAuth`

**Files:**
- Modify: `apps/mvp_api/src/middleware/clerk-auth.ts`

- [ ] **Step 1: Replace the auto-provision block (lines 73-99)**

Replace the existing `// Auto-provision Free plan for new users` block with:

```typescript
    // Auto-provision Free plan for new users
    try {
      const freeProduct = await db.product.findFirst({ where: { isFree: true } })
      if (freeProduct) {
        const licenseKey = `sl_live_${crypto.randomBytes(24).toString("base64url")}`
        await db.$transaction(async (tx) => {
          const transaction = await tx.transaction.create({
            data: {
              userId: user!.id,
              productId: freeProduct.id,
              source: "FREE_AUTO",
              amount: 0,
              currency: "usd",
              paymentMethod: null,
              externalReference: null,
              notes: "Auto-granted free tier on signup",
              createdByUserId: null,
              checkoutSessionId: null,
            },
          })
          await tx.entitlement.create({
            data: {
              userId: user!.id,
              productId: freeProduct.id,
              transactionId: transaction.id,
              totalCalculations: freeProduct.calculations,
            },
          })
          await tx.licenseKey.create({
            data: {
              userId: user!.id,
              key: licenseKey,
            },
          })
        })
      } else {
        console.warn("[auth] Free product not found — skipping Free plan provisioning")
      }
    } catch (err) {
      // Non-fatal: log and continue — auth must not fail due to provisioning error
      console.warn("[auth] Free plan provisioning failed:", err)
    }
```

- [ ] **Step 2: Run the test**

```bash
cd apps/mvp_api
bun test src/middleware/clerk-auth.test.ts
```

Expected: new test PASSES; existing tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_api/src/middleware/clerk-auth.ts apps/mvp_api/src/middleware/clerk-auth.test.ts
git commit -m "feat(mvp-api): write FREE_AUTO Transaction in clerkAuth first-auth path"
```

---

## Phase D — Stripe `provisionEntitlement` writes Transaction

### Task 10: Extract shared helper `createEntitlementAndTransaction`

**Files:**
- Create: `apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts`

- [ ] **Step 1: Create the helper file**

```typescript
import type { Prisma, PrismaClient } from "@renewable-energy/mvp-db"
import crypto from "node:crypto"

export interface SharedProvisionParams {
  userId: string
  productId: string
  amount: number          // USD cents
  source: "STRIPE" | "MANUAL"
  paymentMethod?: string | null
  externalReference?: string | null
  notes?: string | null
  createdByUserId?: string | null
  checkoutSessionId?: string | null
  purchasedAt?: Date
  totalCalculations: number
}

/**
 * Creates a Transaction + Entitlement and (if missing) a LicenseKey for the user.
 * Caller must wrap in db.$transaction; pass `tx` as the first argument.
 */
export async function createEntitlementAndTransaction(
  tx: Prisma.TransactionClient,
  params: SharedProvisionParams,
): Promise<{ transactionId: string; entitlementId: string }> {
  const transaction = await tx.transaction.create({
    data: {
      userId: params.userId,
      productId: params.productId,
      source: params.source,
      status: "COMPLETED",
      amount: params.amount,
      currency: "usd",
      purchasedAt: params.purchasedAt ?? new Date(),
      paymentMethod: params.paymentMethod ?? null,
      externalReference: params.externalReference ?? null,
      notes: params.notes ?? null,
      createdByUserId: params.createdByUserId ?? null,
      checkoutSessionId: params.checkoutSessionId ?? null,
    },
  })

  const entitlement = await tx.entitlement.create({
    data: {
      userId: params.userId,
      productId: params.productId,
      transactionId: transaction.id,
      totalCalculations: params.totalCalculations,
    },
  })

  const existingKey = await tx.licenseKey.findFirst({
    where: { userId: params.userId },
  })
  if (!existingKey) {
    const key = `sl_live_${crypto.randomBytes(24).toString("base64url")}`
    await tx.licenseKey.create({
      data: { userId: params.userId, key },
    })
  }

  return { transactionId: transaction.id, entitlementId: entitlement.id }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/mvp_api
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts
git commit -m "feat(mvp-api): add createEntitlementAndTransaction helper"
```

---

### Task 11: Update `provision.ts` to use the helper and write Transaction

**Files:**
- Modify: `apps/mvp_api/src/modules/billing/provision.ts`
- Modify: `apps/mvp_api/src/modules/billing/billing.provision.test.ts`

- [ ] **Step 1: Update the existing provision tests to assert Transaction creation**

In `billing.provision.test.ts`, find each happy-path test that asserts on `tx.entitlement.create`. Add the parallel assertion that `tx.transaction.create` was called first with `source: "STRIPE"` and the correct `amount` and `checkoutSessionId`. Example assertion to add inside an existing test:

```typescript
expect(transactionCreateSpy).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({
      userId: "usr_test",
      productId: "prod_basic",
      source: "STRIPE",
      amount: 199,
      currency: "usd",
      checkoutSessionId: "cs_db_1",
      paymentMethod: null,
      createdByUserId: null,
    }),
  }),
)
```

- [ ] **Step 2: Run the tests; expect failure**

```bash
cd apps/mvp_api
bun test src/modules/billing/billing.provision.test.ts
```

Expected: FAIL — current `provision.ts` doesn't call `transaction.create`.

- [ ] **Step 3: Replace `provision.ts` body**

Replace the file content with:

```typescript
import { db } from "../../lib/db.js"
import { createEntitlementAndTransaction } from "./create-entitlement-and-transaction.js"

/**
 * Provision an entitlement and (optionally) a license key for a completed checkout session.
 * Idempotent: if checkoutSession.processedAt is set, returns immediately.
 *
 * @param purchase - Purchase amount from Stripe. Pass from webhook handler.
 *   Omit (or pass undefined) from the verify-session safety net path.
 */
export async function provisionEntitlement(
  stripeCheckoutSessionId: string,
  purchase?: { amountTotal: number | null; currency: string | null },
): Promise<{ provisioned: boolean }> {
  const session = await db.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId },
    include: { user: true },
  })

  if (!session) {
    console.warn(`CheckoutSession not found: ${stripeCheckoutSessionId}`)
    return { provisioned: false }
  }

  if (session.processedAt) {
    return { provisioned: false }
  }

  const product = await db.product.findUnique({
    where: { slug: session.productSlug },
  })

  if (!product) {
    console.error(`Product not found for slug: ${session.productSlug}`)
    return { provisioned: false }
  }

  const amount = purchase?.amountTotal ?? product.priceAmount

  await db.$transaction(async (tx) => {
    await createEntitlementAndTransaction(tx, {
      userId: session.userId,
      productId: product.id,
      amount,
      source: "STRIPE",
      checkoutSessionId: session.id,
      totalCalculations: product.calculations,
    })

    await tx.checkoutSession.update({
      where: { id: session.id },
      data: { processedAt: new Date() },
    })
  })

  return { provisioned: true }
}
```

- [ ] **Step 4: Run the tests; expect pass**

```bash
cd apps/mvp_api
bun test src/modules/billing/billing.provision.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_api/src/modules/billing/provision.ts apps/mvp_api/src/modules/billing/billing.provision.test.ts
git commit -m "feat(mvp-api): provisionEntitlement now writes Transaction(STRIPE)"
```

---

### Task 12: Update billing.routes.test.ts and stripe.webhook.test.ts

**Files:**
- Modify: `apps/mvp_api/src/modules/billing/billing.routes.test.ts`
- Modify: `apps/mvp_api/src/modules/webhooks/stripe.webhook.test.ts`

- [ ] **Step 1: Run both files to identify failures**

```bash
cd apps/mvp_api
bun test src/modules/billing/billing.routes.test.ts src/modules/webhooks/stripe.webhook.test.ts
```

Expected: some tests FAIL because mocks for `db.entitlement.create` no longer match (now Entitlement requires `transactionId`).

- [ ] **Step 2: Update each failing test's mocks**

For each failure:
- Where the test asserts on `tx.entitlement.create.toHaveBeenCalledWith(...)`, change the expected `data` object to include `transactionId: expect.any(String)`.
- Where the test asserts on `tx.checkoutSession.update`, remove expectations on `data.amountTotal` and `data.currency` (those are no longer written there).
- Where the test mocks `tx.checkoutSession.update`, remove the assertion that `amountTotal`/`currency` were passed.

Add (or update existing) assertion that `tx.transaction.create` is called with `source: "STRIPE"` and the correct amount.

- [ ] **Step 3: Run; expect pass**

```bash
bun test src/modules/billing/billing.routes.test.ts src/modules/webhooks/stripe.webhook.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_api/src/modules/billing/billing.routes.test.ts apps/mvp_api/src/modules/webhooks/stripe.webhook.test.ts
git commit -m "test(mvp-api): align billing/webhook tests with Transaction model"
```

---

## Phase E — Manual purchase service

### Task 13: Define types and Zod schemas

**Files:**
- Create: `apps/mvp_api/src/modules/transactions/types.ts`

- [ ] **Step 1: Create the file**

```typescript
import { z } from "zod"

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "OTHER"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const TRANSACTION_SOURCES = ["STRIPE", "MANUAL", "FREE_AUTO"] as const
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number]

export const createManualTransactionBody = z.object({
  userId: z.string().min(1),
  productSlug: z.string().min(1),
  paymentMethod: z.enum(PAYMENT_METHODS),
  externalReference: z.string().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  purchasedAt: z.string().datetime().optional(),
})
export type CreateManualTransactionBody = z.infer<typeof createManualTransactionBody>

export const transactionFiltersQuery = z.object({
  source: z.enum([...TRANSACTION_SOURCES, "ALL"]).optional().default("ALL"),
  email: z.string().optional(),
  productSlug: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type TransactionFiltersQuery = z.infer<typeof transactionFiltersQuery>

export interface TransactionListItem {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  productId: string
  productSlug: string
  productName: string
  source: TransactionSource
  status: string
  amount: number
  currency: string
  purchasedAt: string
  createdAt: string
  paymentMethod: PaymentMethod | null
  externalReference: string | null
  notes: string | null
  createdByUserId: string | null
  createdByEmail: string | null
  checkoutSessionId: string | null
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/mvp_api
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_api/src/modules/transactions/types.ts
git commit -m "feat(mvp-api): add transaction types and Zod schemas"
```

---

### Task 14: Failing tests for `transactions.service.ts`

**Files:**
- Create: `apps/mvp_api/src/modules/transactions/transactions.service.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, expect, it, mock, beforeEach } from "bun:test"

// Mock createEntitlementAndTransaction so we can isolate transactions.service logic
const createEntitlementAndTransactionMock = mock(async () => ({
  transactionId: "txn_new",
  entitlementId: "ent_new",
}))
mock.module("../billing/create-entitlement-and-transaction.js", () => ({
  createEntitlementAndTransaction: createEntitlementAndTransactionMock,
}))

const dbMock = {
  user: { findUnique: mock(async () => null) },
  product: { findUnique: mock(async () => null) },
  $transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => cb({} as unknown)),
}
mock.module("../../lib/db.js", () => ({ db: dbMock }))

import { createManualTransaction } from "./transactions.service.js"

beforeEach(() => {
  createEntitlementAndTransactionMock.mockClear()
  dbMock.user.findUnique.mockReset()
  dbMock.product.findUnique.mockReset()
  dbMock.$transaction.mockReset().mockImplementation(async (cb) => cb({} as unknown))
})

describe("createManualTransaction", () => {
  it("creates a Transaction + Entitlement for a valid manual purchase", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pro",
      slug: "pv-layout-pro",
      isFree: false,
      active: true,
      priceAmount: 499,
      calculations: 10,
    })

    const result = await createManualTransaction({
      userId: "usr_alice",
      productSlug: "pv-layout-pro",
      paymentMethod: "UPI",
      externalReference: "UPI-8472",
      notes: "Mumbai meetup",
      createdByUserId: "usr_admin",
    })

    expect(createEntitlementAndTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "usr_alice",
        productId: "prod_pro",
        amount: 499,
        source: "MANUAL",
        paymentMethod: "UPI",
        externalReference: "UPI-8472",
        notes: "Mumbai meetup",
        createdByUserId: "usr_admin",
        totalCalculations: 10,
      }),
    )
    expect(result).toEqual({ transactionId: "txn_new", entitlementId: "ent_new" })
  })

  it("rejects with 404 when user does not exist", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce(null)

    await expect(
      createManualTransaction({
        userId: "usr_missing",
        productSlug: "pv-layout-pro",
        paymentMethod: "CASH",
        createdByUserId: "usr_admin",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 })
  })

  it("rejects with 400 when product does not exist", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce(null)

    await expect(
      createManualTransaction({
        userId: "usr_alice",
        productSlug: "missing",
        paymentMethod: "CASH",
        createdByUserId: "usr_admin",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 })
  })

  it("rejects with 400 when product is inactive", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pro", slug: "pv-layout-pro", isFree: false, active: false,
      priceAmount: 499, calculations: 10,
    })

    await expect(
      createManualTransaction({
        userId: "usr_alice", productSlug: "pv-layout-pro",
        paymentMethod: "CASH", createdByUserId: "usr_admin",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 })
  })

  it("rejects with 400 (FREE_PRODUCT_NOT_PURCHASABLE) when product is free", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_free", slug: "pv-layout-free", isFree: true, active: true,
      priceAmount: 0, calculations: 5,
    })

    await expect(
      createManualTransaction({
        userId: "usr_alice", productSlug: "pv-layout-free",
        paymentMethod: "CASH", createdByUserId: "usr_admin",
      }),
    ).rejects.toMatchObject({
      code: "FREE_PRODUCT_NOT_PURCHASABLE",
      statusCode: 400,
    })
  })

  it("snapshots the amount from product.priceAmount", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_a", email: "a@b.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pp", slug: "pv-layout-pro-plus", isFree: false, active: true,
      priceAmount: 1499, calculations: 50,
    })

    await createManualTransaction({
      userId: "usr_a", productSlug: "pv-layout-pro-plus",
      paymentMethod: "BANK_TRANSFER", createdByUserId: "usr_admin",
    })

    expect(createEntitlementAndTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 1499, totalCalculations: 50 }),
    )
  })

  it("forwards purchasedAt when provided", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_a", email: "a@b.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pro", slug: "pv-layout-pro", isFree: false, active: true,
      priceAmount: 499, calculations: 10,
    })
    const past = new Date("2026-04-20T12:00:00Z")

    await createManualTransaction({
      userId: "usr_a", productSlug: "pv-layout-pro",
      paymentMethod: "CASH", createdByUserId: "usr_admin",
      purchasedAt: past,
    })

    expect(createEntitlementAndTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ purchasedAt: past }),
    )
  })
})
```

- [ ] **Step 2: Run; expect failure (file doesn't exist)**

```bash
cd apps/mvp_api
bun test src/modules/transactions/transactions.service.test.ts
```

Expected: FAIL — service file not yet implemented.

- [ ] **Step 3: Do NOT commit yet**

---

### Task 15: Implement `transactions.service.ts`

**Files:**
- Create: `apps/mvp_api/src/modules/transactions/transactions.service.ts`

- [ ] **Step 1: Create the file**

```typescript
import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"
import { createEntitlementAndTransaction } from "../billing/create-entitlement-and-transaction.js"
import type { PaymentMethod } from "./types.js"

export interface CreateManualTransactionParams {
  userId: string
  productSlug: string
  paymentMethod: PaymentMethod
  externalReference?: string | null
  notes?: string | null
  purchasedAt?: Date
  createdByUserId: string
}

export async function createManualTransaction(
  params: CreateManualTransactionParams,
): Promise<{ transactionId: string; entitlementId: string }> {
  const user = await db.user.findUnique({ where: { id: params.userId } })
  if (!user) {
    throw new AppError("NOT_FOUND", `User not found: ${params.userId}`, 404)
  }

  const product = await db.product.findUnique({
    where: { slug: params.productSlug },
  })
  if (!product) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Product not found: ${params.productSlug}`,
      400,
    )
  }
  if (!product.active) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Product is not active: ${params.productSlug}`,
      400,
    )
  }
  if (product.isFree) {
    throw new AppError(
      "FREE_PRODUCT_NOT_PURCHASABLE",
      "Free tier is auto-granted at signup; manual purchase is not allowed.",
      400,
    )
  }

  return await db.$transaction(async (tx) => {
    return await createEntitlementAndTransaction(tx, {
      userId: params.userId,
      productId: product.id,
      amount: product.priceAmount,
      source: "MANUAL",
      paymentMethod: params.paymentMethod,
      externalReference: params.externalReference ?? null,
      notes: params.notes ?? null,
      createdByUserId: params.createdByUserId,
      checkoutSessionId: null,
      purchasedAt: params.purchasedAt,
      totalCalculations: product.calculations,
    })
  })
}
```

- [ ] **Step 2: Run tests; expect pass**

```bash
cd apps/mvp_api
bun test src/modules/transactions/transactions.service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_api/src/modules/transactions/transactions.service.ts apps/mvp_api/src/modules/transactions/transactions.service.test.ts
git commit -m "feat(mvp-api): add createManualTransaction service"
```

---

## Phase F — Admin transaction routes + user search

### Task 16: User search endpoint

**Files:**
- Modify: `apps/mvp_api/src/modules/admin/admin.service.ts`
- Modify: `apps/mvp_api/src/modules/admin/admin.routes.ts`
- Modify: `apps/mvp_api/src/modules/admin/admin.routes.test.ts`

- [ ] **Step 1: Add a failing test**

In `admin.routes.test.ts`, add a test inside the existing admin describe block:

```typescript
it("GET /admin/users/search returns up to 20 matches by email prefix", async () => {
  // Arrange: mock db.user.findMany to return three matching users
  const findManyMock = mock(async () => [
    { id: "u1", email: "alice@example.com", name: "Alice" },
    { id: "u2", email: "alice2@example.com", name: "Alice Two" },
    { id: "u3", email: "alex@example.com", name: "Alex" },
  ])
  // Replace existing user mock or add to it (use the file's existing mock pattern)
  ;(globalThis as { _dbMock?: { user: { findMany: typeof findManyMock } } })._dbMock = {
    user: { findMany: findManyMock },
  }

  const res = await fetch(`${TEST_BASE}/admin/users/search?email=ali`, {
    headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
  })

  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)
  expect(body.data.users).toHaveLength(3)
  expect(findManyMock).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        email: { contains: "ali", mode: "insensitive" },
      }),
      take: 20,
    }),
  )
})

it("GET /admin/users/search returns 401 without auth", async () => {
  const res = await fetch(`${TEST_BASE}/admin/users/search?email=ali`)
  expect(res.status).toBe(401)
})
```

- [ ] **Step 2: Run; expect failure (route does not exist)**

```bash
cd apps/mvp_api
bun test src/modules/admin/admin.routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add the service function**

In `admin.service.ts`, append:

```typescript
export async function searchUsersByEmail(query: string, limit = 20) {
  if (!query || query.length < 2) return []
  return db.user.findMany({
    where: { email: { contains: query, mode: "insensitive" } },
    take: limit,
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true },
  })
}
```

- [ ] **Step 4: Add the route**

In `admin.routes.ts`, find the existing `app` (Hono) and add (preserving existing pattern for clerk-auth + role gating):

```typescript
import { searchUsersByEmail } from "./admin.service.js"

// inside the routes registration:
app.get("/admin/users/search", clerkAuth, requireAdminOrOps, async (c) => {
  const email = c.req.query("email") ?? ""
  const users = await searchUsersByEmail(email)
  return c.json({ success: true, data: { users } })
})
```

(Use the existing imports of `clerkAuth` and the role-check middleware exactly as other admin routes in the file do.)

- [ ] **Step 5: Run; expect pass**

```bash
bun test src/modules/admin/admin.routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/admin/admin.service.ts apps/mvp_api/src/modules/admin/admin.routes.ts apps/mvp_api/src/modules/admin/admin.routes.test.ts
git commit -m "feat(mvp-api): GET /admin/users/search by email"
```

---

### Task 17: Failing test — `POST /admin/transactions`

**Files:**
- Create: `apps/mvp_api/src/modules/transactions/transactions.routes.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, expect, it, mock } from "bun:test"

const createManualTransactionMock = mock(async () => ({
  transactionId: "txn_new",
  entitlementId: "ent_new",
}))
mock.module("./transactions.service.js", () => ({
  createManualTransaction: createManualTransactionMock,
  // listTransactions, getTransaction will be added later
}))

// Use the same test harness pattern as other routes tests in this codebase.
// The constants TEST_BASE, TEST_ADMIN_TOKEN, TEST_USER_TOKEN come from
// apps/mvp_api/src/tests/preload.ts or equivalent setup.

import { TEST_BASE, TEST_ADMIN_TOKEN, TEST_USER_TOKEN } from "../../tests/preload.js"

describe("POST /admin/transactions", () => {
  it("creates a manual transaction (200) for ADMIN", async () => {
    const res = await fetch(`${TEST_BASE}/admin/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        userId: "usr_alice",
        productSlug: "pv-layout-pro",
        paymentMethod: "UPI",
        externalReference: "UPI-8472",
        notes: "test note",
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ transactionId: "txn_new", entitlementId: "ent_new" })
    expect(createManualTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "usr_alice",
        productSlug: "pv-layout-pro",
        paymentMethod: "UPI",
        externalReference: "UPI-8472",
        notes: "test note",
        createdByUserId: expect.any(String),  // taken from authenticated admin's user id
      }),
    )
  })

  it("rejects 400 for invalid body (missing paymentMethod)", async () => {
    const res = await fetch(`${TEST_BASE}/admin/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ userId: "usr_alice", productSlug: "pv-layout-pro" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects 401 without auth", async () => {
    const res = await fetch(`${TEST_BASE}/admin/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  })

  it("rejects 403 for non-admin authenticated user", async () => {
    const res = await fetch(`${TEST_BASE}/admin/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_USER_TOKEN}`,
      },
      body: JSON.stringify({
        userId: "usr_alice", productSlug: "pv-layout-pro",
        paymentMethod: "CASH",
      }),
    })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run; expect failure (route does not exist)**

```bash
cd apps/mvp_api
bun test src/modules/transactions/transactions.routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Do NOT commit yet**

---

### Task 18: Implement `transactions.routes.ts` POST + service plumbing

**Files:**
- Create: `apps/mvp_api/src/modules/transactions/transactions.routes.ts`
- Modify: `apps/mvp_api/src/app.ts`

- [ ] **Step 1: Create the routes file**

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireAdminOrOps } from "../../middleware/rbac.js"  // use existing helper; rename if file uses a different name
import { createManualTransaction } from "./transactions.service.js"
import { createManualTransactionBody, transactionFiltersQuery } from "./types.js"

export const transactionsRoutes = new Hono()

transactionsRoutes.post(
  "/admin/transactions",
  clerkAuth,
  requireAdminOrOps,
  zValidator("json", createManualTransactionBody),
  async (c) => {
    const body = c.req.valid("json")
    const adminUser = c.get("user") as { id: string }
    const result = await createManualTransaction({
      userId: body.userId,
      productSlug: body.productSlug,
      paymentMethod: body.paymentMethod,
      externalReference: body.externalReference ?? null,
      notes: body.notes ?? null,
      purchasedAt: body.purchasedAt ? new Date(body.purchasedAt) : undefined,
      createdByUserId: adminUser.id,
    })
    return c.json({ success: true, data: result })
  },
)

// Placeholders for GET routes — implemented in Task 19/20
```

If `requireAdminOrOps` does not exist with that exact name, look in `src/middleware/rbac.ts` for the existing role-check helper and use its actual name. If only `requireAdmin` exists, create `requireAdminOrOps` in the same file mirroring the existing pattern (allow both `"ADMIN"` and `"OPS"` roles).

- [ ] **Step 2: Mount the routes in `app.ts`**

Add (next to other module mounts in `app.ts`):

```typescript
import { transactionsRoutes } from "./modules/transactions/transactions.routes.js"

// inside the app setup:
app.route("/", transactionsRoutes)
```

- [ ] **Step 3: Run tests; expect pass**

```bash
cd apps/mvp_api
bun test src/modules/transactions/transactions.routes.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_api/src/modules/transactions/transactions.routes.ts apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): POST /admin/transactions for manual purchases"
```

---

### Task 19: List + get-by-id endpoints

**Files:**
- Modify: `apps/mvp_api/src/modules/transactions/transactions.service.ts`
- Modify: `apps/mvp_api/src/modules/transactions/transactions.routes.ts`
- Modify: `apps/mvp_api/src/modules/transactions/transactions.service.test.ts`
- Modify: `apps/mvp_api/src/modules/transactions/transactions.routes.test.ts`

- [ ] **Step 1: Add failing tests for the service**

Append to `transactions.service.test.ts`:

```typescript
describe("listTransactions", () => {
  it("returns paginated, filtered, sorted by purchasedAt desc", async () => {
    const findManyMock = mock(async () => [
      {
        id: "txn_1",
        userId: "usr_a",
        productId: "prod_pro",
        source: "STRIPE",
        status: "COMPLETED",
        amount: 499,
        currency: "usd",
        purchasedAt: new Date("2026-04-25T10:00:00Z"),
        createdAt: new Date(),
        paymentMethod: null,
        externalReference: null,
        notes: null,
        createdByUserId: null,
        checkoutSessionId: "cs_1",
        user: { email: "alice@example.com", name: "Alice" },
        product: { slug: "pv-layout-pro", name: "Pro" },
        createdByUser: null,
      },
    ])
    const countMock = mock(async () => 1)
    ;(dbMock as any).transaction = { findMany: findManyMock, count: countMock }

    const result = await listTransactions({ source: "ALL", page: 1, pageSize: 20 })

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { purchasedAt: "desc" },
        take: 20,
        skip: 0,
      }),
    )
    expect(result.transactions[0]).toMatchObject({
      id: "txn_1",
      source: "STRIPE",
      userEmail: "alice@example.com",
      productSlug: "pv-layout-pro",
    })
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 })
  })

  it("filters by source when source != ALL", async () => {
    const findManyMock = mock(async () => [])
    const countMock = mock(async () => 0)
    ;(dbMock as any).transaction = { findMany: findManyMock, count: countMock }

    await listTransactions({ source: "MANUAL", page: 1, pageSize: 20 })

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: "MANUAL" }),
      }),
    )
  })

  it("filters by email substring (insensitive) and date range", async () => {
    const findManyMock = mock(async () => [])
    const countMock = mock(async () => 0)
    ;(dbMock as any).transaction = { findMany: findManyMock, count: countMock }

    await listTransactions({
      source: "ALL",
      email: "alice",
      from: "2026-04-01T00:00:00Z",
      to: "2026-04-30T23:59:59Z",
      page: 1,
      pageSize: 20,
    })

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: { email: { contains: "alice", mode: "insensitive" } },
          purchasedAt: {
            gte: new Date("2026-04-01T00:00:00Z"),
            lte: new Date("2026-04-30T23:59:59Z"),
          },
        }),
      }),
    )
  })
})

describe("getTransaction", () => {
  it("returns the transaction with user/product/createdBy joined", async () => {
    const findUniqueMock = mock(async () => ({
      id: "txn_1",
      userId: "usr_a",
      productId: "prod_pro",
      source: "MANUAL",
      status: "COMPLETED",
      amount: 499,
      currency: "usd",
      purchasedAt: new Date("2026-04-25T10:00:00Z"),
      createdAt: new Date(),
      paymentMethod: "UPI",
      externalReference: "UPI-1",
      notes: "n",
      createdByUserId: "usr_admin",
      checkoutSessionId: null,
      user: { email: "alice@example.com", name: "Alice" },
      product: { slug: "pv-layout-pro", name: "Pro" },
      createdByUser: { email: "admin@example.com" },
    }))
    ;(dbMock as any).transaction = { findUnique: findUniqueMock }

    const result = await getTransaction("txn_1")
    expect(result).toMatchObject({
      id: "txn_1",
      source: "MANUAL",
      paymentMethod: "UPI",
      createdByEmail: "admin@example.com",
    })
  })

  it("throws 404 when not found", async () => {
    ;(dbMock as any).transaction = { findUnique: mock(async () => null) }
    await expect(getTransaction("missing")).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

Add the imports at the top of the test file:

```typescript
import { createManualTransaction, listTransactions, getTransaction } from "./transactions.service.js"
```

- [ ] **Step 2: Run; expect failure (functions not exported yet)**

```bash
cd apps/mvp_api
bun test src/modules/transactions/transactions.service.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `listTransactions` and `getTransaction`**

Append to `apps/mvp_api/src/modules/transactions/transactions.service.ts`:

```typescript
import type { TransactionFiltersQuery, TransactionListItem, TransactionSource, PaymentMethod } from "./types.js"

interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function toListItem(row: any): TransactionListItem {
  return {
    id: row.id,
    userId: row.userId,
    userEmail: row.user.email,
    userName: row.user.name ?? null,
    productId: row.productId,
    productSlug: row.product.slug,
    productName: row.product.name,
    source: row.source as TransactionSource,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    purchasedAt: row.purchasedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    paymentMethod: (row.paymentMethod ?? null) as PaymentMethod | null,
    externalReference: row.externalReference ?? null,
    notes: row.notes ?? null,
    createdByUserId: row.createdByUserId ?? null,
    createdByEmail: row.createdByUser?.email ?? null,
    checkoutSessionId: row.checkoutSessionId ?? null,
  }
}

export async function listTransactions(
  filters: TransactionFiltersQuery,
): Promise<{ transactions: TransactionListItem[]; pagination: PaginationMeta }> {
  const where: Record<string, unknown> = {}
  if (filters.source && filters.source !== "ALL") where.source = filters.source
  if (filters.email) where.user = { email: { contains: filters.email, mode: "insensitive" } }
  if (filters.productSlug) where.product = { slug: filters.productSlug }
  if (filters.from || filters.to) {
    where.purchasedAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    }
  }

  const skip = (filters.page - 1) * filters.pageSize
  const [rows, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: {
        user: { select: { email: true, name: true } },
        product: { select: { slug: true, name: true } },
        createdByUser: { select: { email: true } },
      },
      orderBy: { purchasedAt: "desc" },
      skip,
      take: filters.pageSize,
    }),
    db.transaction.count({ where }),
  ])

  return {
    transactions: rows.map(toListItem),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
  }
}

export async function getTransaction(id: string): Promise<TransactionListItem> {
  const row = await db.transaction.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      product: { select: { slug: true, name: true } },
      createdByUser: { select: { email: true } },
    },
  })
  if (!row) {
    throw new AppError("NOT_FOUND", `Transaction not found: ${id}`, 404)
  }
  return toListItem(row)
}
```

- [ ] **Step 4: Run service tests; expect pass**

```bash
bun test src/modules/transactions/transactions.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add failing route tests for GET endpoints**

Append to `transactions.routes.test.ts`:

```typescript
import { listTransactions as listMock, getTransaction as getMock } from "./transactions.service.js"
// (or update the mock.module call at the top to include these)

describe("GET /admin/transactions", () => {
  it("returns paginated list with filters", async () => {
    // listTransactions mock returns a payload via mock.module setup
    const url = `${TEST_BASE}/admin/transactions?source=MANUAL&page=1&pageSize=20`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.transactions).toBeArray()
    expect(body.data.pagination).toMatchObject({ page: 1, pageSize: 20 })
  })

  it("rejects 401 without auth", async () => {
    const res = await fetch(`${TEST_BASE}/admin/transactions`)
    expect(res.status).toBe(401)
  })

  it("rejects 403 for non-admin", async () => {
    const res = await fetch(`${TEST_BASE}/admin/transactions`, {
      headers: { Authorization: `Bearer ${TEST_USER_TOKEN}` },
    })
    expect(res.status).toBe(403)
  })
})

describe("GET /admin/transactions/:id", () => {
  it("returns single transaction (200)", async () => {
    const res = await fetch(`${TEST_BASE}/admin/transactions/txn_1`, {
      headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe("txn_1")
  })

  it("returns 404 for unknown id", async () => {
    // mock getTransaction to throw NOT_FOUND for "missing"
    const res = await fetch(`${TEST_BASE}/admin/transactions/missing`, {
      headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    })
    expect(res.status).toBe(404)
  })
})
```

Update the `mock.module(...)` at the top of the file to also export `listTransactions` and `getTransaction` mocks.

- [ ] **Step 6: Run; expect failure (routes don't exist yet)**

```bash
bun test src/modules/transactions/transactions.routes.test.ts
```

Expected: FAIL on the new tests; existing POST tests still pass.

- [ ] **Step 7: Add the GET routes**

Append to `transactions.routes.ts`:

```typescript
import { listTransactions, getTransaction } from "./transactions.service.js"

transactionsRoutes.get(
  "/admin/transactions",
  clerkAuth,
  requireAdminOrOps,
  zValidator("query", transactionFiltersQuery),
  async (c) => {
    const filters = c.req.valid("query")
    const result = await listTransactions(filters)
    return c.json({ success: true, data: result })
  },
)

transactionsRoutes.get(
  "/admin/transactions/:id",
  clerkAuth,
  requireAdminOrOps,
  async (c) => {
    const id = c.req.param("id")
    const result = await getTransaction(id)
    return c.json({ success: true, data: result })
  },
)
```

- [ ] **Step 8: Run all transaction tests; expect pass**

```bash
bun test src/modules/transactions/
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/mvp_api/src/modules/transactions/
git commit -m "feat(mvp-api): GET /admin/transactions and GET /admin/transactions/:id"
```

---

### Task 20: Per-customer transactions endpoint

**Files:**
- Modify: `apps/mvp_api/src/modules/admin/customer.service.ts`
- Modify: `apps/mvp_api/src/modules/admin/customer.routes.ts`
- Modify: `apps/mvp_api/src/modules/admin/customer.routes.test.ts`

- [ ] **Step 1: Failing test — `GET /admin/customers/:id/transactions`**

In `customer.routes.test.ts`, add:

```typescript
it("GET /admin/customers/:id/transactions returns top 10 by purchasedAt desc", async () => {
  // mock listTransactions or db.transaction.findMany via the file's existing pattern
  const res = await fetch(`${TEST_BASE}/admin/customers/usr_alice/transactions?limit=10`, {
    headers: { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
  })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.data.transactions).toBeArray()
})
```

- [ ] **Step 2: Run; expect failure**

```bash
bun test src/modules/admin/customer.routes.test.ts
```

- [ ] **Step 3: Add the service function**

In `customer.service.ts`, append:

```typescript
export async function listCustomerTransactions(userId: string, limit = 10) {
  const rows = await db.transaction.findMany({
    where: { userId },
    include: {
      product: { select: { slug: true, name: true } },
      createdByUser: { select: { email: true } },
    },
    orderBy: { purchasedAt: "desc" },
    take: limit,
  })
  return rows.map((row) => ({
    id: row.id,
    productSlug: row.product.slug,
    productName: row.product.name,
    source: row.source,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    purchasedAt: row.purchasedAt.toISOString(),
    paymentMethod: row.paymentMethod ?? null,
    externalReference: row.externalReference ?? null,
    createdByEmail: row.createdByUser?.email ?? null,
  }))
}
```

- [ ] **Step 4: Add the route**

In `customer.routes.ts`, append (using the same auth + role pattern as existing customer routes):

```typescript
import { listCustomerTransactions } from "./customer.service.js"

customerRoutes.get(
  "/admin/customers/:id/transactions",
  clerkAuth,
  requireAdminOrOps,
  async (c) => {
    const id = c.req.param("id")
    const limit = Number(c.req.query("limit") ?? "10")
    const transactions = await listCustomerTransactions(id, limit)
    return c.json({ success: true, data: { transactions } })
  },
)
```

- [ ] **Step 5: Run; expect pass**

```bash
bun test src/modules/admin/customer.routes.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/admin/customer.service.ts apps/mvp_api/src/modules/admin/customer.routes.ts apps/mvp_api/src/modules/admin/customer.routes.test.ts
git commit -m "feat(mvp-api): GET /admin/customers/:id/transactions"
```

---

### Task 21: Verify all backend tests pass

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run test --filter=@renewable-energy/mvp-api
```

Expected: PASS. If failures appear (likely in older billing/dashboard/customer tests), they need follow-up — note them and proceed to Phase G which addresses reporting aggregations.

- [ ] **Step 2: No commit (verification only)**

---

## Phase G — Admin reporting aggregations swap

### Task 22: Customer total spend swap

**Files:**
- Modify: `apps/mvp_api/src/modules/admin/customer.service.ts`
- Modify: `apps/mvp_api/src/modules/admin/customer.service.test.ts`

- [ ] **Step 1: Failing test for customer total spend now reading Transaction**

Add or modify a test in `customer.service.test.ts`:

```typescript
it("totalSpend sums Transaction.amount for STRIPE+MANUAL only (excludes FREE_AUTO)", async () => {
  const aggMock = mock(async (args: unknown) => {
    // Assert the where clause excludes FREE_AUTO
    return { _sum: { amount: 1998 } }
  })
  // Replace existing total-spend mock; the relevant query target is db.transaction.aggregate
  ;(globalThis as { _dbMock?: any })._dbMock = {
    transaction: { aggregate: aggMock },
    // ...other shared mocks the test needs
  }

  const result = await getCustomerSummary("usr_alice")
  expect(result.totalSpend).toBe(1998)
  expect(aggMock).toHaveBeenCalledWith(
    expect.objectContaining({
      _sum: { amount: true },
      where: expect.objectContaining({
        userId: "usr_alice",
        source: { in: ["STRIPE", "MANUAL"] },
      }),
    }),
  )
})
```

- [ ] **Step 2: Run; expect failure**

```bash
bun test src/modules/admin/customer.service.test.ts
```

- [ ] **Step 3: Update `customer.service.ts`**

Find where `getCustomerSummary` (or whatever the equivalent is) computes `totalSpend` from `db.checkoutSession.aggregate`. Replace with:

```typescript
const spendAgg = await db.transaction.aggregate({
  _sum: { amount: true },
  where: {
    userId,
    source: { in: ["STRIPE", "MANUAL"] },
  },
})
const totalSpend = spendAgg._sum.amount ?? 0
```

If the existing customer-list query (`listCustomers`) joins to `checkoutSession` for total spend, change it to a parallel query against `transaction.groupBy` keyed by `userId`. Keep the response shape unchanged.

- [ ] **Step 4: Run all customer tests; expect pass**

```bash
bun test src/modules/admin/customer.service.test.ts src/modules/admin/customer.routes.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_api/src/modules/admin/customer.service.ts apps/mvp_api/src/modules/admin/customer.service.test.ts
git commit -m "refactor(mvp-api): customer total spend reads from Transaction"
```

---

### Task 23: Dashboard summary aggregations + source split

**Files:**
- Modify: `apps/mvp_api/src/modules/admin/dashboard.service.ts`
- Modify: `apps/mvp_api/src/modules/admin/dashboard.service.test.ts`
- Modify: `apps/mvp_api/src/modules/admin/dashboard.routes.ts`
- Modify: `apps/mvp_api/src/modules/admin/dashboard.routes.test.ts`

- [ ] **Step 1: Failing test for new summary shape**

In `dashboard.service.test.ts`, add or modify a test:

```typescript
it("getDashboardSummary returns totals + Stripe/Manual split", async () => {
  // Mock db.transaction.groupBy or aggregate twice (once per source)
  // and db.user.count for totalCustomers, db.usageRecord.count for totalCalculations.
  const aggMock = mock(async (args: { where?: { source?: { in?: string[] } | string } }) => {
    if ((args.where?.source as { in?: string[] } | undefined)?.in) {
      return { _sum: { amount: 1697 }, _count: 3 }
    }
    if (args.where?.source === "STRIPE") return { _sum: { amount: 1198 }, _count: 2 }
    if (args.where?.source === "MANUAL") return { _sum: { amount: 499 }, _count: 1 }
    return { _sum: { amount: 0 }, _count: 0 }
  })
  // Wire into the mock pattern this file already uses

  const result = await getDashboardSummary()
  expect(result).toMatchObject({
    totalRevenue: 1697,
    totalRevenueStripe: 1198,
    totalRevenueManual: 499,
    totalPurchases: 3,
    totalPurchasesStripe: 2,
    totalPurchasesManual: 1,
  })
})
```

- [ ] **Step 2: Run; expect failure**

```bash
bun test src/modules/admin/dashboard.service.test.ts
```

- [ ] **Step 3: Update `dashboard.service.ts`**

Replace the existing `getDashboardSummary` body. Sketch:

```typescript
export async function getDashboardSummary() {
  const [paid, stripe, manual, totalCustomers, totalCalculations] = await Promise.all([
    db.transaction.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { source: { in: ["STRIPE", "MANUAL"] } },
    }),
    db.transaction.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { source: "STRIPE" },
    }),
    db.transaction.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { source: "MANUAL" },
    }),
    db.user.count(),
    db.usageRecord.count(),
  ])

  return {
    totalRevenue: paid._sum.amount ?? 0,
    totalRevenueStripe: stripe._sum.amount ?? 0,
    totalRevenueManual: manual._sum.amount ?? 0,
    totalPurchases: paid._count,
    totalPurchasesStripe: stripe._count,
    totalPurchasesManual: manual._count,
    totalCustomers,
    totalCalculations,
  }
}
```

- [ ] **Step 4: Update the dashboard route response shape**

In `dashboard.routes.ts`, update the GET `/admin/dashboard/summary` handler to return all the new fields.

- [ ] **Step 5: Run dashboard tests; expect pass**

```bash
bun test src/modules/admin/dashboard.service.test.ts src/modules/admin/dashboard.routes.test.ts
```

Existing dashboard tests likely need updates: change assertions to expect the new fields. Update them now.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/admin/dashboard.service.ts apps/mvp_api/src/modules/admin/dashboard.service.test.ts apps/mvp_api/src/modules/admin/dashboard.routes.ts apps/mvp_api/src/modules/admin/dashboard.routes.test.ts
git commit -m "refactor(mvp-api): dashboard summary uses Transaction with source split"
```

---

### Task 24: Dashboard trends grouped by purchasedAt with source split

**Files:**
- Modify: `apps/mvp_api/src/modules/admin/dashboard.service.ts`
- Modify: `apps/mvp_api/src/modules/admin/dashboard.service.test.ts`
- Modify: `apps/mvp_api/src/modules/admin/dashboard.routes.ts`

- [ ] **Step 1: Failing test for new trends shape**

```typescript
it("getDashboardTrends groups by purchasedAt with source split", async () => {
  const findManyMock = mock(async () => [
    { purchasedAt: new Date("2026-04-26T10:00:00Z"), source: "STRIPE", amount: 499 },
    { purchasedAt: new Date("2026-04-26T11:00:00Z"), source: "MANUAL", amount: 499 },
    { purchasedAt: new Date("2026-04-27T09:00:00Z"), source: "STRIPE", amount: 1499 },
  ])
  // Wire into mocks

  const result = await getDashboardTrends("daily")

  // Expect periods 2026-04-26 and 2026-04-27 with split
  const apr26 = result.find((p) => p.period === "2026-04-26")
  expect(apr26).toMatchObject({
    revenue: 998,
    revenueStripe: 499,
    revenueManual: 499,
    purchases: 2,
    purchasesStripe: 1,
    purchasesManual: 1,
  })
})
```

- [ ] **Step 2: Run; expect failure**

```bash
bun test src/modules/admin/dashboard.service.test.ts
```

- [ ] **Step 3: Implement**

Replace `getDashboardTrends` with a version that:

```typescript
export async function getDashboardTrends(granularity: "daily" | "weekly" | "monthly") {
  const rows = await db.transaction.findMany({
    where: { source: { in: ["STRIPE", "MANUAL"] } },
    select: { purchasedAt: true, source: true, amount: true },
  })
  const buckets = new Map<string, {
    revenue: number; revenueStripe: number; revenueManual: number;
    purchases: number; purchasesStripe: number; purchasesManual: number;
  }>()
  for (const row of rows) {
    const key = bucketKey(row.purchasedAt, granularity)  // existing helper or inline
    const b = buckets.get(key) ?? {
      revenue: 0, revenueStripe: 0, revenueManual: 0,
      purchases: 0, purchasesStripe: 0, purchasesManual: 0,
    }
    b.revenue += row.amount
    b.purchases += 1
    if (row.source === "STRIPE") {
      b.revenueStripe += row.amount
      b.purchasesStripe += 1
    } else {
      b.revenueManual += row.amount
      b.purchasesManual += 1
    }
    buckets.set(key, b)
  }
  // Also fold customers/calculations as before, then return sorted array
  // ... (preserve existing customers/calculations rollup)
  return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([period, vals]) => ({
    period, ...vals, customers: 0, calculations: 0,  // wire customers/calcs as in existing impl
  }))
}
```

(Reuse the existing `bucketKey` / customers / calculations rollup from the prior implementation; only swap the revenue/purchases source.)

- [ ] **Step 4: Run; expect pass**

```bash
bun test src/modules/admin/dashboard.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_api/src/modules/admin/dashboard.service.ts apps/mvp_api/src/modules/admin/dashboard.service.test.ts apps/mvp_api/src/modules/admin/dashboard.routes.ts
git commit -m "refactor(mvp-api): dashboard trends grouped by purchasedAt with source split"
```

---

### Task 25: Per-product summary + sales swap

**Files:**
- Modify: `apps/mvp_api/src/modules/admin/product.service.ts`
- Modify: `apps/mvp_api/src/modules/admin/product.service.test.ts`
- Modify: `apps/mvp_api/src/modules/admin/sales-utils.ts`
- Modify: `apps/mvp_api/src/modules/admin/sales-utils.test.ts`

- [ ] **Step 1: Update tests to expect Transaction-based aggregation**

In `product.service.test.ts`, update tests for `getProductsSummary`, `getProductDetail`, `getProductSales` to expect the source = `Transaction` rather than `CheckoutSession`. The shape additions are: `revenueStripe`, `revenueManual`, `purchasesStripe`, `purchasesManual` on summary + per-product.

- [ ] **Step 2: Run; expect failure**

```bash
bun test src/modules/admin/product.service.test.ts src/modules/admin/sales-utils.test.ts
```

- [ ] **Step 3: Update `product.service.ts` and `sales-utils.ts`**

Anywhere those services call `db.checkoutSession.aggregate` / `groupBy`, replace with `db.transaction.aggregate` / `groupBy` filtered by `source: { in: ["STRIPE", "MANUAL"] }` and grouped/joined by `productId`. Add per-source aggregates next to totals.

- [ ] **Step 4: Run; expect pass**

```bash
bun test src/modules/admin/product.service.test.ts src/modules/admin/sales-utils.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_api/src/modules/admin/product.service.ts apps/mvp_api/src/modules/admin/product.service.test.ts apps/mvp_api/src/modules/admin/sales-utils.ts apps/mvp_api/src/modules/admin/sales-utils.test.ts
git commit -m "refactor(mvp-api): product/sales aggregations switched to Transaction"
```

---

### Task 26: Final backend gate

- [ ] **Step 1: Run lint, typecheck, test, build**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: ALL PASS. Fix any remaining failures inline.

- [ ] **Step 2: Commit any straggler fixes**

```bash
git add -A
git commit -m "chore(mvp-api): post-aggregation-swap cleanup"
```

(Skip this commit if there are no changes.)

---

## Phase H — Admin app hooks

### Task 27: `useAdminTransactions` and `useAdminTransaction`

**Files:**
- Create: `apps/mvp_admin/lib/hooks/use-admin-transactions.ts`

- [ ] **Step 1: Read an existing hook for pattern**

```bash
cat apps/mvp_admin/lib/hooks/use-admin-customers.ts | head -80
```

Note the pattern: `useQuery` with the API client, key namespacing, error mapping.

- [ ] **Step 2: Create the hooks file**

```typescript
"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import type { TransactionListItem, PaymentMethod, TransactionSource } from "@/lib/api"  // shared types

const API = process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export interface TransactionFilters {
  source?: TransactionSource | "ALL"
  email?: string
  productSlug?: string
  from?: string
  to?: string
}

export function useAdminTransactions(filters: TransactionFilters, page: number, pageSize = 20) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ["admin-transactions", filters, page, pageSize],
    queryFn: async () => {
      const token = await getToken()
      const params = new URLSearchParams()
      if (filters.source && filters.source !== "ALL") params.set("source", filters.source)
      if (filters.email) params.set("email", filters.email)
      if (filters.productSlug) params.set("productSlug", filters.productSlug)
      if (filters.from) params.set("from", filters.from)
      if (filters.to) params.set("to", filters.to)
      params.set("page", String(page))
      params.set("pageSize", String(pageSize))
      const res = await fetch(`${API}/admin/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Failed to load transactions")
      const body = await res.json()
      return body.data as { transactions: TransactionListItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
    },
    staleTime: 10_000,
  })
}

export function useAdminTransaction(id: string) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ["admin-transaction", id],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${API}/admin/transactions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Failed to load transaction")
      const body = await res.json()
      return body.data as TransactionListItem
    },
    enabled: !!id,
  })
}

export interface CreateManualTransactionInput {
  userId: string
  productSlug: string
  paymentMethod: PaymentMethod
  externalReference?: string
  notes?: string
  purchasedAt?: string
}

export function useCreateManualTransaction() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateManualTransactionInput) => {
      const token = await getToken()
      const res = await fetch(`${API}/admin/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      return body.data as { transactionId: string; entitlementId: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-transactions"] })
      qc.invalidateQueries({ queryKey: ["admin-customers"] })
      qc.invalidateQueries({ queryKey: ["admin-customer"] })
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] })
    },
  })
}

export function useCustomerTransactions(userId: string, limit = 10) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ["admin-customer-transactions", userId, limit],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${API}/admin/customers/${userId}/transactions?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Failed to load customer transactions")
      const body = await res.json()
      return body.data.transactions as TransactionListItem[]
    },
    enabled: !!userId,
  })
}
```

If `lib/api.ts` doesn't yet export `TransactionListItem`, `PaymentMethod`, and `TransactionSource`, add them there as plain TS types matching the backend `types.ts`.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run typecheck --filter=@renewable-energy/mvp-admin
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_admin/lib/hooks/use-admin-transactions.ts apps/mvp_admin/lib/api.ts
git commit -m "feat(mvp-admin): add admin-transactions hooks"
```

---

### Task 28: `useAdminUserSearch`

**Files:**
- Create: `apps/mvp_admin/lib/hooks/use-admin-user-search.ts`

- [ ] **Step 1: Create the file**

```typescript
"use client"

import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"

const API = process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export interface UserSearchResult {
  id: string
  email: string
  name: string | null
}

export function useAdminUserSearch(emailQuery: string) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ["admin-user-search", emailQuery],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(
        `${API}/admin/users/search?email=${encodeURIComponent(emailQuery)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error("Search failed")
      const body = await res.json()
      return body.data.users as UserSearchResult[]
    },
    enabled: emailQuery.length >= 2,
    staleTime: 30_000,
  })
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run typecheck --filter=@renewable-energy/mvp-admin
git add apps/mvp_admin/lib/hooks/use-admin-user-search.ts
git commit -m "feat(mvp-admin): add useAdminUserSearch hook"
```

---

## Phase I — Admin app pages

### Task 29: Sidebar — add Transactions nav

**Files:**
- Modify: `apps/mvp_admin/components/admin-sidebar.tsx`
- Modify: `apps/mvp_admin/components/admin-sidebar.test.tsx`

- [ ] **Step 1: Failing test**

In `admin-sidebar.test.tsx`, add a test asserting the Transactions nav appears for both ADMIN and OPS roles:

```typescript
it("shows Transactions nav item for both ADMIN and OPS", () => {
  for (const role of ["ADMIN", "OPS"] as const) {
    const { getByText, unmount } = render(<AdminSidebar role={role} />)
    expect(getByText("Transactions")).toBeInTheDocument()
    unmount()
  }
})
```

- [ ] **Step 2: Run; expect failure**

```bash
cd apps/mvp_admin
bun test components/admin-sidebar.test.tsx
```

- [ ] **Step 3: Add the nav item**

In `admin-sidebar.tsx`, import a Receipt icon (e.g., `Receipt` from `lucide-react`), then update `BASE_NAV`:

```typescript
import { Receipt } from "lucide-react"
// ...
const BASE_NAV = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Building2 },
  { label: "Transactions", href: "/transactions", icon: Receipt },
  { label: "Plans", href: "/plans", icon: Package },
]
```

- [ ] **Step 4: Run; expect pass**

```bash
bun test components/admin-sidebar.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_admin/components/admin-sidebar.tsx apps/mvp_admin/components/admin-sidebar.test.tsx
git commit -m "feat(mvp-admin): add Transactions sidebar nav"
```

---

### Task 30: Transactions list page (`/transactions`)

**Files:**
- Create: `apps/mvp_admin/app/(admin)/transactions/page.tsx`
- Create: `apps/mvp_admin/app/(admin)/transactions/_components/transactions-page-client.tsx`

- [ ] **Step 1: Create the server page (matches existing page convention)**

```tsx
// apps/mvp_admin/app/(admin)/transactions/page.tsx
import { TransactionsPageClient } from "./_components/transactions-page-client"

export default function TransactionsPage() {
  return <TransactionsPageClient />
}
```

- [ ] **Step 2: Create the client component**

```tsx
// apps/mvp_admin/app/(admin)/transactions/_components/transactions-page-client.tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@renewable-energy/ui/components/table"
import { Input } from "@renewable-energy/ui/components/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@renewable-energy/ui/components/select"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { useAdminTransactions } from "@/lib/hooks/use-admin-transactions"
import { formatUsdCents, formatDate } from "@/lib/format"  // existing helpers
import type { TransactionSource } from "@/lib/api"

const PAGE_SIZE = 20

export function TransactionsPageClient() {
  const router = useRouter()
  const sp = useSearchParams()
  const page = Math.max(1, Number(sp.get("page") ?? "1"))
  const source = (sp.get("source") as TransactionSource | "ALL" | null) ?? "ALL"
  const email = sp.get("email") ?? ""

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value); else params.delete(key)
    if (key !== "page") params.set("page", "1")
    router.push(`/transactions?${params.toString()}`)
  }

  const { data, isLoading, isError } = useAdminTransactions(
    { source, email },
    page,
    PAGE_SIZE,
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <Button asChild>
          <Link href="/transactions/new">Record manual purchase</Link>
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={source} onValueChange={(v) => updateParam("source", v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All sources</SelectItem>
            <SelectItem value="STRIPE">Stripe</SelectItem>
            <SelectItem value="MANUAL">Manual</SelectItem>
            <SelectItem value="FREE_AUTO">Free auto-grant</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by email"
          defaultValue={email}
          onBlur={(e) => updateParam("email", e.target.value.trim())}
          className="w-72"
        />
      </div>

      {isLoading && <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
      {isError && <div className="text-destructive">Failed to load transactions.</div>}
      {data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Recorded by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.transactions.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No transactions yet.</TableCell></TableRow>
              )}
              {data.transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{formatDate(t.purchasedAt)}</TableCell>
                  <TableCell>
                    <Link href={`/customers/${t.userId}`} className="hover:underline">
                      {t.userEmail}
                    </Link>
                    {t.userName ? <span className="text-muted-foreground ml-1">— {t.userName}</span> : null}
                  </TableCell>
                  <TableCell>
                    <Link href={`/plans/${t.productSlug}`} className="hover:underline">
                      {t.productSlug}
                    </Link>
                  </TableCell>
                  <TableCell>{formatUsdCents(t.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={t.source === "STRIPE" ? "default" : t.source === "MANUAL" ? "secondary" : "outline"}>
                      {t.source}
                    </Badge>
                  </TableCell>
                  <TableCell>{t.paymentMethod ?? "—"}</TableCell>
                  <TableCell className="max-w-40 truncate" title={t.externalReference ?? undefined}>
                    {t.externalReference ?? "—"}
                  </TableCell>
                  <TableCell>{t.createdByEmail ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => updateParam("page", String(page - 1))}>Previous</Button>
            <span className="text-sm">Page {data.pagination.page} of {data.pagination.totalPages}</span>
            <Button variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => updateParam("page", String(page + 1))}>Next</Button>
          </div>
        </>
      )}
    </div>
  )
}
```

If `formatUsdCents` and `formatDate` helpers don't exist at `@/lib/format`, find the existing util used by other admin pages (e.g., `dashboard-client.tsx` likely formats USD inline) and either factor those into `lib/format.ts` or inline the same logic.

- [ ] **Step 3: Visit the page locally**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run dev --filter=@renewable-energy/mvp-admin
```

Open http://localhost:3004/transactions. You should see "No transactions yet." (or your free-auto rows after step 1 of post-migration ritual).

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_admin/app/\(admin\)/transactions/
git commit -m "feat(mvp-admin): /transactions list page with filters and pagination"
```

---

### Task 31: New manual purchase form (`/transactions/new`)

**Files:**
- Create: `apps/mvp_admin/app/(admin)/transactions/new/page.tsx`
- Create: `apps/mvp_admin/app/(admin)/transactions/new/_components/new-transaction-form.tsx`

- [ ] **Step 1: Create the page wrapper**

```tsx
// apps/mvp_admin/app/(admin)/transactions/new/page.tsx
import { NewTransactionForm } from "./_components/new-transaction-form"

export default function NewTransactionPage() {
  return <NewTransactionForm />
}
```

- [ ] **Step 2: Create the form component**

```tsx
// apps/mvp_admin/app/(admin)/transactions/new/_components/new-transaction-form.tsx
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@renewable-energy/ui/components/button"
import { Input } from "@renewable-energy/ui/components/input"
import { Textarea } from "@renewable-energy/ui/components/textarea"
import { Label } from "@renewable-energy/ui/components/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@renewable-energy/ui/components/select"
import {
  RadioGroup, RadioGroupItem,
} from "@renewable-energy/ui/components/radio-group"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@renewable-energy/ui/components/dialog"
import { useAdminUserSearch, type UserSearchResult } from "@/lib/hooks/use-admin-user-search"
import { useCreateManualTransaction } from "@/lib/hooks/use-admin-transactions"
import { useAdminProducts } from "@/lib/hooks/use-admin-products"  // existing hook
import { formatUsdCents } from "@/lib/format"
import type { PaymentMethod } from "@/lib/api"

const METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "OTHER"]

export function NewTransactionForm() {
  const router = useRouter()
  const [emailQuery, setEmailQuery] = React.useState("")
  const [debouncedEmail, setDebouncedEmail] = React.useState("")
  const [selectedUser, setSelectedUser] = React.useState<UserSearchResult | null>(null)
  const [productSlug, setProductSlug] = React.useState<string>("")
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("UPI")
  const [externalReference, setExternalReference] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [purchasedAt, setPurchasedAt] = React.useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(emailQuery), 300)
    return () => clearTimeout(t)
  }, [emailQuery])

  const { data: userResults, isLoading: searching } = useAdminUserSearch(debouncedEmail)
  const { data: productsData } = useAdminProducts(1, 100)  // or whatever the existing hook returns
  const products = (productsData?.products ?? []).filter((p) => !p.isFree && p.active)

  const selectedProduct = products.find((p) => p.slug === productSlug) ?? null
  const canSubmit = !!selectedUser && !!selectedProduct && !!paymentMethod

  const create = useCreateManualTransaction()

  const onConfirm = async () => {
    if (!selectedUser || !selectedProduct) return
    try {
      const result = await create.mutateAsync({
        userId: selectedUser.id,
        productSlug: selectedProduct.slug,
        paymentMethod,
        externalReference: externalReference.trim() || undefined,
        notes: notes.trim() || undefined,
        purchasedAt: new Date(purchasedAt + "T12:00:00Z").toISOString(),
      })
      toast.success("Manual purchase recorded.")
      router.push(`/transactions/${result.transactionId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record purchase.")
    } finally {
      setConfirmOpen(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Record manual purchase</h1>

      <div className="space-y-2">
        <Label>Customer (search by email)</Label>
        <Input
          placeholder="alice@example.com"
          value={emailQuery}
          onChange={(e) => { setEmailQuery(e.target.value); setSelectedUser(null) }}
        />
        {searching && <p className="text-sm text-muted-foreground">Searching…</p>}
        {!searching && debouncedEmail.length >= 2 && userResults && userResults.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No customer with that email. Customer must sign up at solarlayout.in/sign-up before you can record a purchase.
          </p>
        )}
        {userResults && userResults.length > 0 && !selectedUser && (
          <div className="rounded-md border divide-y">
            {userResults.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { setSelectedUser(u); setEmailQuery(u.email) }}
                className="w-full text-left px-3 py-2 hover:bg-muted"
              >
                <div className="font-medium">{u.email}</div>
                {u.name && <div className="text-sm text-muted-foreground">{u.name}</div>}
              </button>
            ))}
          </div>
        )}
        {selectedUser && (
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            Selected: <strong>{selectedUser.email}</strong>{selectedUser.name ? ` — ${selectedUser.name}` : ""}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Plan</Label>
        <Select value={productSlug} onValueChange={setProductSlug}>
          <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.slug} value={p.slug}>
                {p.name} — {formatUsdCents(p.priceAmount)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Payment method</Label>
        <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
          {METHODS.map((m) => (
            <div key={m} className="flex items-center space-x-2">
              <RadioGroupItem value={m} id={`pm-${m}`} />
              <Label htmlFor={`pm-${m}`}>{m}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>External reference</Label>
        <Input
          placeholder="e.g., bank txn ID, UPI ref, cheque #"
          value={externalReference}
          onChange={(e) => setExternalReference(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      <div className="space-y-2">
        <Label>Purchased at</Label>
        <Input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
      </div>

      <Button disabled={!canSubmit || create.isPending} onClick={() => setConfirmOpen(true)}>
        Record purchase
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm manual purchase</DialogTitle>
          </DialogHeader>
          {selectedUser && selectedProduct && (
            <p className="text-sm">
              Recording manual purchase: <strong>{selectedUser.email}</strong> buys <strong>{selectedProduct.name}</strong> for <strong>{formatUsdCents(selectedProduct.priceAmount)}</strong> via <strong>{paymentMethod}</strong>{externalReference ? <> (ref: <code>{externalReference}</code>)</> : null}. The {selectedProduct.calculations}-calculation entitlement will activate immediately. Confirm?
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={onConfirm} disabled={create.isPending}>
              {create.isPending ? "Recording…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

If `useAdminProducts` does not return a list (or returns a different shape), adapt the call to whatever the existing hook in `lib/hooks/use-admin-products.ts` provides. The form needs: `slug`, `name`, `priceAmount`, `calculations`, `isFree`, `active`.

- [ ] **Step 3: Smoke test in browser**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run dev --filter=@renewable-energy/mvp-admin
```

Visit http://localhost:3004/transactions/new. Try the customer search (the second test customer signs up via incognito on mvp_web first), then record a UPI purchase.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_admin/app/\(admin\)/transactions/new/
git commit -m "feat(mvp-admin): /transactions/new manual purchase form"
```

---

### Task 32: Transaction detail page (`/transactions/:id`)

**Files:**
- Create: `apps/mvp_admin/app/(admin)/transactions/[id]/page.tsx`
- Create: `apps/mvp_admin/app/(admin)/transactions/[id]/_components/transaction-detail-client.tsx`

- [ ] **Step 1: Create the server page**

```tsx
import { TransactionDetailClient } from "./_components/transaction-detail-client"

export default async function TransactionDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TransactionDetailClient id={id} />
}
```

- [ ] **Step 2: Create the client component**

```tsx
"use client"

import Link from "next/link"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@renewable-energy/ui/components/card"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { useAdminTransaction } from "@/lib/hooks/use-admin-transactions"
import { formatUsdCents, formatDate } from "@/lib/format"

export function TransactionDetailClient({ id }: { id: string }) {
  const { data, isLoading, isError } = useAdminTransaction(id)

  if (isLoading) return <Skeleton className="h-96 w-full m-6" />
  if (isError || !data) return <div className="p-6 text-destructive">Transaction not found.</div>

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{formatUsdCents(data.amount)}</h1>
        <Badge>{data.source}</Badge>
        <Badge variant="secondary">{data.status}</Badge>
        <span className="text-muted-foreground">{formatDate(data.purchasedAt)}</span>
      </div>

      <Card>
        <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
        <CardContent>
          <Link href={`/customers/${data.userId}`} className="hover:underline">
            {data.userEmail}
          </Link>
          {data.userName && <span className="text-muted-foreground ml-1">— {data.userName}</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Plan</CardTitle></CardHeader>
        <CardContent>
          <Link href={`/plans/${data.productSlug}`} className="hover:underline">
            {data.productName} ({data.productSlug})
          </Link>
        </CardContent>
      </Card>

      {data.source === "MANUAL" && (
        <Card>
          <CardHeader><CardTitle>Manual purchase details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><strong>Method:</strong> {data.paymentMethod ?? "—"}</div>
            <div><strong>External reference:</strong> {data.externalReference ?? "—"}</div>
            <div><strong>Notes:</strong> {data.notes ?? "—"}</div>
            <div><strong>Recorded by:</strong> {data.createdByEmail ?? "—"}</div>
          </CardContent>
        </Card>
      )}

      {data.source === "STRIPE" && data.checkoutSessionId && (
        <Card>
          <CardHeader><CardTitle>Stripe details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><strong>Checkout session ID:</strong> <code>{data.checkoutSessionId}</code></div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Smoke test**

Visit http://localhost:3004/transactions/<id> for one of the rows in the list.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_admin/app/\(admin\)/transactions/\[id\]/
git commit -m "feat(mvp-admin): /transactions/:id detail page"
```

---

## Phase J — Existing pages: customer detail + dashboards

### Task 33: Add Transactions section to customer detail

**Files:**
- Modify: `apps/mvp_admin/app/(admin)/customers/[id]/_components/customer-detail-client.tsx`

- [ ] **Step 1: Add a Transactions section above the existing Plans/Entitlements table**

Inside the component, add (using the existing `useCustomerTransactions` hook from Task 27):

```tsx
import { useCustomerTransactions } from "@/lib/hooks/use-admin-transactions"

// inside the component, near the top of the JSX:
const { data: transactions } = useCustomerTransactions(customerId, 10)

// JSX (place above the existing Plans/Entitlements section):
<Card>
  <CardHeader className="flex flex-row items-center justify-between">
    <CardTitle>Transactions (most recent 10)</CardTitle>
    <Link href={`/transactions?email=${encodeURIComponent(customerEmail)}`} className="text-sm hover:underline">View all</Link>
  </CardHeader>
  <CardContent>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Method</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(!transactions || transactions.length === 0) && (
          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transactions yet.</TableCell></TableRow>
        )}
        {transactions?.map((t) => (
          <TableRow key={t.id}>
            <TableCell>{formatDate(t.purchasedAt)}</TableCell>
            <TableCell>{t.productSlug}</TableCell>
            <TableCell>{formatUsdCents(t.amount)}</TableCell>
            <TableCell><Badge variant={t.source === "STRIPE" ? "default" : t.source === "MANUAL" ? "secondary" : "outline"}>{t.source}</Badge></TableCell>
            <TableCell>{t.paymentMethod ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

The exact prop names (`customerId`, `customerEmail`) match what the existing component already destructures from `useCustomerDetail` or its props.

- [ ] **Step 2: Run typecheck and smoke test**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run typecheck --filter=@renewable-energy/mvp-admin
```

Open http://localhost:3004/customers/<id>; confirm the Transactions section renders above Plans/Entitlements.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_admin/app/\(admin\)/customers/\[id\]/_components/customer-detail-client.tsx
git commit -m "feat(mvp-admin): Transactions section on customer detail"
```

---

### Task 34: Dashboard cards subtitle (Stripe / Manual split)

**Files:**
- Modify: `apps/mvp_admin/app/(admin)/dashboard/_components/dashboard-client.tsx`

- [ ] **Step 1: Update the summary fetch consumer**

The summary query already returns `totalRevenueStripe`, `totalRevenueManual`, `totalPurchasesStripe`, `totalPurchasesManual` after Task 23. Add subtitles under the Revenue and Purchases cards:

Find the Revenue card and add directly under the formatted value:

```tsx
<div className="text-xs text-muted-foreground">
  Stripe {formatUsdCents(summary.totalRevenueStripe)} · Manual {formatUsdCents(summary.totalRevenueManual)}
</div>
```

Find the Purchases card and add:

```tsx
<div className="text-xs text-muted-foreground">
  Stripe {summary.totalPurchasesStripe} · Manual {summary.totalPurchasesManual}
</div>
```

- [ ] **Step 2: Smoke test**

Visit http://localhost:3004/dashboard. Cards should show the subtitle.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_admin/app/\(admin\)/dashboard/_components/dashboard-client.tsx
git commit -m "feat(mvp-admin): dashboard cards show Stripe/Manual split subtitle"
```

---

### Task 35: Per-plan page subtitle (Stripe / Manual split)

**Files:**
- Modify: `apps/mvp_admin/app/(admin)/plans/[slug]/_components/product-detail-client.tsx`

- [ ] **Step 1: Same subtitle treatment on the per-plan revenue + purchases cards**

Use the new fields returned by the per-product API (added in Task 25). Place subtitles under the Revenue card and Purchases card with the same pattern as the dashboard.

- [ ] **Step 2: Smoke test and commit**

```bash
git add apps/mvp_admin/app/\(admin\)/plans/\[slug\]/_components/product-detail-client.tsx
git commit -m "feat(mvp-admin): per-plan cards show Stripe/Manual split subtitle"
```

---

## Phase K — Final gate, code review, and acceptance walkthrough

### Task 36: Full repo gate

- [ ] **Step 1: Run all gates from repo root**

```bash
cd /Users/arunkpatra/codebase/renewable_energy
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: ALL PASS.

- [ ] **Step 2: If anything fails, fix inline and commit small focused fixes**

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "chore: post-spike gate fixes"
```

---

### Task 37: Code review pass

- [ ] **Step 1: Run the reviewer**

Per CLAUDE.md, for significant work (5+ files, new infrastructure, new patterns) run the reviewer agent. Dispatch:

```
Use Agent tool with subagent_type=superpowers:code-reviewer to review the diff between origin/main and HEAD on branch mvp-manual-purchases. Focus areas: data integrity in DB transaction (Transaction + Entitlement + LicenseKey), correctness of source filters in reporting aggregations, role gating on new admin endpoints, and the kill-switch fix at usage.service.ts.
```

Address findings inline; commit fixes separately so each is reviewable.

- [ ] **Step 2: Final gate after fixes**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

---

### Task 38: Human acceptance walkthrough

Per `docs/collaborative-testing-protocol.md` — one step at a time, await human confirmation between steps. Use the acceptance checklist verbatim from the spec, Section 7 Layer 4. Record each step's outcome.

- [ ] Apply migration locally → DB wiped.
- [ ] Sign in to mvp_web → free Transaction(FREE_AUTO) + entitlement + license key auto-created. License key visible.
- [ ] Sign in to mvp_admin → `Transactions` nav visible. Dashboard shows 1+ customers, $0 revenue.
- [ ] Stripe purchase happy path: Pro Plus via test card → entitlement on user dashboard → `/admin/transactions` row with `source=STRIPE`.
- [ ] Manual purchase happy path: second test customer signs up; admin records UPI Pro purchase with reference + notes → user sees Pro plan immediately → `/admin/transactions` MANUAL row → `/customers/:id` Transactions section populated.
- [ ] Manual purchase rejection: free product rejected.
- [ ] Dashboard subtitle reflects Stripe + Manual split. Per-plan page same.
- [ ] Kill switch: deactivate an entitlement on `/customers/:id` → desktop's next `/usage/report` returns 402.
- [ ] License key flow: copy from web → paste in desktop → run a layout → entitlement decrements → dashboard Total Calculations increments.

Only proceed to the next step after the human confirms the current one.

---

### Task 39: PR and platform deployment

- [ ] **Step 1: Push branch and open PR**

```bash
git push -u origin mvp-manual-purchases
gh pr create --title "feat: manual purchases and unified transaction ledger" --body "$(cat <<'EOF'
## Summary
- Introduces unified \`Transaction\` ledger as canonical record for Stripe + manual + free auto-grant purchases.
- Adds admin UI to record manual purchases (search customer by email, select plan, payment method, reference, notes).
- Surfaces Stripe vs Manual revenue split on admin dashboard and per-plan pages.
- Fixes kill-switch enforcement at \`POST /usage/report\` (deactivated entitlements were silently consumable).
- Migration wipes test data per spec; no real customer data affected.

## Spec
\`docs/superpowers/specs/2026-04-28-mvp-manual-purchases-design.md\`

## Test plan
- [ ] Apply migration locally; verify wipe.
- [ ] Each operator runs \`docs/mvp/TRANSACTIONS_SPIKE_POST_MIGRATION.md\`.
- [ ] Stripe purchase end-to-end.
- [ ] Manual purchase end-to-end.
- [ ] Kill switch works at API layer.
- [ ] Dashboard + per-plan show source split.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for CI to pass**

- [ ] **Step 3: After merge, manually trigger the platform-deployment workflow with environment = production**

- [ ] **Step 4: Run the production verification (acceptance walkthrough against production URLs) using `docs/mvp/TRANSACTIONS_SPIKE_POST_MIGRATION.md`**

- [ ] **Step 5: Wait for explicit human sign-off ("spike done")**

---

## Self-review checklist (run before declaring plan complete)

- [ ] Every spec section has at least one task implementing it.
- [ ] No "TBD", "TODO", "fill in" placeholders.
- [ ] Type names consistent across tasks (`Transaction`, `transactionId`, `source`, `purchasedAt`, `createdByUserId`, `PaymentMethod`).
- [ ] Test code accompanies every implementation step.
- [ ] Each phase ends with a passing pre-commit gate.
- [ ] Tasks reference exact files with absolute or repo-rooted paths.
- [ ] The kill-switch fix has dedicated tests AND is verified in the human walkthrough.
- [ ] Migration is described with full SQL, not "create table".
