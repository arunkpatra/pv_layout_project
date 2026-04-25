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
  deactivatedAt: new Date() as Date | null,
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
