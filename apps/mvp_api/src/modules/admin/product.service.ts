import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"
import {
  type Granularity,
  getISOWeek,
  getPeriod,
  getCutoff,
  generatePeriods,
} from "./sales-utils.js"

export type ProductListItem = {
  slug: string
  name: string
  priceAmount: number
  priceCurrency: string
  calculations: number
  active: boolean
  isFree: boolean
  totalRevenueUsd: number
  purchaseCount: number
  activeEntitlementCount: number
}

export type ProductPaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type SalesDataPoint = {
  period: string
  revenueUsd: number
  purchaseCount: number
}

export type ProductSalesResult = {
  granularity: Granularity
  data: SalesDataPoint[]
}

export async function listProducts(params: {
  page: number
  pageSize: number
}): Promise<{ data: ProductListItem[]; pagination: ProductPaginationMeta }> {
  const { page, pageSize } = params
  const skip = (page - 1) * pageSize

  const [products, total, sessions] = await Promise.all([
    db.product.findMany({
      orderBy: { displayOrder: "asc" },
      skip,
      take: pageSize,
      include: {
        entitlements: { select: { deactivatedAt: true } },
      },
    }),
    db.product.count(),
    // No Prisma relation between CheckoutSession and Product; join by productSlug in JS
    db.checkoutSession.findMany({
      where: { processedAt: { not: null } },
      select: { productSlug: true, amountTotal: true },
    }),
  ])

  const sessionsBySlug = new Map<
    string,
    { productSlug: string; amountTotal: number | null }[]
  >()
  for (const s of sessions) {
    const arr = sessionsBySlug.get(s.productSlug) ?? []
    arr.push(s)
    sessionsBySlug.set(s.productSlug, arr)
  }

  const data: ProductListItem[] = products.map((p) => {
    const productSessions = sessionsBySlug.get(p.slug) ?? []
    return {
      slug: p.slug,
      name: p.name,
      priceAmount: p.priceAmount,
      priceCurrency: p.priceCurrency,
      calculations: p.calculations,
      active: p.active,
      isFree: p.isFree,
      totalRevenueUsd:
        productSessions.reduce((sum, s) => sum + (s.amountTotal ?? 0), 0) /
        100,
      purchaseCount: productSessions.length,
      activeEntitlementCount: p.entitlements.filter(
        (e) => e.deactivatedAt === null,
      ).length,
    }
  })

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getProduct(slug: string): Promise<ProductListItem> {
  const [product, sessions] = await Promise.all([
    db.product.findUnique({
      where: { slug },
      include: {
        entitlements: { select: { deactivatedAt: true } },
      },
    }),
    db.checkoutSession.findMany({
      where: { productSlug: slug, processedAt: { not: null } },
      select: { amountTotal: true },
    }),
  ])

  if (!product) {
    throw new AppError("NOT_FOUND", `Product ${slug} not found`, 404)
  }

  return {
    slug: product.slug,
    name: product.name,
    priceAmount: product.priceAmount,
    priceCurrency: product.priceCurrency,
    calculations: product.calculations,
    active: product.active,
    isFree: product.isFree,
    totalRevenueUsd:
      sessions.reduce((sum, s) => sum + (s.amountTotal ?? 0), 0) / 100,
    purchaseCount: sessions.length,
    activeEntitlementCount: product.entitlements.filter(
      (e) => e.deactivatedAt === null,
    ).length,
  }
}

export async function getProductSales(
  slug: string,
  granularity: Granularity,
): Promise<ProductSalesResult> {
  const product = await db.product.findUnique({
    where: { slug },
    select: { id: true },
  })
  if (!product) {
    throw new AppError("NOT_FOUND", `Product ${slug} not found`, 404)
  }

  const now = new Date()
  const cutoff = getCutoff(granularity, now)

  const sessions = await db.checkoutSession.findMany({
    where: {
      productSlug: slug,
      // Prisma merges `not: null` and `gte: cutoff` as AND on the same field
      processedAt: { not: null, gte: cutoff },
    },
    select: { amountTotal: true, processedAt: true },
  })

  const periods = generatePeriods(granularity, now)
  const grouped = new Map<string, { revenueUsd: number; purchaseCount: number }>(
    periods.map((p) => [p, { revenueUsd: 0, purchaseCount: 0 }]),
  )

  for (const session of sessions) {
    const period = getPeriod(granularity, session.processedAt!)
    const entry = grouped.get(period)
    if (entry) {
      entry.revenueUsd += (session.amountTotal ?? 0) / 100
      entry.purchaseCount += 1
    }
  }

  return {
    granularity,
    data: periods.map((p) => ({ period: p, ...grouped.get(p)! })),
  }
}

export type ProductsSummary = {
  totalRevenueUsd: number
  totalPurchases: number
  activeEntitlements: number
}

export async function getProductsSummary(): Promise<ProductsSummary> {
  const [revenueAgg, totalPurchases, activeEntitlements] = await Promise.all([
    db.checkoutSession.aggregate({
      _sum: { amountTotal: true },
      where: { processedAt: { not: null } },
    }),
    db.checkoutSession.count({ where: { processedAt: { not: null } } }),
    db.entitlement.count({ where: { deactivatedAt: null } }),
  ])

  return {
    totalRevenueUsd: (revenueAgg._sum.amountTotal ?? 0) / 100,
    totalPurchases,
    activeEntitlements,
  }
}
