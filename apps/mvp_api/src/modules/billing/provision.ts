import { db } from "../../lib/db.js"
import crypto from "node:crypto"

/**
 * Provision an entitlement and (optionally) a license key for a completed checkout session.
 * Idempotent: if checkoutSession.processedAt is set, returns immediately.
 */
export async function provisionEntitlement(
  stripeCheckoutSessionId: string,
): Promise<{ provisioned: boolean }> {
  const session = await db.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId },
    include: { user: true },
  })

  if (!session) {
    console.warn(`CheckoutSession not found: ${stripeCheckoutSessionId}`)
    return { provisioned: false }
  }

  // Idempotency guard
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

  // Check if user already has a license key
  const existingKey = await db.licenseKey.findFirst({
    where: { userId: session.userId },
  })

  // Single transaction: create entitlement + license key + mark processed
  await db.$transaction(async (tx) => {
    await tx.entitlement.create({
      data: {
        userId: session.userId,
        productId: product.id,
        totalCalculations: product.calculations,
      },
    })

    if (!existingKey) {
      const key = `sl_live_${crypto.randomBytes(24).toString("base64url")}`
      await tx.licenseKey.create({
        data: {
          userId: session.userId,
          key,
        },
      })
    }

    await tx.checkoutSession.update({
      where: { id: session.id },
      data: { processedAt: new Date() },
    })
  })

  return { provisioned: true }
}
