import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

// ─── transactions.service mock ──────────────────────────────────────────────
// Must be registered before any module that imports transactions.service.js is loaded.
const createManualTransactionMock = mock(async () => ({
  transactionId: "txn_new",
  entitlementId: "ent_new",
}))
mock.module("./transactions.service.js", () => ({
  createManualTransaction: createManualTransactionMock,
  // listTransactions, getTransaction will be added later (Task 19)
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
