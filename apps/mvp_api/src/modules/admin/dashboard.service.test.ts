import { describe, it, expect, mock, beforeEach } from "bun:test"

// ─── db mocks ────────────────────────────────────────────────────────────────
const mockCheckoutSessionAggregate = mock(async () => ({ _sum: { amountTotal: 9998 as number | null } }))
const mockUserCount = mock(async () => 3)
const mockCheckoutSessionCount = mock(async () => 2)
const mockUsageRecordCount = mock(async () => 1)
const mockCheckoutSessionFindMany = mock(async () => [] as Array<{ amountTotal: number | null; processedAt: Date | null }>)
const mockUserFindMany = mock(async () => [] as Array<{ createdAt: Date }>)

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
    usageRecord: {
      count: mockUsageRecordCount,
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
    mockUsageRecordCount.mockReset()
    mockUsageRecordCount.mockImplementation(async () => 1)
  })

  it("returns correct all-time totals", async () => {
    const result = await getDashboardSummary()
    expect(result.totalRevenueUsd).toBeCloseTo(99.98)
    expect(result.totalCustomers).toBe(3)
    expect(result.totalPurchases).toBe(2)
    expect(result.totalCalculations).toBe(1)
  })

  it("returns zeros when no data exists", async () => {
    mockCheckoutSessionAggregate.mockImplementation(async () => ({
      _sum: { amountTotal: null },
    }))
    mockUserCount.mockImplementation(async () => 0)
    mockCheckoutSessionCount.mockImplementation(async () => 0)
    mockUsageRecordCount.mockImplementation(async () => 0)
    const result = await getDashboardSummary()
    expect(result.totalRevenueUsd).toBe(0)
    expect(result.totalCustomers).toBe(0)
    expect(result.totalPurchases).toBe(0)
    expect(result.totalCalculations).toBe(0)
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

  it("returns weekly trends with 12 periods", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [])
    const result = await getDashboardTrends("weekly")
    expect(result.granularity).toBe("weekly")
    expect(result.revenue).toHaveLength(12)
    expect(result.customers).toHaveLength(12)
    for (const r of result.revenue) expect(r.revenueUsd).toBe(0)
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
