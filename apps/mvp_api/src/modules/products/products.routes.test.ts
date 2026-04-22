import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
  errorHandler,
  type MvpHonoEnv,
} from "../../middleware/error-handler.js"

const mockFindMany = mock(async () => [
  {
    slug: "pv-layout-basic",
    name: "PV Layout Basic",
    description: "5 layout calculations per purchase",
    priceAmount: 199,
    priceCurrency: "usd",
    calculations: 5,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
    ],
  },
])

mock.module("../../lib/db.js", () => ({
  db: {
    product: {
      findMany: mockFindMany,
    },
  },
}))

const { productsRoutes } = await import("./products.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", productsRoutes)
  app.onError(errorHandler)
  return app
}

describe("GET /products", () => {
  beforeEach(() => {
    mockFindMany.mockReset()
    mockFindMany.mockImplementation(async () => [
      {
        slug: "pv-layout-basic",
        name: "PV Layout Basic",
        description: "5 layout calculations per purchase",
        priceAmount: 199,
        priceCurrency: "usd",
        calculations: 5,
        features: [
          {
            featureKey: "plant_layout",
            label: "Plant Layout (MMS, Inverter, LA)",
          },
        ],
      },
    ])
  })

  it("returns 200 with products list", async () => {
    const app = makeApp()
    const res = await app.request("/products", { method: "GET" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { products: unknown[] }
    }
    expect(body.success).toBe(true)
    expect(body.data.products).toHaveLength(1)
    expect(
      (body.data.products[0] as Record<string, unknown>).slug,
    ).toBe("pv-layout-basic")
    expect(
      (body.data.products[0] as Record<string, unknown>).features,
    ).toBeDefined()
  })

  it("does not expose stripePriceId in response", async () => {
    const app = makeApp()
    const res = await app.request("/products", { method: "GET" })
    const body = (await res.json()) as {
      success: boolean
      data: { products: Record<string, unknown>[] }
    }
    expect(body.data.products[0]).not.toHaveProperty("stripePriceId")
  })
})
