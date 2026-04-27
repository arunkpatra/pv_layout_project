import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"
import { createEntitlementAndTransaction } from "../billing/create-entitlement-and-transaction.js"
import type { PaymentMethod } from "./types.js"

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
