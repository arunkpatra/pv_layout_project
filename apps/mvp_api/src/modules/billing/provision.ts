import { db } from "../../lib/db.js"
import { createEntitlementAndTransaction } from "./create-entitlement-and-transaction.js"

/**
 * Provision an entitlement and (optionally) a license key for a completed checkout session.
 * Idempotent: if checkoutSession.processedAt is set, returns immediately.
 *
 * @param purchase - Purchase amount from Stripe. Pass from webhook handler.
 *   Omit (or pass undefined) from the verify-session safety net path.
 */
export async function provisionEntitlement(
  stripeCheckoutSessionId: string,
  purchase?: { amountTotal: number | null; currency: string | null },
): Promise<{ provisioned: boolean }> {
  const session = await db.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId },
    include: { user: true },
  })

  if (!session) {
    console.warn(`CheckoutSession not found: ${stripeCheckoutSessionId}`)
    return { provisioned: false }
  }

  if (session.processedAt) {
    return { provisioned: false }
  }

  const product = await db.product.findUnique({
    where: { slug: session.productSlug },
  })

  if (!product) {
    console.error(`Product not found for slug: ${session.productSlug}`)
    return { provisioned: false }
  }

  const amount = purchase?.amountTotal ?? product.priceAmount

  await db.$transaction(async (tx) => {
    await createEntitlementAndTransaction(tx, {
      userId: session.userId,
      productId: product.id,
      amount,
      source: "STRIPE",
      checkoutSessionId: session.id,
      totalCalculations: product.calculations,
    })

    await tx.checkoutSession.update({
      where: { id: session.id },
      data: { processedAt: new Date() },
    })
  })

  return { provisioned: true }
}
