import { describe, test, expect } from "bun:test"
import {
  createEntitlementsClient,
  EntitlementsError,
} from "./client"
import { isPlausibleLicenseKey } from "./types"

const KEY = "sl_live_abc123"

const successfulEntitlements = {
  success: true,
  data: {
    user: { name: "Acme Solar", email: "ops@acme.example" },
    plans: [
      {
        planName: "Free",
        features: ["Layout generation"],
        totalCalculations: 100,
        usedCalculations: 5,
        remainingCalculations: 95,
      },
    ],
    licensed: true,
    availableFeatures: ["plant_layout"],
    totalCalculations: 100,
    usedCalculations: 5,
    remainingCalculations: 95,
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("isPlausibleLicenseKey", () => {
  test("accepts the canonical sl_live_ format", () => {
    expect(isPlausibleLicenseKey("sl_live_abc_123-XYZ")).toBe(true)
  })
  test("rejects missing prefix", () => {
    expect(isPlausibleLicenseKey("abc123")).toBe(false)
  })
  test("rejects test-mode keys (only live)", () => {
    expect(isPlausibleLicenseKey("sl_test_abc123")).toBe(false)
  })
  test("ignores surrounding whitespace", () => {
    expect(isPlausibleLicenseKey("  sl_live_abc  ")).toBe(true)
  })
  test("rejects empty", () => {
    expect(isPlausibleLicenseKey("")).toBe(false)
  })
})

describe("getEntitlements", () => {
  test("returns the inner data payload on success", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () => jsonResponse(successfulEntitlements),
    })
    const ent = await client.getEntitlements(KEY)
    expect(ent.licensed).toBe(true)
    expect(ent.availableFeatures).toContain("plant_layout")
    expect(ent.plans[0]?.planName).toBe("Free")
    expect(ent.remainingCalculations).toBe(95)
  })

  test("sends Bearer auth header", async () => {
    let seenAuth = ""
    const client = createEntitlementsClient({
      fetchImpl: async (_input, init) => {
        const headers = new Headers(init?.headers)
        seenAuth = headers.get("authorization") ?? ""
        return jsonResponse(successfulEntitlements)
      },
    })
    await client.getEntitlements(KEY)
    expect(seenAuth).toBe(`Bearer ${KEY}`)
  })

  test("targets /entitlements on the configured base URL", async () => {
    let seenUrl = ""
    const client = createEntitlementsClient({
      baseUrl: "https://staging.api.solarlayout.in/",
      fetchImpl: async (input) => {
        seenUrl = input.toString()
        return jsonResponse(successfulEntitlements)
      },
    })
    await client.getEntitlements(KEY)
    expect(seenUrl).toBe("https://staging.api.solarlayout.in/entitlements")
  })

  test("maps 401 to EntitlementsError with message from API", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse({ error: { message: "Invalid key" } }, 401),
    })
    try {
      await client.getEntitlements(KEY)
      throw new Error("expected throw")
    } catch (err) {
      expect(err).toBeInstanceOf(EntitlementsError)
      const e = err as EntitlementsError
      expect(e.status).toBe(401)
      expect(e.message).toBe("Invalid key")
    }
  })

  test("falls back to status-based message when API error has no body", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () => new Response("", { status: 503 }),
    })
    try {
      await client.getEntitlements(KEY)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(503)
      expect(e.message).toBe("HTTP 503")
    }
  })

  test("maps network error to status=0", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch")
      },
    })
    try {
      await client.getEntitlements(KEY)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(0)
      expect(e.message).toBe("Failed to fetch")
    }
  })

  test("rejects a schema-invalid success response", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse({ success: true, data: { nonsense: true } }),
    })
    try {
      await client.getEntitlements(KEY)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(0)
      expect(e.message).toContain("schema validation")
    }
  })
})

describe("reportUsage", () => {
  test("posts the feature and returns the new remaining count", async () => {
    let seenBody = ""
    const client = createEntitlementsClient({
      fetchImpl: async (_input, init) => {
        seenBody = (init?.body as string) ?? ""
        return jsonResponse({
          success: true,
          data: { recorded: true, remainingCalculations: 42 },
        })
      },
    })
    const res = await client.reportUsage(KEY, "plant_layout")
    expect(JSON.parse(seenBody || "{}")).toEqual({ feature: "plant_layout" })
    expect(res.recorded).toBe(true)
    expect(res.remainingCalculations).toBe(42)
  })

  test("propagates 402 when quota exhausted", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse({ error: { message: "No calculations remaining" } }, 402),
    })
    try {
      await client.reportUsage(KEY, "plant_layout")
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(402)
      expect(e.message).toBe("No calculations remaining")
    }
  })
})
