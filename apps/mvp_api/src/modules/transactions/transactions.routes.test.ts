import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"
import { AppError } from "../../lib/errors.js"

// ─── transactions.service mock ──────────────────────────────────────────────
// Must be registered before any module that imports transactions.service.js is loaded.
const createManualTransactionMock = mock(async () => ({
  transactionId: "txn_new",
  entitlementId: "ent_new",
}))
const listTransactionsMock = mock(async () => ({
  transactions: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
}))
const getTransactionMock = mock(async (_id: string) => ({
  id: "txn_1",
  userId: "usr_a",
  userEmail: "alice@example.com",
  userName: "Alice",
  productId: "prod_pro",
  productSlug: "pv-layout-pro",
  productName: "Pro",
  source: "MANUAL",
  status: "COMPLETED",
  amount: 499,
  currency: "usd",
  purchasedAt: "2026-04-25T10:00:00.000Z",
  createdAt: new Date().toISOString(),
  paymentMethod: "UPI",
  externalReference: "UPI-1",
  notes: "n",
  createdByUserId: "usr_admin",
  createdByEmail: "admin@example.com",
  checkoutSessionId: null,
}))
mock.module("./transactions.service.js", () => ({
  createManualTransaction: createManualTransactionMock,
  listTransactions: listTransactionsMock,
  getTransaction: getTransactionMock,
}))

// ─── @clerk/backend mock ────────────────────────────────────────────────────
mock.module("@clerk/backend", () => ({
  verifyToken: async (_token: string) => ({ sub: "ck_admin" }),
  createClerkClient: () => ({
    users: {
      getUser: async () => ({
        id: "ck_admin",
        emailAddresses: [{ id: "ea_1", emailAddress: "admin@test.com" }],
        primaryEmailAddressId: "ea_1",
        firstName: "Admin",
        lastName: null,
        publicMetadata: { roles: ["ADMIN"] },
      }),
    },
  }),
}))

// ─── db mock ─────────────────────────────────────────────────────────────────
// clerkAuth calls db.user.findFirst to look up the authenticated user.
const mockUserFindFirst = mock(async () => ({
  id: "usr_admin",
  clerkId: "ck_admin",
  email: "admin@test.com",
  name: "Admin",
  stripeCustomerId: null,
  roles: ["ADMIN"],
  status: "ACTIVE",
}))

mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findFirst: mockUserFindFirst,
    },
    product: {
      findFirst: async () => null,
    },
    $transaction: async () => {},
  },
}))

const { transactionsRoutes } = await import("./transactions.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", transactionsRoutes)
  app.onError(errorHandler)
  return app
}

beforeEach(() => {
  createManualTransactionMock.mockReset()
  createManualTransactionMock.mockImplementation(async () => ({
    transactionId: "txn_new",
    entitlementId: "ent_new",
  }))

  listTransactionsMock.mockReset()
  listTransactionsMock.mockImplementation(async () => ({
    transactions: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  }))

  getTransactionMock.mockReset()
  getTransactionMock.mockImplementation(async (_id: string) => ({
    id: "txn_1",
    userId: "usr_a",
    userEmail: "alice@example.com",
    userName: "Alice",
    productId: "prod_pro",
    productSlug: "pv-layout-pro",
    productName: "Pro",
    source: "MANUAL",
    status: "COMPLETED",
    amount: 499,
    currency: "usd",
    purchasedAt: "2026-04-25T10:00:00.000Z",
    createdAt: new Date().toISOString(),
    paymentMethod: "UPI",
    externalReference: "UPI-1",
    notes: "n",
    createdByUserId: "usr_admin",
    createdByEmail: "admin@example.com",
    checkoutSessionId: null,
  }))

  mockUserFindFirst.mockReset()
  mockUserFindFirst.mockImplementation(async () => ({
    id: "usr_admin",
    clerkId: "ck_admin",
    email: "admin@test.com",
    name: "Admin",
    stripeCustomerId: null,
    roles: ["ADMIN"],
    status: "ACTIVE",
  }))
})

describe("POST /admin/transactions", () => {
  it("creates a manual transaction (200) for ADMIN", async () => {
    const res = await makeApp().request("/admin/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
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
    const body = (await res.json()) as {
      success: boolean
      data: { transactionId: string; entitlementId: string }
    }
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ transactionId: "txn_new", entitlementId: "ent_new" })
    expect(createManualTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "usr_alice",
        productSlug: "pv-layout-pro",
        paymentMethod: "UPI",
        externalReference: "UPI-8472",
        notes: "test note",
        createdByUserId: expect.any(String),
      }),
    )
  })

  it("rejects 400 for invalid body (missing paymentMethod)", async () => {
    const res = await makeApp().request("/admin/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      },
      body: JSON.stringify({ userId: "usr_alice", productSlug: "pv-layout-pro" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects 401 without auth", async () => {
    const res = await makeApp().request("/admin/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  })

  it("rejects 403 for non-admin authenticated user", async () => {
    // Override findFirst to return a user without ADMIN role
    mockUserFindFirst.mockImplementation(async () => ({
      id: "usr_ops",
      clerkId: "ck_admin",
      email: "ops@test.com",
      name: "Ops User",
      stripeCustomerId: null,
      roles: ["OPS"],
      status: "ACTIVE",
    }))

    const res = await makeApp().request("/admin/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      },
      body: JSON.stringify({
        userId: "usr_alice",
        productSlug: "pv-layout-pro",
        paymentMethod: "CASH",
      }),
    })
    expect(res.status).toBe(403)
  })
})

describe("GET /admin/transactions", () => {
  it("returns paginated list (200) for ADMIN", async () => {
    const txn = {
      id: "txn_1",
      userId: "usr_a",
      userEmail: "alice@example.com",
      userName: "Alice",
      productId: "prod_pro",
      productSlug: "pv-layout-pro",
      productName: "Pro",
      source: "STRIPE",
      status: "COMPLETED",
      amount: 499,
      currency: "usd",
      purchasedAt: "2026-04-25T10:00:00.000Z",
      createdAt: new Date().toISOString(),
      paymentMethod: null,
      externalReference: null,
      notes: null,
      createdByUserId: null,
      createdByEmail: null,
      checkoutSessionId: "cs_1",
    }
    listTransactionsMock.mockImplementation(async () => ({
      transactions: [txn],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }))

    const res = await makeApp().request(
      "/admin/transactions?source=ALL&page=1&pageSize=20",
      {
        method: "GET",
        headers: { Authorization: "Bearer token" },
      },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { transactions: unknown[]; pagination: unknown }
    }
    expect(body.success).toBe(true)
    expect(body.data.transactions).toHaveLength(1)
    expect(body.data.pagination).toMatchObject({ page: 1, total: 1 })
    expect(listTransactionsMock).toHaveBeenCalledTimes(1)
  })

  it("rejects 401 without auth", async () => {
    const res = await makeApp().request("/admin/transactions", {
      method: "GET",
    })
    expect(res.status).toBe(401)
  })

  it("rejects 403 for non-admin", async () => {
    mockUserFindFirst.mockImplementation(async () => ({
      id: "usr_ops",
      clerkId: "ck_admin",
      email: "ops@test.com",
      name: "Ops User",
      stripeCustomerId: null,
      roles: ["OPS"],
      status: "ACTIVE",
    }))

    const res = await makeApp().request("/admin/transactions", {
      method: "GET",
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(403)
  })
})

describe("GET /admin/transactions/:id", () => {
  it("returns single transaction (200) for ADMIN", async () => {
    const res = await makeApp().request("/admin/transactions/txn_1", {
      method: "GET",
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; data: { id: string } }
    expect(body.success).toBe(true)
    expect(body.data.id).toBe("txn_1")
    expect(getTransactionMock).toHaveBeenCalledWith("txn_1")
  })

  it("returns 404 for unknown id", async () => {
    getTransactionMock.mockImplementation(async () => {
      throw new AppError("NOT_FOUND", "Transaction not found: missing", 404)
    })

    const res = await makeApp().request("/admin/transactions/missing", {
      method: "GET",
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(404)
  })
})
