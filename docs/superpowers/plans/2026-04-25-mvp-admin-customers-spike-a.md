# MVP Admin — Customers, Purchase Recording, Entitlement Deactivation (Spike A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Customers section to the admin portal, record purchase amounts from Stripe webhooks, and enable admins/ops to deactivate/reactivate entitlements; filter consumer entitlements endpoint to exclude deactivated and exhausted entitlements.

**Architecture:** All data flows through `apps/mvp_admin → HTTP → apps/mvp_api → packages/mvp_db → PostgreSQL`. Customer routes live in a new `customer.routes.ts` with `requireRole("ADMIN", "OPS")`, separate from the existing `admin.routes.ts` which keeps `requireRole("ADMIN")`. No new external dependencies.

**Tech Stack:** Prisma (PostgreSQL), Hono, Bun:test, Next.js 15 App Router, TanStack Query, shadcn/ui, Clerk, TypeScript.

---

## File Map

**New files — `apps/mvp_api`:**
- `src/modules/billing/provision.test.ts` — tests for `provisionEntitlement` with/without `purchase` arg
- `src/modules/admin/customer.service.ts` — `listCustomers`, `getCustomer`, `updateEntitlementStatus`
- `src/modules/admin/customer.routes.test.ts` — integration tests for all 3 new routes
- `src/modules/admin/customer.routes.ts` — 3 routes with `requireRole("ADMIN", "OPS")`

**Modified files — `apps/mvp_api`:**
- `src/modules/billing/provision.ts` — extend signature to accept optional `purchase` param
- `src/modules/billing/billing.routes.ts` — filter `GET /billing/entitlements`
- `src/modules/billing/billing.routes.test.ts` — add tests for filtering
- `src/modules/webhooks/stripe.webhook.routes.ts` — pass `amountTotal`/`currency`
- `src/app.ts` — mount `customerRoutes`

**Modified files — `packages/mvp_db`:**
- `prisma/schema.prisma` — add `amountTotal Int?`, `currency String?` to `CheckoutSession`; add `deactivatedAt DateTime?` to `Entitlement`

**New files — `apps/mvp_admin`:**
- `lib/hooks/use-admin-customers.ts` — `useAdminCustomers`, `useAdminCustomer`, `useUpdateEntitlementStatus`
- `app/(admin)/customers/page.tsx` — list page (server component)
- `app/(admin)/customers/_components/customers-page-client.tsx` — paginated table client component
- `app/(admin)/customers/[id]/page.tsx` — detail page (server component)
- `app/(admin)/customers/[id]/_components/customer-detail-client.tsx` — detail client component

**Modified files — `apps/mvp_admin`:**
- `lib/api.ts` — add `CustomerListItem`, `EntitlementDetail`, `CustomerDetail`, `AdminCustomersResponse` types
- `components/admin-sidebar.tsx` — add Customers to `BASE_NAV`

---

## Task 1: DB Schema — Add purchase amount and entitlement deactivation fields

**Files:**
- Modify: `packages/mvp_db/prisma/schema.prisma`
- Migrate: `packages/mvp_db/prisma/migrations/` (auto-generated)

- [ ] **Step 1: Add fields to schema**

In `packages/mvp_db/prisma/schema.prisma`, update `CheckoutSession` and `Entitlement`:

```prisma
model CheckoutSession {
  id                       String    @id @default("")
  userId                   String
  user                     User      @relation(fields: [userId], references: [id])
  productSlug              String
  stripeCheckoutSessionId  String    @unique
  stripeCheckoutSessionUrl String
  status                   String?
  amountTotal              Int?
  currency                 String?
  processedAt              DateTime?
  createdAt                DateTime  @default(now())

  @@map("checkout_sessions")
}

model Entitlement {
  id                String    @id @default("")
  userId            String
  user              User      @relation(fields: [userId], references: [id])
  productId         String
  product           Product   @relation(fields: [productId], references: [id])
  totalCalculations Int
  usedCalculations  Int       @default(0)
  purchasedAt       DateTime  @default(now())
  deactivatedAt     DateTime?

  @@map("entitlements")
}
```

- [ ] **Step 2: Create migration (from repo root)**

```bash
bun run db:migrate
```

When prompted for a migration name, enter:
```
add_purchase_amount_entitlement_deactivation
```

Expected: migration file created under `packages/mvp_db/prisma/migrations/`, Prisma client regenerated.

- [ ] **Step 3: Verify Prisma client regenerated**

```bash
bun run db:generate
```

Expected: no errors. Prisma client output in `packages/mvp_db/src/generated/prisma`.

- [ ] **Step 4: Run gates**

```bash
bun run lint && bun run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mvp_db/prisma/schema.prisma packages/mvp_db/prisma/migrations/
git commit -m "feat(mvp-db): add amountTotal/currency to CheckoutSession, deactivatedAt to Entitlement"
```

---

## Task 2: Extend `provisionEntitlement` to write purchase amount

**Files:**
- Create: `apps/mvp_api/src/modules/billing/provision.test.ts`
- Modify: `apps/mvp_api/src/modules/billing/provision.ts`

- [ ] **Step 1: Write failing test**

Create `apps/mvp_api/src/modules/billing/provision.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test"

const mockCheckoutSessionFindUnique = mock(async () => ({
  id: "cs1",
  stripeCheckoutSessionId: "cs_test_123",
  userId: "usr1",
  productSlug: "pv-layout-pro",
  processedAt: null,
  user: { id: "usr1", email: "test@example.com" },
}))
const mockProductFindUnique = mock(async () => ({
  id: "prod1",
  slug: "pv-layout-pro",
  calculations: 100,
}))
const mockLicenseKeyFindFirst = mock(async () => null)
const mockTxEntitlementCreate = mock(async () => ({}))
const mockTxLicenseKeyCreate = mock(async () => ({}))
const mockTxCheckoutSessionUpdate = mock(async () => ({}))

const mockTx = {
  entitlement: { create: mockTxEntitlementCreate },
  licenseKey: { create: mockTxLicenseKeyCreate },
  checkoutSession: { update: mockTxCheckoutSessionUpdate },
}

mock.module("../../lib/db.js", () => ({
  db: {
    checkoutSession: { findUnique: mockCheckoutSessionFindUnique },
    product: { findUnique: mockProductFindUnique },
    licenseKey: { findFirst: mockLicenseKeyFindFirst },
    $transaction: async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx),
  },
}))

const { provisionEntitlement } = await import("./provision.js")

describe("provisionEntitlement", () => {
  beforeEach(() => {
    mockCheckoutSessionFindUnique.mockImplementation(async () => ({
      id: "cs1",
      stripeCheckoutSessionId: "cs_test_123",
      userId: "usr1",
      productSlug: "pv-layout-pro",
      processedAt: null,
      user: { id: "usr1", email: "test@example.com" },
    }))
    mockProductFindUnique.mockImplementation(async () => ({
      id: "prod1",
      slug: "pv-layout-pro",
      calculations: 100,
    }))
    mockLicenseKeyFindFirst.mockImplementation(async () => null)
    mockTxEntitlementCreate.mockReset()
    mockTxLicenseKeyCreate.mockReset()
    mockTxCheckoutSessionUpdate.mockReset()
    mockTxEntitlementCreate.mockImplementation(async () => ({}))
    mockTxLicenseKeyCreate.mockImplementation(async () => ({}))
    mockTxCheckoutSessionUpdate.mockImplementation(async () => ({}))
  })

  it("returns provisioned: true for valid session", async () => {
    const result = await provisionEntitlement("cs_test_123")
    expect(result.provisioned).toBe(true)
    expect(mockTxEntitlementCreate).toHaveBeenCalledTimes(1)
  })

  it("writes amountTotal and currency when purchase arg provided", async () => {
    await provisionEntitlement("cs_test_123", {
      amountTotal: 4999,
      currency: "usd",
    })
    const calls = mockTxCheckoutSessionUpdate.mock.calls
    expect(calls.length).toBe(1)
    const arg = calls[0]![0] as { data: Record<string, unknown> }
    expect(arg.data.amountTotal).toBe(4999)
    expect(arg.data.currency).toBe("usd")
    expect(arg.data.processedAt).toBeInstanceOf(Date)
  })

  it("omits amountTotal from update when no purchase arg", async () => {
    await provisionEntitlement("cs_test_123")
    const calls = mockTxCheckoutSessionUpdate.mock.calls
    expect(calls.length).toBe(1)
    const arg = calls[0]![0] as { data: Record<string, unknown> }
    expect(arg.data.processedAt).toBeInstanceOf(Date)
    expect("amountTotal" in arg.data).toBe(false)
  })

  it("returns provisioned: false for already processed session", async () => {
    mockCheckoutSessionFindUnique.mockImplementation(async () => ({
      id: "cs1",
      stripeCheckoutSessionId: "cs_test_123",
      userId: "usr1",
      productSlug: "pv-layout-pro",
      processedAt: new Date(),
      user: { id: "usr1", email: "test@example.com" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any)
    const result = await provisionEntitlement("cs_test_123")
    expect(result.provisioned).toBe(false)
  })

  it("returns provisioned: false for missing session", async () => {
    mockCheckoutSessionFindUnique.mockImplementation(async () => null as never)
    const result = await provisionEntitlement("nonexistent")
    expect(result.provisioned).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "provision"
```

Expected: FAIL — test for "writes amountTotal and currency" should fail because current `provisionEntitlement` doesn't accept a second argument.

- [ ] **Step 3: Update `provision.ts` to accept optional `purchase` param**

Replace `apps/mvp_api/src/modules/billing/provision.ts` entirely:

```typescript
import { db } from "../../lib/db.js"
import crypto from "node:crypto"

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

  // Idempotency guard
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

  // Check if user already has a license key
  const existingKey = await db.licenseKey.findFirst({
    where: { userId: session.userId },
  })

  // Single transaction: create entitlement + license key + mark processed
  await db.$transaction(async (tx) => {
    await tx.entitlement.create({
      data: {
        userId: session.userId,
        productId: product.id,
        totalCalculations: product.calculations,
      },
    })

    if (!existingKey) {
      const key = `sl_live_${crypto.randomBytes(24).toString("base64url")}`
      await tx.licenseKey.create({
        data: {
          userId: session.userId,
          key,
        },
      })
    }

    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        processedAt: new Date(),
        ...(purchase !== undefined
          ? { amountTotal: purchase.amountTotal, currency: purchase.currency }
          : {}),
      },
    })
  })

  return { provisioned: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "provision"
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/billing/provision.ts apps/mvp_api/src/modules/billing/provision.test.ts
git commit -m "feat(mvp-api): extend provisionEntitlement to write amountTotal and currency"
```

---

## Task 3: Pass purchase amount from Stripe webhook

**Files:**
- Modify: `apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.ts`

- [ ] **Step 1: Update webhook handler to pass purchase data**

In `apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.ts`, update the `checkout.session.completed` handler.

Old code (lines 31-53):
```typescript
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
      return c.json({ error: "Provisioning failed" }, 500)
    }
  }
```

New code:
```typescript
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string
      amount_total: number | null
      currency: string | null
      metadata: Record<string, string>
    }

    console.log(
      JSON.stringify({
        level: "info",
        event: "checkout.session.completed",
        stripeSessionId: session.id,
        product: session.metadata?.product,
        userId: session.metadata?.userId,
        amountTotal: session.amount_total,
        currency: session.currency,
      }),
    )

    try {
      await provisionEntitlement(session.id, {
        amountTotal: session.amount_total,
        currency: session.currency,
      })
    } catch (err) {
      console.error("Provisioning failed for session:", session.id, err)
      return c.json({ error: "Provisioning failed" }, 500)
    }
  }
```

- [ ] **Step 2: Run gates**

```bash
bun run lint && bun run typecheck && bun run test
```

Expected: all pass (no new tests needed — webhook handler delegates to `provisionEntitlement` which is tested).

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.ts
git commit -m "feat(mvp-api): pass amountTotal and currency to provisionEntitlement from Stripe webhook"
```

---

## Task 4: Filter `GET /billing/entitlements` to exclude deactivated and exhausted

**Files:**
- Modify: `apps/mvp_api/src/modules/billing/billing.routes.ts`
- Modify: `apps/mvp_api/src/modules/billing/billing.routes.test.ts`

- [ ] **Step 1: Write failing tests**

In `apps/mvp_api/src/modules/billing/billing.routes.test.ts`, add two tests inside the existing `describe("GET /billing/entitlements")` block (after the existing tests):

```typescript
  it("excludes exhausted entitlements (usedCalculations >= totalCalculations)", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_exhausted",
        totalCalculations: 5,
        usedCalculations: 5,
        purchasedAt: new Date("2026-04-22"),
        product: { slug: "pv-layout-pro", name: "PV Layout Pro" },
      },
    ])
    mockLicenseKeyFindFirst.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/billing/entitlements", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { entitlements: unknown[] }
    }
    expect(body.data.entitlements).toHaveLength(0)
  })

  it("includes active entitlement with remaining calculations", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_active",
        totalCalculations: 10,
        usedCalculations: 3,
        purchasedAt: new Date("2026-04-22"),
        product: { slug: "pv-layout-pro", name: "PV Layout Pro" },
      },
    ])
    const app = makeApp()
    const res = await app.request("/billing/entitlements", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { entitlements: { remainingCalculations: number }[] }
    }
    expect(body.data.entitlements).toHaveLength(1)
    expect(body.data.entitlements[0]!.remainingCalculations).toBe(7)
  })
```

- [ ] **Step 2: Run tests to verify the exhausted test fails**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "GET /billing/entitlements"
```

Expected: the "excludes exhausted entitlements" test FAILS (current code returns all).

- [ ] **Step 3: Update `GET /billing/entitlements` handler**

In `apps/mvp_api/src/modules/billing/billing.routes.ts`, replace the `GET /billing/entitlements` handler (lines 129-161):

```typescript
// GET /billing/entitlements
billingRoutes.get("/billing/entitlements", async (c) => {
  const user = c.get("user")

  // Exclude deactivated entitlements at DB level; exclude exhausted in JS
  const entitlements = await db.entitlement.findMany({
    where: { userId: user.id, deactivatedAt: null },
    orderBy: { purchasedAt: "desc" },
    include: {
      product: {
        select: { slug: true, name: true },
      },
    },
  })

  const active = entitlements.filter(
    (e) => e.usedCalculations < e.totalCalculations,
  )

  const licenseKey = await db.licenseKey.findFirst({
    where: { userId: user.id, revokedAt: null },
  })

  const mapped = active.map((e) => ({
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

- [ ] **Step 4: Run tests to verify all pass**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "GET /billing/entitlements"
```

Expected: all tests PASS (including the 2 new ones and the existing 3).

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/billing/billing.routes.ts apps/mvp_api/src/modules/billing/billing.routes.test.ts
git commit -m "feat(mvp-api): exclude deactivated and exhausted entitlements from GET /billing/entitlements"
```

---

## Task 5: `customer.service.ts` — `listCustomers` and `getCustomer`

**Files:**
- Create: `apps/mvp_api/src/modules/admin/customer.service.ts`
- Create: `apps/mvp_api/src/modules/admin/customer.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/mvp_api/src/modules/admin/customer.service.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test"

const mockUserFindMany = mock(async () => [
  {
    id: "usr1",
    email: "alice@example.com",
    name: "Alice",
    roles: [],
    status: "ACTIVE",
    createdAt: new Date("2026-01-01"),
    checkoutSessions: [{ amountTotal: 4999 }, { amountTotal: null }],
    entitlements: [
      { deactivatedAt: null },
      { deactivatedAt: new Date() },
    ],
  },
])
const mockUserCount = mock(async () => 1)
const mockUserFindUnique = mock(async () => ({
  id: "usr1",
  email: "alice@example.com",
  name: "Alice",
  roles: [],
  status: "ACTIVE",
  createdAt: new Date("2026-01-01"),
  checkoutSessions: [{ amountTotal: 4999 }],
  entitlements: [
    {
      id: "ent1",
      productId: "prod1",
      totalCalculations: 10,
      usedCalculations: 3,
      purchasedAt: new Date("2026-01-15"),
      deactivatedAt: null,
      product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
    },
    {
      id: "ent2",
      productId: "prod1",
      totalCalculations: 5,
      usedCalculations: 5,
      purchasedAt: new Date("2026-02-01"),
      deactivatedAt: null,
      product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
    },
    {
      id: "ent3",
      productId: "prod1",
      totalCalculations: 10,
      usedCalculations: 0,
      purchasedAt: new Date("2026-03-01"),
      deactivatedAt: new Date("2026-03-10"),
      product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
    },
  ],
}))

mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findMany: mockUserFindMany,
      count: mockUserCount,
      findUnique: mockUserFindUnique,
    },
  },
}))

const { listCustomers, getCustomer } = await import("./customer.service.js")

describe("listCustomers", () => {
  beforeEach(() => {
    mockUserFindMany.mockReset()
    mockUserFindMany.mockImplementation(async () => [
      {
        id: "usr1",
        email: "alice@example.com",
        name: "Alice",
        roles: [],
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        checkoutSessions: [{ amountTotal: 4999 }, { amountTotal: null }],
        entitlements: [
          { deactivatedAt: null },
          { deactivatedAt: new Date() },
        ],
      },
    ])
    mockUserCount.mockReset()
    mockUserCount.mockImplementation(async () => 1)
  })

  it("returns paginated list with computed spend and active entitlement count", async () => {
    const result = await listCustomers({ page: 1, pageSize: 20 })
    expect(result.data).toHaveLength(1)
    const customer = result.data[0]!
    expect(customer.id).toBe("usr1")
    expect(customer.totalSpendUsd).toBeCloseTo(49.99)
    expect(customer.activeEntitlementCount).toBe(1)
    expect(result.pagination.total).toBe(1)
  })

  it("treats null amountTotal as zero in spend sum", async () => {
    mockUserFindMany.mockImplementation(async () => [
      {
        id: "usr2",
        email: "bob@example.com",
        name: "Bob",
        roles: [],
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        checkoutSessions: [{ amountTotal: null }],
        entitlements: [],
      },
    ])
    const result = await listCustomers({ page: 1, pageSize: 20 })
    expect(result.data[0]!.totalSpendUsd).toBe(0)
  })
})

describe("getCustomer", () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset()
    mockUserFindUnique.mockImplementation(async () => ({
      id: "usr1",
      email: "alice@example.com",
      name: "Alice",
      roles: [],
      status: "ACTIVE",
      createdAt: new Date("2026-01-01"),
      checkoutSessions: [{ amountTotal: 4999 }],
      entitlements: [
        {
          id: "ent1",
          productId: "prod1",
          totalCalculations: 10,
          usedCalculations: 3,
          purchasedAt: new Date("2026-01-15"),
          deactivatedAt: null,
          product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
        },
        {
          id: "ent2",
          productId: "prod1",
          totalCalculations: 5,
          usedCalculations: 5,
          purchasedAt: new Date("2026-02-01"),
          deactivatedAt: null,
          product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
        },
        {
          id: "ent3",
          productId: "prod1",
          totalCalculations: 10,
          usedCalculations: 0,
          purchasedAt: new Date("2026-03-01"),
          deactivatedAt: new Date("2026-03-10"),
          product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
        },
      ],
    }))
  })

  it("returns customer with entitlements and correct state", async () => {
    const result = await getCustomer("usr1", "all")
    expect(result.id).toBe("usr1")
    expect(result.entitlements).toHaveLength(3)

    const active = result.entitlements.find((e) => e.id === "ent1")!
    expect(active.state).toBe("ACTIVE")
    expect(active.remainingCalculations).toBe(7)

    const exhausted = result.entitlements.find((e) => e.id === "ent2")!
    expect(exhausted.state).toBe("EXHAUSTED")

    const deactivated = result.entitlements.find((e) => e.id === "ent3")!
    expect(deactivated.state).toBe("DEACTIVATED")
    expect(deactivated.deactivatedAt).not.toBeNull()
  })

  it("throws 404 when customer not found", async () => {
    mockUserFindUnique.mockImplementation(async () => null as never)
    await expect(getCustomer("nonexistent", "active")).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "listCustomers|getCustomer"
```

Expected: FAIL — `customer.service.js` does not exist.

- [ ] **Step 3: Create `customer.service.ts`**

Create `apps/mvp_api/src/modules/admin/customer.service.ts`:

```typescript
import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"

export type CustomerListItem = {
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string
  totalSpendUsd: number
  activeEntitlementCount: number
}

export type EntitlementState = "ACTIVE" | "EXHAUSTED" | "DEACTIVATED"

export type EntitlementDetail = {
  id: string
  productId: string
  productName: string
  productSlug: string
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
  purchasedAt: string
  deactivatedAt: string | null
  state: EntitlementState
}

export type CustomerDetail = {
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string
  totalSpendUsd: number
  entitlements: EntitlementDetail[]
}

export type CustomerPaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function deriveEntitlementState(e: {
  deactivatedAt: Date | null
  usedCalculations: number
  totalCalculations: number
}): EntitlementState {
  if (e.deactivatedAt !== null) return "DEACTIVATED"
  if (e.usedCalculations >= e.totalCalculations) return "EXHAUSTED"
  return "ACTIVE"
}

export async function listCustomers(params: {
  page: number
  pageSize: number
}): Promise<{ data: CustomerListItem[]; pagination: CustomerPaginationMeta }> {
  const { page, pageSize } = params
  const skip = (page - 1) * pageSize

  const [users, total] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        checkoutSessions: { select: { amountTotal: true } },
        entitlements: { select: { deactivatedAt: true } },
      },
    }),
    db.user.count(),
  ])

  const data: CustomerListItem[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    roles: u.roles,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    totalSpendUsd:
      u.checkoutSessions.reduce(
        (sum, s) => sum + (s.amountTotal ?? 0),
        0,
      ) / 100,
    activeEntitlementCount: u.entitlements.filter(
      (e) => e.deactivatedAt === null,
    ).length,
  }))

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getCustomer(
  id: string,
  filter: "active" | "all" = "active",
): Promise<CustomerDetail> {
  const user = await db.user.findUnique({
    where: { id },
    include: {
      checkoutSessions: { select: { amountTotal: true } },
      entitlements: {
        where: filter === "active" ? { deactivatedAt: null } : {},
        include: {
          product: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { purchasedAt: "desc" },
      },
    },
  })

  if (!user) {
    throw new AppError("NOT_FOUND", `Customer ${id} not found`, 404)
  }

  const entitlements: EntitlementDetail[] = user.entitlements.map((e) => ({
    id: e.id,
    productId: e.product.id,
    productName: e.product.name,
    productSlug: e.product.slug,
    totalCalculations: e.totalCalculations,
    usedCalculations: e.usedCalculations,
    remainingCalculations: e.totalCalculations - e.usedCalculations,
    purchasedAt: e.purchasedAt.toISOString(),
    deactivatedAt: e.deactivatedAt?.toISOString() ?? null,
    state: deriveEntitlementState(e),
  }))

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    totalSpendUsd:
      user.checkoutSessions.reduce(
        (sum, s) => sum + (s.amountTotal ?? 0),
        0,
      ) / 100,
    entitlements,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "listCustomers|getCustomer"
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/admin/customer.service.ts apps/mvp_api/src/modules/admin/customer.service.test.ts
git commit -m "feat(mvp-api): add customer.service with listCustomers and getCustomer"
```

---

## Task 6: `customer.service.ts` — `updateEntitlementStatus`

**Files:**
- Modify: `apps/mvp_api/src/modules/admin/customer.service.ts`
- Modify: `apps/mvp_api/src/modules/admin/customer.service.test.ts`

- [ ] **Step 1: Write failing tests**

Add this describe block to the end of `apps/mvp_api/src/modules/admin/customer.service.test.ts`.

First add mocks at the top of the file, right after the `mockUserFindUnique` mock declaration but before the `mock.module` call:

```typescript
const mockEntitlementFindUnique = mock(async () => ({
  id: "ent1",
  userId: "usr1",
  productId: "prod1",
  totalCalculations: 10,
  usedCalculations: 3,
  deactivatedAt: null,
  purchasedAt: new Date("2026-01-15"),
}))
const mockEntitlementUpdate = mock(async () => ({
  id: "ent1",
  deactivatedAt: new Date(),
}))
```

Update the `mock.module("../../lib/db.js", ...)` call to include entitlement:

```typescript
mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findMany: mockUserFindMany,
      count: mockUserCount,
      findUnique: mockUserFindUnique,
    },
    entitlement: {
      findUnique: mockEntitlementFindUnique,
      update: mockEntitlementUpdate,
    },
  },
}))
```

Update the import at the bottom to also import `updateEntitlementStatus`:

```typescript
const { listCustomers, getCustomer, updateEntitlementStatus } = await import("./customer.service.js")
```

Add this describe block at the end of the file:

```typescript
describe("updateEntitlementStatus", () => {
  beforeEach(() => {
    mockEntitlementFindUnique.mockReset()
    mockEntitlementFindUnique.mockImplementation(async () => ({
      id: "ent1",
      userId: "usr1",
      productId: "prod1",
      totalCalculations: 10,
      usedCalculations: 3,
      deactivatedAt: null,
      purchasedAt: new Date("2026-01-15"),
    }))
    mockEntitlementUpdate.mockReset()
    mockEntitlementUpdate.mockImplementation(async () => ({
      id: "ent1",
      deactivatedAt: new Date(),
    }))
  })

  it("sets deactivatedAt to now when status is INACTIVE", async () => {
    await updateEntitlementStatus({ entitlementId: "ent1", status: "INACTIVE" })
    const calls = mockEntitlementUpdate.mock.calls
    expect(calls.length).toBe(1)
    const arg = calls[0]![0] as { data: { deactivatedAt: Date | null } }
    expect(arg.data.deactivatedAt).toBeInstanceOf(Date)
  })

  it("sets deactivatedAt to null when status is ACTIVE", async () => {
    await updateEntitlementStatus({ entitlementId: "ent1", status: "ACTIVE" })
    const calls = mockEntitlementUpdate.mock.calls
    expect(calls.length).toBe(1)
    const arg = calls[0]![0] as { data: { deactivatedAt: null } }
    expect(arg.data.deactivatedAt).toBeNull()
  })

  it("throws 404 when entitlement not found", async () => {
    mockEntitlementFindUnique.mockImplementation(async () => null as never)
    await expect(
      updateEntitlementStatus({ entitlementId: "nonexistent", status: "INACTIVE" }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "updateEntitlementStatus"
```

Expected: FAIL — `updateEntitlementStatus` is not exported from `customer.service.js`.

- [ ] **Step 3: Add `updateEntitlementStatus` to `customer.service.ts`**

Append to the end of `apps/mvp_api/src/modules/admin/customer.service.ts`:

```typescript
export async function updateEntitlementStatus(params: {
  entitlementId: string
  status: "ACTIVE" | "INACTIVE"
}): Promise<{
  id: string
  deactivatedAt: Date | null
}> {
  const { entitlementId, status } = params

  const existing = await db.entitlement.findUnique({
    where: { id: entitlementId },
  })
  if (!existing) {
    throw new AppError(
      "NOT_FOUND",
      `Entitlement ${entitlementId} not found`,
      404,
    )
  }

  return db.entitlement.update({
    where: { id: entitlementId },
    data: { deactivatedAt: status === "INACTIVE" ? new Date() : null },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "updateEntitlementStatus"
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/admin/customer.service.ts apps/mvp_api/src/modules/admin/customer.service.test.ts
git commit -m "feat(mvp-api): add updateEntitlementStatus to customer.service"
```

---

## Task 7: `customer.routes.ts` — 3 new admin routes

**Files:**
- Create: `apps/mvp_api/src/modules/admin/customer.routes.test.ts`
- Create: `apps/mvp_api/src/modules/admin/customer.routes.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/mvp_api/src/modules/admin/customer.routes.test.ts`:

```typescript
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

// ─── @clerk/backend mock ─────────────────────────────────────────────────────
mock.module("@clerk/backend", () => ({
  verifyToken: async (_token: string) => ({ sub: "ck_ops" }),
  createClerkClient: () => ({
    users: {
      getUser: async () => ({
        id: "ck_ops",
        emailAddresses: [{ id: "ea_1", emailAddress: "ops@test.com" }],
        primaryEmailAddressId: "ea_1",
        firstName: "Ops",
        lastName: null,
        publicMetadata: { roles: ["OPS"] },
      }),
      createUser: async () => ({}),
      updateUser: async () => ({}),
    },
  }),
}))

// ─── db mock ─────────────────────────────────────────────────────────────────
const mockUserFindFirst = mock(async () => ({
  id: "usr_ops",
  clerkId: "ck_ops",
  email: "ops@test.com",
  name: "Ops",
  stripeCustomerId: null,
  roles: ["OPS"],
  status: "ACTIVE",
}))
const mockUserFindMany = mock(async () => [
  {
    id: "usr1",
    email: "alice@example.com",
    name: "Alice",
    roles: [],
    status: "ACTIVE",
    createdAt: new Date("2026-01-01"),
    checkoutSessions: [{ amountTotal: 4999 }],
    entitlements: [{ deactivatedAt: null }],
  },
])
const mockUserCount = mock(async () => 1)
const mockUserFindUnique = mock(async () => ({
  id: "usr1",
  email: "alice@example.com",
  name: "Alice",
  roles: [],
  status: "ACTIVE",
  createdAt: new Date("2026-01-01"),
  checkoutSessions: [{ amountTotal: 4999 }],
  entitlements: [
    {
      id: "ent1",
      productId: "prod1",
      totalCalculations: 10,
      usedCalculations: 3,
      purchasedAt: new Date("2026-01-15"),
      deactivatedAt: null,
      product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
    },
  ],
}))
const mockEntitlementFindUnique = mock(async () => ({
  id: "ent1",
  userId: "usr1",
  productId: "prod1",
  totalCalculations: 10,
  usedCalculations: 3,
  deactivatedAt: null,
  purchasedAt: new Date("2026-01-15"),
}))
const mockEntitlementUpdate = mock(async () => ({
  id: "ent1",
  deactivatedAt: new Date(),
}))

mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findFirst: mockUserFindFirst,
      findMany: mockUserFindMany,
      count: mockUserCount,
      findUnique: mockUserFindUnique,
    },
    entitlement: {
      findUnique: mockEntitlementFindUnique,
      update: mockEntitlementUpdate,
    },
    $transaction: async () => {},
  },
}))

const { customerRoutes } = await import("./customer.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", customerRoutes)
  app.onError(errorHandler)
  return app
}

beforeEach(() => {
  mockUserFindFirst.mockReset()
  mockUserFindFirst.mockImplementation(async () => ({
    id: "usr_ops",
    clerkId: "ck_ops",
    email: "ops@test.com",
    name: "Ops",
    stripeCustomerId: null,
    roles: ["OPS"],
    status: "ACTIVE",
  }))
  mockUserFindMany.mockReset()
  mockUserFindMany.mockImplementation(async () => [
    {
      id: "usr1",
      email: "alice@example.com",
      name: "Alice",
      roles: [],
      status: "ACTIVE",
      createdAt: new Date("2026-01-01"),
      checkoutSessions: [{ amountTotal: 4999 }],
      entitlements: [{ deactivatedAt: null }],
    },
  ])
  mockUserCount.mockReset()
  mockUserCount.mockImplementation(async () => 1)
  mockUserFindUnique.mockReset()
  mockUserFindUnique.mockImplementation(async () => ({
    id: "usr1",
    email: "alice@example.com",
    name: "Alice",
    roles: [],
    status: "ACTIVE",
    createdAt: new Date("2026-01-01"),
    checkoutSessions: [{ amountTotal: 4999 }],
    entitlements: [
      {
        id: "ent1",
        productId: "prod1",
        totalCalculations: 10,
        usedCalculations: 3,
        purchasedAt: new Date("2026-01-15"),
        deactivatedAt: null,
        product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
      },
    ],
  }))
  mockEntitlementFindUnique.mockReset()
  mockEntitlementFindUnique.mockImplementation(async () => ({
    id: "ent1",
    userId: "usr1",
    productId: "prod1",
    totalCalculations: 10,
    usedCalculations: 3,
    deactivatedAt: null,
    purchasedAt: new Date("2026-01-15"),
  }))
  mockEntitlementUpdate.mockReset()
  mockEntitlementUpdate.mockImplementation(async () => ({
    id: "ent1",
    deactivatedAt: new Date(),
  }))
})

describe("GET /admin/customers", () => {
  it("returns 200 with paginated customer list (OPS role)", async () => {
    const res = await makeApp().request("/admin/customers", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { data: unknown[]; pagination: { total: number } }
    }
    expect(body.success).toBe(true)
    expect(body.data.data).toHaveLength(1)
    expect(body.data.pagination.total).toBe(1)
  })
})

describe("GET /admin/customers/:id", () => {
  it("returns 200 with customer detail", async () => {
    const res = await makeApp().request("/admin/customers/usr1", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { id: string; entitlements: unknown[] }
    }
    expect(body.data.id).toBe("usr1")
    expect(body.data.entitlements).toHaveLength(1)
  })

  it("returns 404 when customer not found", async () => {
    mockUserFindUnique.mockImplementation(async () => null as never)
    const res = await makeApp().request("/admin/customers/nonexistent", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(404)
  })
})

describe("PATCH /admin/entitlements/:id/status", () => {
  it("returns 200 on deactivate", async () => {
    const res = await makeApp().request("/admin/entitlements/ent1/status", {
      method: "PATCH",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" }),
    })
    expect(res.status).toBe(200)
  })

  it("returns 200 on reactivate", async () => {
    mockEntitlementUpdate.mockImplementation(async () => ({
      id: "ent1",
      deactivatedAt: null,
    }))
    const res = await makeApp().request("/admin/entitlements/ent1/status", {
      method: "PATCH",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    })
    expect(res.status).toBe(200)
  })

  it("returns 400 for invalid status value", async () => {
    const res = await makeApp().request("/admin/entitlements/ent1/status", {
      method: "PATCH",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "BANNED" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when entitlement not found", async () => {
    mockEntitlementFindUnique.mockImplementation(async () => null as never)
    const res = await makeApp().request("/admin/entitlements/nonexistent/status", {
      method: "PATCH",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" }),
    })
    expect(res.status).toBe(404)
  })
})

describe("Role enforcement", () => {
  it("returns 403 when user has no admin/ops role on customer routes", async () => {
    const { requireRole } = await import("../../middleware/rbac.js")
    const app = new Hono<MvpHonoEnv>()
    app.use("*", async (c, next) => {
      c.set("user", {
        id: "usr_plain",
        clerkId: "ck_plain",
        email: "plain@test.com",
        name: "Plain",
        stripeCustomerId: null,
        roles: [],
        status: "ACTIVE",
      })
      return next()
    })
    app.get("/admin/customers", requireRole("ADMIN", "OPS"), (c) =>
      c.json({ ok: true }),
    )
    app.onError(errorHandler)
    const res = await app.request("/admin/customers")
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "GET /admin/customers|PATCH /admin/entitlements|Role enforcement"
```

Expected: FAIL — `customer.routes.js` does not exist.

- [ ] **Step 3: Create `customer.routes.ts`**

Create `apps/mvp_api/src/modules/admin/customer.routes.ts`:

```typescript
import { Hono } from "hono"
import { z } from "zod"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireRole } from "../../middleware/rbac.js"
import {
  listCustomers,
  getCustomer,
  updateEntitlementStatus,
} from "./customer.service.js"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"

export const customerRoutes = new Hono<MvpHonoEnv>()

const EntitlementStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
})

customerRoutes.use(
  "/admin/customers*",
  clerkAuth,
  requireRole("ADMIN", "OPS"),
)
customerRoutes.use(
  "/admin/entitlements*",
  clerkAuth,
  requireRole("ADMIN", "OPS"),
)

customerRoutes.get("/admin/customers", async (c) => {
  const page = parseInt(c.req.query("page") ?? "1", 10)
  const pageSize = Math.min(
    parseInt(c.req.query("pageSize") ?? "20", 10),
    100,
  )
  const result = await listCustomers({
    page: isNaN(page) ? 1 : page,
    pageSize: isNaN(pageSize) ? 20 : pageSize,
  })
  return c.json(ok(result))
})

customerRoutes.get("/admin/customers/:id", async (c) => {
  const { id } = c.req.param()
  const filterParam = c.req.query("filter")
  const filter = filterParam === "all" ? "all" : "active"
  const customer = await getCustomer(id, filter)
  return c.json(ok(customer))
})

customerRoutes.patch("/admin/entitlements/:id/status", async (c) => {
  const { id } = c.req.param()
  const parsed = EntitlementStatusSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors)
  }
  const updated = await updateEntitlementStatus({
    entitlementId: id,
    status: parsed.data.status,
  })
  return c.json(ok(updated))
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx turbo test --filter=mvp_api -- --test-name-pattern "GET /admin/customers|PATCH /admin/entitlements|Role enforcement"
```

Expected: all tests PASS.

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/admin/customer.routes.ts apps/mvp_api/src/modules/admin/customer.routes.test.ts
git commit -m "feat(mvp-api): add customer routes GET /admin/customers, GET /admin/customers/:id, PATCH /admin/entitlements/:id/status"
```

---

## Task 8: Mount `customerRoutes` in `app.ts`

**Files:**
- Modify: `apps/mvp_api/src/app.ts`

- [ ] **Step 1: Add import and mount**

In `apps/mvp_api/src/app.ts`, add the import after the `adminRoutes` import:

```typescript
import { customerRoutes } from "./modules/admin/customer.routes.js"
```

Add the route mount after `app.route("/", adminRoutes)`:

```typescript
app.route("/", customerRoutes)
```

- [ ] **Step 2: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): mount customerRoutes in app"
```

---

## Task 9: Sidebar — add Customers to BASE_NAV

**Files:**
- Modify: `apps/mvp_admin/components/admin-sidebar.tsx`

- [ ] **Step 1: Add Customers nav item**

In `apps/mvp_admin/components/admin-sidebar.tsx`:

1. Add `Building2` to the lucide-react import (alongside `LayoutDashboard`, `Users`, etc.):

```typescript
import {
  LayoutDashboard,
  Users,
  Building2,
  LogOut,
  ChevronsUpDown,
  ShieldCheck,
} from "lucide-react"
```

2. Update `BASE_NAV` to include Customers between Dashboard and Users:

```typescript
const BASE_NAV = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Building2 },
]
```

- [ ] **Step 2: Run full gates**

```bash
bun run lint && bun run typecheck && bun run build
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_admin/components/admin-sidebar.tsx
git commit -m "feat(mvp-admin): add Customers to sidebar nav"
```

---

## Task 10: Types and TanStack Query hooks for customers

**Files:**
- Modify: `apps/mvp_admin/lib/api.ts`
- Create: `apps/mvp_admin/lib/hooks/use-admin-customers.ts`

- [ ] **Step 1: Add customer types to `lib/api.ts`**

Append to `apps/mvp_admin/lib/api.ts`:

```typescript
export type CustomerListItem = {
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string
  totalSpendUsd: number
  activeEntitlementCount: number
}

export type EntitlementDetail = {
  id: string
  productId: string
  productName: string
  productSlug: string
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
  purchasedAt: string
  deactivatedAt: string | null
  state: "ACTIVE" | "EXHAUSTED" | "DEACTIVATED"
}

export type CustomerDetail = {
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string
  totalSpendUsd: number
  entitlements: EntitlementDetail[]
}

export type AdminCustomersResponse = {
  data: CustomerListItem[]
  pagination: PaginationMeta
}
```

- [ ] **Step 2: Create `use-admin-customers.ts`**

Create `apps/mvp_admin/lib/hooks/use-admin-customers.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import {
  MVP_API_URL,
  type AdminCustomersResponse,
  type CustomerDetail,
} from "../api"

export function useAdminCustomers(params: {
  page: number
  pageSize: number
}) {
  const { getToken } = useAuth()
  return useQuery<AdminCustomersResponse>({
    queryKey: ["admin-customers", params],
    queryFn: async () => {
      const token = await getToken()
      const qs = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })
      const res = await fetch(`${MVP_API_URL}/admin/customers?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to fetch customers: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: AdminCustomersResponse
      }
      return body.data
    },
  })
}

export function useAdminCustomer(id: string, filter: "active" | "all") {
  const { getToken } = useAuth()
  return useQuery<CustomerDetail>({
    queryKey: ["admin-customer", id, filter],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/customers/${id}?filter=${filter}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error(`Failed to fetch customer: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: CustomerDetail
      }
      return body.data
    },
  })
}

export function useUpdateEntitlementStatus() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation<
    void,
    Error,
    { entitlementId: string; status: "ACTIVE" | "INACTIVE"; customerId: string }
  >({
    mutationFn: async ({ entitlementId, status }) => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/entitlements/${entitlementId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      )
      if (!res.ok) throw new Error(`Failed to update entitlement: ${res.status}`)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-customer", variables.customerId],
      })
    },
  })
}
```

- [ ] **Step 3: Run full gates**

```bash
bun run lint && bun run typecheck && bun run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_admin/lib/api.ts apps/mvp_admin/lib/hooks/use-admin-customers.ts
git commit -m "feat(mvp-admin): add customer types and TanStack Query hooks"
```

---

## Task 11: Customers list page + client component

**Files:**
- Create: `apps/mvp_admin/app/(admin)/customers/page.tsx`
- Create: `apps/mvp_admin/app/(admin)/customers/_components/customers-page-client.tsx`

- [ ] **Step 1: Create the server page**

Create `apps/mvp_admin/app/(admin)/customers/page.tsx`:

```typescript
export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { CustomersPageClient } from "./_components/customers-page-client"

export const metadata: Metadata = { title: "Customers" }

export default async function CustomersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Customers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All platform users and their purchase activity.
        </p>
      </div>
      <CustomersPageClient />
    </div>
  )
}
```

- [ ] **Step 2: Create the client component**

Create `apps/mvp_admin/app/(admin)/customers/_components/customers-page-client.tsx`:

```typescript
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useAdminCustomers } from "@/lib/hooks/use-admin-customers"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renewable-energy/ui/components/table"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"

export function CustomersPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))

  const { data, isLoading, error } = useAdminCustomers({ page, pageSize: 20 })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {!data || data.data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No customers found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Total Spend</TableHead>
                <TableHead>Active Entitlements</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/customers/${customer.id}`)}
                >
                  <TableCell className="font-medium text-foreground">
                    {customer.name ?? customer.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(customer.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    ${customer.totalSpendUsd.toFixed(2)}
                  </TableCell>
                  <TableCell>{customer.activeEntitlementCount}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        customer.status === "ACTIVE" ? "default" : "outline"
                      }
                      className="text-xs"
                    >
                      {customer.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.pagination.page} of {data.pagination.totalPages} —{" "}
            {data.pagination.total} total
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => router.push(`/customers?page=${page - 1}`)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.pagination.totalPages}
              onClick={() => router.push(`/customers?page=${page + 1}`)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run full gates**

```bash
bun run lint && bun run typecheck && bun run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_admin/app/\(admin\)/customers/
git commit -m "feat(mvp-admin): add Customers list page"
```

---

## Task 12: Customer detail page + client component with entitlement actions

**Files:**
- Create: `apps/mvp_admin/app/(admin)/customers/[id]/page.tsx`
- Create: `apps/mvp_admin/app/(admin)/customers/[id]/_components/customer-detail-client.tsx`

- [ ] **Step 1: Create the server detail page**

Create `apps/mvp_admin/app/(admin)/customers/[id]/page.tsx`:

```typescript
export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { CustomerDetailClient } from "./_components/customer-detail-client"

export const metadata: Metadata = { title: "Customer Detail" }

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string }>
}) {
  const { id } = await params
  const { filter } = await searchParams
  const activeFilter = filter === "all" ? "all" : "active"

  return <CustomerDetailClient id={id} filter={activeFilter} />
}
```

- [ ] **Step 2: Create the client detail component**

Create `apps/mvp_admin/app/(admin)/customers/[id]/_components/customer-detail-client.tsx`:

```typescript
"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  useAdminCustomer,
  useUpdateEntitlementStatus,
} from "@/lib/hooks/use-admin-customers"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renewable-energy/ui/components/table"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import type { EntitlementDetail } from "@/lib/api"

function StateBadge({ state }: { state: EntitlementDetail["state"] }) {
  if (state === "ACTIVE") return <Badge className="text-xs">ACTIVE</Badge>
  if (state === "EXHAUSTED")
    return (
      <Badge variant="secondary" className="text-xs">
        EXHAUSTED
      </Badge>
    )
  return (
    <Badge variant="destructive" className="text-xs">
      DEACTIVATED
    </Badge>
  )
}

export function CustomerDetailClient({
  id,
  filter,
}: {
  id: string
  filter: "active" | "all"
}) {
  const router = useRouter()
  const { data, isLoading, error } = useAdminCustomer(id, filter)
  const { mutate: updateStatus, isPending } = useUpdateEntitlementStatus()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {error.message}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/customers">← Customers</Link>
      </Button>

      {/* Header card */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {data.name ?? data.email}
            </h1>
            <p className="text-sm text-muted-foreground">{data.email}</p>
          </div>
          <Badge
            variant={data.status === "ACTIVE" ? "default" : "outline"}
            className="text-xs"
          >
            {data.status}
          </Badge>
        </div>
        <div className="flex gap-6 text-sm text-muted-foreground pt-2">
          <span>
            Joined{" "}
            {new Date(data.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span className="font-medium text-foreground">
            Total spend: ${data.totalSpendUsd.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Entitlements section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Entitlements</h2>
          <div className="flex gap-1 rounded-md border border-border p-1">
            <Button
              size="sm"
              variant={filter === "active" ? "default" : "ghost"}
              onClick={() => router.push(`/customers/${id}?filter=active`)}
            >
              Active
            </Button>
            <Button
              size="sm"
              variant={filter === "all" ? "default" : "ghost"}
              onClick={() => router.push(`/customers/${id}?filter=all`)}
            >
              All
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {data.entitlements.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No entitlements found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entitlements.map((ent) => (
                  <TableRow key={ent.id}>
                    <TableCell className="font-medium">
                      {ent.productName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(ent.purchasedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>{ent.totalCalculations}</TableCell>
                    <TableCell>{ent.usedCalculations}</TableCell>
                    <TableCell>{ent.remainingCalculations}</TableCell>
                    <TableCell>
                      <StateBadge state={ent.state} />
                    </TableCell>
                    <TableCell>
                      {ent.state === "ACTIVE" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            updateStatus({
                              entitlementId: ent.id,
                              status: "INACTIVE",
                              customerId: id,
                            })
                          }
                        >
                          Deactivate
                        </Button>
                      )}
                      {ent.state === "DEACTIVATED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            updateStatus({
                              entitlementId: ent.id,
                              status: "ACTIVE",
                              customerId: id,
                            })
                          }
                        >
                          Reactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_admin/app/\(admin\)/customers/\[id\]/
git commit -m "feat(mvp-admin): add Customer detail page with entitlement deactivate/reactivate"
```

---

## Final verification

- [ ] **Run all gates one last time from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Verify test count increased**

```bash
bunx turbo test --filter=mvp_api 2>&1 | tail -20
```

Expected: at least 15 new tests across `provision.test.ts`, `billing.routes.test.ts` (2 new), `customer.service.test.ts`, and `customer.routes.test.ts`.
