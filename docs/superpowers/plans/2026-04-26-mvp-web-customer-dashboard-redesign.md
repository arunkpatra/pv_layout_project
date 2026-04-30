# MVP Web Customer Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `mvp_web` customer dashboard from 4 half-baked pages to 3 fully-functional pages (Dashboard, Plans, Usage) backed by a new `GET /billing/usage` API endpoint.

**Architecture:** A new Clerk-authenticated `GET /billing/usage` endpoint is added to `billing.routes.ts`. The `GET /billing/entitlements` endpoint is updated to return ALL entitlement states (ACTIVE, EXHAUSTED, DEACTIVATED) instead of filtering. Three new/rewritten `mvp_web` pages consume these endpoints via two new TanStack Query hooks. The License page is deleted; its content moves to Dashboard.

**Tech Stack:** Hono + Bun (API), Next.js 16 App Router + TanStack Query v5 + Clerk (web), Prisma (DB via `@renewable-energy/mvp-db`), Vitest + RTL (web tests), Bun test (API tests)

---

## File Map

### `apps/mvp_api`
| File | Change |
|------|--------|
| `src/modules/billing/billing.routes.ts` | Update `GET /billing/entitlements` (return all states); add `GET /billing/usage`; fix Stripe `success_url`/`cancel_url` |
| `src/modules/billing/billing.routes.test.ts` | Update existing entitlements tests; add `GET /billing/usage` tests |

### `apps/mvp_web`
| File | Change |
|------|--------|
| `components/hooks/use-billing.ts` | **Create** — `useEntitlements()` and `useUserUsage()` TanStack Query hooks |
| `components/dashboard-sidebar.tsx` | Remove License + Plan nav items; add Plans item |
| `app/(main)/dashboard/page.tsx` | **Rewrite** — stat cards, license key card, download card, recent activity |
| `app/(main)/dashboard/page.test.tsx` | **Rewrite** — tests for new dashboard page |
| `app/(main)/dashboard/plans/page.tsx` | **Create** — migrate from `plan/page.tsx`; remove license card; show all entitlements with state badges; fix router.replace path |
| `app/(main)/dashboard/plan/` | **Delete** entire folder |
| `app/(main)/dashboard/usage/page.tsx` | **Rewrite** — full paginated history |
| `app/(main)/dashboard/license/` | **Delete** entire folder |

---

## Task 1: Update `GET /billing/entitlements` + fix Stripe return URL

**Context:** The route is in `apps/mvp_api/src/modules/billing/billing.routes.ts`. Currently it filters to non-deactivated, non-exhausted entitlements only. We need it to return ALL entitlements with a `state` field. The Stripe `success_url` and `cancel_url` still point to `/dashboard/plan` — rename to `/dashboard/plans`. The DB mock in the test file needs `deactivatedAt` added to the existing mock object.

**Files:**
- Modify: `apps/mvp_api/src/modules/billing/billing.routes.ts`
- Modify: `apps/mvp_api/src/modules/billing/billing.routes.test.ts`

- [ ] **Step 1: Write new failing test for all-states entitlements response**

Add this test to the `describe("GET /billing/entitlements")` block in `billing.routes.test.ts`. Place it BEFORE the existing tests so failures are obvious. First add `deactivatedAt: null` to the existing `mockEntitlementFindMany` default mock:

```typescript
const mockEntitlementFindMany = mock(async () => [
  {
    id: "ent_test1",
    totalCalculations: 10,
    usedCalculations: 3,
    purchasedAt: new Date("2026-04-22"),
    deactivatedAt: null,                         // ADD THIS
    product: { slug: "pv-layout-pro", name: "PV Layout Pro" },
  },
])
```

Then add this new test inside `describe("GET /billing/entitlements", () => {`:

```typescript
it("returns all entitlements with state field including exhausted and deactivated", async () => {
  mockEntitlementFindMany.mockImplementation(async () => [
    {
      id: "ent_active",
      totalCalculations: 10,
      usedCalculations: 3,
      purchasedAt: new Date("2026-04-22"),
      deactivatedAt: null,
      product: { slug: "pv-layout-pro", name: "PV Layout Pro" },
    },
    {
      id: "ent_exhausted",
      totalCalculations: 5,
      usedCalculations: 5,
      purchasedAt: new Date("2026-03-01"),
      deactivatedAt: null,
      product: { slug: "pv-layout-basic", name: "PV Layout Basic" },
    },
    {
      id: "ent_deactivated",
      totalCalculations: 10,
      usedCalculations: 0,
      purchasedAt: new Date("2026-02-01"),
      deactivatedAt: new Date("2026-03-15"),
      product: { slug: "pv-layout-pro", name: "PV Layout Pro" },
    },
  ])
  const app = makeApp()
  const res = await app.request("/billing/entitlements", {
    method: "GET",
    headers: { Authorization: "Bearer valid-token" },
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as {
    success: boolean
    data: {
      entitlements: Array<{ id: string; state: string; remainingCalculations: number }>
    }
  }
  expect(body.data.entitlements).toHaveLength(3)
  const byId = Object.fromEntries(body.data.entitlements.map(e => [e.id, e]))
  expect(byId["ent_active"]!.state).toBe("ACTIVE")
  expect(byId["ent_active"]!.remainingCalculations).toBe(7)
  expect(byId["ent_exhausted"]!.state).toBe("EXHAUSTED")
  expect(byId["ent_exhausted"]!.remainingCalculations).toBe(0)
  expect(byId["ent_deactivated"]!.state).toBe("DEACTIVATED")
})
```

- [ ] **Step 2: Run the new test to verify it fails**

```bash
cd /path/to/repo && bunx turbo test --filter=mvp_api 2>&1 | tail -30
```

Expected: FAIL — the new test fails because `state` field does not exist yet, and `entitlements` has length 1 (only active filtered).

- [ ] **Step 3: Update `GET /billing/entitlements` route implementation**

Replace the `GET /billing/entitlements` handler in `billing.routes.ts`. The key changes: (a) remove `deactivatedAt: null` from the DB query, (b) remove the JS `active` filter, (c) add `state` field and `id`/`deactivatedAt` to the mapped output.

Also update `success_url` and `cancel_url` in `POST /billing/checkout` from `/dashboard/plan` to `/dashboard/plans`.

```typescript
// In POST /billing/checkout, update both URLs:
success_url: `${baseUrl}/dashboard/plans?session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${baseUrl}/dashboard/plans`,
```

Replace the entire `GET /billing/entitlements` handler with:

```typescript
// GET /billing/entitlements
billingRoutes.get("/billing/entitlements", async (c) => {
  const user = c.get("user")

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

  const mapped = entitlements.map((e) => {
    let state: "ACTIVE" | "EXHAUSTED" | "DEACTIVATED"
    if (e.deactivatedAt !== null) {
      state = "DEACTIVATED"
    } else if (e.usedCalculations >= e.totalCalculations) {
      state = "EXHAUSTED"
    } else {
      state = "ACTIVE"
    }
    return {
      id: e.id,
      product: e.product.slug,
      productName: e.product.name,
      totalCalculations: e.totalCalculations,
      usedCalculations: e.usedCalculations,
      remainingCalculations: Math.max(
        0,
        e.totalCalculations - e.usedCalculations,
      ),
      purchasedAt: e.purchasedAt.toISOString(),
      deactivatedAt: e.deactivatedAt?.toISOString() ?? null,
      state,
    }
  })

  return c.json(
    ok({
      entitlements: mapped,
      licenseKey: licenseKey?.key ?? null,
    }),
  )
})
```

- [ ] **Step 4: Update existing entitlements tests that relied on old filtering behavior**

The following existing tests in `describe("GET /billing/entitlements")` need updates:

1. **"returns entitlements and license key"** — add `deactivatedAt: null` to the mock (already done in Step 1), and add assertion for `state`:
```typescript
expect(first.state).toBe("ACTIVE")
```

2. **"returns empty when user has no entitlements"** — no change needed (still valid).

3. **"excludes exhausted entitlements"** — rename to **"marks exhausted entitlements with state EXHAUSTED"** and update assertions:
```typescript
it("marks exhausted entitlements with state EXHAUSTED", async () => {
  mockEntitlementFindMany.mockImplementation(async () => [
    {
      id: "ent_exhausted",
      totalCalculations: 5,
      usedCalculations: 5,
      purchasedAt: new Date("2026-04-22"),
      deactivatedAt: null,
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
    data: { entitlements: Array<{ state: string; remainingCalculations: number }> }
  }
  expect(body.data.entitlements).toHaveLength(1)
  expect(body.data.entitlements[0]!.state).toBe("EXHAUSTED")
  expect(body.data.entitlements[0]!.remainingCalculations).toBe(0)
})
```

4. **"includes active entitlement with remaining calculations"** — add `deactivatedAt: null` to mock and add `state` assertion:
```typescript
expect(body.data.entitlements[0]!.state).toBe("ACTIVE")
```

- [ ] **Step 5: Run all billing tests to verify they pass**

```bash
bunx turbo test --filter=mvp_api 2>&1 | tail -30
```

Expected: All tests pass including the new all-states test.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/modules/billing/billing.routes.ts \
        apps/mvp_api/src/modules/billing/billing.routes.test.ts
git commit -m "feat(mvp-api): entitlements returns all states; fix Stripe return URL to /plans"
```

---

## Task 2: Add `GET /billing/usage` endpoint

**Context:** `billing.routes.ts` has no service file — all logic lives in the routes file. The `UsageRecord` model is in `@renewable-energy/mvp-db`, accessible via `db` imported from `../../lib/db.js`. The `UsageRecord` has fields: `id`, `userId`, `featureKey`, `createdAt`, and a `product` relation with `name`. The DB mock in `billing.routes.test.ts` currently has no `usageRecord` key — it must be added.

**Files:**
- Modify: `apps/mvp_api/src/modules/billing/billing.routes.ts`
- Modify: `apps/mvp_api/src/modules/billing/billing.routes.test.ts`

- [ ] **Step 1: Add `usageRecord` mock to the DB mock in the test file**

Locate the `mock.module("../../lib/db.js", ...)` call. Add two new mock functions near the top of the file (alongside the other mocks):

```typescript
const mockUsageRecordFindMany = mock(async () => [
  {
    featureKey: "pv-layout",
    createdAt: new Date("2026-04-22T10:00:00Z"),
    product: { name: "PV Layout Pro" },
  },
])
const mockUsageRecordCount = mock(async () => 1)
```

Then add `usageRecord` to the `db` object in the mock module:

```typescript
usageRecord: {
  findMany: mockUsageRecordFindMany,
  count: mockUsageRecordCount,
},
```

Also add resets to `beforeEach` blocks (add inside the nearest top-level `beforeEach`, or add a new one at the top of the file before all describe blocks):

```typescript
beforeEach(() => {
  mockUsageRecordFindMany.mockReset()
  mockUsageRecordCount.mockReset()
  mockUsageRecordFindMany.mockImplementation(async () => [
    {
      featureKey: "pv-layout",
      createdAt: new Date("2026-04-22T10:00:00Z"),
      product: { name: "PV Layout Pro" },
    },
  ])
  mockUsageRecordCount.mockImplementation(async () => 1)
})
```

- [ ] **Step 2: Write failing tests for `GET /billing/usage`**

Add a new `describe` block at the end of the test file:

```typescript
describe("GET /billing/usage", () => {
  it("returns paginated usage records for authenticated user", async () => {
    const app = makeApp()
    const res = await app.request("/billing/usage?page=1&pageSize=20", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        data: Array<{ featureKey: string; productName: string; createdAt: string }>
        pagination: { page: number; pageSize: number; total: number; totalPages: number }
      }
    }
    expect(body.success).toBe(true)
    expect(body.data.data).toHaveLength(1)
    expect(body.data.data[0]!.featureKey).toBe("pv-layout")
    expect(body.data.data[0]!.productName).toBe("PV Layout Pro")
    expect(body.data.data[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(body.data.pagination.page).toBe(1)
    expect(body.data.pagination.total).toBe(1)
    expect(body.data.pagination.totalPages).toBe(1)
  })

  it("returns empty data with pagination when no usage records", async () => {
    mockUsageRecordFindMany.mockImplementation(async () => [])
    mockUsageRecordCount.mockImplementation(async () => 0)
    const app = makeApp()
    const res = await app.request("/billing/usage", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        data: unknown[]
        pagination: { total: number; totalPages: number }
      }
    }
    expect(body.data.data).toHaveLength(0)
    expect(body.data.pagination.total).toBe(0)
    expect(body.data.pagination.totalPages).toBe(1)
  })

  it("defaults to page=1 pageSize=20 when params are omitted", async () => {
    const app = makeApp()
    await app.request("/billing/usage", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    const [findManyCall] = mockUsageRecordFindMany.mock.calls
    expect((findManyCall![0] as { skip: number; take: number }).skip).toBe(0)
    expect((findManyCall![0] as { skip: number; take: number }).take).toBe(20)
  })
})
```

- [ ] **Step 3: Run the new tests to verify they fail**

```bash
bunx turbo test --filter=mvp_api 2>&1 | tail -20
```

Expected: FAIL — route does not exist yet (404).

- [ ] **Step 4: Implement `GET /billing/usage` in `billing.routes.ts`**

Add this handler at the end of `billing.routes.ts`, after the `GET /billing/entitlements` handler:

```typescript
// GET /billing/usage
billingRoutes.get("/billing/usage", async (c) => {
  const user = c.get("user")
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10))
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(c.req.query("pageSize") ?? "20", 10)),
  )
  const skip = (page - 1) * pageSize

  const [records, total] = await Promise.all([
    db.usageRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: { product: { select: { name: true } } },
    }),
    db.usageRecord.count({ where: { userId: user.id } }),
  ])

  return c.json(
    ok({
      data: records.map((r) => ({
        featureKey: r.featureKey,
        productName: r.product.name,
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    }),
  )
})
```

- [ ] **Step 5: Run all billing tests**

```bash
bunx turbo test --filter=mvp_api 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 6: Run full gate from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_api/src/modules/billing/billing.routes.ts \
        apps/mvp_api/src/modules/billing/billing.routes.test.ts
git commit -m "feat(mvp-api): add GET /billing/usage endpoint with pagination"
```

---

## Task 3: Add TanStack Query hooks for billing data

**Context:** `apps/mvp_web` has `@tanstack/react-query` v5 installed, `QueryProvider` wraps the app, and `useAuth` from `@clerk/nextjs` provides `getToken`. The existing hook pattern is in `apps/mvp_admin/lib/hooks/use-admin-customers.ts` — follow the same pattern. There are no existing hooks in `mvp_web` (no `lib/` directory). Place hooks in `components/hooks/` to stay near the components that use them (the existing `download-card.tsx` is already in `components/`).

**Files:**
- Create: `apps/mvp_web/components/hooks/use-billing.ts`

- [ ] **Step 1: Create the hooks file**

```typescript
// apps/mvp_web/components/hooks/use-billing.ts
"use client"

import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@clerk/nextjs"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export type EntitlementState = "ACTIVE" | "EXHAUSTED" | "DEACTIVATED"

export type EntitlementItem = {
  id: string
  product: string
  productName: string
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
  purchasedAt: string
  deactivatedAt: string | null
  state: EntitlementState
}

export type EntitlementsData = {
  entitlements: EntitlementItem[]
  licenseKey: string | null
}

export type UsageRecord = {
  featureKey: string
  productName: string
  createdAt: string
}

export type UsagePagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type UsageData = {
  data: UsageRecord[]
  pagination: UsagePagination
}

export function useEntitlements() {
  const { getToken } = useAuth()
  return useQuery<EntitlementsData, Error>({
    queryKey: ["entitlements"],
    queryFn: async () => {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/billing/entitlements`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok)
        throw new Error(`Failed to fetch entitlements: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: EntitlementsData
      }
      return body.data
    },
  })
}

export function useUserUsage(page: number, pageSize: number) {
  const { getToken } = useAuth()
  return useQuery<UsageData, Error>({
    queryKey: ["user-usage", page, pageSize],
    queryFn: async () => {
      const token = await getToken()
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      const res = await fetch(`${MVP_API_URL}/billing/usage?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to fetch usage: ${res.status}`)
      const body = (await res.json()) as {
        success: boolean
        data: UsageData
      }
      return body.data
    },
  })
}
```

- [ ] **Step 2: Run typecheck to verify the file compiles cleanly**

```bash
bunx turbo typecheck --filter=mvp_web 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_web/components/hooks/use-billing.ts
git commit -m "feat(mvp-web): add useEntitlements and useUserUsage TanStack Query hooks"
```

---

## Task 4: Update sidebar — 3 nav items, remove License and Plan

**Context:** `apps/mvp_web/components/dashboard-sidebar.tsx` has a `navItems` array with 4 items: Dashboard, Plan, Usage, License. Replace it with 3 items: Dashboard, Plans, Usage. Import `Key` is unused after this change and should be removed.

**Files:**
- Modify: `apps/mvp_web/components/dashboard-sidebar.tsx`

- [ ] **Step 1: Update the navItems array**

Replace the existing `navItems` declaration:

```typescript
// OLD
const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Plan", href: "/dashboard/plan", icon: CreditCard },
  { label: "Usage", href: "/dashboard/usage", icon: BarChart3 },
  { label: "License", href: "/dashboard/license", icon: Key },
]
```

With:

```typescript
// NEW
const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Plans", href: "/dashboard/plans", icon: CreditCard },
  { label: "Usage", href: "/dashboard/usage", icon: BarChart3 },
]
```

- [ ] **Step 2: Remove unused `Key` import**

In the import from `lucide-react`, remove `Key` from the list. The new import line is:

```typescript
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  LogOut,
  ChevronsUpDown,
  Sun,
} from "lucide-react"
```

- [ ] **Step 3: Run typecheck**

```bash
bunx turbo typecheck --filter=mvp_web 2>&1 | tail -10
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_web/components/dashboard-sidebar.tsx
git commit -m "feat(mvp-web): sidebar — 3 nav items, remove License, rename Plan to Plans"
```

---

## Task 5: Create Plans page + delete plan folder

**Context:** `apps/mvp_web/app/(main)/dashboard/plan/page.tsx` contains the full purchase + entitlements page. We migrate it to `plans/page.tsx` with three changes: (1) remove the license key section, (2) show all entitlements (not just active) including EXHAUSTED and DEACTIVATED with state badges, (3) fix `router.replace("/dashboard/plan")` to `router.replace("/dashboard/plans")`. The page still fetches products separately (no hook needed — the existing inline fetch pattern is fine for this single use). Use `useEntitlements()` from Task 3 instead of manual fetch.

**Files:**
- Create: `apps/mvp_web/app/(main)/dashboard/plans/page.tsx`
- Delete: `apps/mvp_web/app/(main)/dashboard/plan/page.tsx` (and the `plan/` folder)

- [ ] **Step 1: Create `apps/mvp_web/app/(main)/dashboard/plans/page.tsx`**

```typescript
"use client"

import { Suspense, useEffect, useState, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { Check, Loader2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renewable-energy/ui/components/table"
import { toast } from "sonner"
import { useEntitlements } from "@/components/hooks/use-billing"

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

export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PlansPageInner />
    </Suspense>
  )
}

function PlansPageInner() {
  const { getToken } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const hasVerified = useRef(false)

  const {
    data: entData,
    isLoading: entLoading,
    refetch: refetchEntitlements,
  } = useEntitlements()

  const sessionId = searchParams.get("session_id")

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${MVP_API_URL}/products`)
        if (res.ok) {
          const data = (await res.json()) as {
            success: boolean
            data: { products: Product[] }
          }
          if (data.success) setProducts(data.data.products)
        }
      } catch (err) {
        console.error("Failed to load products:", err)
      } finally {
        setProductsLoading(false)
      }
    }
    load()
  }, [])

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
        const data = (await res.json()) as {
          success: boolean
          data: { verified: boolean }
        }
        if (data.success && data.data.verified) {
          toast.success(
            "Purchase successful! Your entitlement has been activated.",
          )
          await refetchEntitlements()
        }
      } catch (err) {
        console.error("Session verification failed:", err)
      }
      router.replace("/dashboard/plans")
    }
    verify()
  }, [sessionId, getToken, router, refetchEntitlements])

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
      const data = (await res.json()) as {
        success: boolean
        data: { url: string }
      }
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

  const stateBadge = (state: "ACTIVE" | "EXHAUSTED" | "DEACTIVATED") => {
    if (state === "ACTIVE")
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
          Active
        </Badge>
      )
    if (state === "EXHAUSTED")
      return (
        <Badge variant="secondary" className="text-muted-foreground">
          Exhausted
        </Badge>
      )
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        Deactivated
      </Badge>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Plans
        </h1>
        <p className="mt-1 text-muted-foreground">
          Purchase calculation packs and view your purchase history.
        </p>
      </div>

      {/* Buy section */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          Buy Calculations
        </h2>
        {productsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
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
                        <Check className="h-4 w-4 shrink-0 text-green-600" />
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
        )}
      </div>

      {/* Purchase history */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          Your Purchases
        </h2>
        {entLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !entData || entData.entitlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No purchases yet. Buy a pack above to get started.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entData.entitlements.map((ent) => (
                  <TableRow
                    key={ent.id}
                    className={
                      ent.state !== "ACTIVE" ? "opacity-60" : undefined
                    }
                  >
                    <TableCell>{ent.productName}</TableCell>
                    <TableCell>
                      {new Date(ent.purchasedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{ent.totalCalculations}</TableCell>
                    <TableCell>{ent.usedCalculations}</TableCell>
                    <TableCell>{ent.remainingCalculations}</TableCell>
                    <TableCell>{stateBadge(ent.state)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the old `plan` folder**

```bash
rm -rf apps/mvp_web/app/\(main\)/dashboard/plan
```

- [ ] **Step 3: Run typecheck**

```bash
bunx turbo typecheck --filter=mvp_web 2>&1 | tail -10
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_web/app/\(main\)/dashboard/plans/page.tsx
git rm -r apps/mvp_web/app/\(main\)/dashboard/plan/
git commit -m "feat(mvp-web): create Plans page with all entitlements; delete old plan page"
```

---

## Task 6: Rewrite Dashboard home page

**Context:** The current `app/(main)/dashboard/page.tsx` is a per-product download page with hardcoded product slugs. It needs to become a true dashboard: stat cards, license key card, download card, recent activity. It uses `useEntitlements()` and `useUserUsage(1, 5)`. The existing `page.test.tsx` has tests that test the old page ("renders three download cards") — they must be replaced entirely with tests for the new page. The `DownloadCard` component is no longer needed here but keep it in `components/` since it may still be used elsewhere.

**Files:**
- Modify: `apps/mvp_web/app/(main)/dashboard/page.tsx`
- Modify: `apps/mvp_web/app/(main)/dashboard/page.test.tsx`

- [ ] **Step 1: Write failing tests for the new dashboard page**

Replace the entire contents of `apps/mvp_web/app/(main)/dashboard/page.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/hooks/use-billing", () => ({
  useEntitlements: vi.fn(),
  useUserUsage: vi.fn(),
}))

import { useEntitlements, useUserUsage } from "@/components/hooks/use-billing"
import DashboardPage from "./page"

const mockUseEntitlements = vi.mocked(useEntitlements)
const mockUseUserUsage = vi.mocked(useUserUsage)

describe("Dashboard home page", () => {
  beforeEach(() => {
    mockUseEntitlements.mockReturnValue({
      data: { entitlements: [], licenseKey: null },
      isLoading: false,
      error: null,
    } as never)
    mockUseUserUsage.mockReturnValue({
      data: { data: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 1 } },
      isLoading: false,
      error: null,
    } as never)
  })

  it("renders Dashboard heading", () => {
    render(<DashboardPage />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard")
  })

  it("shows Remaining Calculations stat card", () => {
    mockUseEntitlements.mockReturnValue({
      data: {
        entitlements: [
          {
            id: "ent1",
            product: "pv-layout-pro",
            productName: "PV Layout Pro",
            totalCalculations: 10,
            usedCalculations: 3,
            remainingCalculations: 7,
            purchasedAt: "2026-04-22T00:00:00.000Z",
            deactivatedAt: null,
            state: "ACTIVE" as const,
          },
        ],
        licenseKey: "sl_live_abcdefgh1234",
      },
      isLoading: false,
      error: null,
    } as never)
    render(<DashboardPage />)
    expect(screen.getByText("Remaining Calculations")).toBeInTheDocument()
    expect(screen.getByText("7")).toBeInTheDocument()
  })

  it("shows purchase prompt when no license key", () => {
    render(<DashboardPage />)
    expect(screen.getByText(/Purchase a plan/i)).toBeInTheDocument()
  })

  it("shows masked license key when available", () => {
    mockUseEntitlements.mockReturnValue({
      data: {
        entitlements: [],
        licenseKey: "sl_live_abcdefghijklmnop",
      },
      isLoading: false,
      error: null,
    } as never)
    render(<DashboardPage />)
    expect(screen.getByText("sl_live_...")).toBeInTheDocument()
  })

  it("shows empty state in recent activity when no records", () => {
    render(<DashboardPage />)
    expect(screen.getByText(/No calculations run yet/i)).toBeInTheDocument()
  })

  it("shows usage records in recent activity table", () => {
    mockUseUserUsage.mockReturnValue({
      data: {
        data: [
          { featureKey: "pv-layout", productName: "PV Layout Pro", createdAt: "2026-04-22T10:00:00Z" },
        ],
        pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
      },
      isLoading: false,
      error: null,
    } as never)
    render(<DashboardPage />)
    expect(screen.getByText("pv-layout")).toBeInTheDocument()
    expect(screen.getByText("PV Layout Pro")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bunx turbo test --filter=mvp_web 2>&1 | tail -20
```

Expected: FAIL — old page renders three download cards, not a Dashboard heading.

- [ ] **Step 3: Rewrite `apps/mvp_web/app/(main)/dashboard/page.tsx`**

```typescript
"use client"

import { useState } from "react"
import Link from "next/link"
import { Copy, CheckCheck, Download, Loader2, ArrowRight } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { useEntitlements, useUserUsage } from "@/components/hooks/use-billing"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renewable-energy/ui/components/table"
import { toast } from "sonner"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export default function DashboardPage() {
  const { getToken } = useAuth()
  const {
    data: entData,
    isLoading: entLoading,
    error: entError,
  } = useEntitlements()
  const {
    data: usageData,
    isLoading: usageLoading,
    error: usageError,
  } = useUserUsage(1, 5)

  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const activeEntitlements =
    entData?.entitlements.filter((e) => e.state === "ACTIVE") ?? []
  const remainingCalcs = activeEntitlements.reduce(
    (sum, e) => sum + e.remainingCalculations,
    0,
  )
  const activeCount = activeEntitlements.length
  const licenseKey = entData?.licenseKey ?? null
  const maskedKey = licenseKey ? `${licenseKey.slice(0, 8)}...` : null
  const firstActiveSlug = activeEntitlements[0]?.product ?? null

  async function copyKey() {
    if (!licenseKey) return
    await navigator.clipboard.writeText(licenseKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDownload() {
    if (!firstActiveSlug) return
    setDownloading(true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/dashboard/download/${firstActiveSlug}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        toast.error("Download failed. Please try again.")
        return
      }
      const body = (await res.json()) as { data: { url: string } }
      window.location.href = body.data.url
    } catch {
      toast.error("Download failed. Please try again.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your SolarLayout account.
        </p>
      </div>

      {/* Stat cards */}
      {entError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {entError.message}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              Remaining Calculations
            </p>
            {entLoading ? (
              <Skeleton className="mt-1 h-8 w-20" />
            ) : (
              <p className="mt-1 text-2xl font-semibold">{remainingCalcs}</p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Active Entitlements</p>
            {entLoading ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-semibold">{activeCount}</p>
            )}
          </div>
        </div>
      )}

      {/* License Key + Download */}
      {!entError && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Your License Key
            </p>
            {entLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : maskedKey ? (
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-sm font-mono">
                  {maskedKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
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
            ) : (
              <p className="text-sm text-muted-foreground">
                <Link
                  href="/dashboard/plans"
                  className="text-primary underline underline-offset-4"
                >
                  Purchase a plan
                </Link>{" "}
                to get your license key.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Download SolarLayout
            </p>
            {entLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <>
                <Button
                  className="w-full"
                  disabled={!firstActiveSlug || downloading}
                  onClick={handleDownload}
                  title={
                    !firstActiveSlug
                      ? "Purchase a plan to download"
                      : undefined
                  }
                >
                  {downloading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download Desktop App
                    </>
                  )}
                </Button>
                {!firstActiveSlug && (
                  <p className="text-xs text-muted-foreground">
                    Purchase a plan to download.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Recent Activity</h2>
          <Link
            href="/dashboard/usage"
            className="flex items-center gap-1 text-xs text-primary"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {usageError ? (
          <div className="p-4 text-sm text-destructive">
            {usageError.message}
          </div>
        ) : usageLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !usageData || usageData.data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No calculations run yet. Download the app to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usageData.data.map((record, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">
                    {record.featureKey}
                  </TableCell>
                  <TableCell>{record.productName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(record.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
bunx turbo test --filter=mvp_web 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: Run full gate**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_web/app/\(main\)/dashboard/page.tsx \
        apps/mvp_web/app/\(main\)/dashboard/page.test.tsx
git commit -m "feat(mvp-web): rewrite dashboard home — stat cards, license key, download, recent activity"
```

---

## Task 7: Implement Usage page (replace stub)

**Context:** `apps/mvp_web/app/(main)/dashboard/usage/page.tsx` is currently a server component stub with "Coming soon" text. Replace it entirely with a client component that uses `useUserUsage()` and URL-based pagination (`?page=N`). Must wrap the inner component in `<Suspense>` because it calls `useSearchParams()`.

**Files:**
- Modify: `apps/mvp_web/app/(main)/dashboard/usage/page.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
"use client"

import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useUserUsage } from "@/components/hooks/use-billing"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renewable-energy/ui/components/table"

export default function UsagePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <UsagePageInner />
    </Suspense>
  )
}

function UsagePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const { data, isLoading, error } = useUserUsage(page, 20)

  function goToPage(p: number) {
    router.push(`/dashboard/usage?page=${p}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Usage History
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {!isLoading && `${data?.pagination.total ?? 0} total records`}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {error ? (
          <div className="p-4 text-sm text-destructive">{error.message}</div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No calculations recorded yet. Download the app and run your first
            layout.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((record, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">
                    {record.featureKey}
                  </TableCell>
                  <TableCell>{record.productName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(record.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            ← Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pagination.totalPages}
            onClick={() => goToPage(page + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
bunx turbo typecheck --filter=mvp_web 2>&1 | tail -10
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_web/app/\(main\)/dashboard/usage/page.tsx
git commit -m "feat(mvp-web): implement Usage page with paginated history"
```

---

## Task 8: Delete License page

**Context:** `apps/mvp_web/app/(main)/dashboard/license/` contains `page.tsx` and `page.test.tsx`. The license key is now shown on the Dashboard. Delete the entire folder. No other file references it after the sidebar was updated in Task 4.

**Files:**
- Delete: `apps/mvp_web/app/(main)/dashboard/license/` (entire folder)

- [ ] **Step 1: Verify no remaining references to /dashboard/license**

```bash
grep -r "dashboard/license" apps/mvp_web --include="*.tsx" --include="*.ts"
```

Expected: No output (sidebar was already updated in Task 4).

- [ ] **Step 2: Delete the folder**

```bash
rm -rf "apps/mvp_web/app/(main)/dashboard/license"
```

- [ ] **Step 3: Run full gate from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git rm -r "apps/mvp_web/app/(main)/dashboard/license/"
git commit -m "feat(mvp-web): delete License page — license key now shown on Dashboard"
```

---

## Self-Review Checklist

After all tasks are complete, verify against the spec:

- [ ] `GET /billing/entitlements` returns all states (ACTIVE, EXHAUSTED, DEACTIVATED) with `state` field
- [ ] `GET /billing/usage` exists, requires Clerk auth, returns paginated records
- [ ] Stripe `success_url` points to `/dashboard/plans`
- [ ] Sidebar has exactly 3 items: Dashboard, Plans, Usage
- [ ] Dashboard: stat cards (remaining calcs, active entitlements), license key card, download card, recent activity (last 5)
- [ ] Plans: buy section + all entitlements with state badges, no license key card
- [ ] Usage: paginated table with `?page=N` URL param, empty state message
- [ ] License page folder deleted
- [ ] Plan page folder deleted
- [ ] All gates pass: `bun run lint && bun run typecheck && bun run test && bun run build`
