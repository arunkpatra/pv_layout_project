import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"
import { createEntitlementAndTransaction } from "../billing/create-entitlement-and-transaction.js"
import type {
  PaymentMethod,
  TransactionFiltersQuery,
  TransactionListItem,
  TransactionSource,
} from "./types.js"

export interface CreateManualTransactionParams {
  userId: string
  productSlug: string
  paymentMethod: PaymentMethod
  externalReference?: string | null
  notes?: string | null
  purchasedAt?: Date
  createdByUserId: string
}

export async function createManualTransaction(
  params: CreateManualTransactionParams,
): Promise<{ transactionId: string; entitlementId: string }> {
  const user = await db.user.findUnique({ where: { id: params.userId } })
  if (!user) {
    throw new AppError("NOT_FOUND", `User not found: ${params.userId}`, 404)
  }

  const product = await db.product.findUnique({
    where: { slug: params.productSlug },
  })
  if (!product) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Product not found: ${params.productSlug}`,
      400,
    )
  }
  if (!product.active) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Product is not active: ${params.productSlug}`,
      400,
    )
  }
  if (product.isFree) {
    throw new AppError(
      "FREE_PRODUCT_NOT_PURCHASABLE",
      "Free tier is auto-granted at signup; manual purchase is not allowed.",
      400,
    )
  }

  return await db.$transaction(async (tx) => {
    return await createEntitlementAndTransaction(tx, {
      userId: params.userId,
      productId: product.id,
      amount: product.priceAmount,
      source: "MANUAL",
      paymentMethod: params.paymentMethod,
      externalReference: params.externalReference ?? null,
      notes: params.notes ?? null,
      createdByUserId: params.createdByUserId,
      checkoutSessionId: null,
      purchasedAt: params.purchasedAt,
      totalCalculations: product.calculations,
    })
  })
}

interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function toListItem(row: any): TransactionListItem {
  return {
    id: row.id,
    userId: row.userId,
    userEmail: row.user.email,
    userName: row.user.name ?? null,
    productId: row.productId,
    productSlug: row.product.slug,
    productName: row.product.name,
    source: row.source as TransactionSource,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    purchasedAt: row.purchasedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    paymentMethod: (row.paymentMethod ?? null) as PaymentMethod | null,
    externalReference: row.externalReference ?? null,
    notes: row.notes ?? null,
    createdByUserId: row.createdByUserId ?? null,
    createdByEmail: row.createdByUser?.email ?? null,
    checkoutSessionId: row.checkoutSessionId ?? null,
  }
}

export async function listTransactions(
  filters: TransactionFiltersQuery,
): Promise<{ transactions: TransactionListItem[]; pagination: PaginationMeta }> {
  const where: Record<string, unknown> = {}
  if (filters.source && filters.source !== "ALL") where.source = filters.source
  if (filters.email) where.user = { email: { contains: filters.email, mode: "insensitive" } }
  if (filters.productSlug) where.product = { slug: filters.productSlug }
  if (filters.from || filters.to) {
    where.purchasedAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    }
  }

  const skip = (filters.page - 1) * filters.pageSize
  const [rows, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: {
        user: { select: { email: true, name: true } },
        product: { select: { slug: true, name: true } },
        createdByUser: { select: { email: true } },
      },
      orderBy: { purchasedAt: "desc" },
      skip,
      take: filters.pageSize,
    }),
    db.transaction.count({ where }),
  ])

  return {
    transactions: rows.map(toListItem),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
  }
}

export async function getTransaction(id: string): Promise<TransactionListItem> {
  const row = await db.transaction.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      product: { select: { slug: true, name: true } },
      createdByUser: { select: { email: true } },
    },
  })
  if (!row) {
    throw new AppError("NOT_FOUND", `Transaction not found: ${id}`, 404)
  }
  return toListItem(row)
}
