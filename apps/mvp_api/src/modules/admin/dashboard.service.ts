import { db } from "../../lib/db.js"
import {
  type Granularity,
  getCutoff,
  generatePeriods,
  getPeriod,
} from "./sales-utils.js"

export type DashboardSummary = {
  totalRevenueUsd: number
  totalCustomers: number
  totalPurchases: number
  totalCalculations: number
}

export type RevenueTrendPoint = {
  period: string
  revenueUsd: number
}

export type CustomerTrendPoint = {
  period: string
  count: number
}

export type PurchaseTrendPoint = {
  period: string
  count: number
}

export type CalculationTrendPoint = {
  period: string
  count: number
}

export type DashboardTrends = {
  granularity: Granularity
  revenue: RevenueTrendPoint[]
  customers: CustomerTrendPoint[]
  purchases: PurchaseTrendPoint[]
  calculations: CalculationTrendPoint[]
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [revenueAgg, totalCustomers, totalPurchases, totalCalculations] =
    await Promise.all([
      db.checkoutSession.aggregate({
        _sum: { amountTotal: true },
        where: { processedAt: { not: null } },
      }),
      db.user.count(),
      db.checkoutSession.count({ where: { processedAt: { not: null } } }),
      db.usageRecord.count(),
    ])

  return {
    totalRevenueUsd: ((revenueAgg._sum.amountTotal ?? 0) as number) / 100,
    totalCustomers,
    totalPurchases,
    totalCalculations,
  }
}

export async function getDashboardTrends(
  granularity: Granularity,
): Promise<DashboardTrends> {
  const now = new Date()
  const cutoff = getCutoff(granularity, now)

  const [sessions, users, usageRecords] = await Promise.all([
    db.checkoutSession.findMany({
      where: { processedAt: { not: null, gte: cutoff } },
      select: { amountTotal: true, processedAt: true },
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

  const revenueMap = new Map<string, number>(periods.map((p) => [p, 0]))
  const purchaseMap = new Map<string, number>(periods.map((p) => [p, 0]))
  for (const s of sessions) {
    const period = getPeriod(granularity, s.processedAt!)
    const prevRev = revenueMap.get(period)
    if (prevRev !== undefined) {
      revenueMap.set(period, prevRev + (s.amountTotal ?? 0) / 100)
    }
    const prevPur = purchaseMap.get(period)
    if (prevPur !== undefined) {
      purchaseMap.set(period, prevPur + 1)
    }
  }

  const customerMap = new Map<string, number>(periods.map((p) => [p, 0]))
  for (const u of users) {
    const period = getPeriod(granularity, u.createdAt)
    const prev = customerMap.get(period)
    if (prev !== undefined) {
      customerMap.set(period, prev + 1)
    }
  }

  const calculationMap = new Map<string, number>(periods.map((p) => [p, 0]))
  for (const r of usageRecords) {
    const period = getPeriod(granularity, r.createdAt)
    const prev = calculationMap.get(period)
    if (prev !== undefined) {
      calculationMap.set(period, prev + 1)
    }
  }

  return {
    granularity,
    revenue: periods.map((p) => ({ period: p, revenueUsd: revenueMap.get(p)! })),
    customers: periods.map((p) => ({ period: p, count: customerMap.get(p)! })),
    purchases: periods.map((p) => ({ period: p, count: purchaseMap.get(p)! })),
    calculations: periods.map((p) => ({ period: p, count: calculationMap.get(p)! })),
  }
}
