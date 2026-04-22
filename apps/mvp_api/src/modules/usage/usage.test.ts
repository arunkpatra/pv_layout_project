import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

const mockUser = {
  id: "usr_test1",
  clerkId: "clerk_abc",
  email: "test@example.com",
  name: "Test User",
  stripeCustomerId: null,
}

const mockLicenseKey = {
  id: "lk_test1",
  key: "sl_live_testkey",
  userId: "usr_test1",
  createdAt: new Date(),
  revokedAt: null,
}

mock.module("../../middleware/license-key-auth.js", () => ({
  licenseKeyAuth: async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set("user", mockUser)
    c.set("licenseKey", mockLicenseKey)
    return next()
  },
}))

const mockProductFeatureFindFirst = mock(async () => ({
  id: "pf_test1",
  featureKey: "plant_layout",
  label: "Plant Layout",
  productId: "prod_basic",
}))

const mockEntitlementFindMany = mock(async () => [
  {
    id: "ent_basic",
    userId: "usr_test1",
    productId: "prod_basic",
    totalCalculations: 5,
    usedCalculations: 2,
    purchasedAt: new Date(),
    product: {
      name: "PV Layout Basic",
      displayOrder: 1,
      features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
    },
  },
])

const mockExecuteRaw = mock(async () => 1)
const mockUsageRecordCreate = mock(async () => ({}))
const mockTransaction = mock(
  async (
    fn: (tx: {
      $executeRaw: typeof mockExecuteRaw
      usageRecord: { create: typeof mockUsageRecordCreate }
    }) => Promise<void>,
  ) => {
    return fn({
      $executeRaw: mockExecuteRaw,
      usageRecord: { create: mockUsageRecordCreate },
    })
  },
)

// licenseKeyAuth runs via the real middleware path even with the module mock,
// so db.licenseKey.findFirst must be stubbed.
const mockLicenseKeyFindFirst = mock(async () => ({
  id: "lk_test1",
  key: "sl_live_testkey",
  userId: "usr_test1",
  createdAt: new Date(),
  revokedAt: null,
  user: mockUser,
}))

mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: mockLicenseKeyFindFirst },
    productFeature: { findFirst: mockProductFeatureFindFirst },
    entitlement: { findMany: mockEntitlementFindMany },
    $transaction: mockTransaction,
  },
}))

const { usageRoutes } = await import("./usage.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", usageRoutes)
  app.onError(errorHandler)
  return app
}

describe("POST /usage/report", () => {
  beforeEach(() => {
    mockLicenseKeyFindFirst.mockReset()
    mockLicenseKeyFindFirst.mockImplementation(async () => ({
      id: "lk_test1",
      key: "sl_live_testkey",
      userId: "usr_test1",
      createdAt: new Date(),
      revokedAt: null,
      user: mockUser,
    }))
    mockProductFeatureFindFirst.mockReset()
    mockProductFeatureFindFirst.mockImplementation(async () => ({
      id: "pf_test1",
      featureKey: "plant_layout",
      label: "Plant Layout",
      productId: "prod_basic",
    }))
    mockEntitlementFindMany.mockReset()
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_basic",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 5,
        usedCalculations: 2,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Basic",
          displayOrder: 1,
          features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
        },
      },
    ])
    mockExecuteRaw.mockReset()
    mockExecuteRaw.mockImplementation(async () => 1)
    mockUsageRecordCreate.mockReset()
    mockUsageRecordCreate.mockImplementation(async () => ({}))
    mockTransaction.mockReset()
    mockTransaction.mockImplementation(
      async (
        fn: (tx: {
          $executeRaw: typeof mockExecuteRaw
          usageRecord: { create: typeof mockUsageRecordCreate }
        }) => Promise<void>,
      ) => {
        return fn({
          $executeRaw: mockExecuteRaw,
          usageRecord: { create: mockUsageRecordCreate },
        })
      },
    )
  })

  it("returns 400 for unknown feature key", async () => {
    mockProductFeatureFindFirst.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sl_live_testkey",
      },
      body: JSON.stringify({ feature: "nonexistent_feature" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      success: boolean
      error: { code: string }
    }
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  it("returns 402 when no entitlements cover the feature", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [] as never)
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sl_live_testkey",
      },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    expect(res.status).toBe(402)
    const body = (await res.json()) as {
      success: boolean
      error: { code: string }
    }
    expect(body.error.code).toBe("PAYMENT_REQUIRED")
  })

  it("returns 402 when matching entitlement is exhausted", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_basic",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 5,
        usedCalculations: 5,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Basic",
          displayOrder: 1,
          features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
        },
      },
    ])
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sl_live_testkey",
      },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    expect(res.status).toBe(402)
  })

  it("returns 409 on concurrent decrement race (executeRaw returns 0)", async () => {
    mockExecuteRaw.mockImplementation(async () => 0)
    mockTransaction.mockImplementation(
      async (
        fn: (tx: {
          $executeRaw: typeof mockExecuteRaw
          usageRecord: { create: typeof mockUsageRecordCreate }
        }) => Promise<void>,
      ) => {
        return fn({
          $executeRaw: mockExecuteRaw,
          usageRecord: { create: mockUsageRecordCreate },
        })
      },
    )
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sl_live_testkey",
      },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as {
      success: boolean
      error: { code: string }
    }
    expect(body.error.code).toBe("CONFLICT")
  })

  it("records usage and returns 200 with updated remaining count", async () => {
    const app = makeApp()
    const res = await app.request("/usage/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sl_live_testkey",
      },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { recorded: boolean; remainingCalculations: number }
    }
    expect(body.success).toBe(true)
    expect(body.data.recorded).toBe(true)
    expect(mockUsageRecordCreate).toHaveBeenCalled()
  })

  it("selects cheapest pool first when user has multiple entitlements", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_basic",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 5,
        usedCalculations: 1,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Basic",
          displayOrder: 1,
          features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
        },
      },
      {
        id: "ent_pro",
        userId: "usr_test1",
        productId: "prod_pro",
        totalCalculations: 10,
        usedCalculations: 0,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Pro",
          displayOrder: 2,
          features: [
            { featureKey: "plant_layout", label: "Plant Layout" },
            { featureKey: "cable_routing", label: "Cable Routing" },
          ],
        },
      },
    ])
    const app = makeApp()
    await app.request("/usage/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sl_live_testkey",
      },
      body: JSON.stringify({ feature: "plant_layout" }),
    })
    // UsageRecord should be created with prod_basic (cheapest pool, displayOrder: 1)
    const createCall = mockUsageRecordCreate.mock.calls[0] as unknown as [
      { data: { productId: string } },
    ]
    expect(createCall?.[0]?.data?.productId).toBe("prod_basic")
  })
})
