import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
  errorHandler,
  type MvpHonoEnv,
} from "../../middleware/error-handler.js"

// Mock DB — provision.ts uses db.$transaction and db.checkoutSession.findUnique
const mockCheckoutSessionFindUnique = mock(async () => ({
  id: "cs_db_1",
  stripeCheckoutSessionId: "cs_test_123",
  userId: "usr_test1",
  productSlug: "pv-layout-basic",
  processedAt: null,
  user: { id: "usr_test1", email: "test@example.com" },
}))
const mockProductFindUnique = mock(async () => ({
  id: "prod_test1",
  slug: "pv-layout-basic",
  calculations: 5,
}))
const mockLicenseKeyFindFirst = mock(async () => ({
  key: "sl_live_existingkey",
}))
mock.module("../../lib/db.js", () => ({
  db: {
    checkoutSession: { findUnique: mockCheckoutSessionFindUnique },
    product: { findUnique: mockProductFindUnique },
    licenseKey: { findFirst: mockLicenseKeyFindFirst },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        entitlement: { create: mock(async () => ({})) },
        licenseKey: { create: mock(async () => ({})) },
        checkoutSession: { update: mock(async () => ({})) },
      }),
  },
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
    mockConstructEvent.mockReset()
    mockCheckoutSessionFindUnique.mockReset()
    mockCheckoutSessionFindUnique.mockImplementation(async () => ({
      id: "cs_db_1",
      stripeCheckoutSessionId: "cs_test_123",
      userId: "usr_test1",
      productSlug: "pv-layout-basic",
      processedAt: null,
      user: { id: "usr_test1", email: "test@example.com" },
    }))
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
    expect(mockCheckoutSessionFindUnique).toHaveBeenCalled()
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
    expect(mockCheckoutSessionFindUnique).not.toHaveBeenCalled()
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
