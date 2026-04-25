import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"

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
  granularity: "daily" | "weekly" | "monthly"
  data: SalesDataPoint[]
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

function getPeriod(
  granularity: "daily" | "weekly" | "monthly",
  date: Date,
): string {
  if (granularity === "daily") return date.toISOString().slice(0, 10)
  if (granularity === "weekly") return getISOWeek(date)
  return date.toISOString().slice(0, 7)
}

function getCutoff(
  granularity: "daily" | "weekly" | "monthly",
  now: Date,
): Date {
  const d = new Date(now)
  if (granularity === "daily") d.setDate(d.getDate() - 30)
  else if (granularity === "weekly") d.setDate(d.getDate() - 12 * 7)
  else d.setMonth(d.getMonth() - 12)
  return d
}

function generatePeriods(
  granularity: "daily" | "weekly" | "monthly",
  now: Date,
): string[] {
  if (granularity === "daily") {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (29 - i))
      return d.toISOString().slice(0, 10)
    })
  }
  if (granularity === "weekly") {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (11 - i) * 7)
      return getISOWeek(d)
    })
  }
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - (11 - i))
    return d.toISOString().slice(0, 7)
  })
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
  granularity: "daily" | "weekly" | "monthly",
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
