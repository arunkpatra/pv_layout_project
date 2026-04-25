import { describe, it, expect, mock, beforeEach } from "bun:test"

const mockProductFindMany = mock(async () => [
  {
    id: "prod1",
    slug: "pv-layout-pro",
    name: "PV Layout Pro",
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
  name: "PV Layout Pro",
  priceAmount: 4999,
  priceCurrency: "usd",
  calculations: 10,
  active: true,
  isFree: false,
  entitlements: [{ deactivatedAt: null }],
}))
const mockCheckoutSessionFindMany = mock(async () => [
  { productSlug: "pv-layout-pro", amountTotal: 4999, processedAt: new Date("2026-04-01") },
  { productSlug: "pv-layout-pro", amountTotal: null, processedAt: new Date("2026-04-10") },
])
const mockCheckoutSessionAggregate = mock(async () => ({
  _sum: { amountTotal: 14997 },
}))
const mockCheckoutSessionCount = mock(async () => 3)
const mockEntitlementCount = mock(async () => 2)

mock.module("../../lib/db.js", () => ({
  db: {
    product: {
      findMany: mockProductFindMany,
      count: mockProductCount,
      findUnique: mockProductFindUnique,
    },
    checkoutSession: {
      findMany: mockCheckoutSessionFindMany,
      aggregate: mockCheckoutSessionAggregate,
      count: mockCheckoutSessionCount,
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
        name: "PV Layout Pro",
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
    mockCheckoutSessionFindMany.mockReset()
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { productSlug: "pv-layout-pro", amountTotal: 4999, processedAt: new Date("2026-04-01") },
      { productSlug: "pv-layout-pro", amountTotal: null, processedAt: new Date("2026-04-10") },
    ])
  })

  it("returns paginated list with computed revenue, purchase count, and active entitlements", async () => {
    const result = await listProducts({ page: 1, pageSize: 20 })
    expect(result.data).toHaveLength(1)
    const p = result.data[0]!
    expect(p.slug).toBe("pv-layout-pro")
    expect(p.totalRevenueUsd).toBeCloseTo(49.99)
    expect(p.purchaseCount).toBe(2)
    expect(p.activeEntitlementCount).toBe(1)
    expect(result.pagination.total).toBe(1)
  })

  it("treats null amountTotal as zero in revenue sum", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { productSlug: "pv-layout-pro", amountTotal: null, processedAt: new Date() },
    ])
    const result = await listProducts({ page: 1, pageSize: 20 })
    expect(result.data[0]!.totalRevenueUsd).toBe(0)
  })

  it("counts only sessions for matching productSlug", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { productSlug: "pv-layout-basic", amountTotal: 999, processedAt: new Date() },
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
      name: "PV Layout Pro",
      priceAmount: 4999,
      priceCurrency: "usd",
      calculations: 10,
      active: true,
      isFree: false,
      entitlements: [{ deactivatedAt: null }],
    }))
    mockCheckoutSessionFindMany.mockReset()
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { productSlug: "pv-layout-pro", amountTotal: 4999, processedAt: new Date("2026-04-01") },
    ])
  })

  it("returns product with metrics", async () => {
    const result = await getProduct("pv-layout-pro")
    expect(result.slug).toBe("pv-layout-pro")
    expect(result.totalRevenueUsd).toBeCloseTo(49.99)
    expect(result.purchaseCount).toBe(1)
    expect(result.activeEntitlementCount).toBe(1)
  })

  it("throws 404 when product not found", async () => {
    mockProductFindUnique.mockImplementation(async () => null as never)
    await expect(getProduct("nonexistent")).rejects.toMatchObject({ statusCode: 404 })
  })
})

const { getProductSales } = await import("./product.service.js")

describe("getProductSales", () => {
  beforeEach(() => {
    mockProductFindUnique.mockReset()
    mockProductFindUnique.mockImplementation(async () => ({
      id: "prod1",
      slug: "pv-layout-pro",
      name: "PV Layout Pro",
      priceAmount: 4999,
      priceCurrency: "usd",
      calculations: 10,
      active: true,
      isFree: false,
      entitlements: [{ deactivatedAt: null }],
    }))
    mockCheckoutSessionFindMany.mockReset()
  })

  it("returns monthly data with 12 periods, zeros for missing periods", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [])
    const result = await getProductSales("pv-layout-pro", "monthly")
    expect(result.granularity).toBe("monthly")
    expect(result.data).toHaveLength(12)
    for (const point of result.data) {
      expect(point.revenueUsd).toBe(0)
      expect(point.purchaseCount).toBe(0)
    }
  })

  it("returns daily data with 30 periods", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [])
    const result = await getProductSales("pv-layout-pro", "daily")
    expect(result.granularity).toBe("daily")
    expect(result.data).toHaveLength(30)
  })

  it("returns weekly data with 12 periods", async () => {
    mockCheckoutSessionFindMany.mockImplementation(async () => [])
    const result = await getProductSales("pv-layout-pro", "weekly")
    expect(result.granularity).toBe("weekly")
    expect(result.data).toHaveLength(12)
  })

  it("aggregates revenue and count for sessions in the current month", async () => {
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7)
    mockCheckoutSessionFindMany.mockImplementation(async () => [
      { productSlug: "pv-layout-pro", amountTotal: 4999, processedAt: new Date(now) },
      { productSlug: "pv-layout-pro", amountTotal: 9999, processedAt: new Date(now) },
    ])
    const result = await getProductSales("pv-layout-pro", "monthly")
    const currentPeriod = result.data.find((d) => d.period === currentMonth)!
    expect(currentPeriod.purchaseCount).toBe(2)
    expect(currentPeriod.revenueUsd).toBeCloseTo(149.98)
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
    mockCheckoutSessionAggregate.mockReset()
    mockCheckoutSessionAggregate.mockImplementation(async () => ({
      _sum: { amountTotal: 14997 },
    }))
    mockCheckoutSessionCount.mockReset()
    mockCheckoutSessionCount.mockImplementation(async () => 3)
    mockEntitlementCount.mockReset()
    mockEntitlementCount.mockImplementation(async () => 2)
  })

  it("returns correct all-product totals", async () => {
    const result = await getProductsSummary()
    expect(result.totalRevenueUsd).toBeCloseTo(149.97)
    expect(result.totalPurchases).toBe(3)
    expect(result.activeEntitlements).toBe(2)
  })

  it("returns zeros when no sessions or entitlements exist", async () => {
    mockCheckoutSessionAggregate.mockImplementation(async () => ({
      _sum: { amountTotal: null },
    }))
    mockCheckoutSessionCount.mockImplementation(async () => 0)
    mockEntitlementCount.mockImplementation(async () => 0)
    const result = await getProductsSummary()
    expect(result.totalRevenueUsd).toBe(0)
    expect(result.totalPurchases).toBe(0)
    expect(result.activeEntitlements).toBe(0)
  })
})
