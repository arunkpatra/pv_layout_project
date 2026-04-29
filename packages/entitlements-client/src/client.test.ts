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

// ---------------------------------------------------------------------------
// V2 — getEntitlementsV2 (+ V2 envelope error mapping covers all V2 callers)
// ---------------------------------------------------------------------------

const successfulEntitlementsV2 = {
  success: true,
  data: {
    user: { name: "Test", email: "test@example.com" },
    plans: [
      {
        planName: "Free",
        features: [
          "Plant Layout (MMS, Inverter, LA)",
          "Obstruction Exclusion",
          "AC & DC Cable Routing",
          "Cable Quantity Measurements",
          "Energy Yield Analysis",
          "Plant Generation Estimates",
        ],
        totalCalculations: 5,
        usedCalculations: 0,
        remainingCalculations: 5,
      },
    ],
    licensed: true,
    availableFeatures: [
      "plant_layout",
      "obstruction_exclusion",
      "cable_routing",
      "cable_measurements",
      "energy_yield",
      "generation_estimates",
    ],
    totalCalculations: 5,
    usedCalculations: 0,
    remainingCalculations: 5,
    projectQuota: 3,
    projectsActive: 0,
    projectsRemaining: 3,
  },
}

describe("getEntitlementsV2", () => {
  test("returns the V2 data payload (V1 fields + projectQuota/active/remaining)", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () => jsonResponse(successfulEntitlementsV2),
    })
    const ent = await client.getEntitlementsV2(KEY)
    // V1 fields present
    expect(ent.licensed).toBe(true)
    expect(ent.availableFeatures).toContain("plant_layout")
    expect(ent.plans[0]?.planName).toBe("Free")
    // V2 fields present
    expect(ent.projectQuota).toBe(3)
    expect(ent.projectsActive).toBe(0)
    expect(ent.projectsRemaining).toBe(3)
  })

  test("targets /v2/entitlements on the configured base URL", async () => {
    let seenUrl = ""
    const client = createEntitlementsClient({
      baseUrl: "http://localhost:3003",
      fetchImpl: async (input) => {
        seenUrl = input.toString()
        return jsonResponse(successfulEntitlementsV2)
      },
    })
    await client.getEntitlementsV2(KEY)
    expect(seenUrl).toBe("http://localhost:3003/v2/entitlements")
  })

  test("sends Bearer auth header on the V2 path", async () => {
    let seenAuth = ""
    const client = createEntitlementsClient({
      fetchImpl: async (_input, init) => {
        const headers = new Headers(init?.headers)
        seenAuth = headers.get("authorization") ?? ""
        return jsonResponse(successfulEntitlementsV2)
      },
    })
    await client.getEntitlementsV2(KEY)
    expect(seenAuth).toBe(`Bearer ${KEY}`)
  })

  test("maps 401 V2 error envelope to EntitlementsError with code=UNAUTHORIZED", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "License key not recognised.",
            },
          },
          401
        ),
    })
    try {
      await client.getEntitlementsV2(KEY)
      throw new Error("expected throw")
    } catch (err) {
      expect(err).toBeInstanceOf(EntitlementsError)
      const e = err as EntitlementsError
      expect(e.status).toBe(401)
      expect(e.code).toBe("UNAUTHORIZED")
      expect(e.message).toBe("License key not recognised.")
    }
  })

  test("maps 402 V2 error envelope to code=PAYMENT_REQUIRED", async () => {
    // The /v2/entitlements endpoint itself doesn't 402, but any V2-aware
    // caller (B9 reportUsage, B11 createProject) that hits 402 flows
    // through this same error parser. Test it here so the V2-aware
    // EntitlementsError contract is covered once.
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "PAYMENT_REQUIRED",
              message:
                "Project quota exhausted (3/3). Delete a project or upgrade your plan to add more.",
            },
          },
          402
        ),
    })
    try {
      await client.getEntitlementsV2(KEY)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(402)
      expect(e.code).toBe("PAYMENT_REQUIRED")
      expect(e.message).toContain("Project quota exhausted")
    }
  })

  test("falls back to V1 error shape when the body lacks the V2 envelope", async () => {
    // Older / non-V2 routes still return `{ error: { message } }`. The
    // parser tries V2 first, falls through to V1 — verify the fallback
    // path leaves `code` undefined but extracts the message.
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse({ error: { message: "Legacy 500" } }, 500),
    })
    try {
      await client.getEntitlementsV2(KEY)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(500)
      expect(e.code).toBeUndefined()
      expect(e.message).toBe("Legacy 500")
    }
  })

  test("falls back to status-based message when no body", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () => new Response("", { status: 503 }),
    })
    try {
      await client.getEntitlementsV2(KEY)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(503)
      expect(e.code).toBeUndefined()
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
      await client.getEntitlementsV2(KEY)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(0)
      expect(e.message).toBe("Failed to fetch")
    }
  })

  test("rejects a V2 success body that's missing project-quota fields", async () => {
    // Backend invariant: V2 always returns the three project-quota fields.
    // If we ever see V1's shape from the V2 route, that's a server bug —
    // fail loudly rather than silently degrade.
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse({
          success: true,
          data: {
            user: { name: "x", email: "x@y" },
            plans: [],
            licensed: true,
            availableFeatures: [],
            totalCalculations: 0,
            usedCalculations: 0,
            remainingCalculations: 0,
            // missing projectQuota / projectsActive / projectsRemaining
          },
        }),
    })
    try {
      await client.getEntitlementsV2(KEY)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(0)
      expect(e.message).toContain("schema validation")
    }
  })
})
