# Spike 5: Stripe Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe one-time payment integration so users can purchase calculation packs from the dashboard, with automatic entitlement and license key provisioning.

**Architecture:** Stripe Checkout (`mode: 'payment'`) with webhook + verify-session safety net. Products and features stored in seeded DB tables. `processedAt` timestamp on `CheckoutSession` for idempotent provisioning. All Stripe logic in `apps/mvp_api`. Frontend redirects to Stripe Checkout — no embedded Payment Elements.

**Tech Stack:** Stripe Node SDK (`stripe`), Hono v4 on Bun, Prisma (`packages/mvp_db`), Next.js 16 + React 19 + TanStack Query v5 (`apps/mvp_web`).

---

## File Map

### `packages/mvp_db`

- Modify: `prisma/schema.prisma` — add `Product`, `ProductFeature`, `CheckoutSession` models; modify `User` (add `stripeCustomerId`, `checkoutSessions` relation); modify `Entitlement` (change `product` string to `productId` FK); modify `LicenseKey` (remove `product` field — key is per-user not per-product)
- Modify: `src/extensions/semantic-id/id-prefixes.ts` — add prefixes for new models
- Create: `prisma/seed-products.ts` — seed script for products + features
- Migration auto-generated

### `apps/mvp_api`

- Modify: `package.json` — add `stripe` dependency
- Modify: `src/env.ts` — add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Create: `src/lib/stripe.ts` — Stripe client singleton
- Create: `src/modules/products/products.routes.ts` — `GET /products`
- Create: `src/modules/products/products.routes.test.ts`
- Create: `src/modules/billing/billing.routes.ts` — `POST /billing/checkout`, `POST /billing/verify-session`, `GET /billing/entitlements`
- Create: `src/modules/billing/billing.routes.test.ts`
- Create: `src/modules/billing/provision.ts` — shared provisioning transaction logic
- Create: `src/modules/webhooks/stripe.webhook.routes.ts` — `POST /webhooks/stripe`
- Create: `src/modules/webhooks/stripe.webhook.test.ts`
- Modify: `src/app.ts` — register new routes

### `apps/mvp_web`

- Modify: `app/(main)/dashboard/plan/page.tsx` — replace placeholder with purchase + entitlements page
- Create: `app/(main)/dashboard/plan/page.test.tsx` — update tests
- Modify: `app/(main)/dashboard/license/page.tsx` — replace placeholder with license key display
- Create: `app/(main)/dashboard/license/page.test.tsx` — update tests
- Modify: `app/(main)/dashboard/page.tsx` — add entitlement balances to download cards
- Modify: `app/(main)/dashboard/page.test.tsx` — update tests
- Modify: `components/pricing-cards.tsx` — enable Buy Now buttons as links
- Modify: `app/(marketing)/pricing/page.test.tsx` — update test

### Config

- Modify: `turbo.json` — add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` to mvp-api build env
- Modify: `docs/initiatives/mvp-spike-plan.md` — update Spike 5 status

---

## Task 1: Schema changes + migration + ID prefixes

**Files:**
- Modify: `packages/mvp_db/prisma/schema.prisma`
- Modify: `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`

- [ ] **Step 1: Update the Prisma schema**

Replace the entire `packages/mvp_db/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model DownloadRegistration {
  id        String   @id @default("")
  name      String
  email     String
  mobile    String?
  product   String
  ipAddress String
  createdAt DateTime @default(now())

  @@map("download_registrations")
}

model ContactSubmission {
  id        String   @id @default("")
  name      String
  email     String
  subject   String
  message   String
  ipAddress String
  createdAt DateTime @default(now())

  @@map("contact_submissions")
}

model User {
  id               String            @id @default("")
  clerkId          String            @unique
  email            String            @unique
  name             String?
  stripeCustomerId String?           @unique
  createdAt        DateTime          @default(now())
  licenseKeys      LicenseKey[]
  entitlements     Entitlement[]
  checkoutSessions CheckoutSession[]

  @@map("users")
}

model LicenseKey {
  id        String    @id @default("")
  key       String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  createdAt DateTime  @default(now())
  revokedAt DateTime?

  @@map("license_keys")
}

model Product {
  id            String           @id @default("")
  slug          String           @unique
  name          String
  description   String
  priceAmount   Int
  priceCurrency String           @default("usd")
  calculations  Int
  stripePriceId String           @unique
  displayOrder  Int              @default(0)
  active        Boolean          @default(true)
  features      ProductFeature[]
  entitlements  Entitlement[]
  createdAt     DateTime         @default(now())

  @@map("products")
}

model ProductFeature {
  id         String  @id @default("")
  productId  String
  product    Product @relation(fields: [productId], references: [id])
  featureKey String
  label      String

  @@unique([productId, featureKey])
  @@map("product_features")
}

model Entitlement {
  id                String   @id @default("")
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  productId         String
  product           Product  @relation(fields: [productId], references: [id])
  totalCalculations Int
  usedCalculations  Int      @default(0)
  purchasedAt       DateTime @default(now())

  @@map("entitlements")
}

model CheckoutSession {
  id                       String    @id @default("")
  userId                   String
  user                     User      @relation(fields: [userId], references: [id])
  productSlug              String
  stripeCheckoutSessionId  String    @unique
  stripeCheckoutSessionUrl String
  status                   String?
  processedAt              DateTime?
  createdAt                DateTime  @default(now())

  @@map("checkout_sessions")
}
```

Key changes from previous schema:
- `User`: added `stripeCustomerId` (optional, unique) and `checkoutSessions` relation
- `LicenseKey`: removed `product` field — key is per-user, not per-product
- `Entitlement`: `product String` → `productId String` FK to `Product`
- New: `Product`, `ProductFeature`, `CheckoutSession`

- [ ] **Step 2: Add ID prefixes for new models**

In `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`, add prefixes:

```ts
export const ID_PREFIXES: Record<string, string> = {
  DownloadRegistration: "drg",
  ContactSubmission: "csb",
  User: "usr",
  LicenseKey: "lk",
  Product: "prod",
  ProductFeature: "pf",
  Entitlement: "ent",
  CheckoutSession: "cs",
}
```

- [ ] **Step 3: Run the migration**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun run mvp-db:migrate
```

When prompted for name, enter: `add_products_checkout_stripe`

- [ ] **Step 4: Regenerate Prisma client and rebuild**

```bash
bun run mvp-db:generate && bunx turbo build --filter=@renewable-energy/mvp-db
```

- [ ] **Step 5: Run existing tests to verify nothing breaks**

```bash
bunx turbo test --filter=@renewable-energy/mvp-db
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/mvp_db/prisma/schema.prisma \
        packages/mvp_db/prisma/migrations/ \
        packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts
git commit -m "feat(mvp-db): add Product, ProductFeature, CheckoutSession models; update User/Entitlement/LicenseKey

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Product seed script

**Files:**
- Create: `packages/mvp_db/prisma/seed-products.ts`

- [ ] **Step 1: Create the seed script**

Create `packages/mvp_db/prisma/seed-products.ts`:

```ts
import { adminPrisma } from "../src/index.js"

const STRIPE_PRICE_IDS = {
  "pv-layout-basic":
    process.env.STRIPE_PRICE_BASIC ?? "price_placeholder_basic",
  "pv-layout-pro":
    process.env.STRIPE_PRICE_PRO ?? "price_placeholder_pro",
  "pv-layout-pro-plus":
    process.env.STRIPE_PRICE_PRO_PLUS ?? "price_placeholder_pro_plus",
}

const products = [
  {
    slug: "pv-layout-basic",
    name: "PV Layout Basic",
    description: "5 layout calculations per purchase",
    priceAmount: 199,
    calculations: 5,
    displayOrder: 1,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "obstruction_exclusion", label: "Obstruction Exclusion" },
    ],
  },
  {
    slug: "pv-layout-pro",
    name: "PV Layout Pro",
    description: "10 layout calculations per purchase",
    priceAmount: 499,
    calculations: 10,
    displayOrder: 2,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "obstruction_exclusion", label: "Obstruction Exclusion" },
      { featureKey: "cable_routing", label: "AC & DC Cable Routing" },
      { featureKey: "cable_measurements", label: "Cable Quantity Measurements" },
    ],
  },
  {
    slug: "pv-layout-pro-plus",
    name: "PV Layout Pro Plus",
    description: "50 layout and yield calculations per purchase",
    priceAmount: 1499,
    calculations: 50,
    displayOrder: 3,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "obstruction_exclusion", label: "Obstruction Exclusion" },
      { featureKey: "cable_routing", label: "AC & DC Cable Routing" },
      { featureKey: "cable_measurements", label: "Cable Quantity Measurements" },
      { featureKey: "energy_yield", label: "Energy Yield Analysis" },
      { featureKey: "generation_estimates", label: "Plant Generation Estimates" },
    ],
  },
]

async function seed() {
  console.log("Seeding products...")

  for (const product of products) {
    const stripePriceId =
      STRIPE_PRICE_IDS[product.slug as keyof typeof STRIPE_PRICE_IDS]

    const upserted = await adminPrisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        description: product.description,
        priceAmount: product.priceAmount,
        calculations: product.calculations,
        stripePriceId: stripePriceId,
        displayOrder: product.displayOrder,
        active: true,
      },
      create: {
        slug: product.slug,
        name: product.name,
        description: product.description,
        priceAmount: product.priceAmount,
        calculations: product.calculations,
        stripePriceId: stripePriceId,
        displayOrder: product.displayOrder,
        active: true,
      },
    })

    // Delete existing features and recreate (simpler than diffing)
    await adminPrisma.productFeature.deleteMany({
      where: { productId: upserted.id },
    })

    for (const feature of product.features) {
      await adminPrisma.productFeature.create({
        data: {
          productId: upserted.id,
          featureKey: feature.featureKey,
          label: feature.label,
        },
      })
    }

    console.log(`  ✓ ${product.name} (${stripePriceId})`)
  }

  console.log("Done.")
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => adminPrisma.$disconnect())
```

- [ ] **Step 2: Run the seed script locally**

```bash
cd /Users/arunkpatra/codebase/renewable_energy/packages/mvp_db && \
bun run prisma/seed-products.ts
```

Expected: 3 products seeded with placeholder Stripe price IDs.

- [ ] **Step 3: Verify seed by checking DB**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && \
bun -e "import { prisma } from '@renewable-energy/mvp-db'; const p = await prisma.product.findMany({ include: { features: true } }); console.log(JSON.stringify(p, null, 2)); await prisma.\$disconnect()"
```

Expected: 3 products with their features.

- [ ] **Step 4: Commit**

```bash
git add packages/mvp_db/prisma/seed-products.ts
git commit -m "feat(mvp-db): add product seed script with 3 products and features

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add Stripe dependency, env vars, and Stripe client

**Files:**
- Modify: `apps/mvp_api/package.json`
- Modify: `apps/mvp_api/src/env.ts`
- Create: `apps/mvp_api/src/lib/stripe.ts`
- Modify: `turbo.json`

- [ ] **Step 1: Add `stripe` to mvp_api dependencies**

In `apps/mvp_api/package.json`, add to `dependencies`:

```json
"stripe": "^20.3.1"
```

- [ ] **Step 2: Add Stripe env vars to `env.ts`**

In `apps/mvp_api/src/env.ts`, add to the `EnvSchema`:

```ts
  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
```

- [ ] **Step 3: Create Stripe client singleton**

Create `apps/mvp_api/src/lib/stripe.ts`:

```ts
import Stripe from "stripe"
import { env } from "../env.js"

export function getStripeClient(): Stripe {
  const key = env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured")
  }
  return new Stripe(key)
}
```

- [ ] **Step 4: Add Stripe env vars to `turbo.json`**

In `turbo.json`, find the `@renewable-energy/mvp-api#build` block and add `"STRIPE_SECRET_KEY"` and `"STRIPE_WEBHOOK_SECRET"` to its `env` array.

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun install
```

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/package.json \
        apps/mvp_api/src/env.ts \
        apps/mvp_api/src/lib/stripe.ts \
        turbo.json \
        bun.lock
git commit -m "feat(mvp-api): add Stripe SDK, env vars, client singleton

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: GET /products route (TDD)

**Files:**
- Create: `apps/mvp_api/src/modules/products/products.routes.ts`
- Create: `apps/mvp_api/src/modules/products/products.routes.test.ts`
- Modify: `apps/mvp_api/src/app.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mvp_api/src/modules/products/products.routes.test.ts`:

```ts
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
  errorHandler,
  type MvpHonoEnv,
} from "../../middleware/error-handler.js"

// Mock the db module
const mockFindMany = mock(async () => [
  {
    slug: "pv-layout-basic",
    name: "PV Layout Basic",
    description: "5 layout calculations per purchase",
    priceAmount: 199,
    priceCurrency: "usd",
    calculations: 5,
    displayOrder: 1,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "obstruction_exclusion", label: "Obstruction Exclusion" },
    ],
  },
  {
    slug: "pv-layout-pro",
    name: "PV Layout Pro",
    description: "10 layout calculations per purchase",
    priceAmount: 499,
    priceCurrency: "usd",
    calculations: 10,
    displayOrder: 2,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "cable_routing", label: "AC & DC Cable Routing" },
    ],
  },
])

mock.module("../../lib/db.js", () => ({
  db: {
    product: {
      findMany: mockFindMany,
    },
  },
}))

const { productsRoutes } = await import("./products.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", productsRoutes)
  app.onError(errorHandler)
  return app
}

describe("GET /products", () => {
  beforeEach(() => {
    mockFindMany.mockReset()
    mockFindMany.mockImplementation(async () => [
      {
        slug: "pv-layout-basic",
        name: "PV Layout Basic",
        description: "5 layout calculations per purchase",
        priceAmount: 199,
        priceCurrency: "usd",
        calculations: 5,
        displayOrder: 1,
        features: [
          { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
        ],
      },
    ])
  })

  it("returns 200 with products list", async () => {
    const app = makeApp()
    const res = await app.request("/products", { method: "GET" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { products: unknown[] }
    }
    expect(body.success).toBe(true)
    expect(body.data.products).toHaveLength(1)
    expect(body.data.products[0]).toHaveProperty("slug", "pv-layout-basic")
    expect(body.data.products[0]).toHaveProperty("features")
  })

  it("does not expose stripePriceId in response", async () => {
    const app = makeApp()
    const res = await app.request("/products", { method: "GET" })
    const body = (await res.json()) as {
      success: boolean
      data: { products: Record<string, unknown>[] }
    }
    expect(body.data.products[0]).not.toHaveProperty("stripePriceId")
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/mvp_api && bun test src/modules/products/products.routes.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create the route**

Create `apps/mvp_api/src/modules/products/products.routes.ts`:

```ts
import { Hono } from "hono"
import { db } from "../../lib/db.js"
import { ok } from "../../lib/response.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const productsRoutes = new Hono<MvpHonoEnv>()

productsRoutes.get("/products", async (c) => {
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
    select: {
      slug: true,
      name: true,
      description: true,
      priceAmount: true,
      priceCurrency: true,
      calculations: true,
      features: {
        select: {
          featureKey: true,
          label: true,
        },
      },
    },
  })

  return c.json(ok({ products }))
})
```

- [ ] **Step 4: Register route in app.ts**

In `apps/mvp_api/src/app.ts`, add import and registration:

```ts
import { productsRoutes } from "./modules/products/products.routes.js"
```

Add after existing route registrations:

```ts
app.route("/", productsRoutes)
```

- [ ] **Step 5: Run test — expect PASS**

```bash
cd apps/mvp_api && bun test src/modules/products/products.routes.test.ts
```

- [ ] **Step 6: Run all mvp_api tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_api/src/modules/products/ \
        apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): add GET /products route with features

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Shared provisioning logic

**Files:**
- Create: `apps/mvp_api/src/modules/billing/provision.ts`

This module contains the shared transaction logic used by both the webhook handler and the verify-session endpoint.

- [ ] **Step 1: Create the provisioning module**

Create `apps/mvp_api/src/modules/billing/provision.ts`:

```ts
import { db } from "../../lib/db.js"
import crypto from "node:crypto"

/**
 * Provision an entitlement and (optionally) a license key for a completed checkout session.
 * Idempotent: if checkoutSession.processedAt is set, returns immediately.
 *
 * Must be called with a valid userId and productSlug. The checkoutSession must exist in the DB.
 */
export async function provisionEntitlement(
  stripeCheckoutSessionId: string,
): Promise<{ provisioned: boolean }> {
  // Look up the checkout session
  const session = await db.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId },
    include: { user: true },
  })

  if (!session) {
    console.warn(`CheckoutSession not found: ${stripeCheckoutSessionId}`)
    return { provisioned: false }
  }

  // Idempotency guard
  if (session.processedAt) {
    return { provisioned: false }
  }

  // Look up the product
  const product = await db.product.findUnique({
    where: { slug: session.productSlug },
  })

  if (!product) {
    console.error(`Product not found for slug: ${session.productSlug}`)
    return { provisioned: false }
  }

  // Check if user already has a license key
  const existingKey = await db.licenseKey.findFirst({
    where: { userId: session.userId },
  })

  // Single transaction: create entitlement + license key + mark processed
  await db.$transaction(async (tx) => {
    // Create entitlement
    await tx.entitlement.create({
      data: {
        userId: session.userId,
        productId: product.id,
        totalCalculations: product.calculations,
      },
    })

    // Create license key if user doesn't have one
    if (!existingKey) {
      const key = `sl_live_${crypto.randomBytes(24).toString("base64url")}`
      await tx.licenseKey.create({
        data: {
          userId: session.userId,
          key,
        },
      })
    }

    // Mark session as processed (idempotency)
    await tx.checkoutSession.update({
      where: { id: session.id },
      data: { processedAt: new Date() },
    })
  })

  return { provisioned: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mvp_api/src/modules/billing/provision.ts
git commit -m "feat(mvp-api): add shared entitlement provisioning logic

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Billing routes — checkout + verify-session + entitlements (TDD)

**Files:**
- Create: `apps/mvp_api/src/modules/billing/billing.routes.ts`
- Create: `apps/mvp_api/src/modules/billing/billing.routes.test.ts`
- Modify: `apps/mvp_api/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mvp_api/src/modules/billing/billing.routes.test.ts`:

```ts
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
  errorHandler,
  type MvpHonoEnv,
} from "../../middleware/error-handler.js"

// Mock Clerk auth
mock.module("../../middleware/clerk-auth.js", () => ({
  clerkAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}))

// Mock Clerk verifyToken to extract userId
mock.module("@clerk/backend", () => ({
  verifyToken: async () => ({ sub: "clerk_user_123" }),
}))

// Mock Stripe
const mockCheckoutSessionsCreate = mock(async () => ({
  id: "cs_test_123",
  url: "https://checkout.stripe.com/test",
}))
const mockCustomersCreate = mock(async () => ({
  id: "cus_test_123",
}))
mock.module("../../lib/stripe.js", () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: mockCheckoutSessionsCreate } },
    customers: { create: mockCustomersCreate },
  }),
}))

// Mock DB
const mockUserFindFirst = mock(async () => null)
const mockUserCreate = mock(async () => ({
  id: "usr_test1",
  clerkId: "clerk_user_123",
  email: "test@example.com",
  stripeCustomerId: null,
}))
const mockUserUpdate = mock(async () => ({
  id: "usr_test1",
  stripeCustomerId: "cus_test_123",
}))
const mockProductFindUnique = mock(async () => ({
  id: "prod_test1",
  slug: "pv-layout-basic",
  stripePriceId: "price_test_basic",
  calculations: 5,
}))
const mockCheckoutSessionCreate = mock(async () => ({
  id: "cs_db_test1",
}))
const mockEntitlementFindMany = mock(async () => [])
const mockLicenseKeyFindFirst = mock(async () => null)

mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findFirst: mockUserFindFirst,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
    product: {
      findUnique: mockProductFindUnique,
    },
    checkoutSession: {
      create: mockCheckoutSessionCreate,
    },
    entitlement: {
      findMany: mockEntitlementFindMany,
    },
    licenseKey: {
      findFirst: mockLicenseKeyFindFirst,
    },
  },
}))

// Mock provision
mock.module("./provision.js", () => ({
  provisionEntitlement: async () => ({ provisioned: true }),
}))

const { billingRoutes } = await import("./billing.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", billingRoutes)
  app.onError(errorHandler)
  return app
}

describe("POST /billing/checkout", () => {
  beforeEach(() => {
    mockUserFindFirst.mockReset()
    mockUserCreate.mockReset()
    mockUserUpdate.mockReset()
    mockProductFindUnique.mockReset()
    mockCheckoutSessionCreate.mockReset()
    mockCheckoutSessionsCreate.mockReset()
    mockCustomersCreate.mockReset()

    mockUserFindFirst.mockImplementation(async () => ({
      id: "usr_test1",
      clerkId: "clerk_user_123",
      email: "test@example.com",
      stripeCustomerId: "cus_existing",
    }))
    mockProductFindUnique.mockImplementation(async () => ({
      id: "prod_test1",
      slug: "pv-layout-basic",
      stripePriceId: "price_test_basic",
      calculations: 5,
      active: true,
    }))
    mockCheckoutSessionCreate.mockImplementation(async () => ({
      id: "cs_db_test1",
    }))
    mockCheckoutSessionsCreate.mockImplementation(async () => ({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/test",
    }))
  })

  it("returns 200 with checkout URL for valid product", async () => {
    const app = makeApp()
    const res = await app.request("/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ product: "pv-layout-basic" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { url: string }
    }
    expect(body.success).toBe(true)
    expect(body.data.url).toContain("checkout.stripe.com")
  })

  it("returns 400 for invalid product slug", async () => {
    mockProductFindUnique.mockImplementation(async () => null)
    const app = makeApp()
    const res = await app.request("/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ product: "nonexistent" }),
    })
    expect(res.status).toBe(400)
  })
})

describe("GET /billing/entitlements", () => {
  beforeEach(() => {
    mockUserFindFirst.mockReset()
    mockEntitlementFindMany.mockReset()
    mockLicenseKeyFindFirst.mockReset()

    mockUserFindFirst.mockImplementation(async () => ({
      id: "usr_test1",
      clerkId: "clerk_user_123",
    }))
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_test1",
        totalCalculations: 10,
        usedCalculations: 3,
        purchasedAt: new Date("2026-04-22"),
        product: {
          slug: "pv-layout-pro",
          name: "PV Layout Pro",
        },
      },
    ])
    mockLicenseKeyFindFirst.mockImplementation(async () => ({
      key: "sl_live_testkey123",
    }))
  })

  it("returns 200 with entitlements and license key", async () => {
    const app = makeApp()
    const res = await app.request("/billing/entitlements", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        entitlements: unknown[]
        licenseKey: string | null
      }
    }
    expect(body.success).toBe(true)
    expect(body.data.entitlements).toHaveLength(1)
    expect(body.data.licenseKey).toBe("sl_live_testkey123")
  })

  it("returns null licenseKey when user has none", async () => {
    mockLicenseKeyFindFirst.mockImplementation(async () => null)
    const app = makeApp()
    const res = await app.request("/billing/entitlements", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { licenseKey: string | null }
    }
    expect(body.data.licenseKey).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/mvp_api && bun test src/modules/billing/billing.routes.test.ts
```

- [ ] **Step 3: Create the billing routes**

Create `apps/mvp_api/src/modules/billing/billing.routes.ts`:

```ts
import { Hono } from "hono"
import { z } from "zod"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { db } from "../../lib/db.js"
import { getStripeClient } from "../../lib/stripe.js"
import { ok } from "../../lib/response.js"
import { AppError, ValidationError } from "../../lib/errors.js"
import { provisionEntitlement } from "./provision.js"
import { env } from "../../env.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { verifyToken } from "@clerk/backend"

export const billingRoutes = new Hono<MvpHonoEnv>()

// All /billing/* routes require Clerk authentication
billingRoutes.use("/billing/*", clerkAuth)

const CheckoutBodySchema = z.object({
  product: z.string().min(1),
})

const VerifyBodySchema = z.object({
  sessionId: z.string().min(1),
})

/** Extract Clerk user ID from the Authorization header */
async function getClerkUserId(authHeader: string | undefined): Promise<string> {
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined
  if (!token) throw new AppError("UNAUTHORIZED", "Missing token", 401)
  const payload = await verifyToken(token, {
    secretKey: env.CLERK_SECRET_KEY ?? "",
  })
  return payload.sub
}

/** Upsert a User record by Clerk ID. Creates Stripe customer if needed. */
async function resolveUser(clerkId: string, email: string, name?: string) {
  let user = await db.user.findFirst({ where: { clerkId } })

  if (!user) {
    user = await db.user.create({
      data: { clerkId, email, name },
    })
  }

  // Create Stripe customer if needed
  if (!user.stripeCustomerId) {
    const stripe = getStripeClient()
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id, clerkId: user.clerkId },
    })
    user = await db.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    })
  }

  return user
}

// POST /billing/checkout
billingRoutes.post("/billing/checkout", async (c) => {
  const body = CheckoutBodySchema.safeParse(await c.req.json())
  if (!body.success) {
    throw new ValidationError(body.error.flatten().fieldErrors)
  }

  const product = await db.product.findUnique({
    where: { slug: body.data.product },
  })

  if (!product || !product.active) {
    throw new ValidationError({
      product: ["Invalid or inactive product"],
    })
  }

  // Resolve user from Clerk token
  const clerkId = await getClerkUserId(c.req.header("Authorization"))
  // Get Clerk user details for Stripe customer creation
  const user = await resolveUser(clerkId, clerkId) // email updated later if needed

  const stripe = getStripeClient()
  const baseUrl =
    env.MVP_CORS_ORIGINS?.split(",")[0]?.trim() ?? "http://localhost:3002"

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: user.stripeCustomerId!,
    line_items: [{ price: product.stripePriceId, quantity: 1 }],
    metadata: { userId: user.id, product: product.slug },
    success_url: `${baseUrl}/dashboard/plan?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard/plan`,
  })

  await db.checkoutSession.create({
    data: {
      userId: user.id,
      productSlug: product.slug,
      stripeCheckoutSessionId: session.id,
      stripeCheckoutSessionUrl: session.url!,
    },
  })

  return c.json(ok({ url: session.url! }))
})

// POST /billing/verify-session
billingRoutes.post("/billing/verify-session", async (c) => {
  const body = VerifyBodySchema.safeParse(await c.req.json())
  if (!body.success) {
    throw new ValidationError(body.error.flatten().fieldErrors)
  }

  const session = await db.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId: body.data.sessionId },
  })

  if (!session) {
    throw new AppError("NOT_FOUND", "Checkout session not found", 404)
  }

  // Already processed
  if (session.processedAt) {
    return c.json(ok({ verified: true, updated: false }))
  }

  // Check with Stripe
  const stripe = getStripeClient()
  const stripeSession = await stripe.checkout.sessions.retrieve(
    body.data.sessionId,
  )

  if (stripeSession.status !== "complete") {
    await db.checkoutSession.update({
      where: { id: session.id },
      data: { status: stripeSession.status ?? undefined },
    })
    return c.json(ok({ verified: false }))
  }

  // Provision entitlement
  const result = await provisionEntitlement(body.data.sessionId)

  return c.json(ok({ verified: true, updated: result.provisioned }))
})

// GET /billing/entitlements
billingRoutes.get("/billing/entitlements", async (c) => {
  const clerkId = await getClerkUserId(c.req.header("Authorization"))
  const user = await db.user.findFirst({ where: { clerkId } })

  if (!user) {
    return c.json(ok({ entitlements: [], licenseKey: null }))
  }

  const entitlements = await db.entitlement.findMany({
    where: { userId: user.id },
    orderBy: { purchasedAt: "desc" },
    include: {
      product: {
        select: { slug: true, name: true },
      },
    },
  })

  const licenseKey = await db.licenseKey.findFirst({
    where: { userId: user.id, revokedAt: null },
  })

  const mapped = entitlements.map((e) => ({
    product: e.product.slug,
    productName: e.product.name,
    totalCalculations: e.totalCalculations,
    usedCalculations: e.usedCalculations,
    remainingCalculations: e.totalCalculations - e.usedCalculations,
    purchasedAt: e.purchasedAt.toISOString(),
  }))

  return c.json(
    ok({
      entitlements: mapped,
      licenseKey: licenseKey?.key ?? null,
    }),
  )
})
```

- [ ] **Step 4: Register routes in app.ts**

In `apps/mvp_api/src/app.ts`, add import:

```ts
import { billingRoutes } from "./modules/billing/billing.routes.js"
```

Add registration:

```ts
app.route("/", billingRoutes)
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/mvp_api && bun test src/modules/billing/billing.routes.test.ts
```

- [ ] **Step 6: Run all mvp_api tests + typecheck**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api && bunx turbo typecheck --filter=@renewable-energy/mvp-api
```

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_api/src/modules/billing/ \
        apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): add billing routes — checkout, verify-session, entitlements

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Stripe webhook handler (TDD)

**Files:**
- Create: `apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.ts`
- Create: `apps/mvp_api/src/modules/webhooks/stripe.webhook.test.ts`
- Modify: `apps/mvp_api/src/app.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mvp_api/src/modules/webhooks/stripe.webhook.test.ts`:

```ts
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
  errorHandler,
  type MvpHonoEnv,
} from "../../middleware/error-handler.js"

// Mock provision
const mockProvisionEntitlement = mock(async () => ({ provisioned: true }))
mock.module("../billing/provision.js", () => ({
  provisionEntitlement: mockProvisionEntitlement,
}))

// Mock stripe webhook verification
const mockConstructEvent = mock(
  (_body: unknown, _sig: unknown, _secret: unknown) => ({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        metadata: { userId: "usr_test1", product: "pv-layout-basic" },
      },
    },
  }),
)
mock.module("../../lib/stripe.js", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: mockConstructEvent },
  }),
}))

// Mock env
mock.module("../../env.js", () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  },
}))

const { stripeWebhookRoutes } = await import("./stripe.webhook.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", stripeWebhookRoutes)
  app.onError(errorHandler)
  return app
}

describe("POST /webhooks/stripe", () => {
  beforeEach(() => {
    mockProvisionEntitlement.mockReset()
    mockConstructEvent.mockReset()
    mockProvisionEntitlement.mockImplementation(async () => ({
      provisioned: true,
    }))
    mockConstructEvent.mockImplementation(() => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          metadata: { userId: "usr_test1", product: "pv-layout-basic" },
        },
      },
    }))
  })

  it("returns 200 and provisions entitlement for checkout.session.completed", async () => {
    const app = makeApp()
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "test_sig",
      },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    })
    expect(res.status).toBe(200)
    expect(mockProvisionEntitlement).toHaveBeenCalledWith("cs_test_123")
  })

  it("returns 200 and ignores unhandled event types", async () => {
    mockConstructEvent.mockImplementation(() => ({
      type: "customer.created",
      data: { object: {} },
    }))
    const app = makeApp()
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "test_sig",
      },
      body: JSON.stringify({ type: "customer.created" }),
    })
    expect(res.status).toBe(200)
    expect(mockProvisionEntitlement).not.toHaveBeenCalled()
  })

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature")
    })
    const app = makeApp()
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "bad_sig",
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/mvp_api && bun test src/modules/webhooks/stripe.webhook.test.ts
```

- [ ] **Step 3: Create the webhook route**

Create `apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.ts`:

```ts
import { Hono } from "hono"
import { getStripeClient } from "../../lib/stripe.js"
import { env } from "../../env.js"
import { provisionEntitlement } from "../billing/provision.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const stripeWebhookRoutes = new Hono<MvpHonoEnv>()

stripeWebhookRoutes.post("/webhooks/stripe", async (c) => {
  const stripe = getStripeClient()
  const sig = c.req.header("stripe-signature")

  if (!sig) {
    return c.json({ error: "Missing stripe-signature header" }, 400)
  }

  const rawBody = await c.req.text()

  let event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      env.STRIPE_WEBHOOK_SECRET ?? "",
    )
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err)
    return c.json({ error: "Invalid signature" }, 400)
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string
      metadata: Record<string, string>
    }

    console.log(
      JSON.stringify({
        level: "info",
        event: "checkout.session.completed",
        stripeSessionId: session.id,
        product: session.metadata?.product,
        userId: session.metadata?.userId,
      }),
    )

    try {
      await provisionEntitlement(session.id)
    } catch (err) {
      console.error("Provisioning failed for session:", session.id, err)
      // Return 500 so Stripe retries
      return c.json({ error: "Provisioning failed" }, 500)
    }
  }

  return c.json({ received: true }, 200)
})
```

- [ ] **Step 4: Register webhook route in app.ts**

In `apps/mvp_api/src/app.ts`, add import:

```ts
import { stripeWebhookRoutes } from "./modules/webhooks/stripe.webhook.routes.js"
```

Add registration (BEFORE the CORS middleware — webhooks must not be blocked by CORS, OR add it after other routes since Stripe doesn't send CORS preflight):

```ts
app.route("/", stripeWebhookRoutes)
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/mvp_api && bun test src/modules/webhooks/stripe.webhook.test.ts
```

- [ ] **Step 6: Run all mvp_api tests + typecheck**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api && bunx turbo typecheck --filter=@renewable-energy/mvp-api
```

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_api/src/modules/webhooks/ \
        apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): add Stripe webhook handler for checkout.session.completed

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Plan page — replace placeholder with purchase + entitlements UI

**Files:**
- Modify: `apps/mvp_web/app/(main)/dashboard/plan/page.tsx`
- Modify: `apps/mvp_web/app/(main)/dashboard/plan/page.test.tsx`

- [ ] **Step 1: Write the updated test**

Replace `apps/mvp_web/app/(main)/dashboard/plan/page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}))

// Mock fetch for products and entitlements
const mockFetch = vi.fn()
global.fetch = mockFetch

import PlanPage from "./page"

describe("Plan page", () => {
  it("renders Plan heading", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { products: [], entitlements: [], licenseKey: null } }),
    })
    render(<PlanPage />)
    expect(screen.getByRole("heading", { name: /Plan/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — may fail (page not yet rewritten)**

- [ ] **Step 3: Rewrite the Plan page**

Replace `apps/mvp_web/app/(main)/dashboard/plan/page.tsx`:

```tsx
"use client"

import { useEffect, useState, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { CreditCard, Check, Loader2, Copy, CheckCheck } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import { toast } from "sonner"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

interface Product {
  slug: string
  name: string
  description: string
  priceAmount: number
  priceCurrency: string
  calculations: number
  features: { featureKey: string; label: string }[]
}

interface EntitlementItem {
  product: string
  productName: string
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
  purchasedAt: string
}

export default function PlanPage() {
  const { getToken } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [products, setProducts] = useState<Product[]>([])
  const [entitlements, setEntitlements] = useState<EntitlementItem[]>([])
  const [licenseKey, setLicenseKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const hasVerified = useRef(false)

  const sessionId = searchParams.get("session_id")

  // Fetch products and entitlements
  useEffect(() => {
    async function load() {
      try {
        const [productsRes, entitlementsRes] = await Promise.all([
          fetch(`${MVP_API_URL}/products`),
          (async () => {
            const token = await getToken()
            if (!token) return null
            return fetch(`${MVP_API_URL}/billing/entitlements`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          })(),
        ])

        if (productsRes.ok) {
          const data = await productsRes.json()
          if (data.success) setProducts(data.data.products)
        }

        if (entitlementsRes?.ok) {
          const data = await entitlementsRes.json()
          if (data.success) {
            setEntitlements(data.data.entitlements)
            setLicenseKey(data.data.licenseKey)
          }
        }
      } catch (err) {
        console.error("Failed to load plan data:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getToken])

  // Verify checkout session on return from Stripe
  useEffect(() => {
    if (!sessionId || hasVerified.current) return
    hasVerified.current = true

    async function verify() {
      try {
        const token = await getToken()
        const res = await fetch(`${MVP_API_URL}/billing/verify-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId }),
        })
        const data = await res.json()
        if (data.success && data.data.verified) {
          toast.success("Purchase successful! Your entitlement has been activated.")
          // Reload entitlements
          const entRes = await fetch(`${MVP_API_URL}/billing/entitlements`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (entRes.ok) {
            const entData = await entRes.json()
            if (entData.success) {
              setEntitlements(entData.data.entitlements)
              setLicenseKey(entData.data.licenseKey)
            }
          }
        }
      } catch (err) {
        console.error("Session verification failed:", err)
      }
      // Remove session_id from URL
      router.replace("/dashboard/plan")
    }
    verify()
  }, [sessionId, getToken, router])

  async function handlePurchase(productSlug: string) {
    setCheckoutLoading(productSlug)
    try {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product: productSlug }),
      })
      const data = await res.json()
      if (data.success && data.data.url) {
        window.location.href = data.data.url
      } else {
        toast.error("Failed to start checkout. Please try again.")
      }
    } catch (err) {
      console.error("Checkout error:", err)
      toast.error("Failed to start checkout. Please try again.")
    } finally {
      setCheckoutLoading(null)
    }
  }

  async function copyLicenseKey() {
    if (!licenseKey) return
    await navigator.clipboard.writeText(licenseKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Plan
        </h1>
        <p className="mt-1 text-muted-foreground">
          Purchase calculation packs and manage your entitlements.
        </p>
      </div>

      {/* Product cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Card key={product.slug} className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">{product.name}</CardTitle>
              <div className="mt-2">
                <span className="text-3xl font-bold text-foreground">
                  ${(product.priceAmount / 100).toFixed(2)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {product.calculations} calculations
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <ul className="space-y-1">
                {product.features.map((f) => (
                  <li
                    key={f.featureKey}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="h-4 w-4 text-green-600 shrink-0" />
                    {f.label}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handlePurchase(product.slug)}
                disabled={checkoutLoading !== null}
                className="w-full"
              >
                {checkoutLoading === product.slug ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  "Purchase"
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entitlements */}
      {entitlements.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Your Entitlements
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entitlements.map((ent, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{ent.productName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-foreground">
                    {ent.remainingCalculations}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {ent.totalCalculations} remaining
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Purchased{" "}
                    {new Date(ent.purchasedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* License Key */}
      {licenseKey && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            License Key
          </h2>
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-3 py-2 text-sm font-mono">
              {licenseKey}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={copyLicenseKey}
              aria-label="Copy license key"
            >
              {copied ? (
                <CheckCheck className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use this key in your SolarLayout desktop application.
          </p>
        </div>
      )}
    </div>
  )
}
```

**Note:** This is a client component (`"use client"`) because it uses hooks (useSearchParams, useAuth, useState, useEffect). The `export const metadata` is removed since client components don't support it.

- [ ] **Step 4: Run tests — expect PASS**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

- [ ] **Step 5: Commit**

```bash
git add "apps/mvp_web/app/(main)/dashboard/plan/"
git commit -m "feat(mvp-web): replace Plan placeholder with purchase + entitlements page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: License page — replace placeholder with key display

**Files:**
- Modify: `apps/mvp_web/app/(main)/dashboard/license/page.tsx`
- Modify: `apps/mvp_web/app/(main)/dashboard/license/page.test.tsx`

- [ ] **Step 1: Write updated test**

Replace `apps/mvp_web/app/(main)/dashboard/license/page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import LicensePage from "./page"

describe("License page", () => {
  it("renders License heading", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { entitlements: [], licenseKey: null },
      }),
    })
    render(<LicensePage />)
    expect(
      screen.getByRole("heading", { name: /License/i }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rewrite License page**

Replace `apps/mvp_web/app/(main)/dashboard/license/page.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { Key, Copy, CheckCheck, Loader2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export default function LicensePage() {
  const { getToken } = useAuth()
  const [licenseKey, setLicenseKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken()
        if (!token) return
        const res = await fetch(`${MVP_API_URL}/billing/entitlements`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            setLicenseKey(data.data.licenseKey)
          }
        }
      } catch (err) {
        console.error("Failed to load license key:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getToken])

  async function copyKey() {
    if (!licenseKey) return
    await navigator.clipboard.writeText(licenseKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          License
        </h1>
        <p className="mt-1 text-muted-foreground">Your licence key.</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Licence Key</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {licenseKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {licenseKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyKey}
                  aria-label="Copy license key"
                >
                  {copied ? (
                    <CheckCheck className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter this key in your SolarLayout desktop application to
                activate it.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Purchase a plan from the{" "}
              <a
                href="/dashboard/plan"
                className="text-primary underline underline-offset-4"
              >
                Plan page
              </a>{" "}
              to get your licence key.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

- [ ] **Step 4: Commit**

```bash
git add "apps/mvp_web/app/(main)/dashboard/license/"
git commit -m "feat(mvp-web): replace License placeholder with key display + copy button

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Enable pricing page Buy Now buttons

**Files:**
- Modify: `apps/mvp_web/components/pricing-cards.tsx`
- Modify: `apps/mvp_web/app/(marketing)/pricing/page.test.tsx`

- [ ] **Step 1: Update pricing test**

In `apps/mvp_web/app/(marketing)/pricing/page.test.tsx`, find the test `"renders disabled Buy Now buttons without tooltip"` and replace it with:

```tsx
test("renders Buy Now buttons as links to dashboard plan page", () => {
  render(<PricingPage />)
  const buyLinks = screen.getAllByRole("link", { name: /Buy Now/i })
  expect(buyLinks.length).toBeGreaterThanOrEqual(3)
  expect(buyLinks[0]).toHaveAttribute(
    "href",
    "/dashboard/plan?product=pv-layout-basic"
  )
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Update `pricing-cards.tsx`**

In `apps/mvp_web/components/pricing-cards.tsx`:

1. Add `import Link from "next/link"` at the top
2. Add `slug` to the `PricingTier` interface and tier data:

```ts
interface PricingTier {
  name: string
  slug: string
  price: string
  purchaseModel: string
  calculations: string
  highlighted?: boolean
}

const tiers: PricingTier[] = [
  {
    name: "PV Layout Basic",
    slug: "pv-layout-basic",
    price: "$1.99",
    purchaseModel: "One-time",
    calculations: "5 Layout",
  },
  {
    name: "PV Layout Pro",
    slug: "pv-layout-pro",
    price: "$4.99",
    purchaseModel: "One-time",
    calculations: "10 Layout",
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    slug: "pv-layout-pro-plus",
    price: "$14.99",
    purchaseModel: "One-time",
    calculations: "50 Layout + Yield",
  },
]
```

3. Replace the disabled Button in the card grid with a Link:

```tsx
<CardContent className="flex flex-1 flex-col justify-end">
  <Button asChild variant="outline" className="w-full">
    <Link href={`/dashboard/plan?product=${tier.slug}`}>
      Buy Now
    </Link>
  </Button>
</CardContent>
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_web/components/pricing-cards.tsx \
        "apps/mvp_web/app/(marketing)/pricing/page.test.tsx"
git commit -m "feat(mvp-web): enable Buy Now buttons — link to /dashboard/plan?product=<slug>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Dashboard home page — show entitlement balances on download cards

**Files:**
- Modify: `apps/mvp_web/app/(main)/dashboard/page.tsx`
- Modify: `apps/mvp_web/app/(main)/dashboard/page.test.tsx`

- [ ] **Step 1: Update test**

Replace `apps/mvp_web/app/(main)/dashboard/page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import DashboardPage from "./page"

describe("Dashboard home page", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { entitlements: [], licenseKey: null },
      }),
    })
  })

  it("renders welcome heading", () => {
    render(<DashboardPage />)
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
  })

  it("renders three download cards", () => {
    render(<DashboardPage />)
    expect(screen.getByText("PV Layout Basic")).toBeInTheDocument()
    expect(screen.getByText("PV Layout Pro")).toBeInTheDocument()
    expect(screen.getByText("PV Layout Pro Plus")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Update dashboard home page**

Replace `apps/mvp_web/app/(main)/dashboard/page.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { DownloadCard } from "@/components/download-card"
import Link from "next/link"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

const products = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    calculations: "5 layout calculations per purchase",
    productSlug: "pv-layout-basic" as const,
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    calculations: "10 layout calculations per purchase",
    productSlug: "pv-layout-pro" as const,
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    calculations: "50 layout and yield calculations per purchase",
    productSlug: "pv-layout-pro-plus" as const,
  },
]

interface EntitlementItem {
  product: string
  remainingCalculations: number
}

export default function DashboardPage() {
  const { getToken } = useAuth()
  const [entitlements, setEntitlements] = useState<EntitlementItem[]>([])

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken()
        if (!token) return
        const res = await fetch(`${MVP_API_URL}/billing/entitlements`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success) setEntitlements(data.data.entitlements)
        }
      } catch {
        // silent — entitlements are supplementary info
      }
    }
    load()
  }, [getToken])

  function getRemainingForProduct(slug: string): number {
    return entitlements
      .filter((e) => e.product === slug)
      .reduce((sum, e) => sum + e.remainingCalculations, 0)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Downloads
        </h1>
        <p className="mt-1 text-muted-foreground">
          Download the SolarLayout desktop application for your plan.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const remaining = getRemainingForProduct(product.productSlug)
          return (
            <div key={product.productSlug} className="space-y-2">
              <DownloadCard
                name={product.name}
                price={product.price}
                calculations={product.calculations}
                productSlug={product.productSlug}
                apiBaseUrl={MVP_API_URL}
                highlighted={product.highlighted}
              />
              <div className="text-center text-sm text-muted-foreground">
                {remaining > 0 ? (
                  <span>{remaining} calculations remaining</span>
                ) : (
                  <Link
                    href={`/dashboard/plan?product=${product.productSlug}`}
                    className="text-primary underline underline-offset-4"
                  >
                    Buy calculations
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Note:** This is now a client component (`"use client"`) because it fetches entitlements.

- [ ] **Step 3: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

- [ ] **Step 4: Commit**

```bash
git add "apps/mvp_web/app/(main)/dashboard/page.tsx" \
        "apps/mvp_web/app/(main)/dashboard/page.test.tsx"
git commit -m "feat(mvp-web): show entitlement balances and buy-more links on download cards

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Update spike plan + full gates

**Files:**
- Modify: `docs/initiatives/mvp-spike-plan.md`
- Modify: `turbo.json` (if not already updated)

- [ ] **Step 1: Update spike plan**

Mark Spike 5 as complete. Update the status in the overview table and the Spike 5 section. Add decision D24: One-time payment packs, not subscriptions.

- [ ] **Step 2: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

All must pass.

- [ ] **Step 3: Commit**

```bash
git add docs/initiatives/mvp-spike-plan.md
git commit -m "docs: mark Spike 5 complete — Stripe one-time payment integration

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
