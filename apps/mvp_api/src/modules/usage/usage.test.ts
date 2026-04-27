import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

const mockUser = {
  id: "usr_test1",
  clerkId: "clerk_abc",
  email: "test@example.com",
  name: "Test User",
  stripeCustomerId: null,
  roles: [],
  status: "ACTIVE",
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
      name: "Basic",
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
          name: "Basic",
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
          name: "Basic",
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
          name: "Basic",
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
          name: "Pro",
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

describe("reportUsage — kill switch enforcement", () => {
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

  it("rejects with 402 when the only entitlement is deactivated", async () => {
    // Post-fix: findMany returns [] because deactivatedAt: null filter excludes
    // the deactivated entitlement. Pre-fix: query has no deactivatedAt filter,
    // so the mock must return [] to simulate what the fix enforces via the DB.
    // We verify the WHERE clause includes deactivatedAt: null via the call args.
    mockEntitlementFindMany.mockImplementation(
      async (args: { where: Record<string, unknown> }) => {
        // Post-fix: query MUST include deactivatedAt: null in the where clause
        if (!("deactivatedAt" in args.where) || args.where.deactivatedAt !== null) {
          // Pre-fix behaviour: no filter, so return the deactivated entitlement
          // (which causes the test to fail because 402 won't be thrown)
          return [
            {
              id: "ent_deactivated",
              userId: "usr_test1",
              productId: "prod_basic",
              totalCalculations: 10,
              usedCalculations: 3,
              deactivatedAt: new Date(),
              purchasedAt: new Date(),
              product: {
                name: "Basic",
                displayOrder: 1,
                features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
              },
            },
          ]
        }
        // Post-fix: deactivatedAt: null filter applied — deactivated row excluded
        return []
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
    expect(res.status).toBe(402)
    const body = (await res.json()) as {
      success: boolean
      error: { code: string }
    }
    expect(body.error.code).toBe("PAYMENT_REQUIRED")

    // Assert the DB call filtered deactivatedAt
    const findManyCall = mockEntitlementFindMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(findManyCall?.[0]?.where).toMatchObject({
      userId: "usr_test1",
      deactivatedAt: null,
    })
  })

  it("consumes only the active entitlement when stacked with a deactivated one", async () => {
    // Post-fix: query includes deactivatedAt: null, so only active entitlement
    // is returned. Pre-fix: deactivated entitlement with lower displayOrder
    // would be returned first and incorrectly selected.
    mockEntitlementFindMany.mockImplementation(
      async (args: { where: Record<string, unknown> }) => {
        if (!("deactivatedAt" in args.where) || args.where.deactivatedAt !== null) {
          // Pre-fix: return deactivated (lower displayOrder) + active entitlement
          return [
            {
              id: "ent_deactivated",
              userId: "usr_test1",
              productId: "prod_basic",
              totalCalculations: 10,
              usedCalculations: 0,
              deactivatedAt: new Date(),
              purchasedAt: new Date(),
              product: {
                name: "Basic",
                displayOrder: 1,
                features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
              },
            },
            {
              id: "ent_active",
              userId: "usr_test1",
              productId: "prod_pro",
              totalCalculations: 10,
              usedCalculations: 3,
              deactivatedAt: null,
              purchasedAt: new Date(),
              product: {
                name: "Pro",
                displayOrder: 2,
                features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
              },
            },
          ]
        }
        // Post-fix: deactivatedAt: null filter — only active entitlement returned
        return [
          {
            id: "ent_active",
            userId: "usr_test1",
            productId: "prod_pro",
            totalCalculations: 10,
            usedCalculations: 3,
            deactivatedAt: null,
            purchasedAt: new Date(),
            product: {
              name: "Pro",
              displayOrder: 2,
              features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
            },
          },
        ]
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
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { recorded: boolean; remainingCalculations: number }
    }
    expect(body.success).toBe(true)
    expect(body.data.recorded).toBe(true)

    // The usage record must be created against the active entitlement's product
    const createCall = mockUsageRecordCreate.mock.calls[0] as unknown as [
      { data: { productId: string } },
    ]
    expect(createCall?.[0]?.data?.productId).toBe("prod_pro")

    // Assert the DB call filtered deactivatedAt
    const findManyCall = mockEntitlementFindMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(findManyCall?.[0]?.where).toMatchObject({
      userId: "usr_test1",
      deactivatedAt: null,
    })
  })
})
