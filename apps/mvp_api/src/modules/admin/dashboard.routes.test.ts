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
const mockUsageRecordCount = mock(async () => 1)
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
    usageRecord: { count: mockUsageRecordCount },
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
  mockUsageRecordCount.mockReset()
  mockUsageRecordCount.mockImplementation(async () => 1)
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
        totalCalculations: number
      }
    }
    expect(body.success).toBe(true)
    expect(typeof body.data.totalRevenueUsd).toBe("number")
    expect(typeof body.data.totalCustomers).toBe("number")
    expect(typeof body.data.totalPurchases).toBe("number")
    expect(typeof body.data.totalCalculations).toBe("number")
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
