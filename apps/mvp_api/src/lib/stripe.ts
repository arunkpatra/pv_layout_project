import Stripe from "stripe"
import { env } from "../env.js"

export function getStripeClient(): Stripe {
  const key = env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured")
  }
  return new Stripe(key)
}
