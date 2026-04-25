# MVP Admin — Products Pages with Sales Reporting (Spike B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Products section to the admin portal with a paginated list showing per-product revenue and purchase metrics, and a detail page with a time-series sales chart (revenue + purchase count, daily/weekly/monthly toggle).

**Architecture:** New `product.service.ts` + `product.routes.ts` in `apps/mvp_api/src/modules/admin/`, mounted in `app.ts`. New pages and hooks in `apps/mvp_admin`. No DB schema changes — all required fields (`amountTotal`, `currency`, `processedAt`) were added in Spike A. `CheckoutSession` has no Prisma relation to `Product`, so sessions are queried by `productSlug` and joined in JS.

**Tech Stack:** Prisma (PostgreSQL), Hono, Bun:test, Next.js 16 App Router, TanStack Query, shadcn/ui (`ChartContainer`, `ChartTooltip`), recharts (`ComposedChart`, `Bar`, `Line`), Clerk, TypeScript.

---

## File Map

**New files — `apps/mvp_api`:**
- `src/modules/admin/product.service.ts` — `listProducts`, `getProduct`, `getProductSales`
- `src/modules/admin/product.service.test.ts` — unit tests for all three functions
- `src/modules/admin/product.routes.ts` — 3 routes with `requireRole("ADMIN", "OPS")`
- `src/modules/admin/product.routes.test.ts` — integration tests for all 3 routes

**Modified files — `apps/mvp_api`:**
- `src/app.ts` — mount `productRoutes`

**Modified files — `apps/mvp_admin`:**
- `lib/api.ts` — add `ProductListItem`, `AdminProductsResponse`, `SalesDataPoint`, `ProductSalesResponse` types
- `components/admin-sidebar.tsx` — add Products to `BASE_NAV`

**New files — `apps/mvp_admin`:**
- `lib/hooks/use-admin-products.ts` — `useAdminProducts`, `useAdminProduct`, `useAdminProductSales`
- `app/(admin)/products/page.tsx` — server component
- `app/(admin)/products/_components/products-page-client.tsx` — table client component
- `app/(admin)/products/[slug]/page.tsx` — server component
- `app/(admin)/products/[slug]/_components/product-detail-client.tsx` — summary card + chart

---

## Task 1: `product.service.ts` — `listProducts` and `getProduct`

**Files:**
- Create: `apps/mvp_api/src/modules/admin/product.service.test.ts`
- Create: `apps/mvp_api/src/modules/admin/product.service.ts`

**Context:** `CheckoutSession` has no Prisma relation to `Product`. `productSlug` is a plain string field on `CheckoutSession`. Query all processed sessions in one call, group by `productSlug` in JS. `Entitlement` does have a Prisma relation to `Product`, so `include: { entitlements: true }` works. Run all tests from repo root: `cd /Users/arunkpatra/codebase/renewable_energy && bun run test --filter=mvp_api 2>&1 | tail -20`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mvp_api/src/modules/admin/product.service.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test"

const mockProductFindMany = mock(async () => [
  {
    id: "prod1",
    slug: "pv-layout-pro",
    name: "PV Layout Pro",
    priceAmount: 4999,
    priceCurrency: "usd",
    calculations: 10,
    active: true,
    isFree: false,
    entitlements: [
      { deactivatedAt: null },
      { deactivatedAt: new Date() },
    ],
  },
])
const mockProductCount = mock(async () => 1)
const mockProductFindUnique = mock(async () => ({
  id: "prod1",
  slug: "pv-layout-pro",
  name: "PV Layout Pro",
  priceAmount: 4999,
  priceCurrency: "usd",
  calculations: 10,
  active: true,
  isFree: false,
  entitlements: [{ deactivatedAt: null }],
}))
const mockCheckoutSessionFindMany = mock(async () => [
  { productSlug: "pv-layout-pro", amountTotal: 4999, processedAt: new Date("2026-04-01") },
  { productSlug: "pv-layout-pro", amountTotal: null, processedAt: new Date("2026-04-10") },
])

mock.module("../../lib/db.js", () => ({
  db: {
    product: {
      findMany: mockProductFindMany,
      count: mockProductCount,
      findUnique: mockProductFindUnique,
    },
    checkoutSession: {
      findMany: mockCheckoutSessionFindMany,
    },
  },
}))

const { listProducts, getProduct } = await import("./product.service.js")

describe("listProducts", () => {
  beforeEach(() => {
    mockProductFindMany.mockReset()
    mockProductFindMany.mockImplementation(async () => [
      {
        id: "prod1",
        slug: "pv-layout-pro",
        name: "PV Layout Pro",
        priceAmount: 4999,
        priceCurrency: "usd",
        calculations: 10,
        active: true,
        isFree: false,
        entitlements: [
          { deactivatedAt: null },
          { deactivatedAt: new Date() },
        ],
      },
    ])
    mockProductCount.mockReset()
    mockProductCount.mockImplementation(async () => 1)
    mockCheckoutSessionFindMany.mockReset()
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { productSlug: "pv-layout-pro", amountTotal: 4999, processedAt: new Date("2026-04-01") },
      { productSlug: "pv-layout-pro", amountTotal: null, processedAt: new Date("2026-04-10") },
    ])
  })

  it("returns paginated list with computed revenue, purchase count, and active entitlements", async () => {
    const result = await listProducts({ page: 1, pageSize: 20 })
    expect(result.data).toHaveLength(1)
    const p = result.data[0]!
    expect(p.slug).toBe("pv-layout-pro")
    expect(p.totalRevenueUsd).toBeCloseTo(49.99)
    expect(p.purchaseCount).toBe(2)
    expect(p.activeEntitlementCount).toBe(1)
    expect(result.pagination.total).toBe(1)
  })

  it("treats null amountTotal as zero in revenue sum", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { productSlug: "pv-layout-pro", amountTotal: null, processedAt: new Date() },
    ])
    const result = await listProducts({ page: 1, pageSize: 20 })
    expect(result.data[0]!.totalRevenueUsd).toBe(0)
  })

  it("counts only sessions for matching productSlug", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { productSlug: "pv-layout-basic", amountTotal: 999, processedAt: new Date() },
    ])
    const result = await listProducts({ page: 1, pageSize: 20 })
    expect(result.data[0]!.purchaseCount).toBe(0)
    expect(result.data[0]!.totalRevenueUsd).toBe(0)
  })
})

describe("getProduct", () => {
  beforeEach(() => {
    mockProductFindUnique.mockReset()
    mockProductFindUnique.mockImplementation(async () => ({
      id: "prod1",
      slug: "pv-layout-pro",
      name: "PV Layout Pro",
      priceAmount: 4999,
      priceCurrency: "usd",
      calculations: 10,
      active: true,
      isFree: false,
      entitlements: [{ deactivatedAt: null }],
    }))
    mockCheckoutSessionFindMany.mockReset()
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { productSlug: "pv-layout-pro", amountTotal: 4999, processedAt: new Date("2026-04-01") },
    ])
  })

  it("returns product with metrics", async () => {
    const result = await getProduct("pv-layout-pro")
    expect(result.slug).toBe("pv-layout-pro")
    expect(result.totalRevenueUsd).toBeCloseTo(49.99)
    expect(result.purchaseCount).toBe(1)
    expect(result.activeEntitlementCount).toBe(1)
  })

  it("throws 404 when product not found", async () => {
    mockProductFindUnique.mockImplementation(async () => null as never)
    await expect(getProduct("nonexistent")).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun run test --filter=mvp_api 2>&1 | grep -E "product.service|FAIL|error" | head -10
```

Expected: module not found or import error.

- [ ] **Step 3: Implement `product.service.ts`**

Create `apps/mvp_api/src/modules/admin/product.service.ts`:

```typescript
import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"

export type ProductListItem = {
  slug: string
  name: string
  priceAmount: number
  priceCurrency: string
  calculations: number
  active: boolean
  isFree: boolean
  totalRevenueUsd: number
  purchaseCount: number
  activeEntitlementCount: number
}

export type ProductPaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type SalesDataPoint = {
  period: string
  revenueUsd: number
  purchaseCount: number
}

export type ProductSalesResult = {
  granularity: "daily" | "weekly" | "monthly"
  data: SalesDataPoint[]
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

function getPeriod(
  granularity: "daily" | "weekly" | "monthly",
  date: Date,
): string {
  if (granularity === "daily") return date.toISOString().slice(0, 10)
  if (granularity === "weekly") return getISOWeek(date)
  return date.toISOString().slice(0, 7)
}

function getCutoff(
  granularity: "daily" | "weekly" | "monthly",
  now: Date,
): Date {
  const d = new Date(now)
  if (granularity === "daily") d.setDate(d.getDate() - 30)
  else if (granularity === "weekly") d.setDate(d.getDate() - 12 * 7)
  else d.setMonth(d.getMonth() - 12)
  return d
}

function generatePeriods(
  granularity: "daily" | "weekly" | "monthly",
  now: Date,
): string[] {
  if (granularity === "daily") {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (29 - i))
      return d.toISOString().slice(0, 10)
    })
  }
  if (granularity === "weekly") {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (11 - i) * 7)
      return getISOWeek(d)
    })
  }
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - (11 - i))
    return d.toISOString().slice(0, 7)
  })
}

export async function listProducts(params: {
  page: number
  pageSize: number
}): Promise<{ data: ProductListItem[]; pagination: ProductPaginationMeta }> {
  const { page, pageSize } = params
  const skip = (page - 1) * pageSize

  const [products, total, sessions] = await Promise.all([
    db.product.findMany({
      orderBy: { displayOrder: "asc" },
      skip,
      take: pageSize,
      include: {
        entitlements: { select: { deactivatedAt: true } },
      },
    }),
    db.product.count(),
    db.checkoutSession.findMany({
      where: { processedAt: { not: null } },
      select: { productSlug: true, amountTotal: true },
    }),
  ])

  const sessionsBySlug = new Map<
    string,
    { productSlug: string; amountTotal: number | null }[]
  >()
  for (const s of sessions) {
    const arr = sessionsBySlug.get(s.productSlug) ?? []
    arr.push(s)
    sessionsBySlug.set(s.productSlug, arr)
  }

  const data: ProductListItem[] = products.map((p) => {
    const productSessions = sessionsBySlug.get(p.slug) ?? []
    return {
      slug: p.slug,
      name: p.name,
      priceAmount: p.priceAmount,
      priceCurrency: p.priceCurrency,
      calculations: p.calculations,
      active: p.active,
      isFree: p.isFree,
      totalRevenueUsd:
        productSessions.reduce((sum, s) => sum + (s.amountTotal ?? 0), 0) /
        100,
      purchaseCount: productSessions.length,
      activeEntitlementCount: p.entitlements.filter(
        (e) => e.deactivatedAt === null,
      ).length,
    }
  })

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

export async function getProduct(slug: string): Promise<ProductListItem> {
  const [product, sessions] = await Promise.all([
    db.product.findUnique({
      where: { slug },
      include: {
        entitlements: { select: { deactivatedAt: true } },
      },
    }),
    db.checkoutSession.findMany({
      where: { productSlug: slug, processedAt: { not: null } },
      select: { amountTotal: true },
    }),
  ])

  if (!product) {
    throw new AppError("NOT_FOUND", `Product ${slug} not found`, 404)
  }

  return {
    slug: product.slug,
    name: product.name,
    priceAmount: product.priceAmount,
    priceCurrency: product.priceCurrency,
    calculations: product.calculations,
    active: product.active,
    isFree: product.isFree,
    totalRevenueUsd:
      sessions.reduce((sum, s) => sum + (s.amountTotal ?? 0), 0) / 100,
    purchaseCount: sessions.length,
    activeEntitlementCount: product.entitlements.filter(
      (e) => e.deactivatedAt === null,
    ).length,
  }
}

export async function getProductSales(
  slug: string,
  granularity: "daily" | "weekly" | "monthly",
): Promise<ProductSalesResult> {
  const product = await db.product.findUnique({
    where: { slug },
    select: { id: true },
  })
  if (!product) {
    throw new AppError("NOT_FOUND", `Product ${slug} not found`, 404)
  }

  const now = new Date()
  const cutoff = getCutoff(granularity, now)

  const sessions = await db.checkoutSession.findMany({
    where: {
      productSlug: slug,
      processedAt: { not: null, gte: cutoff },
    },
    select: { amountTotal: true, processedAt: true },
  })

  const periods = generatePeriods(granularity, now)
  const grouped = new Map<string, { revenueUsd: number; purchaseCount: number }>(
    periods.map((p) => [p, { revenueUsd: 0, purchaseCount: 0 }]),
  )

  for (const session of sessions) {
    const period = getPeriod(granularity, session.processedAt!)
    const entry = grouped.get(period)
    if (entry) {
      entry.revenueUsd += (session.amountTotal ?? 0) / 100
      entry.purchaseCount += 1
    }
  }

  return {
    granularity,
    data: periods.map((p) => ({ period: p, ...grouped.get(p)! })),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun run test --filter=mvp_api 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_api/src/modules/admin/product.service.ts apps/mvp_api/src/modules/admin/product.service.test.ts
git commit -m "feat(mvp-api): add product.service with listProducts and getProduct"
```

---

## Task 2: `product.service.ts` — `getProductSales` tests

**Files:**
- Modify: `apps/mvp_api/src/modules/admin/product.service.test.ts`

**Context:** `getProductSales` is already implemented in Task 1. This task adds the unit tests for it. The `generatePeriods` and `getPeriod` functions are private helpers — test them via `getProductSales` behavior. The mock for `db.checkoutSession.findMany` needs to return sessions with `processedAt` dates that fall within known periods.

- [ ] **Step 1: Add failing tests for `getProductSales`**

Append to `apps/mvp_api/src/modules/admin/product.service.test.ts` (below the existing `getProduct` describe block):

```typescript
const { getProductSales } = await import("./product.service.js")

describe("getProductSales", () => {
  beforeEach(() => {
    mockProductFindUnique.mockReset()
    mockProductFindUnique.mockImplementation(async () => ({
      id: "prod1",
    }))
    mockCheckoutSessionFindMany.mockReset()
  })

  it("returns monthly data with 12 periods, zeros for missing periods", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [])
    const result = await getProductSales("pv-layout-pro", "monthly")
    expect(result.granularity).toBe("monthly")
    expect(result.data).toHaveLength(12)
    for (const point of result.data) {
      expect(point.revenueUsd).toBe(0)
      expect(point.purchaseCount).toBe(0)
    }
  })

  it("returns daily data with 30 periods", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [])
    const result = await getProductSales("pv-layout-pro", "daily")
    expect(result.granularity).toBe("daily")
    expect(result.data).toHaveLength(30)
  })

  it("returns weekly data with 12 periods", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [])
    const result = await getProductSales("pv-layout-pro", "weekly")
    expect(result.granularity).toBe("weekly")
    expect(result.data).toHaveLength(12)
  })

  it("aggregates revenue and count for sessions in the current month", async () => {
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7)
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { amountTotal: 4999, processedAt: new Date(now) },
      { amountTotal: 9999, processedAt: new Date(now) },
    ])
    const result = await getProductSales("pv-layout-pro", "monthly")
    const currentPeriod = result.data.find((d) => d.period === currentMonth)!
    expect(currentPeriod.purchaseCount).toBe(2)
    expect(currentPeriod.revenueUsd).toBeCloseTo(149.98)
  })

  it("throws 404 when product not found", async () => {
    mockProductFindUnique.mockImplementation(async () => null as never)
    await expect(
      getProductSales("nonexistent", "monthly"),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun run test --filter=mvp_api 2>&1 | tail -10
```

Expected: all tests pass (including the 5 new ones).

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_api/src/modules/admin/product.service.test.ts
git commit -m "test(mvp-api): add getProductSales unit tests"
```

---

## Task 3: `product.routes.ts` — 3 new admin routes + mount in `app.ts`

**Files:**
- Create: `apps/mvp_api/src/modules/admin/product.routes.test.ts`
- Create: `apps/mvp_api/src/modules/admin/product.routes.ts`
- Modify: `apps/mvp_api/src/app.ts`

**Context:** Follow the exact same pattern as `customer.routes.ts` — mock `@clerk/backend` at the top, mock `../../lib/db.js`, `await import` the routes after mocks. The `granularity` param defaults to `"monthly"` if not provided or invalid. Invalid values are silently coerced to `"monthly"` (no 400 — it's a display hint). Routes use `productRoutes.use("/admin/*", clerkAuth, requireRole("ADMIN", "OPS"))`.

- [ ] **Step 1: Write failing route tests**

Create `apps/mvp_api/src/modules/admin/product.routes.test.ts`:

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

const mockProductFindMany = mock(async () => [
  {
    id: "prod1",
    slug: "pv-layout-pro",
    name: "PV Layout Pro",
    priceAmount: 4999,
    priceCurrency: "usd",
    calculations: 10,
    active: true,
    isFree: false,
    entitlements: [{ deactivatedAt: null }],
  },
])
const mockProductCount = mock(async () => 1)
const mockProductFindUnique = mock(async () => ({
  id: "prod1",
  slug: "pv-layout-pro",
  name: "PV Layout Pro",
  priceAmount: 4999,
  priceCurrency: "usd",
  calculations: 10,
  active: true,
  isFree: false,
  entitlements: [{ deactivatedAt: null }],
}))
const mockCheckoutSessionFindMany = mock(async () => [
  { productSlug: "pv-layout-pro", amountTotal: 4999, processedAt: new Date() },
])

mock.module("../../lib/db.js", () => ({
  db: {
    user: { findFirst: mockUserFindFirst },
    product: {
      findMany: mockProductFindMany,
      count: mockProductCount,
      findUnique: mockProductFindUnique,
    },
    checkoutSession: { findMany: mockCheckoutSessionFindMany },
  },
}))

const { productRoutes } = await import("./product.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", productRoutes)
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
  mockProductFindMany.mockReset()
  mockProductFindMany.mockImplementation(async () => [
    {
      id: "prod1",
      slug: "pv-layout-pro",
      name: "PV Layout Pro",
      priceAmount: 4999,
      priceCurrency: "usd",
      calculations: 10,
      active: true,
      isFree: false,
      entitlements: [{ deactivatedAt: null }],
    },
  ])
  mockProductCount.mockReset()
  mockProductCount.mockImplementation(async () => 1)
  mockProductFindUnique.mockReset()
  mockProductFindUnique.mockImplementation(async () => ({
    id: "prod1",
    slug: "pv-layout-pro",
    name: "PV Layout Pro",
    priceAmount: 4999,
    priceCurrency: "usd",
    calculations: 10,
    active: true,
    isFree: false,
    entitlements: [{ deactivatedAt: null }],
  }))
  mockCheckoutSessionFindMany.mockReset()
  mockCheckoutSessionFindMany.mockImplementation(async () => [
    { productSlug: "pv-layout-pro", amountTotal: 4999, processedAt: new Date() },
  ])
})

describe("GET /admin/products", () => {
  it("returns 200 with paginated product list (OPS role)", async () => {
    const res = await makeApp().request("/admin/products", {
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

describe("GET /admin/products/:slug", () => {
  it("returns 200 with product detail", async () => {
    const res = await makeApp().request("/admin/products/pv-layout-pro", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { slug: string; totalRevenueUsd: number }
    }
    expect(body.data.slug).toBe("pv-layout-pro")
    expect(body.data.totalRevenueUsd).toBeCloseTo(49.99)
  })

  it("returns 404 when product not found", async () => {
    mockProductFindUnique.mockImplementation(async () => null as never)
    const res = await makeApp().request("/admin/products/nonexistent", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(404)
  })
})

describe("GET /admin/products/:slug/sales", () => {
  it("returns 200 with monthly sales data by default", async () => {
    const res = await makeApp().request("/admin/products/pv-layout-pro/sales", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { granularity: string; data: unknown[] }
    }
    expect(body.data.granularity).toBe("monthly")
    expect(body.data.data).toHaveLength(12)
  })

  it("returns daily data when granularity=daily", async () => {
    const res = await makeApp().request(
      "/admin/products/pv-layout-pro/sales?granularity=daily",
      { headers: { Authorization: "Bearer token" } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { granularity: string; data: unknown[] }
    }
    expect(body.data.granularity).toBe("daily")
    expect(body.data.data).toHaveLength(30)
  })

  it("returns 404 when product not found", async () => {
    mockProductFindUnique.mockImplementation(async () => null as never)
    const res = await makeApp().request(
      "/admin/products/nonexistent/sales",
      { headers: { Authorization: "Bearer token" } },
    )
    expect(res.status).toBe(404)
  })
})

describe("Role enforcement", () => {
  it("returns 403 when user has no admin/ops role", async () => {
    mockUserFindFirst.mockImplementation(async () => ({
      id: "usr_plain",
      clerkId: "ck_ops",
      email: "plain@test.com",
      name: "Plain",
      stripeCustomerId: null,
      roles: [],
      status: "ACTIVE",
    }))
    const res = await makeApp().request("/admin/products", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun run test --filter=mvp_api 2>&1 | grep -E "product.routes|FAIL|error" | head -10
```

Expected: import error (file doesn't exist yet).

- [ ] **Step 3: Implement `product.routes.ts`**

Create `apps/mvp_api/src/modules/admin/product.routes.ts`:

```typescript
import { Hono } from "hono"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireRole } from "../../middleware/rbac.js"
import { listProducts, getProduct, getProductSales } from "./product.service.js"
import { ok } from "../../lib/response.js"

export const productRoutes = new Hono<MvpHonoEnv>()

productRoutes.use("/admin/*", clerkAuth, requireRole("ADMIN", "OPS"))

productRoutes.get("/admin/products", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    Math.max(1, parseInt(c.req.query("pageSize") ?? "20", 10) || 20),
    100,
  )
  const result = await listProducts({ page, pageSize })
  return c.json(ok(result))
})

productRoutes.get("/admin/products/:slug/sales", async (c) => {
  const { slug } = c.req.param()
  const raw = c.req.query("granularity")
  const granularity =
    raw === "daily" || raw === "weekly" || raw === "monthly" ? raw : "monthly"
  const result = await getProductSales(slug, granularity)
  return c.json(ok(result))
})

productRoutes.get("/admin/products/:slug", async (c) => {
  const { slug } = c.req.param()
  const product = await getProduct(slug)
  return c.json(ok(product))
})
```

**Important:** Register `/admin/products/:slug/sales` BEFORE `/admin/products/:slug` — otherwise Hono will match `sales` as the `:slug` param.

- [ ] **Step 4: Mount `productRoutes` in `app.ts`**

In `apps/mvp_api/src/app.ts`, add the import after the existing `adminRoutes` import:

```typescript
import { productRoutes } from "./modules/admin/product.routes.js"
```

And add the mount after `app.route("/", adminRoutes)`:

```typescript
app.route("/", productRoutes)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun run test --filter=mvp_api 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/admin/product.routes.ts apps/mvp_api/src/modules/admin/product.routes.test.ts apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): add product routes GET /admin/products, GET /admin/products/:slug, GET /admin/products/:slug/sales"
```

---

## Task 4: Sidebar — add Products to `BASE_NAV`

**Files:**
- Modify: `apps/mvp_admin/components/admin-sidebar.tsx`

**Context:** `BASE_NAV` is visible to both ADMIN and OPS. Add Products between Customers and the admin-only `ADMIN_NAV`. `Building2` is already imported for Customers. Import `Package` for Products.

- [ ] **Step 1: Add `Package` to lucide imports**

In `apps/mvp_admin/components/admin-sidebar.tsx`, update the lucide import:

```typescript
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  LogOut,
  ChevronsUpDown,
  ShieldCheck,
} from "lucide-react"
```

- [ ] **Step 2: Add Products to `BASE_NAV`**

Update `BASE_NAV`:

```typescript
const BASE_NAV = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Building2 },
  { label: "Products", href: "/products", icon: Package },
]
```

- [ ] **Step 3: Typecheck**

```bash
bunx turbo typecheck --filter=@renewable-energy/mvp-admin 2>&1 | tail -5
```

Expected: `Tasks: 1 successful`.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_admin/components/admin-sidebar.tsx
git commit -m "feat(mvp-admin): add Products to sidebar BASE_NAV"
```

---

## Task 5: Types and TanStack Query hooks in `mvp_admin`

**Files:**
- Modify: `apps/mvp_admin/lib/api.ts`
- Create: `apps/mvp_admin/lib/hooks/use-admin-products.ts`

**Context:** `PaginationMeta` is already defined in `lib/api.ts`. Follow the same pattern as `use-admin-customers.ts` — `useAuth()` for token, `fetch` with `Authorization` header, typed response unwrap from `body.data`.

- [ ] **Step 1: Add types to `lib/api.ts`**

Append to `apps/mvp_admin/lib/api.ts`:

```typescript
export type ProductListItem = {
  slug: string
  name: string
  priceAmount: number
  priceCurrency: string
  calculations: number
  active: boolean
  isFree: boolean
  totalRevenueUsd: number
  purchaseCount: number
  activeEntitlementCount: number
}

export type AdminProductsResponse = {
  data: ProductListItem[]
  pagination: PaginationMeta
}

export type SalesDataPoint = {
  period: string
  revenueUsd: number
  purchaseCount: number
}

export type ProductSalesResponse = {
  granularity: "daily" | "weekly" | "monthly"
  data: SalesDataPoint[]
}
```

- [ ] **Step 2: Create `use-admin-products.ts`**

Create `apps/mvp_admin/lib/hooks/use-admin-products.ts`:

```typescript
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import {
  MVP_API_URL,
  type AdminProductsResponse,
  type ProductListItem,
  type ProductSalesResponse,
} from "../api"

export function useAdminProducts(params: { page: number; pageSize: number }) {
  const { getToken } = useAuth()
  return useQuery<AdminProductsResponse>({
    queryKey: ["admin-products", params],
    queryFn: async () => {
      const token = await getToken()
      const qs = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })
      const res = await fetch(`${MVP_API_URL}/admin/products?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch products: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: AdminProductsResponse
      }
      return body.data
    },
  })
}

export function useAdminProduct(slug: string) {
  const { getToken } = useAuth()
  return useQuery<ProductListItem>({
    queryKey: ["admin-product", slug],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/products/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch product: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: ProductListItem
      }
      return body.data
    },
    enabled: !!slug,
  })
}

export function useAdminProductSales(
  slug: string,
  granularity: "daily" | "weekly" | "monthly",
) {
  const { getToken } = useAuth()
  return useQuery<ProductSalesResponse>({
    queryKey: ["admin-product-sales", slug, granularity],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/products/${slug}/sales?granularity=${granularity}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok)
        throw new Error(`Failed to fetch product sales: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: ProductSalesResponse
      }
      return body.data
    },
    enabled: !!slug,
  })
}
```

- [ ] **Step 3: Typecheck**

```bash
bunx turbo typecheck --filter=@renewable-energy/mvp-admin 2>&1 | tail -5
```

Expected: `Tasks: 1 successful`.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_admin/lib/api.ts apps/mvp_admin/lib/hooks/use-admin-products.ts
git commit -m "feat(mvp-admin): add product types and TanStack Query hooks"
```

---

## Task 6: Products list page

**Files:**
- Create: `apps/mvp_admin/app/(admin)/products/page.tsx`
- Create: `apps/mvp_admin/app/(admin)/products/_components/products-page-client.tsx`

**Context:** Follow the exact same pattern as `customers/page.tsx` and `customers-page-client.tsx`. The `active` field on `ProductListItem` is a boolean — derive the badge label as `active ? "ACTIVE" : "INACTIVE"`. Price display: `isFree ? "Free" : formatCurrency(priceAmount / 100)`. Row click → `/products/:slug`.

- [ ] **Step 1: Create the server page**

Create `apps/mvp_admin/app/(admin)/products/page.tsx`:

```typescript
export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { ProductsPageClient } from "./_components/products-page-client"

export const metadata: Metadata = { title: "Products" }

export default async function ProductsPage() {
  const { sessionClaims } = await auth()
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined
  const roles = Array.isArray(meta?.["roles"])
    ? (meta!["roles"] as string[])
    : []
  if (!roles.includes("ADMIN") && !roles.includes("OPS"))
    redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Products
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All products with sales revenue and entitlement metrics.
        </p>
      </div>
      <ProductsPageClient />
    </div>
  )
}
```

- [ ] **Step 2: Create the client component**

Create `apps/mvp_admin/app/(admin)/products/_components/products-page-client.tsx`:

```typescript
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useAdminProducts } from "@/lib/hooks/use-admin-products"
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

function formatCurrency(usd: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(usd)
}

export function ProductsPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))

  const { data, isLoading, error } = useAdminProducts({ page, pageSize: 20 })

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
          <p className="p-4 text-sm text-muted-foreground">
            No products found.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Total Revenue</TableHead>
                <TableHead>Purchases</TableHead>
                <TableHead>Active Entitlements</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((product) => (
                <TableRow
                  key={product.slug}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/products/${product.slug}`)}
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.slug}</p>
                  </TableCell>
                  <TableCell>
                    {product.isFree
                      ? "Free"
                      : formatCurrency(product.priceAmount / 100)}
                  </TableCell>
                  <TableCell>{formatCurrency(product.totalRevenueUsd)}</TableCell>
                  <TableCell>{product.purchaseCount}</TableCell>
                  <TableCell>{product.activeEntitlementCount}</TableCell>
                  <TableCell>
                    <Badge
                      variant={product.active ? "default" : "outline"}
                      className="text-xs"
                    >
                      {product.active ? "ACTIVE" : "INACTIVE"}
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
              onClick={() => router.push(`/products?page=${page - 1}`)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.pagination.totalPages}
              onClick={() => router.push(`/products?page=${page + 1}`)}
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

- [ ] **Step 3: Typecheck**

```bash
bunx turbo typecheck --filter=@renewable-energy/mvp-admin 2>&1 | tail -5
```

Expected: `Tasks: 1 successful`.

- [ ] **Step 4: Commit**

```bash
git add "apps/mvp_admin/app/(admin)/products/"
git commit -m "feat(mvp-admin): add Products list page and client component"
```

---

## Task 7: Product detail page with sales chart

**Files:**
- Create: `apps/mvp_admin/app/(admin)/products/[slug]/page.tsx`
- Create: `apps/mvp_admin/app/(admin)/products/[slug]/_components/product-detail-client.tsx`

**Context:** `recharts` is a transitive dependency through `@renewable-energy/ui` (transpiled). It is NOT in `apps/mvp_admin/package.json`. Before creating the component, add it as a direct dependency so TypeScript can resolve the types. The `ChartContainer` from `@renewable-energy/ui/components/chart` wraps `ResponsiveContainer` — pass the `ComposedChart` directly as its child (no additional `ResponsiveContainer` wrapper). Register `CORS_ORIGINS` is not needed — this is an admin app.

The chart uses:
- `ComposedChart` with `Bar` (revenueUsd, left Y-axis) and `Line` (purchaseCount, right Y-axis)
- `XAxis` with `dataKey="period"`
- `YAxis yAxisId="revenue"` on the left with `tickFormatter` for `$` prefix
- `YAxis yAxisId="count"` on the right
- `ChartTooltip` with `ChartTooltipContent`
- `ChartLegend` with `ChartLegendContent`

- [ ] **Step 1: Add recharts to mvp_admin dependencies**

```bash
cd /Users/arunkpatra/codebase/renewable_energy/apps/mvp_admin && bun add recharts
```

Verify the version matches `packages/ui`:

```bash
grep '"recharts"' /Users/arunkpatra/codebase/renewable_energy/apps/mvp_admin/package.json
```

Expected: `"recharts": "^3.8.0"` or similar.

- [ ] **Step 2: Create the server page**

Create `apps/mvp_admin/app/(admin)/products/[slug]/page.tsx`:

```typescript
export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { ProductDetailClient } from "./_components/product-detail-client"

export const metadata: Metadata = { title: "Product" }

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ granularity?: string }>
}) {
  const { slug } = await params
  const { granularity: rawGranularity } = await searchParams
  const granularity =
    rawGranularity === "daily" || rawGranularity === "weekly"
      ? rawGranularity
      : "monthly"

  const { sessionClaims } = await auth()
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined
  const roles = Array.isArray(meta?.["roles"])
    ? (meta!["roles"] as string[])
    : []
  if (!roles.includes("ADMIN") && !roles.includes("OPS"))
    redirect("/dashboard")

  return <ProductDetailClient slug={slug} granularity={granularity} />
}
```

- [ ] **Step 3: Create the detail client component**

Create `apps/mvp_admin/app/(admin)/products/[slug]/_components/product-detail-client.tsx`:

```typescript
"use client"

import Link from "next/link"
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@renewable-energy/ui/components/chart"
import {
  useAdminProduct,
  useAdminProductSales,
} from "@/lib/hooks/use-admin-products"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"

function formatCurrency(usd: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(usd)
}

const chartConfig = {
  revenueUsd: {
    label: "Revenue (USD)",
    color: "hsl(var(--chart-1))",
  },
  purchaseCount: {
    label: "Purchases",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

export function ProductDetailClient({
  slug,
  granularity,
}: {
  slug: string
  granularity: "daily" | "weekly" | "monthly"
}) {
  const { data: product, isLoading: productLoading, error: productError } =
    useAdminProduct(slug)
  const { data: sales, isLoading: salesLoading } = useAdminProductSales(
    slug,
    granularity,
  )

  if (productLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (productError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {productError.message}
      </div>
    )
  }

  if (!product) return null

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/products"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Products
      </Link>

      {/* Summary card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {product.name}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">{product.slug}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {product.isFree
                ? "Free"
                : formatCurrency(product.priceAmount / 100)}{" "}
              · {product.calculations} calculations per purchase
            </p>
          </div>
          <Badge
            variant={product.active ? "default" : "outline"}
            className="text-xs"
          >
            {product.active ? "ACTIVE" : "INACTIVE"}
          </Badge>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="mt-1 text-xl font-semibold">
              {formatCurrency(product.totalRevenueUsd)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Total Purchases</p>
            <p className="mt-1 text-xl font-semibold">{product.purchaseCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Active Entitlements</p>
            <p className="mt-1 text-xl font-semibold">
              {product.activeEntitlementCount}
            </p>
          </div>
        </div>
      </div>

      {/* Sales chart */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Sales</h2>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={granularity === "daily" ? "default" : "outline"}
              asChild
            >
              <Link href={`/products/${slug}?granularity=daily`}>Daily</Link>
            </Button>
            <Button
              size="sm"
              variant={granularity === "weekly" ? "default" : "outline"}
              asChild
            >
              <Link href={`/products/${slug}?granularity=weekly`}>Weekly</Link>
            </Button>
            <Button
              size="sm"
              variant={granularity === "monthly" ? "default" : "outline"}
              asChild
            >
              <Link href={`/products/${slug}?granularity=monthly`}>Monthly</Link>
            </Button>
          </div>
        </div>

        {salesLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <ComposedChart data={sales?.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="revenue"
                orientation="left"
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="count"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                yAxisId="revenue"
                dataKey="revenueUsd"
                fill="var(--color-revenueUsd)"
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="purchaseCount"
                stroke="var(--color-purchaseCount)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
bunx turbo typecheck --filter=@renewable-energy/mvp-admin 2>&1 | tail -5
```

Expected: `Tasks: 1 successful`.

- [ ] **Step 5: Run full pre-commit gate**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun run lint && bun run typecheck && bun run test && bun run build 2>&1 | tail -20
```

Expected: all tasks successful.

- [ ] **Step 6: Commit**

```bash
git add "apps/mvp_admin/app/(admin)/products/[slug]/" apps/mvp_admin/package.json bun.lock
git commit -m "feat(mvp-admin): add Product detail page with summary card and sales chart"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✓ `GET /admin/products` — paginated list with all required fields (Task 1 + 3)
- ✓ `GET /admin/products/:slug` — product detail (Task 1 + 3)
- ✓ `GET /admin/products/:slug/sales` — time-series with daily/weekly/monthly (Task 1 + 3)
- ✓ `requireRole("ADMIN", "OPS")` on all routes (Task 3)
- ✓ Sidebar: Products between Customers and Users (Task 4)
- ✓ Products list page: all 6 columns, row click → detail (Task 6)
- ✓ Product detail page: summary card with 3 stat boxes (Task 7)
- ✓ Granularity toggle: Daily/Weekly/Monthly (Task 7)
- ✓ Chart: Bar (revenue) + Line (purchases) on same ComposedChart (Task 7)
- ✓ `dynamic = "force-dynamic"` on both pages (Tasks 6 + 7)
- ✓ Read-only — no edit/delete actions (confirmed)

**Type consistency:**
- `ProductListItem` defined in `product.service.ts` (Task 1), mirrored in `lib/api.ts` (Task 5) — same fields
- `ProductSalesResult` (service) vs `ProductSalesResponse` (admin types) — different names but same shape. The admin hook unwraps `body.data` which is `ProductSalesResult` from the API. Acceptable since they're in separate packages.
- `getProductSales` returns `ProductSalesResult`; hook returns `ProductSalesResponse` — both have `{ granularity, data: SalesDataPoint[] }`. ✓

**Route ordering:** `/admin/products/:slug/sales` registered BEFORE `/admin/products/:slug` in Task 3 Step 3 — prevents Hono matching "sales" as a slug param. ✓
