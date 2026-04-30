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
const mockTxTransactionCreate = mock(async () => ({ id: "txn_test1" }))
const mockTxEntitlementCreate = mock(async () => ({ id: "ent_test1" }))
const mockTxLicenseKeyCreate = mock(async () => ({}))
const mockTxCheckoutSessionUpdate = mock(async () => ({}))
const mockTx = {
  transaction: { create: mockTxTransactionCreate },
  entitlement: { create: mockTxEntitlementCreate },
  licenseKey: { create: mockTxLicenseKeyCreate, findFirst: mock(async () => null) },
  checkoutSession: { update: mockTxCheckoutSessionUpdate },
}
mock.module("../../lib/db.js", () => ({
  db: {
    checkoutSession: { findUnique: mockCheckoutSessionFindUnique },
    product: { findUnique: mockProductFindUnique },
    licenseKey: { findFirst: mockLicenseKeyFindFirst },
    $transaction: async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
  },
}))

const mockConstructEvent = mock(
  async (_body: unknown, _sig: unknown, _secret: unknown) => ({
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
    mockTxTransactionCreate.mockReset()
    mockTxEntitlementCreate.mockReset()
    mockTxLicenseKeyCreate.mockReset()
    mockTxCheckoutSessionUpdate.mockReset()
    mockTxTransactionCreate.mockImplementation(async () => ({ id: "txn_test1" }))
    mockTxEntitlementCreate.mockImplementation(async () => ({ id: "ent_test1" }))
    mockTxLicenseKeyCreate.mockImplementation(async () => ({}))
    mockTxCheckoutSessionUpdate.mockImplementation(async () => ({}))
    mockCheckoutSessionFindUnique.mockImplementation(async () => ({
      id: "cs_db_1",
      stripeCheckoutSessionId: "cs_test_123",
      userId: "usr_test1",
      productSlug: "pv-layout-basic",
      processedAt: null,
      user: { id: "usr_test1", email: "test@example.com" },
    }))
    mockConstructEvent.mockImplementation(async () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          amount_total: null,
          currency: null,
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
    mockConstructEvent.mockImplementation(async () => ({
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

  it("creates transaction with amountTotal when event includes it and writes only processedAt to checkoutSession", async () => {
    mockConstructEvent.mockImplementation(async () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          amount_total: 4999,
          currency: "usd",
          metadata: { userId: "usr_test1", product: "pv-layout-basic" },
        },
      },
    }))
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
    // Transaction.create receives the amount from the Stripe event
    const txCalls = mockTxTransactionCreate.mock.calls as unknown as {
      data: Record<string, unknown>
    }[][]
    expect(txCalls.length).toBe(1)
    const txArg = txCalls[0]![0]!
    expect(txArg.data.amount).toBe(4999)
    expect(txArg.data.source).toBe("STRIPE")
    // checkoutSession.update now only writes processedAt (not amountTotal/currency)
    const csCalls = mockTxCheckoutSessionUpdate.mock.calls as unknown as {
      data: Record<string, unknown>
    }[][]
    expect(csCalls.length).toBe(1)
    const csArg = csCalls[0]![0]!
    expect(csArg.data.processedAt).toBeInstanceOf(Date)
    expect(csArg.data.amountTotal).toBeUndefined()
    expect(csArg.data.currency).toBeUndefined()
  })

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(async () => {
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
