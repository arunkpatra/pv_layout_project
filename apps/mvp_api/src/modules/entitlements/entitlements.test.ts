import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

const mockUser = {
  id: "usr_test1",
  clerkId: "clerk_abc",
  email: "test@example.com",
  name: "Test User" as string | null,
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

const mockEntitlementFindMany = mock(async () => [
  {
    id: "ent_test1",
    userId: "usr_test1",
    productId: "prod_pro",
    totalCalculations: 10,
    usedCalculations: 3,
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

const mockUsageRecordFindMany = mock(async () => [
  {
    featureKey: "plant_layout",
    createdAt: new Date("2026-04-22T10:00:00Z"),
    product: { name: "PV Layout Pro" },
  },
])

// licenseKeyAuth runs via the real middleware path even with the module mock,
// so db.licenseKey.findFirst must be stubbed to avoid runtime errors.
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
    entitlement: { findMany: mockEntitlementFindMany },
    usageRecord: { findMany: mockUsageRecordFindMany },
  },
}))

const { entitlementsRoutes } = await import("./entitlements.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", entitlementsRoutes)
  app.onError(errorHandler)
  return app
}

describe("GET /entitlements", () => {
  beforeEach(() => {
    mockEntitlementFindMany.mockReset()
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_test1",
        userId: "usr_test1",
        productId: "prod_pro",
        totalCalculations: 10,
        usedCalculations: 3,
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
  })

  it("returns licensed true with features and counts", async () => {
    const app = makeApp()
    const res = await app.request("/entitlements", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: {
        user: { name: string | null; email: string }
        plans: {
          planName: string
          features: string[]
          totalCalculations: number
          usedCalculations: number
          remainingCalculations: number
        }[]
        licensed: boolean
        availableFeatures: string[]
        totalCalculations: number
        usedCalculations: number
        remainingCalculations: number
      }
    }
    expect(body.success).toBe(true)
    // existing assertions — must still pass
    expect(body.data.licensed).toBe(true)
    expect(body.data.availableFeatures).toContain("plant_layout")
    expect(body.data.availableFeatures).toContain("cable_routing")
    expect(body.data.totalCalculations).toBe(10)
    expect(body.data.usedCalculations).toBe(3)
    expect(body.data.remainingCalculations).toBe(7)
    // new assertions
    expect(body.data.user.name).toBe("Test User")
    expect(body.data.user.email).toBe("test@example.com")
    expect(body.data.plans).toHaveLength(1)
    expect(body.data.plans[0]!.planName).toBe("PV Layout Pro")
    expect(body.data.plans[0]!.features).toContain("Plant Layout")
    expect(body.data.plans[0]!.features).toContain("Cable Routing")
    expect(body.data.plans[0]!.totalCalculations).toBe(10)
    expect(body.data.plans[0]!.usedCalculations).toBe(3)
    expect(body.data.plans[0]!.remainingCalculations).toBe(7)
  })

  it("returns licensed false when all calculations exhausted", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_test1",
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
    const res = await app.request("/entitlements", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: {
        licensed: boolean
        availableFeatures: string[]
        plans: { remainingCalculations: number }[]
      }
    }
    expect(body.data.licensed).toBe(false)
    expect(body.data.availableFeatures).toHaveLength(0)
    expect(body.data.plans[0]!.remainingCalculations).toBe(0)
  })

  it("returns licensed false when no entitlements", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [] as never)
    const app = makeApp()
    const res = await app.request("/entitlements", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { licensed: boolean }
    }
    expect(body.data.licensed).toBe(false)
  })

  it("returns plan details correctly for a Basic plan", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_test1",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 5,
        usedCalculations: 2,
        purchasedAt: new Date(),
        product: {
          name: "PV Layout Basic",
          displayOrder: 1,
          features: [{ featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" }],
        },
      },
    ])
    const app = makeApp()
    const res = await app.request("/entitlements", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: {
        plans: { planName: string; features: string[]; remainingCalculations: number }[]
      }
    }
    expect(body.data.plans[0]!.planName).toBe("PV Layout Basic")
    expect(body.data.plans[0]!.features).toContain("Plant Layout (MMS, Inverter, LA)")
    expect(body.data.plans[0]!.remainingCalculations).toBe(3)
  })

  it("computes feature union and sums counts across multiple entitlements", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_basic",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 3,
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
        usedCalculations: 2,
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
    const res = await app.request("/entitlements", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: {
        availableFeatures: string[]
        totalCalculations: number
        remainingCalculations: number
        plans: {
          planName: string
          totalCalculations: number
          usedCalculations: number
          remainingCalculations: number
        }[]
      }
    }
    expect(body.data.availableFeatures).toContain("plant_layout")
    expect(body.data.availableFeatures).toContain("cable_routing")
    // plant_layout appears in both products but union deduplicates
    expect(body.data.availableFeatures.filter((f) => f === "plant_layout")).toHaveLength(1)
    expect(body.data.totalCalculations).toBe(13)
    expect(body.data.remainingCalculations).toBe(10)
    expect(body.data.plans).toHaveLength(2)
    expect(body.data.plans[0]!.planName).toBe("PV Layout Basic")
    expect(body.data.plans[0]!.totalCalculations).toBe(3)
    expect(body.data.plans[0]!.usedCalculations).toBe(1)
    expect(body.data.plans[0]!.remainingCalculations).toBe(2)
    expect(body.data.plans[1]!.planName).toBe("PV Layout Pro")
    expect(body.data.plans[1]!.totalCalculations).toBe(10)
    expect(body.data.plans[1]!.usedCalculations).toBe(2)
    expect(body.data.plans[1]!.remainingCalculations).toBe(8)
  })

  it("serialises null name correctly", async () => {
    // Temporarily set name to null on the shared mock object; the licenseKeyAuth
    // module mock closes over mockUser by reference, so this propagates.
    const savedName = mockUser.name
    mockUser.name = null

    try {
      const app = makeApp()
      const res = await app.request("/entitlements", {
        headers: { Authorization: "Bearer sl_live_testkey" },
      })
      const body = (await res.json()) as { data: { user: { name: null } } }
      expect(body.data.user.name).toBeNull()
    } finally {
      mockUser.name = savedName
    }
  })
})

describe("GET /usage/history", () => {
  it("returns usage records with feature and product name", async () => {
    const app = makeApp()
    const res = await app.request("/usage/history", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { records: { featureKey: string; productName: string; createdAt: string }[] }
    }
    expect(body.success).toBe(true)
    expect(body.data.records).toHaveLength(1)
    expect(body.data.records[0]!.featureKey).toBe("plant_layout")
    expect(body.data.records[0]!.productName).toBe("PV Layout Pro")
    expect(body.data.records[0]!.createdAt).toBe("2026-04-22T10:00:00.000Z")
  })

  it("returns empty array when no usage history", async () => {
    mockUsageRecordFindMany.mockImplementation(async () => [] as never)
    const app = makeApp()
    const res = await app.request("/usage/history", {
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    const body = (await res.json()) as {
      success: boolean
      data: { records: unknown[] }
    }
    expect(body.data.records).toHaveLength(0)
  })
})
