import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
  errorHandler,
  type MvpHonoEnv,
} from "../../middleware/error-handler.js"

// Mock Clerk auth to pass
mock.module("../../middleware/clerk-auth.js", () => ({
  clerkAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}))

// Mock verifyToken
mock.module("@clerk/backend", () => ({
  verifyToken: async () => ({ sub: "clerk_user_123" }),
}))

// Mock Stripe
const mockCheckoutCreate = mock(async () => ({
  id: "cs_test_123",
  url: "https://checkout.stripe.com/test",
}))
const mockCheckoutRetrieve = mock(async () => ({
  id: "cs_test_123",
  status: "complete",
}))
const mockCustomersCreate = mock(async () => ({
  id: "cus_test_123",
}))
mock.module("../../lib/stripe.js", () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: mockCheckoutCreate,
        retrieve: mockCheckoutRetrieve,
      },
    },
    customers: { create: mockCustomersCreate },
  }),
}))

// Mock provision
const mockProvision = mock(async () => ({ provisioned: true }))
mock.module("./provision.js", () => ({
  provisionEntitlement: mockProvision,
}))

// Mock DB
const mockUserFindFirst = mock(async () => ({
  id: "usr_test1",
  clerkId: "clerk_user_123",
  email: "test@example.com",
  stripeCustomerId: "cus_existing",
}))
const mockUserCreate = mock(async () => ({
  id: "usr_test1",
  clerkId: "clerk_user_123",
  email: "clerk_user_123",
  stripeCustomerId: null,
}))
const mockUserUpdate = mock(async () => ({
  id: "usr_test1",
  stripeCustomerId: "cus_test_123",
}))
const mockProductFindUnique = mock(async () => ({
  id: "prod_test1",
  slug: "pv-layout-basic",
  stripePriceId: "price_test_basic",
  calculations: 5,
  active: true,
}))
const mockCheckoutSessionCreate = mock(async () => ({ id: "csdb_test1" }))
const mockCheckoutSessionFindUnique = mock(async () => ({
  id: "csdb_test1",
  stripeCheckoutSessionId: "cs_test_123",
  processedAt: null,
}))
const mockEntitlementFindMany = mock(async () => [
  {
    id: "ent_test1",
    totalCalculations: 10,
    usedCalculations: 3,
    purchasedAt: new Date("2026-04-22"),
    product: { slug: "pv-layout-pro", name: "PV Layout Pro" },
  },
])
const mockLicenseKeyFindFirst = mock(async () => ({
  key: "sl_live_testkey123",
}))

mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findFirst: mockUserFindFirst,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
    product: {
      findUnique: mockProductFindUnique,
    },
    checkoutSession: {
      create: mockCheckoutSessionCreate,
      findUnique: mockCheckoutSessionFindUnique,
      update: mock(async () => ({})),
    },
    entitlement: {
      findMany: mockEntitlementFindMany,
    },
    licenseKey: {
      findFirst: mockLicenseKeyFindFirst,
    },
  },
}))

const { billingRoutes } = await import("./billing.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", billingRoutes)
  app.onError(errorHandler)
  return app
}

describe("POST /billing/checkout", () => {
  beforeEach(() => {
    mockUserFindFirst.mockImplementation(async () => ({
      id: "usr_test1",
      clerkId: "clerk_user_123",
      email: "test@example.com",
      stripeCustomerId: "cus_existing",
    }))
    mockProductFindUnique.mockImplementation(async () => ({
      id: "prod_test1",
      slug: "pv-layout-basic",
      stripePriceId: "price_test_basic",
      calculations: 5,
      active: true,
    }))
    mockCheckoutCreate.mockImplementation(async () => ({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/test",
    }))
  })

  it("returns 200 with checkout URL for valid product", async () => {
    const app = makeApp()
    const res = await app.request("/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ product: "pv-layout-basic" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { url: string }
    }
    expect(body.success).toBe(true)
    expect(body.data.url).toContain("checkout.stripe.com")
  })

  it("returns 400 for invalid product slug", async () => {
    mockProductFindUnique.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ product: "nonexistent" }),
    })
    expect(res.status).toBe(400)
  })
})

describe("POST /billing/verify-session", () => {
  beforeEach(() => {
    mockCheckoutSessionFindUnique.mockImplementation(async () => ({
      id: "csdb_test1",
      stripeCheckoutSessionId: "cs_test_123",
      processedAt: null,
    }))
    mockCheckoutRetrieve.mockImplementation(async () => ({
      id: "cs_test_123",
      status: "complete",
    }))
    mockProvision.mockImplementation(async () => ({ provisioned: true }))
  })

  it("returns verified true when session is complete", async () => {
    const app = makeApp()
    const res = await app.request("/billing/verify-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ sessionId: "cs_test_123" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { verified: boolean; updated: boolean }
    }
    expect(body.data.verified).toBe(true)
    expect(body.data.updated).toBe(true)
  })

  it("returns verified false when already processed", async () => {
    mockCheckoutSessionFindUnique.mockImplementation(async () => ({
      id: "csdb_test1",
      stripeCheckoutSessionId: "cs_test_123",
      processedAt: new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any)
    const app = makeApp()
    const res = await app.request("/billing/verify-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({ sessionId: "cs_test_123" }),
    })
    const body = (await res.json()) as {
      success: boolean
      data: { verified: boolean; updated: boolean }
    }
    expect(body.data.verified).toBe(true)
    expect(body.data.updated).toBe(false)
  })
})

describe("GET /billing/entitlements", () => {
  it("returns entitlements and license key", async () => {
    const app = makeApp()
    const res = await app.request("/billing/entitlements", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        entitlements: { product: string; remainingCalculations: number }[]
        licenseKey: string | null
      }
    }
    expect(body.success).toBe(true)
    expect(body.data.entitlements).toHaveLength(1)
    const first = body.data.entitlements[0]!
    expect(first.product).toBe("pv-layout-pro")
    expect(first.remainingCalculations).toBe(7)
    expect(body.data.licenseKey).toBe("sl_live_testkey123")
  })

  it("returns null licenseKey when user has none", async () => {
    mockLicenseKeyFindFirst.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/billing/entitlements", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { licenseKey: string | null }
    }
    expect(body.data.licenseKey).toBeNull()
  })

  it("returns empty when user not found", async () => {
    mockUserFindFirst.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/billing/entitlements", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { entitlements: unknown[]; licenseKey: string | null }
    }
    expect(body.data.entitlements).toHaveLength(0)
    expect(body.data.licenseKey).toBeNull()
  })
})
