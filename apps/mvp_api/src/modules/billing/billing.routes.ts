import { Hono } from "hono"
import { z } from "zod"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { db } from "../../lib/db.js"
import { getStripeClient } from "../../lib/stripe.js"
import { ok } from "../../lib/response.js"
import { AppError, ValidationError } from "../../lib/errors.js"
import { provisionEntitlement } from "./provision.js"
import { env } from "../../env.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { verifyToken } from "@clerk/backend"

export const billingRoutes = new Hono<MvpHonoEnv>()

billingRoutes.use("/billing/*", clerkAuth)

const CheckoutBodySchema = z.object({
  product: z.string().min(1),
})

const VerifyBodySchema = z.object({
  sessionId: z.string().min(1),
})

async function getClerkUserId(
  authHeader: string | undefined,
): Promise<string> {
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined
  if (!token) throw new AppError("UNAUTHORIZED", "Missing token", 401)
  const payload = await verifyToken(token, {
    secretKey: env.CLERK_SECRET_KEY ?? "",
  })
  return payload.sub
}

async function resolveUser(clerkId: string) {
  let user = await db.user.findFirst({ where: { clerkId } })

  if (!user) {
    // Fetch real email from Clerk (dynamic import to avoid module resolution issues in test)
    const { createClerkClient } = await import("@clerk/backend")
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY ?? "" })
    const clerkUser = await clerk.users.getUser(clerkId)
    const email =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress

    if (!email) {
      throw new AppError("BAD_REQUEST", "Clerk user has no email address", 400)
    }

    user = await db.user.create({
      data: {
        clerkId,
        email,
        name: [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean)
          .join(" ") || undefined,
      },
    })
  }

  if (!user.stripeCustomerId) {
    const stripe = getStripeClient()
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id, clerkId: user.clerkId },
    })
    user = await db.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    })
  }

  return user
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

  if (!product || !product.active) {
    throw new ValidationError({
      product: ["Invalid or inactive product"],
    })
  }

  const clerkId = await getClerkUserId(c.req.header("Authorization"))
  const user = await resolveUser(clerkId)

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
    throw new AppError("NOT_FOUND", "Checkout session not found", 404)
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
  const clerkId = await getClerkUserId(c.req.header("Authorization"))
  const user = await db.user.findFirst({ where: { clerkId } })

  if (!user) {
    return c.json(ok({ entitlements: [], licenseKey: null }))
  }

  const entitlements = await db.entitlement.findMany({
    where: { userId: user.id },
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

  const mapped = entitlements.map((e) => ({
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
