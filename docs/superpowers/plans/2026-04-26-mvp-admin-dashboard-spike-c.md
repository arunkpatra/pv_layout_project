# MVP Admin Dashboard Stats — Spike C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the admin dashboard with all-time summary stat cards and two trend charts (revenue and new customers over time), and replace the products page summary hack with a proper server-side aggregation endpoint.

**Architecture:** Two new API endpoints in `mvp_api` (`GET /admin/dashboard/summary` and `GET /admin/dashboard/trends`), plus `GET /admin/products/summary` to fix the products page hack. Shared time-period helpers are extracted to `sales-utils.ts` to avoid duplication between `product.service.ts` and `dashboard.service.ts`. The frontend gets a `DashboardClient` with two dynamically-imported recharts bar charts (same `ssr: false` pattern as the product detail page).

**Tech Stack:** Bun, Hono, Prisma (mvp_db), TypeScript, Next.js 16 App Router, TanStack Query, recharts, shadcn/ui (Badge, Button, Skeleton), Clerk auth.

**Current branch:** `feat/add-dashboard-on-admin` — all work goes here. Do NOT switch branches.

---

## Context: Existing Patterns to Follow

**API shape:** All endpoints return `{ success: true, data: <payload> }` via the `ok()` helper from `apps/mvp_api/src/lib/response.js`.

**Auth middleware:** All admin routes use `clerkAuth` then `requireRole("ADMIN", "OPS")`, applied via `productRoutes.use("/admin/*", clerkAuth, requireRole(...))`.

**DB import:** `import { db } from "../../lib/db.js"` (note `.js` extension — this is NodeNext moduleResolution).

**Test mocking pattern:** `mock.module("../../lib/db.js", () => ({ db: { ... } }))` at top of test file, with `mock` named mocks and `beforeEach` resets. See `product.service.test.ts` and `product.routes.test.ts` for exact patterns.

**Frontend hook pattern:** `useQuery` from TanStack Query, `useAuth` from `@clerk/nextjs` for `getToken()`. See `lib/hooks/use-admin-products.ts`.

**recharts SSR fix:** Extract recharts JSX into a separate file, then `dynamic(() => import(...), { ssr: false })` in the parent. See `app/(admin)/products/[slug]/_components/sales-chart.tsx` and `product-detail-client.tsx`.

**Granularity in URL:** `useSearchParams` to read `?granularity=daily|weekly|monthly`, default to `"monthly"`. Navigation via `router.push(...)`. See `product-detail-client.tsx`.

---

## Task 1: Extract shared sales utilities

Moves the four time-period helpers out of `product.service.ts` into a shared file so `dashboard.service.ts` can reuse them without duplication.

**Files:**
- Create: `apps/mvp_api/src/modules/admin/sales-utils.ts`
- Modify: `apps/mvp_api/src/modules/admin/product.service.ts`

- [ ] **Step 1: Create `sales-utils.ts` with the extracted helpers**

```typescript
// apps/mvp_api/src/modules/admin/sales-utils.ts

export type Granularity = "daily" | "weekly" | "monthly"

export function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

export function getPeriod(granularity: Granularity, date: Date): string {
  if (granularity === "daily") return date.toISOString().slice(0, 10)
  if (granularity === "weekly") return getISOWeek(date)
  return date.toISOString().slice(0, 7)
}

export function getCutoff(granularity: Granularity, now: Date): Date {
  const d = new Date(now)
  if (granularity === "daily") d.setDate(d.getDate() - 29)
  else if (granularity === "weekly") d.setDate(d.getDate() - 11 * 7)
  else d.setMonth(d.getMonth() - 11)
  return d
}

export function generatePeriods(granularity: Granularity, now: Date): string[] {
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
```

- [ ] **Step 2: Update `product.service.ts` to import from `sales-utils.ts`**

Replace the four inline function definitions in `apps/mvp_api/src/modules/admin/product.service.ts` (lines 35–89) with an import:

```typescript
import {
  type Granularity,
  getISOWeek,
  getPeriod,
  getCutoff,
  generatePeriods,
} from "./sales-utils.js"
```

Remove the local definitions of `getISOWeek`, `getPeriod`, `getCutoff`, and `generatePeriods` from `product.service.ts`. The `type Granularity` also replaces the inline `"daily" | "weekly" | "monthly"` union — update `getProductSales` signature to use it:

```typescript
export async function getProductSales(
  slug: string,
  granularity: Granularity,
): Promise<ProductSalesResult> {
```

And update `ProductSalesResult`:
```typescript
export type ProductSalesResult = {
  granularity: Granularity
  data: SalesDataPoint[]
}
```

- [ ] **Step 3: Run the existing product service tests to confirm no regression**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api -- --testPathPattern="product.service"
```

Expected: all 10 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_api/src/modules/admin/sales-utils.ts apps/mvp_api/src/modules/admin/product.service.ts
git commit -m "refactor(mvp-api): extract shared sales time-period helpers to sales-utils.ts"
```

---

## Task 2: Dashboard service — tests first

Implements `getDashboardSummary` and `getDashboardTrends` in `dashboard.service.ts`, TDD.

**Files:**
- Create: `apps/mvp_api/src/modules/admin/dashboard.service.test.ts`
- Create: `apps/mvp_api/src/modules/admin/dashboard.service.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/mvp_api/src/modules/admin/dashboard.service.test.ts
import { describe, it, expect, mock, beforeEach } from "bun:test"

// ─── db mocks ────────────────────────────────────────────────────────────────
const mockCheckoutSessionAggregate = mock(async () => ({ _sum: { amountTotal: 9998 } }))
const mockUserCount = mock(async () => 3)
const mockCheckoutSessionCount = mock(async () => 2)
const mockEntitlementCount = mock(async () => 1)
const mockCheckoutSessionFindMany = mock(async () => [])
const mockUserFindMany = mock(async () => [])

mock.module("../../lib/db.js", () => ({
  db: {
    checkoutSession: {
      aggregate: mockCheckoutSessionAggregate,
      count: mockCheckoutSessionCount,
      findMany: mockCheckoutSessionFindMany,
    },
    user: {
      count: mockUserCount,
      findMany: mockUserFindMany,
    },
    entitlement: {
      count: mockEntitlementCount,
    },
  },
}))

const { getDashboardSummary, getDashboardTrends } = await import("./dashboard.service.js")

describe("getDashboardSummary", () => {
  beforeEach(() => {
    mockCheckoutSessionAggregate.mockReset()
    mockCheckoutSessionAggregate.mockImplementation(async () => ({
      _sum: { amountTotal: 9998 },
    }))
    mockUserCount.mockReset()
    mockUserCount.mockImplementation(async () => 3)
    mockCheckoutSessionCount.mockReset()
    mockCheckoutSessionCount.mockImplementation(async () => 2)
    mockEntitlementCount.mockReset()
    mockEntitlementCount.mockImplementation(async () => 1)
  })

  it("returns correct all-time totals", async () => {
    const result = await getDashboardSummary()
    expect(result.totalRevenueUsd).toBeCloseTo(99.98)
    expect(result.totalCustomers).toBe(3)
    expect(result.totalPurchases).toBe(2)
    expect(result.activeEntitlements).toBe(1)
  })

  it("returns zeros when no data exists", async () => {
    mockCheckoutSessionAggregate.mockImplementation(async () => ({
      _sum: { amountTotal: null },
    }))
    mockUserCount.mockImplementation(async () => 0)
    mockCheckoutSessionCount.mockImplementation(async () => 0)
    mockEntitlementCount.mockImplementation(async () => 0)
    const result = await getDashboardSummary()
    expect(result.totalRevenueUsd).toBe(0)
    expect(result.totalCustomers).toBe(0)
    expect(result.totalPurchases).toBe(0)
    expect(result.activeEntitlements).toBe(0)
  })
})

describe("getDashboardTrends", () => {
  beforeEach(() => {
    mockCheckoutSessionFindMany.mockReset()
    mockUserFindMany.mockReset()
  })

  it("returns monthly trends with 12 revenue periods and 12 customer periods, zeros when no data", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [])
    const result = await getDashboardTrends("monthly")
    expect(result.granularity).toBe("monthly")
    expect(result.revenue).toHaveLength(12)
    expect(result.customers).toHaveLength(12)
    for (const r of result.revenue) expect(r.revenueUsd).toBe(0)
    for (const c of result.customers) expect(c.count).toBe(0)
  })

  it("returns daily trends with 30 periods", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [])
    const result = await getDashboardTrends("daily")
    expect(result.revenue).toHaveLength(30)
    expect(result.customers).toHaveLength(30)
  })

  it("aggregates revenue and customer counts into correct period buckets", async () => {
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7)
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { amountTotal: 4999, processedAt: new Date(now) },
      { amountTotal: 9999, processedAt: new Date(now) },
    ])
    mockUserFindMany.mockImplementation(async () => [
      { createdAt: new Date(now) },
      { createdAt: new Date(now) },
      { createdAt: new Date(now) },
    ])
    const result = await getDashboardTrends("monthly")
    const revPeriod = result.revenue.find((r) => r.period === currentMonth)!
    expect(revPeriod.revenueUsd).toBeCloseTo(149.98)
    const custPeriod = result.customers.find((c) => c.period === currentMonth)!
    expect(custPeriod.count).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api -- --testPathPattern="dashboard.service"
```

Expected: FAIL — `dashboard.service.js` does not exist yet.

- [ ] **Step 3: Implement `dashboard.service.ts`**

```typescript
// apps/mvp_api/src/modules/admin/dashboard.service.ts
import { db } from "../../lib/db.js"
import {
  type Granularity,
  getCutoff,
  generatePeriods,
  getPeriod,
} from "./sales-utils.js"

export type DashboardSummary = {
  totalRevenueUsd: number
  totalCustomers: number
  totalPurchases: number
  activeEntitlements: number
}

export type RevenueTrendPoint = {
  period: string
  revenueUsd: number
}

export type CustomerTrendPoint = {
  period: string
  count: number
}

export type DashboardTrends = {
  granularity: Granularity
  revenue: RevenueTrendPoint[]
  customers: CustomerTrendPoint[]
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [revenueAgg, totalCustomers, totalPurchases, activeEntitlements] =
    await Promise.all([
      db.checkoutSession.aggregate({
        _sum: { amountTotal: true },
        where: { processedAt: { not: null } },
      }),
      db.user.count(),
      db.checkoutSession.count({ where: { processedAt: { not: null } } }),
      db.entitlement.count({ where: { deactivatedAt: null } }),
    ])

  return {
    totalRevenueUsd: ((revenueAgg._sum.amountTotal ?? 0) as number) / 100,
    totalCustomers,
    totalPurchases,
    activeEntitlements,
  }
}

export async function getDashboardTrends(
  granularity: Granularity,
): Promise<DashboardTrends> {
  const now = new Date()
  const cutoff = getCutoff(granularity, now)

  const [sessions, users] = await Promise.all([
    db.checkoutSession.findMany({
      where: { processedAt: { not: null, gte: cutoff } },
      select: { amountTotal: true, processedAt: true },
    }),
    db.user.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { createdAt: true },
    }),
  ])

  const periods = generatePeriods(granularity, now)

  const revenueMap = new Map<string, number>(periods.map((p) => [p, 0]))
  for (const s of sessions) {
    const period = getPeriod(granularity, s.processedAt!)
    const prev = revenueMap.get(period)
    if (prev !== undefined) {
      revenueMap.set(period, prev + (s.amountTotal ?? 0) / 100)
    }
  }

  const customerMap = new Map<string, number>(periods.map((p) => [p, 0]))
  for (const u of users) {
    const period = getPeriod(granularity, u.createdAt)
    const prev = customerMap.get(period)
    if (prev !== undefined) {
      customerMap.set(period, prev + 1)
    }
  }

  return {
    granularity,
    revenue: periods.map((p) => ({ period: p, revenueUsd: revenueMap.get(p)! })),
    customers: periods.map((p) => ({ period: p, count: customerMap.get(p)! })),
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api -- --testPathPattern="dashboard.service"
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_api/src/modules/admin/dashboard.service.ts apps/mvp_api/src/modules/admin/dashboard.service.test.ts
git commit -m "feat(mvp-api): add dashboard service — summary and trends"
```

---

## Task 3: Dashboard routes — tests first

Exposes the two dashboard endpoints and registers them in `app.ts`.

**Files:**
- Create: `apps/mvp_api/src/modules/admin/dashboard.routes.test.ts`
- Create: `apps/mvp_api/src/modules/admin/dashboard.routes.ts`
- Modify: `apps/mvp_api/src/app.ts`

- [ ] **Step 1: Write the failing route tests**

```typescript
// apps/mvp_api/src/modules/admin/dashboard.routes.test.ts
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

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
    },
  }),
}))

const mockUserFindFirst = mock(async () => ({
  id: "usr_ops",
  clerkId: "ck_ops",
  email: "ops@test.com",
  name: "Ops",
  stripeCustomerId: null,
  roles: ["OPS"],
  status: "ACTIVE",
}))

const mockCheckoutSessionAggregate = mock(async () => ({
  _sum: { amountTotal: 4999 },
}))
const mockUserCount = mock(async () => 2)
const mockCheckoutSessionCount = mock(async () => 1)
const mockEntitlementCount = mock(async () => 1)
const mockCheckoutSessionFindMany = mock(async () => [])
const mockUserFindMany = mock(async () => [])

mock.module("../../lib/db.js", () => ({
  db: {
    user: { findFirst: mockUserFindFirst, count: mockUserCount, findMany: mockUserFindMany },
    checkoutSession: {
      aggregate: mockCheckoutSessionAggregate,
      count: mockCheckoutSessionCount,
      findMany: mockCheckoutSessionFindMany,
    },
    entitlement: { count: mockEntitlementCount },
  },
}))

const { dashboardAdminRoutes } = await import("./dashboard.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", dashboardAdminRoutes)
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
  mockCheckoutSessionAggregate.mockReset()
  mockCheckoutSessionAggregate.mockImplementation(async () => ({
    _sum: { amountTotal: 4999 },
  }))
  mockUserCount.mockReset()
  mockUserCount.mockImplementation(async () => 2)
  mockCheckoutSessionCount.mockReset()
  mockCheckoutSessionCount.mockImplementation(async () => 1)
  mockEntitlementCount.mockReset()
  mockEntitlementCount.mockImplementation(async () => 1)
  mockCheckoutSessionFindMany.mockReset()
  mockCheckoutSessionFindMany.mockImplementation(async () => [])
  mockUserFindMany.mockReset()
  mockUserFindMany.mockImplementation(async () => [])
})

describe("GET /admin/dashboard/summary", () => {
  it("returns 200 with summary shape for OPS role", async () => {
    const res = await makeApp().request("/admin/dashboard/summary", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        totalRevenueUsd: number
        totalCustomers: number
        totalPurchases: number
        activeEntitlements: number
      }
    }
    expect(body.success).toBe(true)
    expect(typeof body.data.totalRevenueUsd).toBe("number")
    expect(typeof body.data.totalCustomers).toBe("number")
    expect(typeof body.data.totalPurchases).toBe("number")
    expect(typeof body.data.activeEntitlements).toBe("number")
  })

  it("returns 401 when no Authorization header", async () => {
    const res = await makeApp().request("/admin/dashboard/summary")
    expect(res.status).toBe(401)
  })
})

describe("GET /admin/dashboard/trends", () => {
  it("defaults to monthly granularity when no query param", async () => {
    const res = await makeApp().request("/admin/dashboard/trends", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { granularity: string; revenue: unknown[]; customers: unknown[] }
    }
    expect(body.data.granularity).toBe("monthly")
    expect(body.data.revenue).toHaveLength(12)
    expect(body.data.customers).toHaveLength(12)
  })

  it("returns daily trends when granularity=daily", async () => {
    const res = await makeApp().request(
      "/admin/dashboard/trends?granularity=daily",
      { headers: { Authorization: "Bearer token" } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { granularity: string; revenue: unknown[] }
    }
    expect(body.data.granularity).toBe("daily")
    expect(body.data.revenue).toHaveLength(30)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api -- --testPathPattern="dashboard.routes"
```

Expected: FAIL — `dashboard.routes.js` does not exist yet.

- [ ] **Step 3: Implement `dashboard.routes.ts`**

```typescript
// apps/mvp_api/src/modules/admin/dashboard.routes.ts
import { Hono } from "hono"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireRole } from "../../middleware/rbac.js"
import { getDashboardSummary, getDashboardTrends } from "./dashboard.service.js"
import { ok } from "../../lib/response.js"

export const dashboardAdminRoutes = new Hono<MvpHonoEnv>()

dashboardAdminRoutes.use("/admin/*", clerkAuth, requireRole("ADMIN", "OPS"))

dashboardAdminRoutes.get("/admin/dashboard/summary", async (c) => {
  const result = await getDashboardSummary()
  return c.json(ok(result))
})

dashboardAdminRoutes.get("/admin/dashboard/trends", async (c) => {
  const raw = c.req.query("granularity")
  const granularity =
    raw === "daily" || raw === "weekly" || raw === "monthly" ? raw : "monthly"
  const result = await getDashboardTrends(granularity)
  return c.json(ok(result))
})
```

- [ ] **Step 4: Register `dashboardAdminRoutes` in `app.ts`**

In `apps/mvp_api/src/app.ts`, add the import alongside the other admin imports:

```typescript
import { dashboardAdminRoutes } from "./modules/admin/dashboard.routes.js"
```

And add the route registration after the existing admin routes:

```typescript
app.route("/", dashboardAdminRoutes)
```

- [ ] **Step 5: Run route tests to confirm they pass**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api -- --testPathPattern="dashboard.routes"
```

Expected: all 4 tests pass.

- [ ] **Step 6: Run full API test suite to confirm no regression**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_api/src/modules/admin/dashboard.routes.ts apps/mvp_api/src/modules/admin/dashboard.routes.test.ts apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): add admin dashboard routes — summary and trends"
```

---

## Task 4: Products summary endpoint (fix the hack)

Adds `GET /admin/products/summary` to replace the products page's `pageSize:100` client-side aggregation hack.

**Files:**
- Modify: `apps/mvp_api/src/modules/admin/product.service.ts`
- Modify: `apps/mvp_api/src/modules/admin/product.service.test.ts`
- Modify: `apps/mvp_api/src/modules/admin/product.routes.ts`
- Modify: `apps/mvp_api/src/modules/admin/product.routes.test.ts`

- [ ] **Step 1: Write the failing service test**

Add this describe block to the bottom of `apps/mvp_api/src/modules/admin/product.service.test.ts`.

The file already imports `listProducts` and `getProduct` and `getProductSales` at the top. Add these at the top of the file alongside the existing mock setup:

Add to the existing `mock.module("../../lib/db.js", ...)` — extend the `checkoutSession` mock object to include `aggregate`, and add `entitlement` mock:

```typescript
const mockCheckoutSessionAggregate = mock(async () => ({
  _sum: { amountTotal: 14997 },
}))
const mockEntitlementCountForSummary = mock(async () => 2)
```

Extend the `mock.module` call's db object to include these:
```typescript
// In mock.module "../../lib/db.js":
checkoutSession: {
  findMany: mockCheckoutSessionFindMany,
  aggregate: mockCheckoutSessionAggregate,
  count: mock(async () => 3),
},
entitlement: {
  count: mockEntitlementCountForSummary,
},
```

Then add the describe block at the bottom of the test file:

```typescript
const { getProductsSummary } = await import("./product.service.js")

describe("getProductsSummary", () => {
  beforeEach(() => {
    mockCheckoutSessionAggregate.mockReset()
    mockCheckoutSessionAggregate.mockImplementation(async () => ({
      _sum: { amountTotal: 14997 },
    }))
    mockEntitlementCountForSummary.mockReset()
    mockEntitlementCountForSummary.mockImplementation(async () => 2)
  })

  it("returns correct all-product totals", async () => {
    const result = await getProductsSummary()
    expect(result.totalRevenueUsd).toBeCloseTo(149.97)
    expect(result.totalPurchases).toBe(3)
    expect(result.activeEntitlements).toBe(2)
  })

  it("returns zeros when no sessions or entitlements exist", async () => {
    mockCheckoutSessionAggregate.mockImplementation(async () => ({
      _sum: { amountTotal: null },
    }))
    mockEntitlementCountForSummary.mockImplementation(async () => 0)
    const result = await getProductsSummary()
    expect(result.totalRevenueUsd).toBe(0)
    expect(result.totalPurchases).toBe(0)
    expect(result.activeEntitlements).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api -- --testPathPattern="product.service"
```

Expected: FAIL — `getProductsSummary` is not exported yet.

- [ ] **Step 3: Implement `getProductsSummary` in `product.service.ts`**

Add these types and function to `apps/mvp_api/src/modules/admin/product.service.ts`:

```typescript
export type ProductsSummary = {
  totalRevenueUsd: number
  totalPurchases: number
  activeEntitlements: number
}

export async function getProductsSummary(): Promise<ProductsSummary> {
  const [revenueAgg, totalPurchases, activeEntitlements] = await Promise.all([
    db.checkoutSession.aggregate({
      _sum: { amountTotal: true },
      where: { processedAt: { not: null } },
    }),
    db.checkoutSession.count({ where: { processedAt: { not: null } } }),
    db.entitlement.count({ where: { deactivatedAt: null } }),
  ])

  return {
    totalRevenueUsd: ((revenueAgg._sum.amountTotal ?? 0) as number) / 100,
    totalPurchases,
    activeEntitlements,
  }
}
```

- [ ] **Step 4: Run service tests to confirm they pass**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api -- --testPathPattern="product.service"
```

Expected: all tests pass (including the 2 new `getProductsSummary` tests).

- [ ] **Step 5: Write the failing route test**

Add to `apps/mvp_api/src/modules/admin/product.routes.test.ts` — first extend the db mock to add `aggregate` and `entitlement`:

In the existing `mock.module("../../lib/db.js", ...)` block, add:
```typescript
const mockCheckoutSessionAggregate = mock(async () => ({
  _sum: { amountTotal: 4999 },
}))
const mockCheckoutSessionCountForSummary = mock(async () => 1)
const mockEntitlementCount = mock(async () => 1)
```

Extend the db mock object:
```typescript
// add to checkoutSession in mock.module:
aggregate: mockCheckoutSessionAggregate,
count: mockCheckoutSessionCountForSummary,
// add top-level:
entitlement: { count: mockEntitlementCount },
```

Also add these mocks to `beforeEach`:
```typescript
mockCheckoutSessionAggregate.mockReset()
mockCheckoutSessionAggregate.mockImplementation(async () => ({
  _sum: { amountTotal: 4999 },
}))
mockCheckoutSessionCountForSummary.mockReset()
mockCheckoutSessionCountForSummary.mockImplementation(async () => 1)
mockEntitlementCount.mockReset()
mockEntitlementCount.mockImplementation(async () => 1)
```

Then add a new describe block at the end of the file:

```typescript
describe("GET /admin/products/summary", () => {
  it("returns 200 with summary shape for OPS role", async () => {
    const res = await makeApp().request("/admin/products/summary", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        totalRevenueUsd: number
        totalPurchases: number
        activeEntitlements: number
      }
    }
    expect(body.success).toBe(true)
    expect(typeof body.data.totalRevenueUsd).toBe("number")
    expect(typeof body.data.totalPurchases).toBe("number")
    expect(typeof body.data.activeEntitlements).toBe("number")
  })

  it("returns 401 when no Authorization header", async () => {
    const res = await makeApp().request("/admin/products/summary")
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 6: Run route tests to confirm new tests fail**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api -- --testPathPattern="product.routes"
```

Expected: new `GET /admin/products/summary` tests FAIL — route doesn't exist yet.

- [ ] **Step 7: Add `GET /admin/products/summary` to `product.routes.ts`**

In `apps/mvp_api/src/modules/admin/product.routes.ts`, update the import and add the route. Add `getProductsSummary` to the import:

```typescript
import { listProducts, getProduct, getProductSales, getProductsSummary } from "./product.service.js"
```

Add this route **before** the `GET /admin/products/:slug` route (must come before parameterised routes):

```typescript
productRoutes.get("/admin/products/summary", async (c) => {
  const result = await getProductsSummary()
  return c.json(ok(result))
})
```

- [ ] **Step 8: Run all product route tests to confirm they pass**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api -- --testPathPattern="product.routes"
```

Expected: all tests pass.

- [ ] **Step 9: Run full API test suite**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add apps/mvp_api/src/modules/admin/product.service.ts apps/mvp_api/src/modules/admin/product.service.test.ts apps/mvp_api/src/modules/admin/product.routes.ts apps/mvp_api/src/modules/admin/product.routes.test.ts
git commit -m "feat(mvp-api): add GET /admin/products/summary endpoint"
```

---

## Task 5: Frontend types and hooks

Adds TypeScript types and TanStack Query hooks for the three new endpoints.

**Files:**
- Modify: `apps/mvp_admin/lib/api.ts`
- Create: `apps/mvp_admin/lib/hooks/use-admin-dashboard.ts`
- Modify: `apps/mvp_admin/lib/hooks/use-admin-products.ts`

- [ ] **Step 1: Add types to `lib/api.ts`**

Append to the bottom of `apps/mvp_admin/lib/api.ts`:

```typescript
export type DashboardSummary = {
  totalRevenueUsd: number
  totalCustomers: number
  totalPurchases: number
  activeEntitlements: number
}

export type RevenueTrendPoint = {
  period: string
  revenueUsd: number
}

export type CustomerTrendPoint = {
  period: string
  count: number
}

export type DashboardTrends = {
  granularity: "daily" | "weekly" | "monthly"
  revenue: RevenueTrendPoint[]
  customers: CustomerTrendPoint[]
}

export type ProductsSummary = {
  totalRevenueUsd: number
  totalPurchases: number
  activeEntitlements: number
}
```

- [ ] **Step 2: Create `use-admin-dashboard.ts`**

```typescript
// apps/mvp_admin/lib/hooks/use-admin-dashboard.ts
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"
import {
  MVP_API_URL,
  type DashboardSummary,
  type DashboardTrends,
} from "../api"

export function useAdminDashboardSummary() {
  const { getToken } = useAuth()
  return useQuery<DashboardSummary>({
    queryKey: ["admin-dashboard-summary"],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/dashboard/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch dashboard summary: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: DashboardSummary
      }
      return body.data
    },
  })
}

export function useAdminDashboardTrends(
  granularity: "daily" | "weekly" | "monthly",
) {
  const { getToken } = useAuth()
  return useQuery<DashboardTrends>({
    queryKey: ["admin-dashboard-trends", granularity],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/admin/dashboard/trends?granularity=${granularity}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok)
        throw new Error(`Failed to fetch dashboard trends: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: DashboardTrends
      }
      return body.data
    },
  })
}
```

- [ ] **Step 3: Add `useAdminProductsSummary` to `use-admin-products.ts`**

Add this import at the top of `apps/mvp_admin/lib/hooks/use-admin-products.ts` (extend the existing import):

```typescript
import {
  MVP_API_URL,
  type AdminProductsResponse,
  type ProductListItem,
  type ProductSalesResponse,
  type ProductsSummary,
} from "../api"
```

Append this function to the bottom of `use-admin-products.ts`:

```typescript
export function useAdminProductsSummary() {
  const { getToken } = useAuth()
  return useQuery<ProductsSummary>({
    queryKey: ["admin-products-summary"],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/admin/products/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch products summary: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: ProductsSummary
      }
      return body.data
    },
  })
}
```

- [ ] **Step 4: Run typecheck to confirm types are consistent**

```bash
cd /path/to/repo && bunx turbo typecheck --filter=mvp_admin
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_admin/lib/api.ts apps/mvp_admin/lib/hooks/use-admin-dashboard.ts apps/mvp_admin/lib/hooks/use-admin-products.ts
git commit -m "feat(mvp-admin): add dashboard types and hooks"
```

---

## Task 6: Dashboard UI

Implements the dashboard page with stat cards and two trend charts.

**Files:**
- Create: `apps/mvp_admin/app/(admin)/dashboard/_components/revenue-trend-chart.tsx`
- Create: `apps/mvp_admin/app/(admin)/dashboard/_components/customer-trend-chart.tsx`
- Create: `apps/mvp_admin/app/(admin)/dashboard/_components/dashboard-client.tsx`
- Modify: `apps/mvp_admin/app/(admin)/dashboard/page.tsx`
- Modify: `apps/mvp_admin/app/(admin)/dashboard/page.test.tsx`

- [ ] **Step 1: Create `revenue-trend-chart.tsx`**

```typescript
// apps/mvp_admin/app/(admin)/dashboard/_components/revenue-trend-chart.tsx
"use client"

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@renewable-energy/ui/components/chart"
import type { RevenueTrendPoint } from "@/lib/api"

const chartConfig = {
  revenueUsd: {
    label: "Revenue (USD)",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-48 w-full">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="revenue"
          orientation="left"
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          tick={{ fontSize: 10 }}
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
      </ComposedChart>
    </ChartContainer>
  )
}
```

- [ ] **Step 2: Create `customer-trend-chart.tsx`**

```typescript
// apps/mvp_admin/app/(admin)/dashboard/_components/customer-trend-chart.tsx
"use client"

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@renewable-energy/ui/components/chart"
import type { CustomerTrendPoint } from "@/lib/api"

const chartConfig = {
  count: {
    label: "New Customers",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function CustomerTrendChart({ data }: { data: CustomerTrendPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-48 w-full">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="customers"
          orientation="left"
          tickFormatter={(v: number) => String(Math.round(v))}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          yAxisId="customers"
          dataKey="count"
          fill="var(--color-count)"
          radius={[2, 2, 0, 0]}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
```

- [ ] **Step 3: Create `dashboard-client.tsx`**

`DashboardClient` receives `granularity` as a prop from the server page — it does NOT use `useSearchParams`. This matches the pattern used by `ProductDetailClient`.

```typescript
// apps/mvp_admin/app/(admin)/dashboard/_components/dashboard-client.tsx
"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import {
  useAdminDashboardSummary,
  useAdminDashboardTrends,
} from "@/lib/hooks/use-admin-dashboard"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"

const RevenueTrendChart = dynamic(
  () =>
    import("./revenue-trend-chart").then((m) => m.RevenueTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
)

const CustomerTrendChart = dynamic(
  () =>
    import("./customer-trend-chart").then((m) => m.CustomerTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
)

function formatCurrency(usd: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(usd)
}

export function DashboardClient({
  granularity,
}: {
  granularity: "daily" | "weekly" | "monthly"
}) {
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useAdminDashboardSummary()
  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
  } = useAdminDashboardTrends(granularity)

  return (
    <div className="space-y-6">
      {/* Summary stat cards */}
      {summaryError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {summaryError.message}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            {summaryLoading ? (
              <Skeleton className="mt-1 h-8 w-24" />
            ) : (
              <p className="mt-1 text-2xl font-semibold">
                {formatCurrency(summary?.totalRevenueUsd ?? 0)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Customers</p>
            {summaryLoading ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-semibold">
                {summary?.totalCustomers ?? 0}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Purchases</p>
            {summaryLoading ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-semibold">
                {summary?.totalPurchases ?? 0}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Active Entitlements</p>
            {summaryLoading ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-semibold">
                {summary?.activeEntitlements ?? 0}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Granularity toggle */}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={granularity === "daily" ? "default" : "outline"}
          asChild
        >
          <Link href="/dashboard?granularity=daily">Daily</Link>
        </Button>
        <Button
          size="sm"
          variant={granularity === "weekly" ? "default" : "outline"}
          asChild
        >
          <Link href="/dashboard?granularity=weekly">Weekly</Link>
        </Button>
        <Button
          size="sm"
          variant={granularity === "monthly" ? "default" : "outline"}
          asChild
        >
          <Link href="/dashboard?granularity=monthly">Monthly</Link>
        </Button>
      </div>

      {/* Trend charts */}
      {trendsError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {trendsError.message}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-6 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Revenue over time
            </h2>
            {trendsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <RevenueTrendChart data={trends?.revenue ?? []} />
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-6 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              New customers per period
            </h2>
            {trendsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <CustomerTrendChart data={trends?.customers ?? []} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update `dashboard/page.tsx`**

The server page reads `searchParams.granularity` and passes it as a prop to `DashboardClient` — same pattern as `ProductDetailPage`. No `<Suspense>` wrapper needed.

Replace the entire content of `apps/mvp_admin/app/(admin)/dashboard/page.tsx`:

```typescript
import type { Metadata } from "next"
import { DashboardClient } from "./_components/dashboard-client"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ granularity?: string }>
}) {
  const { granularity: rawGranularity } = await searchParams
  const granularity =
    rawGranularity === "daily" || rawGranularity === "weekly"
      ? rawGranularity
      : "monthly"

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview metrics for SolarLayout.
        </p>
      </div>
      <DashboardClient granularity={granularity} />
    </div>
  )
}
```

- [ ] **Step 5: Update `dashboard/page.test.tsx`**

The existing test checks for the heading "Dashboard". The heading still renders, but it's now in the server component wrapper — the test remains valid. Just confirm it still passes:

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_admin -- --testPathPattern="dashboard/page"
```

Expected: 1 test passes (renders dashboard heading).

- [ ] **Step 6: Typecheck**

```bash
cd /path/to/repo && bunx turbo typecheck --filter=mvp_admin
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_admin/app/\(admin\)/dashboard/
git commit -m "feat(mvp-admin): implement dashboard page with summary stats and trend charts"
```

---

## Task 7: Fix products page summary hack

Replaces the `useAdminProducts({ page: 1, pageSize: 100 })` second call with the new `useAdminProductsSummary` hook.

**Files:**
- Modify: `apps/mvp_admin/app/(admin)/products/_components/products-page-client.tsx`

- [ ] **Step 1: Update `products-page-client.tsx`**

Replace the entire file with:

```typescript
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useAdminProducts } from "@/lib/hooks/use-admin-products"
import { useAdminProductsSummary } from "@/lib/hooks/use-admin-products"
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
  const { data: summary } = useAdminProductsSummary()

  const totalRevenue = summary?.totalRevenueUsd ?? 0
  const totalPurchases = summary?.totalPurchases ?? 0
  const totalActiveEntitlements = summary?.activeEntitlements ?? 0

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
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
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Purchases</p>
          <p className="mt-1 text-2xl font-semibold">{totalPurchases}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Active Entitlements</p>
          <p className="mt-1 text-2xl font-semibold">{totalActiveEntitlements}</p>
        </div>
      </div>
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
                    <p className="text-xs text-muted-foreground">
                      {product.slug}
                    </p>
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

- [ ] **Step 2: Run typecheck and full test suite**

```bash
cd /path/to/repo && bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_admin/app/\(admin\)/products/_components/products-page-client.tsx
git commit -m "fix(mvp-admin): replace products summary pageSize hack with dedicated summary endpoint"
```
