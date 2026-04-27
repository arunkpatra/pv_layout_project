import crypto from "node:crypto"
import { db } from "../../lib/db.js"

export interface SharedProvisionParams {
  userId: string
  productId: string
  amount: number // USD cents
  source: "STRIPE" | "MANUAL"
  paymentMethod?: string | null
  externalReference?: string | null
  notes?: string | null
  createdByUserId?: string | null
  checkoutSessionId?: string | null
  purchasedAt?: Date
  totalCalculations: number
}

/**
 * The transaction client type as provided by db.$transaction when the Prisma
 * client has extensions applied (semantic-id, strict-id). This is wider than
 * Prisma.TransactionClient and is the correct type for extended-client tx callbacks.
 */
export type ExtendedTx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/**
 * Creates a Transaction + Entitlement and (if missing) a LicenseKey for the user.
 * Caller must wrap in db.$transaction; pass `tx` as the first argument.
 */
export async function createEntitlementAndTransaction(
  tx: ExtendedTx,
  params: SharedProvisionParams,
): Promise<{ transactionId: string; entitlementId: string }> {
  const transaction = await tx.transaction.create({
    data: {
      userId: params.userId,
      productId: params.productId,
      source: params.source,
      status: "COMPLETED",
      amount: params.amount,
      currency: "usd",
      purchasedAt: params.purchasedAt ?? new Date(),
      paymentMethod: params.paymentMethod ?? null,
      externalReference: params.externalReference ?? null,
      notes: params.notes ?? null,
      createdByUserId: params.createdByUserId ?? null,
      checkoutSessionId: params.checkoutSessionId ?? null,
    },
  })

  const entitlement = await tx.entitlement.create({
    data: {
      userId: params.userId,
      productId: params.productId,
      transactionId: transaction.id,
      totalCalculations: params.totalCalculations,
    },
  })

  const existingKey = await tx.licenseKey.findFirst({
    where: { userId: params.userId },
  })
  if (!existingKey) {
    const key = `sl_live_${crypto.randomBytes(24).toString("base64url")}`
    await tx.licenseKey.create({
      data: { userId: params.userId, key },
    })
  }

  return { transactionId: transaction.id, entitlementId: entitlement.id }
}
