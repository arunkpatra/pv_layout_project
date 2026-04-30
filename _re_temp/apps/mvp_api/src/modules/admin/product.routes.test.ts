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
    name: "Pro",
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
  name: "Pro",
  priceAmount: 4999,
  priceCurrency: "usd",
  calculations: 10,
  active: true,
  isFree: false,
  entitlements: [{ deactivatedAt: null }],
}))
const mockTransactionFindMany = mock(async () => [
  { productId: "prod1", amount: 4999, source: "STRIPE", purchasedAt: new Date() },
])
const mockTransactionAggregate = mock(async () => ({
  _sum: { amount: 4999 },
  _count: 1,
}))
const mockEntitlementCount = mock(async () => 1)

mock.module("../../lib/db.js", () => ({
  db: {
    user: { findFirst: mockUserFindFirst },
    product: {
      findMany: mockProductFindMany,
      count: mockProductCount,
      findUnique: mockProductFindUnique,
    },
    transaction: {
      findMany: mockTransactionFindMany,
      aggregate: mockTransactionAggregate,
    },
    entitlement: { count: mockEntitlementCount },
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
      name: "Pro",
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
    name: "Pro",
    priceAmount: 4999,
    priceCurrency: "usd",
    calculations: 10,
    active: true,
    isFree: false,
    entitlements: [{ deactivatedAt: null }],
  }))
  mockTransactionFindMany.mockReset()
  mockTransactionFindMany.mockImplementation(async () => [
    { productId: "prod1", amount: 4999, source: "STRIPE", purchasedAt: new Date() },
  ])
  mockTransactionAggregate.mockReset()
  mockTransactionAggregate.mockImplementation(async () => ({
    _sum: { amount: 4999 },
    _count: 1,
  }))
  mockEntitlementCount.mockReset()
  mockEntitlementCount.mockImplementation(async () => 1)
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
  it("returns 200 with product detail including split fields", async () => {
    const res = await makeApp().request("/admin/products/pv-layout-pro", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        slug: string
        totalRevenueUsd: number
        revenueStripe: number
        revenueManual: number
        purchaseCount: number
        purchasesStripe: number
        purchasesManual: number
      }
    }
    expect(body.data.slug).toBe("pv-layout-pro")
    expect(body.data.totalRevenueUsd).toBeCloseTo(49.99)
    expect(body.data.revenueStripe).toBeCloseTo(49.99)
    expect(body.data.revenueManual).toBe(0)
    expect(body.data.purchaseCount).toBe(1)
    expect(body.data.purchasesStripe).toBe(1)
    expect(body.data.purchasesManual).toBe(0)
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
    mockTransactionFindMany.mockImplementation(async () => [])
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
    mockTransactionFindMany.mockImplementation(async () => [])
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

describe("GET /admin/products/summary", () => {
  it("returns 200 with summary shape including split fields for OPS role", async () => {
    const res = await makeApp().request("/admin/products/summary", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        totalRevenueUsd: number
        revenueStripe: number
        revenueManual: number
        totalPurchases: number
        purchasesStripe: number
        purchasesManual: number
        activeEntitlements: number
      }
    }
    expect(body.success).toBe(true)
    expect(typeof body.data.totalRevenueUsd).toBe("number")
    expect(typeof body.data.revenueStripe).toBe("number")
    expect(typeof body.data.revenueManual).toBe("number")
    expect(typeof body.data.totalPurchases).toBe("number")
    expect(typeof body.data.purchasesStripe).toBe("number")
    expect(typeof body.data.purchasesManual).toBe("number")
    expect(typeof body.data.activeEntitlements).toBe("number")
  })

  it("returns 401 when no Authorization header", async () => {
    const res = await makeApp().request("/admin/products/summary")
    expect(res.status).toBe(401)
  })
})
