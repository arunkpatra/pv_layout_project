import { Hono } from "hono"
import { z } from "zod"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { db } from "../../lib/db.js"
import { getStripeClient } from "../../lib/stripe.js"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"
import { provisionEntitlement } from "./provision.js"
import { env } from "../../env.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const billingRoutes = new Hono<MvpHonoEnv>()

billingRoutes.use("/billing/*", clerkAuth)

const CheckoutBodySchema = z.object({
  product: z.string().min(1),
})

const VerifyBodySchema = z.object({
  sessionId: z.string().min(1),
})

/** Ensure user has a Stripe customer ID. Creates one if missing. */
async function ensureStripeCustomer(user: {
  id: string
  email: string
  name: string | null
  clerkId: string
  stripeCustomerId: string | null
}) {
  if (user.stripeCustomerId) return user

  const stripe = getStripeClient()
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId: user.id, clerkId: user.clerkId },
  })

  return db.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  })
}

// POST /billing/checkout
billingRoutes.post("/billing/checkout", async (c) => {
  const body = CheckoutBodySchema.safeParse(await c.req.json())
  if (!body.success) {
    throw new ValidationError(body.error.flatten().fieldErrors)
  }

  const product = await db.product.findUnique({
    where: { slug: body.data.product },
  })

  if (!product || !product.active || product.isFree) {
    throw new ValidationError({
      product: ["Invalid or inactive product"],
    })
  }

  // User is guaranteed to exist — created by clerkAuth middleware
  const user = await ensureStripeCustomer(c.get("user"))

  const stripe = getStripeClient()
  const baseUrl =
    env.MVP_CORS_ORIGINS?.split(",")[0]?.trim() ?? "http://localhost:3002"

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: user.stripeCustomerId!,
    line_items: [{ price: product.stripePriceId, quantity: 1 }],
    metadata: { userId: user.id, product: product.slug },
    success_url: `${baseUrl}/dashboard/plan?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard/plan`,
  })

  await db.checkoutSession.create({
    data: {
      userId: user.id,
      productSlug: product.slug,
      stripeCheckoutSessionId: session.id,
      stripeCheckoutSessionUrl: session.url!,
    },
  })

  return c.json(ok({ url: session.url! }))
})

// POST /billing/verify-session
billingRoutes.post("/billing/verify-session", async (c) => {
  const body = VerifyBodySchema.safeParse(await c.req.json())
  if (!body.success) {
    throw new ValidationError(body.error.flatten().fieldErrors)
  }

  const session = await db.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId: body.data.sessionId },
  })

  if (!session) {
    throw new ValidationError({ sessionId: ["Checkout session not found"] })
  }

  if (session.processedAt) {
    return c.json(ok({ verified: true, updated: false }))
  }

  const stripe = getStripeClient()
  const stripeSession = await stripe.checkout.sessions.retrieve(
    body.data.sessionId,
  )

  if (stripeSession.status !== "complete") {
    await db.checkoutSession.update({
      where: { id: session.id },
      data: { status: stripeSession.status ?? undefined },
    })
    return c.json(ok({ verified: false }))
  }

  const result = await provisionEntitlement(body.data.sessionId)
  return c.json(ok({ verified: true, updated: result.provisioned }))
})

// GET /billing/entitlements
billingRoutes.get("/billing/entitlements", async (c) => {
  const user = c.get("user")

  // Exclude deactivated entitlements at DB level; exclude exhausted in JS
  const entitlements = await db.entitlement.findMany({
    where: { userId: user.id, deactivatedAt: null },
    orderBy: { purchasedAt: "desc" },
    include: {
      product: {
        select: { slug: true, name: true },
      },
    },
  })

  const active = entitlements.filter(
    (e) => e.usedCalculations < e.totalCalculations,
  )

  const licenseKey = await db.licenseKey.findFirst({
    where: { userId: user.id, revokedAt: null },
  })

  const mapped = active.map((e) => ({
    product: e.product.slug,
    productName: e.product.name,
    totalCalculations: e.totalCalculations,
    usedCalculations: e.usedCalculations,
    remainingCalculations: e.totalCalculations - e.usedCalculations,
    purchasedAt: e.purchasedAt.toISOString(),
  }))

  return c.json(
    ok({
      entitlements: mapped,
      licenseKey: licenseKey?.key ?? null,
    }),
  )
})
