import { db } from "../../lib/db.js"
import {
  type Granularity,
  getCutoff,
  generatePeriods,
  getPeriod,
} from "./sales-utils.js"

export type DashboardSummary = {
  totalRevenue: number
  totalRevenueStripe: number
  totalRevenueManual: number
  totalPurchases: number
  totalPurchasesStripe: number
  totalPurchasesManual: number
  totalCustomers: number
  totalCalculations: number
}

export type DashboardTrendPoint = {
  period: string
  revenue: number
  revenueStripe: number
  revenueManual: number
  purchases: number
  purchasesStripe: number
  purchasesManual: number
  customers: number
  calculations: number
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [paid, stripe, manual, totalCustomers, totalCalculations] =
    await Promise.all([
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
      db.user.count(),
      db.usageRecord.count(),
    ])

  return {
    totalRevenue: (paid._sum.amount ?? 0) as number,
    totalRevenueStripe: (stripe._sum.amount ?? 0) as number,
    totalRevenueManual: (manual._sum.amount ?? 0) as number,
    totalPurchases: paid._count,
    totalPurchasesStripe: stripe._count,
    totalPurchasesManual: manual._count,
    totalCustomers,
    totalCalculations,
  }
}

export async function getDashboardTrends(
  granularity: Granularity,
): Promise<DashboardTrendPoint[]> {
  const now = new Date()
  const cutoff = getCutoff(granularity, now)

  const [transactions, users, usageRecords] = await Promise.all([
    db.transaction.findMany({
      where: {
        source: { in: ["STRIPE", "MANUAL"] },
        purchasedAt: { gte: cutoff },
      },
      select: { amount: true, purchasedAt: true, source: true },
    }),
    db.user.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { createdAt: true },
    }),
    db.usageRecord.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { createdAt: true },
    }),
  ])

  const periods = generatePeriods(granularity, now)

  type Bucket = {
    revenue: number
    revenueStripe: number
    revenueManual: number
    purchases: number
    purchasesStripe: number
    purchasesManual: number
    customers: number
    calculations: number
  }

  const buckets = new Map<string, Bucket>(
    periods.map((p) => [
      p,
      {
        revenue: 0,
        revenueStripe: 0,
        revenueManual: 0,
        purchases: 0,
        purchasesStripe: 0,
        purchasesManual: 0,
        customers: 0,
        calculations: 0,
      },
    ]),
  )

  for (const row of transactions) {
    const key = getPeriod(granularity, row.purchasedAt)
    const b = buckets.get(key)
    if (b === undefined) continue
    const amountUsd = row.amount / 100
    b.revenue += amountUsd
    b.purchases += 1
    if (row.source === "STRIPE") {
      b.revenueStripe += amountUsd
      b.purchasesStripe += 1
    } else if (row.source === "MANUAL") {
      b.revenueManual += amountUsd
      b.purchasesManual += 1
    }
  }

  for (const u of users) {
    const key = getPeriod(granularity, u.createdAt)
    const b = buckets.get(key)
    if (b !== undefined) b.customers += 1
  }

  for (const r of usageRecords) {
    const key = getPeriod(granularity, r.createdAt)
    const b = buckets.get(key)
    if (b !== undefined) b.calculations += 1
  }

  return periods.map((p) => ({ period: p, ...buckets.get(p)! }))
}
