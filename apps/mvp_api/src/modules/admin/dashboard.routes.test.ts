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

const mockTransactionAggregate = mock(async () => ({
  _sum: { amount: 4999 },
  _count: 1,
}))
const mockUserCount = mock(async () => 2)
const mockUsageRecordCount = mock(async () => 1)
const mockTransactionFindMany = mock(
  async () =>
    [] as Array<{ amount: number; purchasedAt: Date; source: string }>,
)
const mockUserFindMany = mock(async () => [])
const mockUsageRecordFindMany = mock(async () => [])

mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findFirst: mockUserFindFirst,
      count: mockUserCount,
      findMany: mockUserFindMany,
    },
    transaction: {
      aggregate: mockTransactionAggregate,
      findMany: mockTransactionFindMany,
    },
    usageRecord: { count: mockUsageRecordCount, findMany: mockUsageRecordFindMany },
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
  mockTransactionAggregate.mockReset()
  mockTransactionAggregate.mockImplementation(async () => ({
    _sum: { amount: 4999 },
    _count: 1,
  }))
  mockUserCount.mockReset()
  mockUserCount.mockImplementation(async () => 2)
  mockUsageRecordCount.mockReset()
  mockUsageRecordCount.mockImplementation(async () => 1)
  mockTransactionFindMany.mockReset()
  mockTransactionFindMany.mockImplementation(async () => [])
  mockUserFindMany.mockReset()
  mockUserFindMany.mockImplementation(async () => [])
  mockUsageRecordFindMany.mockReset()
  mockUsageRecordFindMany.mockImplementation(async () => [])
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
        totalRevenue: number
        totalRevenueStripe: number
        totalRevenueManual: number
        totalPurchases: number
        totalPurchasesStripe: number
        totalPurchasesManual: number
        totalCustomers: number
        totalCalculations: number
      }
    }
    expect(body.success).toBe(true)
    expect(typeof body.data.totalRevenue).toBe("number")
    expect(typeof body.data.totalRevenueStripe).toBe("number")
    expect(typeof body.data.totalRevenueManual).toBe("number")
    expect(typeof body.data.totalPurchases).toBe("number")
    expect(typeof body.data.totalPurchasesStripe).toBe("number")
    expect(typeof body.data.totalPurchasesManual).toBe("number")
    expect(typeof body.data.totalCustomers).toBe("number")
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
      data: Array<{
        period: string
        revenue: number
        revenueStripe: number
        revenueManual: number
        purchases: number
        purchasesStripe: number
        purchasesManual: number
        customers: number
        calculations: number
      }>
    }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(12)
    const first = body.data[0]!
    expect(typeof first.period).toBe("string")
    expect(typeof first.revenue).toBe("number")
    expect(typeof first.revenueStripe).toBe("number")
    expect(typeof first.revenueManual).toBe("number")
    expect(typeof first.purchases).toBe("number")
    expect(typeof first.purchasesStripe).toBe("number")
    expect(typeof first.purchasesManual).toBe("number")
    expect(typeof first.customers).toBe("number")
    expect(typeof first.calculations).toBe("number")
  })

  it("returns daily trends when granularity=daily", async () => {
    const res = await makeApp().request(
      "/admin/dashboard/trends?granularity=daily",
      { headers: { Authorization: "Bearer token" } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: Array<{ period: string; revenue: number }>
    }
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(30)
  })
})
