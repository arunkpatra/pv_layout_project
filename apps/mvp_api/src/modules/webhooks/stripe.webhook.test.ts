import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
  errorHandler,
  type MvpHonoEnv,
} from "../../middleware/error-handler.js"

const mockProvision = mock(async () => ({ provisioned: true }))
mock.module("../billing/provision.js", () => ({
  provisionEntitlement: mockProvision,
}))

const mockConstructEvent = mock(
  (_body: unknown, _sig: unknown, _secret: unknown) => ({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        metadata: { userId: "usr_test1", product: "pv-layout-basic" },
      },
    },
  }),
)
mock.module("../../lib/stripe.js", () => ({
  getStripeClient: () => ({
    webhooks: { constructEventAsync: mockConstructEvent },
  }),
}))

mock.module("../../env.js", () => ({
  env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
}))

const { stripeWebhookRoutes } = await import("./stripe.webhook.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", stripeWebhookRoutes)
  app.onError(errorHandler)
  return app
}

describe("POST /webhooks/stripe", () => {
  beforeEach(() => {
    mockProvision.mockReset()
    mockConstructEvent.mockReset()
    mockProvision.mockImplementation(async () => ({ provisioned: true }))
    mockConstructEvent.mockImplementation(() => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          metadata: { userId: "usr_test1", product: "pv-layout-basic" },
        },
      },
    }))
  })

  it("returns 200 and provisions entitlement for checkout.session.completed", async () => {
    const app = makeApp()
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "test_sig",
      },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    })
    expect(res.status).toBe(200)
    expect(mockProvision).toHaveBeenCalledWith("cs_test_123")
  })

  it("returns 200 and ignores unhandled event types", async () => {
    mockConstructEvent.mockImplementation(() => ({
      type: "customer.created",
      data: {
        object: { id: "", metadata: { userId: "", product: "" } },
      },
    }))
    const app = makeApp()
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "test_sig",
      },
      body: JSON.stringify({ type: "customer.created" }),
    })
    expect(res.status).toBe(200)
    expect(mockProvision).not.toHaveBeenCalled()
  })

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature")
    })
    const app = makeApp()
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "bad_sig",
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})
