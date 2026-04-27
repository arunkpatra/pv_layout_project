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
    _count: { usageRecords: 3 },
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
      product: { id: "prod1", name: "Pro", slug: "pv-layout-pro" },
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
  deactivatedAt: new Date() as Date | null,
}))
const mockTransactionFindMany = mock(async (..._args: unknown[]) => [
  {
    id: "txn1",
    productId: "prod1",
    source: "MANUAL",
    status: "COMPLETED",
    amount: 4999,
    currency: "usd",
    purchasedAt: new Date("2026-02-01"),
    paymentMethod: "CASH",
    externalReference: null,
    product: { slug: "pv-layout-pro", name: "Pro" },
    createdByUser: { email: "ops@test.com" },
  },
])

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
    transaction: {
      findMany: mockTransactionFindMany,
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
      _count: { usageRecords: 3 },
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
        product: { id: "prod1", name: "Pro", slug: "pv-layout-pro" },
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
  mockTransactionFindMany.mockReset()
  mockTransactionFindMany.mockImplementation(async () => [
    {
      id: "txn1",
      productId: "prod1",
      source: "MANUAL",
      status: "COMPLETED",
      amount: 4999,
      currency: "usd",
      purchasedAt: new Date("2026-02-01"),
      paymentMethod: "CASH",
      externalReference: null,
      product: { slug: "pv-layout-pro", name: "Pro" },
      createdByUser: { email: "ops@test.com" },
    },
  ])
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
    const res = await makeApp().request("/admin/customers", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(403)
  })
})

describe("GET /admin/customers/:id/transactions", () => {
  it("returns 200 with transactions array and calls service with correct userId", async () => {
    const res = await makeApp().request(
      "/admin/customers/usr1/transactions",
      { headers: { Authorization: "Bearer token" } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { transactions: unknown[] }
    }
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.transactions)).toBe(true)
    expect(body.data.transactions).toHaveLength(1)
    // verify the service was called with the right userId (findMany where clause)
    expect(mockTransactionFindMany).toHaveBeenCalledTimes(1)
    const callArgs = mockTransactionFindMany.mock.calls[0]?.[0] as {
      where: { userId: string }
      take: number
    } | undefined
    expect(callArgs?.where.userId).toBe("usr1")
    expect(callArgs?.take).toBe(10)
  })

  it("returns 200 with limit from query param", async () => {
    const res = await makeApp().request(
      "/admin/customers/usr1/transactions?limit=5",
      { headers: { Authorization: "Bearer token" } },
    )
    expect(res.status).toBe(200)
    const callArgs = mockTransactionFindMany.mock.calls[0]?.[0] as {
      take: number
    } | undefined
    expect(callArgs?.take).toBe(5)
  })

  it("returns 401 without auth", async () => {
    const res = await makeApp().request(
      "/admin/customers/usr1/transactions",
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 without ADMIN or OPS role", async () => {
    mockUserFindFirst.mockImplementation(async () => ({
      id: "usr_plain",
      clerkId: "ck_ops",
      email: "plain@test.com",
      name: "Plain",
      stripeCustomerId: null,
      roles: [],
      status: "ACTIVE",
    }))
    const res = await makeApp().request(
      "/admin/customers/usr1/transactions",
      { headers: { Authorization: "Bearer token" } },
    )
    expect(res.status).toBe(403)
  })
})
