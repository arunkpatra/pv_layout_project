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
    [] as Array<{ amount: number; purchasedAt: Date; source: string }>,
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

  it("returns monthly trends with 12 periods, zeros when no data", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [])
    const result = await getDashboardTrends("monthly")
    expect(result).toHaveLength(12)
    for (const p of result) {
      expect(p.revenue).toBe(0)
      expect(p.revenueStripe).toBe(0)
      expect(p.revenueManual).toBe(0)
      expect(p.purchases).toBe(0)
      expect(p.purchasesStripe).toBe(0)
      expect(p.purchasesManual).toBe(0)
      expect(p.customers).toBe(0)
      expect(p.calculations).toBe(0)
    }
  })

  it("returns daily trends with 30 periods", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [])
    const result = await getDashboardTrends("daily")
    expect(result).toHaveLength(30)
  })

  it("returns weekly trends with 12 periods", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [])
    const result = await getDashboardTrends("weekly")
    expect(result).toHaveLength(12)
    for (const p of result) expect(p.revenue).toBe(0)
  })

  it("aggregates revenue, customers, purchases and calculations into correct period buckets", async () => {
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7)
    mockTransactionFindMany.mockImplementation(async () => [
      { amount: 4999, purchasedAt: new Date(now), source: "STRIPE" },
      { amount: 9999, purchasedAt: new Date(now), source: "STRIPE" },
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
    const bucket = result.find((p) => p.period === currentMonth)!
    expect(bucket.revenue).toBeCloseTo(149.98)
    expect(bucket.customers).toBe(3)
    expect(bucket.purchases).toBe(2)
    expect(bucket.calculations).toBe(2)
  })

  it("getDashboardTrends includes Stripe/Manual split per period", async () => {
    mockTransactionFindMany.mockImplementation(async () => [
      {
        purchasedAt: new Date("2026-04-26T10:00:00Z"),
        source: "STRIPE",
        amount: 499,
      },
      {
        purchasedAt: new Date("2026-04-26T11:00:00Z"),
        source: "MANUAL",
        amount: 499,
      },
      {
        purchasedAt: new Date("2026-04-27T09:00:00Z"),
        source: "STRIPE",
        amount: 1499,
      },
    ])
    mockUserFindMany.mockImplementation(async () => [])

    const result = await getDashboardTrends("daily")

    const apr26 = result.find(
      (p: { period: string }) => p.period === "2026-04-26",
    )
    expect(apr26).toMatchObject({
      revenue: 998 / 100,
      revenueStripe: 499 / 100,
      revenueManual: 499 / 100,
      purchases: 2,
      purchasesStripe: 1,
      purchasesManual: 1,
    })

    const apr27 = result.find(
      (p: { period: string }) => p.period === "2026-04-27",
    )
    expect(apr27).toMatchObject({
      revenueStripe: 1499 / 100,
      revenueManual: 0,
      purchasesStripe: 1,
      purchasesManual: 0,
    })
  })
})
