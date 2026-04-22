import { Hono } from "hono"
import { getStripeClient } from "../../lib/stripe.js"
import { env } from "../../env.js"
import { provisionEntitlement } from "../billing/provision.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const stripeWebhookRoutes = new Hono<MvpHonoEnv>()

stripeWebhookRoutes.post("/webhooks/stripe", async (c) => {
  const stripe = getStripeClient()
  const sig = c.req.header("stripe-signature")

  if (!sig) {
    return c.json({ error: "Missing stripe-signature header" }, 400)
  }

  const rawBody = await c.req.text()

  let event
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      env.STRIPE_WEBHOOK_SECRET ?? "",
    )
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", String(err))
    return c.json({ error: "Invalid signature" }, 400)
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string
      metadata: Record<string, string>
    }

    console.log(
      JSON.stringify({
        level: "info",
        event: "checkout.session.completed",
        stripeSessionId: session.id,
        product: session.metadata?.product,
        userId: session.metadata?.userId,
      }),
    )

    try {
      await provisionEntitlement(session.id)
    } catch (err) {
      console.error("Provisioning failed for session:", session.id, err)
      return c.json({ error: "Provisioning failed" }, 500)
    }
  }

  return c.json({ received: true }, 200)
})
