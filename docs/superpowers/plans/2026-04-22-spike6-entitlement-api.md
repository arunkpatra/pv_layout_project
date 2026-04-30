# Spike 6: Entitlement API + License Key Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose entitlements and usage reporting to Prasanta's Python desktop apps via license-key-authenticated API endpoints.

**Architecture:** New `licenseKeyAuth` middleware (mirrors `clerkAuth`) validates `sl_live_...` Bearer tokens. Entitlement and usage routes are in separate modules. Pool selection logic (cheapest-first) and atomic decrement live in the usage service. A new `UsageRecord` Prisma model records every billable event.

**Tech Stack:** Hono v4, Bun, Prisma (interactive transactions + `$executeRaw`), Zod, bun:test

**Design spec:** `docs/superpowers/specs/2026-04-22-spike6-entitlement-api-design.md`

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Modify | `packages/mvp_db/prisma/schema.prisma` | Add `UsageRecord` model + back-relations |
| Modify | `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts` | Add `UsageRecord: "ur"` prefix |
| Modify | `apps/mvp_api/src/middleware/error-handler.ts` | Add `licenseKey` to `MvpHonoEnv.Variables` |
| Create | `apps/mvp_api/src/middleware/license-key-auth.ts` | License key Bearer token middleware |
| Create | `apps/mvp_api/src/middleware/license-key-auth.test.ts` | Tests for above |
| Create | `apps/mvp_api/src/modules/entitlements/entitlements.service.ts` | `computeEntitlementSummary()` |
| Create | `apps/mvp_api/src/modules/entitlements/entitlements.routes.ts` | `GET /entitlements`, `GET /usage/history` |
| Create | `apps/mvp_api/src/modules/entitlements/entitlements.test.ts` | Tests for above |
| Create | `apps/mvp_api/src/modules/usage/usage.service.ts` | Pool selection + atomic decrement |
| Create | `apps/mvp_api/src/modules/usage/usage.routes.ts` | `POST /usage/report` |
| Create | `apps/mvp_api/src/modules/usage/usage.test.ts` | Tests for above |
| Modify | `apps/mvp_api/src/app.ts` | Mount entitlements + usage routes |

---

## Task 1: Prisma Schema — UsageRecord Model + Migration

**Files:**
- Modify: `packages/mvp_db/prisma/schema.prisma`
- Modify: `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`

- [ ] **Step 1: Add `UsageRecord` model and back-relations to schema**

Open `packages/mvp_db/prisma/schema.prisma`. Add after the `CheckoutSession` model:

```prisma
model UsageRecord {
  id           String     @id @default("")
  userId       String
  user         User       @relation(fields: [userId], references: [id])
  licenseKeyId String
  licenseKey   LicenseKey @relation(fields: [licenseKeyId], references: [id])
  productId    String
  product      Product    @relation(fields: [productId], references: [id])
  featureKey   String
  metadata     Json?
  createdAt    DateTime   @default(now())

  @@map("usage_records")
}
```

Then add back-relations. In the `User` model add:
```prisma
  usageRecords     UsageRecord[]
```

In the `LicenseKey` model add:
```prisma
  usageRecords UsageRecord[]
```

In the `Product` model add:
```prisma
  usageRecords UsageRecord[]
```

- [ ] **Step 2: Register the `UsageRecord` ID prefix**

Open `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`. Add one entry:

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
  UsageRecord: "ur",   // ← add this line
}
```

- [ ] **Step 3: Regenerate Prisma client and run migration**

```bash
bun run db:generate && bun run db:migrate
```

Expected: migration file created in `packages/mvp_db/prisma/migrations/`, Prisma client regenerated with `UsageRecord` type.

- [ ] **Step 4: Commit**

```bash
git add packages/mvp_db/prisma/schema.prisma \
        packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts \
        packages/mvp_db/prisma/migrations/
git commit -m "feat(mvp-db): add UsageRecord model and ur_ ID prefix"
```

---

## Task 2: `licenseKeyAuth` Middleware (TDD)

**Files:**
- Modify: `apps/mvp_api/src/middleware/error-handler.ts`
- Create: `apps/mvp_api/src/middleware/license-key-auth.test.ts`
- Create: `apps/mvp_api/src/middleware/license-key-auth.ts`

- [ ] **Step 1: Extend `MvpHonoEnv` with `licenseKey`**

Open `apps/mvp_api/src/middleware/error-handler.ts`. Replace the `MvpHonoEnv` type:

```ts
export type MvpHonoEnv = {
  Variables: {
    user: { id: string; clerkId: string; email: string; name: string | null; stripeCustomerId: string | null }
    licenseKey?: { id: string; key: string; userId: string; createdAt: Date; revokedAt: Date | null }
  }
}
```

- [ ] **Step 2: Write failing tests**

Create `apps/mvp_api/src/middleware/license-key-auth.test.ts`:

```ts
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "./error-handler.js"

const mockLicenseKeyFindFirst = mock(async () => ({
  id: "lk_test1",
  key: "sl_live_testkey",
  userId: "usr_test1",
  createdAt: new Date(),
  revokedAt: null,
  user: {
    id: "usr_test1",
    clerkId: "clerk_abc",
    email: "test@example.com",
    name: "Test User",
    stripeCustomerId: null,
  },
}))

mock.module("../lib/db.js", () => ({
  db: { licenseKey: { findFirst: mockLicenseKeyFindFirst } },
}))

const { licenseKeyAuth } = await import("./license-key-auth.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.use("/protected", licenseKeyAuth)
  app.get("/protected", (c) => {
    const user = c.get("user")
    const licenseKey = c.get("licenseKey")
    return c.json({ ok: true, userId: user.id, keyId: licenseKey?.id })
  })
  app.onError(errorHandler)
  return app
}

describe("licenseKeyAuth middleware", () => {
  beforeEach(() => {
    mockLicenseKeyFindFirst.mockReset()
    mockLicenseKeyFindFirst.mockImplementation(async () => ({
      id: "lk_test1",
      key: "sl_live_testkey",
      userId: "usr_test1",
      createdAt: new Date(),
      revokedAt: null,
      user: {
        id: "usr_test1",
        clerkId: "clerk_abc",
        email: "test@example.com",
        name: "Test User",
        stripeCustomerId: null,
      },
    }))
  })

  it("returns 401 when Authorization header is missing", async () => {
    const app = makeApp()
    const res = await app.request("/protected", { method: "GET" })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it("returns 401 when header is malformed (no Bearer prefix)", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "sl_live_testkey" },
    })
    expect(res.status).toBe(401)
  })

  it("returns 401 when key is not found", async () => {
    mockLicenseKeyFindFirst.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer sl_live_unknown" },
    })
    expect(res.status).toBe(401)
  })

  it("returns 401 when key is revoked (findFirst with revokedAt:null returns nothing)", async () => {
    mockLicenseKeyFindFirst.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer sl_live_revoked" },
    })
    expect(res.status).toBe(401)
  })

  it("passes through, sets user and licenseKey on context when key is valid", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; userId: string; keyId: string }
    expect(body.ok).toBe(true)
    expect(body.userId).toBe("usr_test1")
    expect(body.keyId).toBe("lk_test1")
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api 2>&1 | grep -A 5 "licenseKeyAuth"
```

Expected: import error or test failure (file does not exist yet).

- [ ] **Step 4: Implement the middleware**

Create `apps/mvp_api/src/middleware/license-key-auth.ts`:

```ts
import type { MiddlewareHandler } from "hono"
import { AppError } from "../lib/errors.js"
import { db } from "../lib/db.js"

export const licenseKeyAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined

  if (!token) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401)
  }

  const licenseKey = await db.licenseKey.findFirst({
    where: { key: token, revokedAt: null },
    include: { user: true },
  })

  if (!licenseKey) {
    throw new AppError("UNAUTHORIZED", "Invalid or revoked license key", 401)
  }

  c.set("user", licenseKey.user)
  c.set("licenseKey", licenseKey)
  await next()
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api 2>&1 | grep -A 5 "licenseKeyAuth"
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_api/src/middleware/error-handler.ts \
        apps/mvp_api/src/middleware/license-key-auth.ts \
        apps/mvp_api/src/middleware/license-key-auth.test.ts
git commit -m "feat(mvp-api): add licenseKeyAuth middleware for sl_live_ Bearer tokens"
```

---

## Task 3: GET /entitlements + GET /usage/history (TDD)

**Files:**
- Create: `apps/mvp_api/src/modules/entitlements/entitlements.test.ts`
- Create: `apps/mvp_api/src/modules/entitlements/entitlements.service.ts`
- Create: `apps/mvp_api/src/modules/entitlements/entitlements.routes.ts`
- Modify: `apps/mvp_api/src/app.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/mvp_api/src/modules/entitlements/entitlements.test.ts`:

```ts
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

const mockUser = {
  id: "usr_test1",
  clerkId: "clerk_abc",
  email: "test@example.com",
  name: "Test User",
  stripeCustomerId: null,
}

const mockLicenseKey = {
  id: "lk_test1",
  key: "sl_live_testkey",
  userId: "usr_test1",
  createdAt: new Date(),
  revokedAt: null,
}

mock.module("../../middleware/license-key-auth.js", () => ({
  licenseKeyAuth: async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set("user", mockUser)
    c.set("licenseKey", mockLicenseKey)
    return next()
  },
}))

const mockEntitlementFindMany = mock(async () => [
  {
    id: "ent_test1",
    userId: "usr_test1",
    productId: "prod_pro",
    totalCalculations: 10,
    usedCalculations: 3,
    purchasedAt: new Date(),
    product: {
      name: "PV Layout Pro",
      displayOrder: 2,
      features: [
        { featureKey: "plant_layout", label: "Plant Layout" },
        { featureKey: "cable_routing", label: "Cable Routing" },
      ],
    },
  },
])

const mockUsageRecordFindMany = mock(async () => [
  {
    featureKey: "plant_layout",
    createdAt: new Date("2026-04-22T10:00:00Z"),
    product: { name: "PV Layout Pro" },
  },
])

mock.module("../../lib/db.js", () => ({
  db: {
    entitlement: { findMany: mockEntitlementFindMany },
    usageRecord: { findMany: mockUsageRecordFindMany },
  },
}))

const { entitlementsRoutes } = await import("./entitlements.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", entitlementsRoutes)
  app.onError(errorHandler)
  return app
}

describe("GET /entitlements", () => {
  beforeEach(() => {
    mockEntitlementFindMany.mockReset()
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_test1",
        userId: "usr_test1",
        productId: "prod_pro",
        totalCalculations: 10,
        usedCalculations: 3,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Pro",
          displayOrder: 2,
          features: [
            { featureKey: "plant_layout", label: "Plant Layout" },
            { featureKey: "cable_routing", label: "Cable Routing" },
          ],
        },
      },
    ])
  })

  it("returns licensed true with features and counts", async () => {
    const app = makeApp()
    const res = await app.request("/entitlements", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        licensed: boolean
        availableFeatures: string[]
        totalCalculations: number
        usedCalculations: number
        remainingCalculations: number
      }
    }
    expect(body.success).toBe(true)
    expect(body.data.licensed).toBe(true)
    expect(body.data.availableFeatures).toContain("plant_layout")
    expect(body.data.availableFeatures).toContain("cable_routing")
    expect(body.data.totalCalculations).toBe(10)
    expect(body.data.usedCalculations).toBe(3)
    expect(body.data.remainingCalculations).toBe(7)
  })

  it("returns licensed false when all calculations exhausted", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_test1",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 5,
        usedCalculations: 5,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Basic",
          displayOrder: 1,
          features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
        },
      },
    ])
    const app = makeApp()
    const res = await app.request("/entitlements", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { licensed: boolean; availableFeatures: string[] }
    }
    expect(body.data.licensed).toBe(false)
    expect(body.data.availableFeatures).toHaveLength(0)
  })

  it("returns licensed false when no entitlements", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [] as never)
    const app = makeApp()
    const res = await app.request("/entitlements", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { licensed: boolean }
    }
    expect(body.data.licensed).toBe(false)
  })

  it("computes feature union and sums counts across multiple entitlements", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_basic",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 3,
        usedCalculations: 1,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Basic",
          displayOrder: 1,
          features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
        },
      },
      {
        id: "ent_pro",
        userId: "usr_test1",
        productId: "prod_pro",
        totalCalculations: 10,
        usedCalculations: 2,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Pro",
          displayOrder: 2,
          features: [
            { featureKey: "plant_layout", label: "Plant Layout" },
            { featureKey: "cable_routing", label: "Cable Routing" },
          ],
        },
      },
    ])
    const app = makeApp()
    const res = await app.request("/entitlements", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { availableFeatures: string[]; totalCalculations: number; remainingCalculations: number }
    }
    expect(body.data.availableFeatures).toContain("plant_layout")
    expect(body.data.availableFeatures).toContain("cable_routing")
    // plant_layout appears in both products but union deduplicates
    expect(body.data.availableFeatures.filter((f) => f === "plant_layout")).toHaveLength(1)
    expect(body.data.totalCalculations).toBe(13)
    expect(body.data.remainingCalculations).toBe(10)
  })
})

describe("GET /usage/history", () => {
  it("returns usage records with feature and product name", async () => {
    const app = makeApp()
    const res = await app.request("/usage/history", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { records: { featureKey: string; productName: string; createdAt: string }[] }
    }
    expect(body.success).toBe(true)
    expect(body.data.records).toHaveLength(1)
    expect(body.data.records[0]!.featureKey).toBe("plant_layout")
    expect(body.data.records[0]!.productName).toBe("PV Layout Pro")
    expect(body.data.records[0]!.createdAt).toBe("2026-04-22T10:00:00.000Z")
  })

  it("returns empty array when no usage history", async () => {
    mockUsageRecordFindMany.mockImplementation(async () => [] as never)
    const app = makeApp()
    const res = await app.request("/usage/history", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { records: unknown[] }
    }
    expect(body.data.records).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api 2>&1 | grep -E "entitlements|FAIL|Cannot find"
```

Expected: module import error (files don't exist yet).

- [ ] **Step 3: Implement the entitlements service**

Create `apps/mvp_api/src/modules/entitlements/entitlements.service.ts`:

```ts
import { db } from "../../lib/db.js"

export interface EntitlementSummary {
  licensed: boolean
  availableFeatures: string[]
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
}

export async function computeEntitlementSummary(
  userId: string,
): Promise<EntitlementSummary> {
  const entitlements = await db.entitlement.findMany({
    where: { userId },
    include: {
      product: {
        include: { features: true },
      },
    },
  })

  const totalCalculations = entitlements.reduce(
    (sum, e) => sum + e.totalCalculations,
    0,
  )
  const usedCalculations = entitlements.reduce(
    (sum, e) => sum + e.usedCalculations,
    0,
  )
  const remainingCalculations = totalCalculations - usedCalculations

  const featureSet = new Set<string>()
  for (const e of entitlements) {
    if (e.totalCalculations - e.usedCalculations > 0) {
      for (const f of e.product.features) {
        featureSet.add(f.featureKey)
      }
    }
  }

  return {
    licensed: remainingCalculations > 0,
    availableFeatures: Array.from(featureSet),
    totalCalculations,
    usedCalculations,
    remainingCalculations,
  }
}
```

- [ ] **Step 4: Implement the entitlements routes**

Create `apps/mvp_api/src/modules/entitlements/entitlements.routes.ts`:

```ts
import { Hono } from "hono"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { db } from "../../lib/db.js"
import { ok } from "../../lib/response.js"
import { computeEntitlementSummary } from "./entitlements.service.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const entitlementsRoutes = new Hono<MvpHonoEnv>()

entitlementsRoutes.use("/entitlements", licenseKeyAuth)
entitlementsRoutes.use("/usage/history", licenseKeyAuth)

entitlementsRoutes.get("/entitlements", async (c) => {
  const user = c.get("user")
  const summary = await computeEntitlementSummary(user.id)
  return c.json(ok(summary))
})

entitlementsRoutes.get("/usage/history", async (c) => {
  const user = c.get("user")
  const records = await db.usageRecord.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      product: { select: { name: true } },
    },
  })

  return c.json(
    ok({
      records: records.map((r) => ({
        featureKey: r.featureKey,
        productName: r.product.name,
        createdAt: r.createdAt.toISOString(),
      })),
    }),
  )
})
```

- [ ] **Step 5: Mount entitlements routes in `app.ts`**

Open `apps/mvp_api/src/app.ts`. Add the import:

```ts
import { entitlementsRoutes } from "./modules/entitlements/entitlements.routes.js"
```

Add the route mounting (after the existing `app.route("/", stripeWebhookRoutes)` line):

```ts
app.route("/", entitlementsRoutes)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api 2>&1 | grep -E "entitlements|✓|✗"
```

Expected: all entitlements tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_api/src/modules/entitlements/ \
        apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): add GET /entitlements and GET /usage/history routes"
```

---

## Task 4: POST /usage/report (TDD)

**Files:**
- Create: `apps/mvp_api/src/modules/usage/usage.test.ts`
- Create: `apps/mvp_api/src/modules/usage/usage.service.ts`
- Create: `apps/mvp_api/src/modules/usage/usage.routes.ts`
- Modify: `apps/mvp_api/src/app.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/mvp_api/src/modules/usage/usage.test.ts`:

```ts
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { AppError } from "../../lib/errors.js"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

const mockUser = {
  id: "usr_test1",
  clerkId: "clerk_abc",
  email: "test@example.com",
  name: "Test User",
  stripeCustomerId: null,
}

const mockLicenseKey = {
  id: "lk_test1",
  key: "sl_live_testkey",
  userId: "usr_test1",
  createdAt: new Date(),
  revokedAt: null,
}

mock.module("../../middleware/license-key-auth.js", () => ({
  licenseKeyAuth: async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set("user", mockUser)
    c.set("licenseKey", mockLicenseKey)
    return next()
  },
}))

const mockProductFeatureFindFirst = mock(async () => ({
  id: "pf_test1",
  featureKey: "plant_layout",
  label: "Plant Layout",
  productId: "prod_basic",
}))

const mockEntitlementFindMany = mock(async () => [
  {
    id: "ent_basic",
    userId: "usr_test1",
    productId: "prod_basic",
    totalCalculations: 5,
    usedCalculations: 2,
    purchasedAt: new Date(),
    product: {
      name: "PV Layout Basic",
      displayOrder: 1,
      features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
    },
  },
])

const mockExecuteRaw = mock(async () => 1)
const mockUsageRecordCreate = mock(async () => ({}))
const mockTransaction = mock(
  async (fn: (tx: {
    $executeRaw: typeof mockExecuteRaw
    usageRecord: { create: typeof mockUsageRecordCreate }
  }) => Promise<void>) => {
    return fn({ $executeRaw: mockExecuteRaw, usageRecord: { create: mockUsageRecordCreate } })
  },
)

mock.module("../../lib/db.js", () => ({
  db: {
    productFeature: { findFirst: mockProductFeatureFindFirst },
    entitlement: { findMany: mockEntitlementFindMany },
    $transaction: mockTransaction,
  },
}))

const { usageRoutes } = await import("./usage.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", usageRoutes)
  app.onError(errorHandler)
  return app
}

describe("POST /usage/report", () => {
  beforeEach(() => {
    mockProductFeatureFindFirst.mockReset()
    mockProductFeatureFindFirst.mockImplementation(async () => ({
      id: "pf_test1",
      featureKey: "plant_layout",
      label: "Plant Layout",
      productId: "prod_basic",
    }))
    mockEntitlementFindMany.mockReset()
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_basic",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 5,
        usedCalculations: 2,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Basic",
          displayOrder: 1,
          features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
        },
      },
    ])
    mockExecuteRaw.mockReset()
    mockExecuteRaw.mockImplementation(async () => 1)
    mockUsageRecordCreate.mockReset()
    mockUsageRecordCreate.mockImplementation(async () => ({}))
    mockTransaction.mockReset()
    mockTransaction.mockImplementation(
      async (fn: (tx: {
        $executeRaw: typeof mockExecuteRaw
        usageRecord: { create: typeof mockUsageRecordCreate }
      }) => Promise<void>) => {
        return fn({ $executeRaw: mockExecuteRaw, usageRecord: { create: mockUsageRecordCreate } })
      },
    )
  })

  it("returns 400 for unknown feature key", async () => {
    mockProductFeatureFindFirst.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer sl_live_testkey" },
      body: JSON.stringify({ feature: "nonexistent_feature" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean; error: { code: string } }
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  it("returns 402 when no entitlements cover the feature", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [] as never)
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer sl_live_testkey" },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    expect(res.status).toBe(402)
    const body = (await res.json()) as { success: boolean; error: { code: string } }
    expect(body.error.code).toBe("PAYMENT_REQUIRED")
  })

  it("returns 402 when matching entitlement is exhausted", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_basic",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 5,
        usedCalculations: 5,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Basic",
          displayOrder: 1,
          features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
        },
      },
    ])
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer sl_live_testkey" },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    expect(res.status).toBe(402)
  })

  it("returns 409 on concurrent decrement race (executeRaw returns 0)", async () => {
    mockExecuteRaw.mockImplementation(async () => 0)
    mockTransaction.mockImplementation(
      async (fn: (tx: {
        $executeRaw: typeof mockExecuteRaw
        usageRecord: { create: typeof mockUsageRecordCreate }
      }) => Promise<void>) => {
        return fn({ $executeRaw: mockExecuteRaw, usageRecord: { create: mockUsageRecordCreate } })
      },
    )
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer sl_live_testkey" },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { success: boolean; error: { code: string } }
    expect(body.error.code).toBe("CONFLICT")
  })

  it("records usage and returns 200 with updated remaining count", async () => {
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer sl_live_testkey" },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { recorded: boolean; remainingCalculations: number }
    }
    expect(body.success).toBe(true)
    expect(body.data.recorded).toBe(true)
    expect(mockUsageRecordCreate).toHaveBeenCalled()
  })

  it("selects cheapest pool first when user has multiple entitlements", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_basic",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 5,
        usedCalculations: 1,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Basic",
          displayOrder: 1,
          features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
        },
      },
      {
        id: "ent_pro",
        userId: "usr_test1",
        productId: "prod_pro",
        totalCalculations: 10,
        usedCalculations: 0,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Pro",
          displayOrder: 2,
          features: [
            { featureKey: "plant_layout", label: "Plant Layout" },
            { featureKey: "cable_routing", label: "Cable Routing" },
          ],
        },
      },
    ])
    const app = makeApp()
    await app.request("/usage/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer sl_live_testkey" },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    // UsageRecord should be created with prod_basic (cheapest pool)
    const createCall = mockUsageRecordCreate.mock.calls[0] as [{ data: { productId: string } }]
    expect(createCall?.[0]?.data?.productId).toBe("prod_basic")
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api 2>&1 | grep -E "usage|FAIL|Cannot find"
```

Expected: module import error (files don't exist yet).

- [ ] **Step 3: Implement the usage service**

Create `apps/mvp_api/src/modules/usage/usage.service.ts`:

```ts
import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"
import { computeEntitlementSummary } from "../entitlements/entitlements.service.js"

export async function reportUsage(
  userId: string,
  licenseKeyId: string,
  featureKey: string,
): Promise<{ recorded: boolean; remainingCalculations: number }> {
  // 1. Validate feature key exists in any product
  const featureExists = await db.productFeature.findFirst({
    where: { featureKey },
  })
  if (!featureExists) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Unknown feature key: ${featureKey}`,
      400,
    )
  }

  // 2. Select pool: cheapest-first (lowest displayOrder) with remaining > 0 and matching feature
  const entitlements = await db.entitlement.findMany({
    where: { userId },
    include: {
      product: {
        include: { features: true },
      },
    },
    orderBy: { product: { displayOrder: "asc" } },
  })

  const pool = entitlements.find(
    (e) =>
      e.totalCalculations - e.usedCalculations > 0 &&
      e.product.features.some((f) => f.featureKey === featureKey),
  )

  if (!pool) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      "No remaining calculations — purchase more at solarlayout.in",
      402,
    )
  }

  // 3. Atomic decrement: guard against concurrent race conditions
  await db.$transaction(async (tx) => {
    const rowsUpdated = await tx.$executeRaw`
      UPDATE entitlements
      SET "usedCalculations" = "usedCalculations" + 1
      WHERE id = ${pool.id}
        AND "usedCalculations" < "totalCalculations"
    `

    if (rowsUpdated === 0) {
      throw new AppError(
        "CONFLICT",
        "Calculation already in progress — retry",
        409,
      )
    }

    await tx.usageRecord.create({
      data: {
        userId,
        licenseKeyId,
        productId: pool.productId,
        featureKey,
      },
    })
  })

  // 4. Return updated total remaining across all entitlements
  const { remainingCalculations } = await computeEntitlementSummary(userId)
  return { recorded: true, remainingCalculations }
}
```

- [ ] **Step 4: Implement the usage routes**

Create `apps/mvp_api/src/modules/usage/usage.routes.ts`:

```ts
import { Hono } from "hono"
import { z } from "zod"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"
import { reportUsage } from "./usage.service.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const usageRoutes = new Hono<MvpHonoEnv>()

usageRoutes.use("/usage/report", licenseKeyAuth)

const UsageReportSchema = z.object({
  feature: z.string().min(1),
})

usageRoutes.post("/usage/report", async (c) => {
  const body = UsageReportSchema.safeParse(await c.req.json())
  if (!body.success) {
    throw new ValidationError(body.error.flatten().fieldErrors)
  }

  const user = c.get("user")
  const licenseKey = c.get("licenseKey")!

  const result = await reportUsage(user.id, licenseKey.id, body.data.feature)
  return c.json(ok(result))
})
```

- [ ] **Step 5: Mount usage routes in `app.ts`**

Open `apps/mvp_api/src/app.ts`. Add the import:

```ts
import { usageRoutes } from "./modules/usage/usage.routes.js"
```

Add the route mounting (after `app.route("/", entitlementsRoutes)`):

```ts
app.route("/", usageRoutes)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api 2>&1 | grep -E "usage|✓|✗"
```

Expected: all usage tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_api/src/modules/usage/ \
        apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): add POST /usage/report with atomic decrement and pool selection"
```

---

## Task 5: Full Gates + Final Commit

- [ ] **Step 1: Run all gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass. Fix any lint or typecheck errors before proceeding.

Common issues to watch for:
- TypeScript complaining about `c.get("licenseKey")` being `undefined` in usage routes — use the non-null assertion `c.get("licenseKey")!` since `licenseKeyAuth` guarantees it is set.
- `$executeRaw` not typed on the extended client — if TypeScript errors, cast: `(tx as { $executeRaw: (sql: TemplateStringsArray, ...values: unknown[]) => Promise<number> }).$executeRaw\`...\``

- [ ] **Step 2: Push and confirm CI passes**

```bash
git push
```

Watch CI. All lint, typecheck, test, and build checks must pass.

- [ ] **Step 3: Update spike plan**

Open `docs/initiatives/mvp-spike-plan.md`. Change Spike 6 status from `planned` to `in-progress` (it will be updated to `complete` after production verification).
