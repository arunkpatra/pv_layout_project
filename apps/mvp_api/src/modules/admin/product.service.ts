import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"
import { getStripeClient } from "../../lib/stripe.js"
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
  revenueStripe: number
  revenueManual: number
  purchaseCount: number
  purchasesStripe: number
  purchasesManual: number
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
  revenueStripe: number
  revenueManual: number
  purchaseCount: number
  purchasesStripe: number
  purchasesManual: number
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

  const [products, total, transactions] = await Promise.all([
    db.product.findMany({
      orderBy: { displayOrder: "asc" },
      skip,
      take: pageSize,
      include: {
        entitlements: { select: { deactivatedAt: true } },
      },
    }),
    db.product.count(),
    db.transaction.findMany({
      where: { source: { in: ["STRIPE", "MANUAL"] } },
      select: { productId: true, amount: true, source: true },
    }),
  ])

  const txByProductId = new Map<
    string,
    { productId: string; amount: number; source: string }[]
  >()
  for (const tx of transactions) {
    const arr = txByProductId.get(tx.productId) ?? []
    arr.push(tx)
    txByProductId.set(tx.productId, arr)
  }

  const data: ProductListItem[] = products.map((p) => {
    const productTxs = txByProductId.get(p.id) ?? []
    let totalRevenueUsd = 0
    let revenueStripe = 0
    let revenueManual = 0
    let purchasesStripe = 0
    let purchasesManual = 0
    for (const tx of productTxs) {
      const amountUsd = tx.amount / 100
      totalRevenueUsd += amountUsd
      if (tx.source === "STRIPE") {
        revenueStripe += amountUsd
        purchasesStripe += 1
      } else if (tx.source === "MANUAL") {
        revenueManual += amountUsd
        purchasesManual += 1
      }
    }
    return {
      slug: p.slug,
      name: p.name,
      priceAmount: p.priceAmount,
      priceCurrency: p.priceCurrency,
      calculations: p.calculations,
      active: p.active,
      isFree: p.isFree,
      totalRevenueUsd,
      revenueStripe,
      revenueManual,
      purchaseCount: productTxs.length,
      purchasesStripe,
      purchasesManual,
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
  const product = await db.product.findUnique({
    where: { slug },
    include: {
      entitlements: { select: { deactivatedAt: true } },
    },
  })

  if (!product) {
    throw new AppError("NOT_FOUND", `Product ${slug} not found`, 404)
  }

  const transactions = await db.transaction.findMany({
    where: {
      productId: product.id,
      source: { in: ["STRIPE", "MANUAL"] },
    },
    select: { amount: true, source: true },
  })

  let totalRevenueUsd = 0
  let revenueStripe = 0
  let revenueManual = 0
  let purchasesStripe = 0
  let purchasesManual = 0
  for (const tx of transactions) {
    const amountUsd = tx.amount / 100
    totalRevenueUsd += amountUsd
    if (tx.source === "STRIPE") {
      revenueStripe += amountUsd
      purchasesStripe += 1
    } else if (tx.source === "MANUAL") {
      revenueManual += amountUsd
      purchasesManual += 1
    }
  }

  return {
    slug: product.slug,
    name: product.name,
    priceAmount: product.priceAmount,
    priceCurrency: product.priceCurrency,
    calculations: product.calculations,
    active: product.active,
    isFree: product.isFree,
    totalRevenueUsd,
    revenueStripe,
    revenueManual,
    purchaseCount: transactions.length,
    purchasesStripe,
    purchasesManual,
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

  const transactions = await db.transaction.findMany({
    where: {
      productId: product.id,
      source: { in: ["STRIPE", "MANUAL"] },
      purchasedAt: { gte: cutoff },
    },
    select: { amount: true, purchasedAt: true, source: true },
  })

  const periods = generatePeriods(granularity, now)
  const grouped = new Map<
    string,
    {
      revenueUsd: number
      revenueStripe: number
      revenueManual: number
      purchaseCount: number
      purchasesStripe: number
      purchasesManual: number
    }
  >(
    periods.map((p) => [
      p,
      {
        revenueUsd: 0,
        revenueStripe: 0,
        revenueManual: 0,
        purchaseCount: 0,
        purchasesStripe: 0,
        purchasesManual: 0,
      },
    ]),
  )

  for (const tx of transactions) {
    const period = getPeriod(granularity, tx.purchasedAt)
    const entry = grouped.get(period)
    if (entry) {
      const amountUsd = tx.amount / 100
      entry.revenueUsd += amountUsd
      entry.purchaseCount += 1
      if (tx.source === "STRIPE") {
        entry.revenueStripe += amountUsd
        entry.purchasesStripe += 1
      } else if (tx.source === "MANUAL") {
        entry.revenueManual += amountUsd
        entry.purchasesManual += 1
      }
    }
  }

  return {
    granularity,
    data: periods.map((p) => ({ period: p, ...grouped.get(p)! })),
  }
}

export type ProductsSummary = {
  totalRevenueUsd: number
  revenueStripe: number
  revenueManual: number
  totalPurchases: number
  purchasesStripe: number
  purchasesManual: number
  activeEntitlements: number
}

export async function updateStripePriceId(
  slug: string,
  stripePriceId: string,
): Promise<{ slug: string; stripePriceId: string }> {
  const product = await db.product.findUnique({
    where: { slug },
    select: { id: true, isFree: true },
  })
  if (!product) {
    throw new AppError("NOT_FOUND", `Product ${slug} not found`, 404)
  }

  // Free plans use a sentinel price ID — skip Stripe validation
  if (!product.isFree) {
    const stripe = getStripeClient()
    try {
      const price = await stripe.prices.retrieve(stripePriceId)
      if (!price.active) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Stripe price ${stripePriceId} exists but is not active`,
          400,
        )
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError(
        "VALIDATION_ERROR",
        `Stripe price ${stripePriceId} does not exist or could not be verified`,
        400,
      )
    }
  }

  const updated = await db.product.update({
    where: { slug },
    data: { stripePriceId },
    select: { slug: true, stripePriceId: true },
  })

  return updated
}

export async function listProductStripePrices(): Promise<
  { slug: string; name: string; stripePriceId: string; isFree: boolean }[]
> {
  return db.product.findMany({
    orderBy: { displayOrder: "asc" },
    select: { slug: true, name: true, stripePriceId: true, isFree: true },
  })
}

export async function getProductsSummary(): Promise<ProductsSummary> {
  const [paid, stripe, manual, activeEntitlements] = await Promise.all([
    db.transaction.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { source: { in: ["STRIPE", "MANUAL"] } },
    }),
    db.transaction.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { source: "STRIPE" },
    }),
    db.transaction.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { source: "MANUAL" },
    }),
    db.entitlement.count({ where: { deactivatedAt: null } }),
  ])

  return {
    totalRevenueUsd: ((paid._sum.amount ?? 0) as number) / 100,
    revenueStripe: ((stripe._sum.amount ?? 0) as number) / 100,
    revenueManual: ((manual._sum.amount ?? 0) as number) / 100,
    totalPurchases: paid._count,
    purchasesStripe: stripe._count,
    purchasesManual: manual._count,
    activeEntitlements,
  }
}
