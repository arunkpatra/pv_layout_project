import { describe, it, expect, mock, beforeEach } from "bun:test"

// ─── db mocks ────────────────────────────────────────────────────────────────
const mockTransactionAggregate = mock(async () => ({
  _sum: { amount: 9998 as number | null },
  _count: 2,
}))
const mockUserCount = mock(async () => 3)
const mockUsageRecordCount = mock(async () => 1)
const mockTransactionFindMany = mock(
  async () =>
    [] as Array<{ amount: number; purchasedAt: Date }>,
)
const mockUserFindMany = mock(async () => [] as Array<{ createdAt: Date }>)
const mockUsageRecordFindMany = mock(
  async () => [] as Array<{ createdAt: Date }>,
)

mock.module("../../lib/db.js", () => ({
  db: {
    transaction: {
      aggregate: mockTransactionAggregate,
      findMany: mockTransactionFindMany,
    },
    user: {
      count: mockUserCount,
      findMany: mockUserFindMany,
    },
    usageRecord: {
      count: mockUsageRecordCount,
      findMany: mockUsageRecordFindMany,
    },
  },
}))

const { getDashboardSummary, getDashboardTrends } = await import(
  "./dashboard.service.js"
)

describe("getDashboardSummary", () => {
  beforeEach(() => {
    mockTransactionAggregate.mockReset()
    // Default: returns same values for all three aggregate calls (paid, stripe, manual)
    mockTransactionAggregate.mockImplementation(async () => ({
      _sum: { amount: 9998 },
      _count: 2,
    }))
    mockUserCount.mockReset()
    mockUserCount.mockImplementation(async () => 3)
    mockUsageRecordCount.mockReset()
    mockUsageRecordCount.mockImplementation(async () => 1)
  })

  it("getDashboardSummary returns totals + Stripe/Manual split", async () => {
    // Return distinct values per call: paid=10000/3, stripe=7000/2, manual=3000/1
    let callCount = 0
    mockTransactionAggregate.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return { _sum: { amount: 10000 }, _count: 3 } // paid (all)
      if (callCount === 2) return { _sum: { amount: 7000 }, _count: 2 } // stripe
      return { _sum: { amount: 3000 }, _count: 1 } // manual
    })
    mockUserCount.mockImplementation(async () => 5)
    mockUsageRecordCount.mockImplementation(async () => 4)

    const result = await getDashboardSummary()

    // Verify all new fields are present and are numbers
    expect(typeof result.totalRevenue).toBe("number")
    expect(typeof result.totalRevenueStripe).toBe("number")
    expect(typeof result.totalRevenueManual).toBe("number")
    expect(typeof result.totalPurchases).toBe("number")
    expect(typeof result.totalPurchasesStripe).toBe("number")
    expect(typeof result.totalPurchasesManual).toBe("number")
    expect(typeof result.totalCustomers).toBe("number")
    expect(typeof result.totalCalculations).toBe("number")
    // Verify correct values
    expect(result.totalRevenue).toBe(10000)
    expect(result.totalRevenueStripe).toBe(7000)
    expect(result.totalRevenueManual).toBe(3000)
    expect(result.totalPurchases).toBe(3)
    expect(result.totalPurchasesStripe).toBe(2)
    expect(result.totalPurchasesManual).toBe(1)
    expect(result.totalCustomers).toBe(5)
    expect(result.totalCalculations).toBe(4)
  })

  it("returns correct all-time totals", async () => {
    const result = await getDashboardSummary()
    expect(result.totalRevenue).toBe(9998)
    expect(result.totalCustomers).toBe(3)
    expect(result.totalPurchases).toBe(2)
    expect(result.totalCalculations).toBe(1)
  })

  it("returns zeros when no data exists", async () => {
    mockTransactionAggregate.mockImplementation(async () => ({
      _sum: { amount: null },
      _count: 0,
    }))
    mockUserCount.mockImplementation(async () => 0)
    mockUsageRecordCount.mockImplementation(async () => 0)
    const result = await getDashboardSummary()
    expect(result.totalRevenue).toBe(0)
    expect(result.totalRevenueStripe).toBe(0)
    expect(result.totalRevenueManual).toBe(0)
    expect(result.totalPurchases).toBe(0)
    expect(result.totalPurchasesStripe).toBe(0)
    expect(result.totalPurchasesManual).toBe(0)
    expect(result.totalCustomers).toBe(0)
    expect(result.totalCalculations).toBe(0)
  })
})

describe("getDashboardTrends", () => {
  beforeEach(() => {
    mockTransactionFindMany.mockReset()
    mockUserFindMany.mockReset()
    mockUsageRecordFindMany.mockReset()
    mockUsageRecordFindMany.mockImplementation(async () => [])
  })

  it("returns monthly trends with 12 periods for all four series, zeros when no data", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [])
    const result = await getDashboardTrends("monthly")
    expect(result.granularity).toBe("monthly")
    expect(result.revenue).toHaveLength(12)
    expect(result.customers).toHaveLength(12)
    expect(result.purchases).toHaveLength(12)
    expect(result.calculations).toHaveLength(12)
    for (const r of result.revenue) expect(r.revenueUsd).toBe(0)
    for (const c of result.customers) expect(c.count).toBe(0)
    for (const p of result.purchases) expect(p.count).toBe(0)
    for (const c of result.calculations) expect(c.count).toBe(0)
  })

  it("returns daily trends with 30 periods", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [])
    const result = await getDashboardTrends("daily")
    expect(result.revenue).toHaveLength(30)
    expect(result.customers).toHaveLength(30)
    expect(result.purchases).toHaveLength(30)
    expect(result.calculations).toHaveLength(30)
  })

  it("returns weekly trends with 12 periods", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [])
    const result = await getDashboardTrends("weekly")
    expect(result.granularity).toBe("weekly")
    expect(result.revenue).toHaveLength(12)
    expect(result.customers).toHaveLength(12)
    expect(result.purchases).toHaveLength(12)
    expect(result.calculations).toHaveLength(12)
    for (const r of result.revenue) expect(r.revenueUsd).toBe(0)
  })

  it("aggregates revenue, customers, purchases and calculations into correct period buckets", async () => {
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7)
    mockTransactionFindMany.mockImplementation(async () => [
      { amount: 4999, purchasedAt: new Date(now) },
      { amount: 9999, purchasedAt: new Date(now) },
    ])
    mockUserFindMany.mockImplementation(async () => [
      { createdAt: new Date(now) },
      { createdAt: new Date(now) },
      { createdAt: new Date(now) },
    ])
    mockUsageRecordFindMany.mockImplementation(async () => [
      { createdAt: new Date(now) },
      { createdAt: new Date(now) },
    ])
    const result = await getDashboardTrends("monthly")
    const revPeriod = result.revenue.find((r) => r.period === currentMonth)!
    expect(revPeriod.revenueUsd).toBeCloseTo(149.98)
    const custPeriod = result.customers.find((c) => c.period === currentMonth)!
    expect(custPeriod.count).toBe(3)
    const purPeriod = result.purchases.find((p) => p.period === currentMonth)!
    expect(purPeriod.count).toBe(2)
    const calcPeriod = result.calculations.find(
      (c) => c.period === currentMonth,
    )!
    expect(calcPeriod.count).toBe(2)
  })
})
