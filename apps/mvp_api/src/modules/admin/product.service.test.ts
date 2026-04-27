import { describe, it, expect, mock, beforeEach } from "bun:test"

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
    entitlements: [
      { deactivatedAt: null },
      { deactivatedAt: new Date() },
    ],
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
  { productId: "prod1", amount: 4999, source: "STRIPE", purchasedAt: new Date("2026-04-01") },
  { productId: "prod1", amount: 2000, source: "MANUAL", purchasedAt: new Date("2026-04-10") },
])
const mockTransactionAggregate = mock(async () => ({
  _sum: { amount: 14997 as number | null },
  _count: 3,
}))
const mockEntitlementCount = mock(async () => 2)

mock.module("../../lib/db.js", () => ({
  db: {
    product: {
      findMany: mockProductFindMany,
      count: mockProductCount,
      findUnique: mockProductFindUnique,
    },
    transaction: {
      findMany: mockTransactionFindMany,
      aggregate: mockTransactionAggregate,
    },
    entitlement: {
      count: mockEntitlementCount,
    },
  },
}))

const { listProducts, getProduct } = await import("./product.service.js")

describe("listProducts", () => {
  beforeEach(() => {
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
        entitlements: [
          { deactivatedAt: null },
          { deactivatedAt: new Date() },
        ],
      },
    ])
    mockProductCount.mockReset()
    mockProductCount.mockImplementation(async () => 1)
    mockTransactionFindMany.mockReset()
    mockTransactionFindMany.mockImplementation(async () => [
      { productId: "prod1", amount: 4999, source: "STRIPE", purchasedAt: new Date("2026-04-01") },
      { productId: "prod1", amount: 2000, source: "MANUAL", purchasedAt: new Date("2026-04-10") },
    ])
  })

  it("returns paginated list with computed revenue, purchase count, and active entitlements", async () => {
    const result = await listProducts({ page: 1, pageSize: 20 })
    expect(result.data).toHaveLength(1)
    const p = result.data[0]!
    expect(p.slug).toBe("pv-layout-pro")
    expect(p.totalRevenueUsd).toBeCloseTo(69.99)
    expect(p.revenueStripe).toBeCloseTo(49.99)
    expect(p.revenueManual).toBeCloseTo(20)
    expect(p.purchaseCount).toBe(2)
    expect(p.purchasesStripe).toBe(1)
    expect(p.purchasesManual).toBe(1)
    expect(p.activeEntitlementCount).toBe(1)
    expect(result.pagination.total).toBe(1)
  })

  it("returns zero revenue and counts when no transactions exist for product", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    const result = await listProducts({ page: 1, pageSize: 20 })
    expect(result.data[0]!.totalRevenueUsd).toBe(0)
    expect(result.data[0]!.revenueStripe).toBe(0)
    expect(result.data[0]!.revenueManual).toBe(0)
    expect(result.data[0]!.purchaseCount).toBe(0)
    expect(result.data[0]!.purchasesStripe).toBe(0)
    expect(result.data[0]!.purchasesManual).toBe(0)
  })

  it("counts only transactions for matching productId", async () => {
    mockTransactionFindMany.mockImplementation(async () => [
      { productId: "prod-other", amount: 999, source: "STRIPE", purchasedAt: new Date() },
    ])
    const result = await listProducts({ page: 1, pageSize: 20 })
    expect(result.data[0]!.purchaseCount).toBe(0)
    expect(result.data[0]!.totalRevenueUsd).toBe(0)
  })
})

describe("getProduct", () => {
  beforeEach(() => {
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
      { productId: "prod1", amount: 4999, source: "STRIPE", purchasedAt: new Date("2026-04-01") },
      { productId: "prod1", amount: 1500, source: "MANUAL", purchasedAt: new Date("2026-04-05") },
    ])
  })

  it("returns product with metrics including stripe/manual split", async () => {
    const result = await getProduct("pv-layout-pro")
    expect(result.slug).toBe("pv-layout-pro")
    expect(result.totalRevenueUsd).toBeCloseTo(64.99)
    expect(result.revenueStripe).toBeCloseTo(49.99)
    expect(result.revenueManual).toBeCloseTo(15)
    expect(result.purchaseCount).toBe(2)
    expect(result.purchasesStripe).toBe(1)
    expect(result.purchasesManual).toBe(1)
    expect(result.activeEntitlementCount).toBe(1)
  })

  it("throws 404 when product not found", async () => {
    mockProductFindUnique.mockImplementation(async () => null as never)
    await expect(getProduct("nonexistent")).rejects.toMatchObject({ statusCode: 404 })
  })

  it("returns zero split fields when no transactions", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    const result = await getProduct("pv-layout-pro")
    expect(result.totalRevenueUsd).toBe(0)
    expect(result.revenueStripe).toBe(0)
    expect(result.revenueManual).toBe(0)
    expect(result.purchaseCount).toBe(0)
    expect(result.purchasesStripe).toBe(0)
    expect(result.purchasesManual).toBe(0)
  })
})

const { getProductSales } = await import("./product.service.js")

describe("getProductSales", () => {
  beforeEach(() => {
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
  })

  it("returns monthly data with 12 periods, zeros for missing periods", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    const result = await getProductSales("pv-layout-pro", "monthly")
    expect(result.granularity).toBe("monthly")
    expect(result.data).toHaveLength(12)
    for (const point of result.data) {
      expect(point.revenueUsd).toBe(0)
      expect(point.revenueStripe).toBe(0)
      expect(point.revenueManual).toBe(0)
      expect(point.purchaseCount).toBe(0)
      expect(point.purchasesStripe).toBe(0)
      expect(point.purchasesManual).toBe(0)
    }
  })

  it("returns daily data with 30 periods", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    const result = await getProductSales("pv-layout-pro", "daily")
    expect(result.granularity).toBe("daily")
    expect(result.data).toHaveLength(30)
  })

  it("returns weekly data with 12 periods", async () => {
    mockTransactionFindMany.mockImplementation(async () => [])
    const result = await getProductSales("pv-layout-pro", "weekly")
    expect(result.granularity).toBe("weekly")
    expect(result.data).toHaveLength(12)
  })

  it("aggregates revenue and counts by source for transactions in the current month", async () => {
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7)
    mockTransactionFindMany.mockImplementation(async () => [
      { productId: "prod1", amount: 4999, source: "STRIPE", purchasedAt: new Date(now) },
      { productId: "prod1", amount: 9999, source: "MANUAL", purchasedAt: new Date(now) },
    ])
    const result = await getProductSales("pv-layout-pro", "monthly")
    const currentPeriod = result.data.find((d) => d.period === currentMonth)!
    expect(currentPeriod.purchaseCount).toBe(2)
    expect(currentPeriod.revenueUsd).toBeCloseTo(149.98)
    expect(currentPeriod.revenueStripe).toBeCloseTo(49.99)
    expect(currentPeriod.revenueManual).toBeCloseTo(99.99)
    expect(currentPeriod.purchasesStripe).toBe(1)
    expect(currentPeriod.purchasesManual).toBe(1)
  })

  it("throws 404 when product not found", async () => {
    mockProductFindUnique.mockImplementation(async () => null as never)
    await expect(
      getProductSales("nonexistent", "monthly"),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

const { getProductsSummary } = await import("./product.service.js")

describe("getProductsSummary", () => {
  beforeEach(() => {
    mockTransactionAggregate.mockReset()
    mockEntitlementCount.mockReset()
    mockEntitlementCount.mockImplementation(async () => 2)
    // Default: called 3 times — paid, stripe, manual
    let callCount = 0
    mockTransactionAggregate.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return { _sum: { amount: 14997 }, _count: 3 }
      if (callCount === 2) return { _sum: { amount: 9999 }, _count: 2 }
      return { _sum: { amount: 4998 }, _count: 1 }
    })
  })

  it("returns correct all-product totals with stripe/manual split", async () => {
    const result = await getProductsSummary()
    expect(result.totalRevenueUsd).toBeCloseTo(149.97)
    expect(result.revenueStripe).toBeCloseTo(99.99)
    expect(result.revenueManual).toBeCloseTo(49.98)
    expect(result.totalPurchases).toBe(3)
    expect(result.purchasesStripe).toBe(2)
    expect(result.purchasesManual).toBe(1)
    expect(result.activeEntitlements).toBe(2)
  })

  it("returns zeros when no transactions or entitlements exist", async () => {
    mockTransactionAggregate.mockImplementation(async () => ({
      _sum: { amount: null },
      _count: 0,
    }))
    mockEntitlementCount.mockImplementation(async () => 0)
    const result = await getProductsSummary()
    expect(result.totalRevenueUsd).toBe(0)
    expect(result.revenueStripe).toBe(0)
    expect(result.revenueManual).toBe(0)
    expect(result.totalPurchases).toBe(0)
    expect(result.purchasesStripe).toBe(0)
    expect(result.purchasesManual).toBe(0)
    expect(result.activeEntitlements).toBe(0)
  })
})
