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
    billing_address_collection: "required",
    phone_number_collection: { enabled: true },
    success_url: `${baseUrl}/dashboard/plans?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard/plans`,
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

  // Exclude deactivated entitlements from user dashboard.
  // Exhausted entitlements are kept — they serve as purchase history.
  const entitlements = await db.entitlement.findMany({
    where: { userId: user.id, deactivatedAt: null },
    orderBy: { purchasedAt: "desc" },
    include: {
      product: {
        select: { slug: true, name: true },
      },
    },
  })

  const licenseKey = await db.licenseKey.findFirst({
    where: { userId: user.id, revokedAt: null },
  })

  const mapped = entitlements.map((e) => {
    let state: "ACTIVE" | "EXHAUSTED" | "DEACTIVATED"
    if (e.deactivatedAt !== null) {
      state = "DEACTIVATED"
    } else if (e.usedCalculations >= e.totalCalculations) {
      state = "EXHAUSTED"
    } else {
      state = "ACTIVE"
    }
    return {
      id: e.id,
      product: e.product.slug,
      productName: e.product.name,
      totalCalculations: e.totalCalculations,
      usedCalculations: e.usedCalculations,
      remainingCalculations: Math.max(
        0,
        e.totalCalculations - e.usedCalculations,
      ),
      purchasedAt: e.purchasedAt.toISOString(),
      deactivatedAt: e.deactivatedAt?.toISOString() ?? null,
      state,
    }
  })

  return c.json(
    ok({
      entitlements: mapped,
      licenseKey: licenseKey?.key ?? null,
    }),
  )
})

// GET /billing/usage
billingRoutes.get("/billing/usage", async (c) => {
  const user = c.get("user")
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10))
  const parsedPageSize = parseInt(c.req.query("pageSize") ?? "20", 10)
  const pageSize = Math.min(
    100,
    Math.max(1, isNaN(parsedPageSize) ? 20 : parsedPageSize),
  )
  const skip = (page - 1) * pageSize

  const [records, total] = await Promise.all([
    db.usageRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: { product: { select: { name: true } } },
    }),
    db.usageRecord.count({ where: { userId: user.id } }),
  ])

  return c.json(
    ok({
      data: records.map((r) => ({
        featureKey: r.featureKey,
        productName: r.product.name,
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    }),
  )
})
