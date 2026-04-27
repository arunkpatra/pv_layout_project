import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"

export type CustomerListItem = {
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string
  totalSpendUsd: number
  activeEntitlementCount: number
  totalCalculations: number
}

export type EntitlementState = "ACTIVE" | "EXHAUSTED" | "DEACTIVATED"

export type EntitlementDetail = {
  id: string
  productId: string
  productName: string
  productSlug: string
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
  purchasedAt: string
  deactivatedAt: string | null
  state: EntitlementState
}

export type CustomerDetail = {
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string
  totalSpendUsd: number
  entitlements: EntitlementDetail[]
}

export type CustomerPaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function deriveEntitlementState(e: {
  deactivatedAt: Date | null
  usedCalculations: number
  totalCalculations: number
}): EntitlementState {
  if (e.deactivatedAt !== null) return "DEACTIVATED"
  if (e.usedCalculations >= e.totalCalculations) return "EXHAUSTED"
  return "ACTIVE"
}

export async function listCustomers(params: {
  page: number
  pageSize: number
}): Promise<{ data: CustomerListItem[]; pagination: CustomerPaginationMeta }> {
  const { page, pageSize } = params
  const skip = (page - 1) * pageSize

  const [users, total] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        checkoutSessions: { select: { amountTotal: true } },
        entitlements: { select: { deactivatedAt: true } },
        _count: { select: { usageRecords: true } },
      },
    }),
    db.user.count(),
  ])

  const data: CustomerListItem[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    roles: u.roles,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    totalSpendUsd:
      u.checkoutSessions.reduce(
        (sum, s) => sum + (s.amountTotal ?? 0),
        0,
      ) / 100,
    activeEntitlementCount: u.entitlements.filter(
      (e) => e.deactivatedAt === null,
    ).length,
    totalCalculations: u._count.usageRecords,
  }))

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

export async function getCustomer(
  id: string,
  filter: "active" | "all" = "active",
): Promise<CustomerDetail> {
  const user = await db.user.findUnique({
    where: { id },
    include: {
      checkoutSessions: { select: { amountTotal: true } },
      entitlements: {
        where: filter === "active" ? { deactivatedAt: null } : {},
        include: {
          product: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { purchasedAt: "desc" },
      },
    },
  })

  if (!user) {
    throw new AppError("NOT_FOUND", `Customer ${id} not found`, 404)
  }

  const allEntitlements: EntitlementDetail[] = user.entitlements.map((e) => ({
    id: e.id,
    productId: e.product.id,
    productName: e.product.name,
    productSlug: e.product.slug,
    totalCalculations: e.totalCalculations,
    usedCalculations: e.usedCalculations,
    remainingCalculations: e.totalCalculations - e.usedCalculations,
    purchasedAt: e.purchasedAt.toISOString(),
    deactivatedAt: e.deactivatedAt?.toISOString() ?? null,
    state: deriveEntitlementState(e),
  }))

  // The DB filter only checks deactivatedAt for "active" — also exclude
  // EXHAUSTED entitlements (usedCalculations >= totalCalculations)
  const entitlements =
    filter === "active"
      ? allEntitlements.filter((e) => e.state === "ACTIVE")
      : allEntitlements

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    totalSpendUsd:
      user.checkoutSessions.reduce(
        (sum, s) => sum + (s.amountTotal ?? 0),
        0,
      ) / 100,
    entitlements,
  }
}

export async function updateEntitlementUsed(params: {
  entitlementId: string
  usedCalculations: number
}): Promise<{
  id: string
  usedCalculations: number
  totalCalculations: number
}> {
  const { entitlementId, usedCalculations } = params

  const existing = await db.entitlement.findUnique({
    where: { id: entitlementId },
    select: { id: true, totalCalculations: true },
  })
  if (!existing) {
    throw new AppError(
      "NOT_FOUND",
      `Entitlement ${entitlementId} not found`,
      404,
    )
  }

  if (usedCalculations < 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Used calculations cannot be negative",
      400,
    )
  }

  if (usedCalculations > existing.totalCalculations) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Used calculations (${usedCalculations}) cannot exceed total (${existing.totalCalculations})`,
      400,
    )
  }

  return db.entitlement.update({
    where: { id: entitlementId },
    data: { usedCalculations },
    select: { id: true, usedCalculations: true, totalCalculations: true },
  })
}

export async function listCustomerTransactions(userId: string, limit = 10) {
  const rows = await db.transaction.findMany({
    where: { userId },
    include: {
      product: { select: { slug: true, name: true } },
      createdByUser: { select: { email: true } },
    },
    orderBy: { purchasedAt: "desc" },
    take: limit,
  })
  return rows.map((row) => ({
    id: row.id,
    productSlug: row.product.slug,
    productName: row.product.name,
    source: row.source,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    purchasedAt: row.purchasedAt.toISOString(),
    paymentMethod: row.paymentMethod ?? null,
    externalReference: row.externalReference ?? null,
    createdByEmail: row.createdByUser?.email ?? null,
  }))
}

export async function updateEntitlementStatus(params: {
  entitlementId: string
  status: "ACTIVE" | "INACTIVE"
}): Promise<{
  id: string
  deactivatedAt: Date | null
}> {
  const { entitlementId, status } = params

  const existing = await db.entitlement.findUnique({
    where: { id: entitlementId },
  })
  if (!existing) {
    throw new AppError(
      "NOT_FOUND",
      `Entitlement ${entitlementId} not found`,
      404,
    )
  }

  return db.entitlement.update({
    where: { id: entitlementId },
    data: { deactivatedAt: status === "INACTIVE" ? new Date() : null },
  })
}
