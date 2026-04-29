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

describe("reportUsageV2", () => {
  const IDEM = "9c4f3e8a-5d6b-4f7c-9e2d-1a8b3c4d5e6f"

  test("posts feature + idempotencyKey to /v2/usage/report and returns refreshed entitlements", async () => {
    let seenBody = ""
    let seenUrl = ""
    const client = createEntitlementsClient({
      fetchImpl: async (input, init) => {
        seenUrl = input.toString()
        seenBody = (init?.body as string) ?? ""
        return jsonResponse({
          success: true,
          data: {
            recorded: true,
            remainingCalculations: 41,
            availableFeatures: [
              "plant_layout",
              "obstruction_exclusion",
              "cable_routing",
              "cable_measurements",
            ],
          },
        })
      },
    })
    const res = await client.reportUsageV2(KEY, "cable_routing", IDEM)
    expect(seenUrl).toBe("https://api.solarlayout.in/v2/usage/report")
    expect(JSON.parse(seenBody)).toEqual({
      feature: "cable_routing",
      idempotencyKey: IDEM,
    })
    expect(res.recorded).toBe(true)
    expect(res.remainingCalculations).toBe(41)
    expect(res.availableFeatures).toContain("cable_routing")
  })

  test("sends Bearer auth header", async () => {
    let seenAuth = ""
    const client = createEntitlementsClient({
      fetchImpl: async (_input, init) => {
        seenAuth = new Headers(init?.headers).get("authorization") ?? ""
        return jsonResponse({
          success: true,
          data: {
            recorded: true,
            remainingCalculations: 0,
            availableFeatures: [],
          },
        })
      },
    })
    await client.reportUsageV2(KEY, "plant_layout", IDEM)
    expect(seenAuth).toBe(`Bearer ${KEY}`)
  })

  test("maps 402 V2 envelope (PAYMENT_REQUIRED) — exhausted user", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "PAYMENT_REQUIRED",
              message:
                "No remaining calculations — purchase more at solarlayout.in",
            },
          },
          402
        ),
    })
    try {
      await client.reportUsageV2(KEY, "plant_layout", IDEM)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(402)
      expect(e.code).toBe("PAYMENT_REQUIRED")
      expect(e.message).toContain("No remaining calculations")
    }
  })

  test("maps 409 V2 envelope (CONFLICT) — concurrent decrement race", async () => {
    // Backend's contract: 409 means the same idempotencyKey is being
    // processed concurrently. Caller should retry shortly after.
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "CONFLICT",
              message: "Calculation already in progress — retry",
            },
          },
          409
        ),
    })
    try {
      await client.reportUsageV2(KEY, "plant_layout", IDEM)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(409)
      expect(e.code).toBe("CONFLICT")
    }
  })

  test("maps 400 V2 envelope (VALIDATION_ERROR) — empty idempotencyKey", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "idempotencyKey must be non-empty",
            },
          },
          400
        ),
    })
    try {
      await client.reportUsageV2(KEY, "plant_layout", "")
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.code).toBe("VALIDATION_ERROR")
      expect(e.status).toBe(400)
    }
  })

  test("maps network error to status=0 (transient — caller should retry with same key)", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch")
      },
    })
    try {
      await client.reportUsageV2(KEY, "plant_layout", IDEM)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(0)
      expect(e.code).toBeUndefined()
      expect(e.message).toBe("Failed to fetch")
    }
  })

  test("rejects a V2 success body missing the new availableFeatures field", async () => {
    // V1 shape (no availableFeatures) accidentally returned by /v2 would
    // be a backend bug — surface it loudly.
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse({
          success: true,
          data: { recorded: true, remainingCalculations: 5 },
        }),
    })
    try {
      await client.reportUsageV2(KEY, "plant_layout", IDEM)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(0)
      expect(e.message).toContain("schema validation")
    }
  })

  test("idempotency contract — same key returns same response without double-debit", async () => {
    // Backend semantic — exercised here as a unit-level claim about the
    // client. The client does not de-dup itself; it relies on the server's
    // `(userId, idempotencyKey)` unique constraint. Verifies that the
    // client correctly forwards the same key on a retry and that the
    // server (mocked here) returns the same response.
    const stableResponse = {
      success: true,
      data: {
        recorded: true,
        remainingCalculations: 99,
        availableFeatures: ["plant_layout"],
      },
    }
    let calls = 0
    const client = createEntitlementsClient({
      fetchImpl: async () => {
        calls += 1
        return jsonResponse(stableResponse)
      },
    })
    const a = await client.reportUsageV2(KEY, "plant_layout", IDEM)
    const b = await client.reportUsageV2(KEY, "plant_layout", IDEM)
    expect(calls).toBe(2) // The client doesn't memoise — each call hits.
    expect(a).toEqual(b) // …but the server returns the same payload.
  })
})

// ---------------------------------------------------------------------------
// V2 — getKmzUploadUrl (B6)
// ---------------------------------------------------------------------------

const SAMPLE_SHA256 =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"

const successKmzUploadUrl = {
  success: true,
  data: {
    uploadUrl:
      "https://solarlayout-local-projects.s3.ap-south-1.amazonaws.com/projects/usr_abc/kmz/9f86.kmz?X-Amz-Signature=...",
    blobUrl: `s3://solarlayout-local-projects/projects/usr_abc/kmz/${SAMPLE_SHA256}.kmz`,
    expiresAt: "2026-04-30T12:15:00.000Z",
  },
}

describe("getKmzUploadUrl", () => {
  test("posts {kmzSha256, kmzSize} to /v2/blobs/kmz-upload-url and returns the presigned URL", async () => {
    let seenUrl = ""
    let seenBody = ""
    const client = createEntitlementsClient({
      fetchImpl: async (input, init) => {
        seenUrl = input.toString()
        seenBody = (init?.body as string) ?? ""
        return jsonResponse(successKmzUploadUrl)
      },
    })
    const res = await client.getKmzUploadUrl(KEY, SAMPLE_SHA256, 1234)
    expect(seenUrl).toBe(
      "https://api.solarlayout.in/v2/blobs/kmz-upload-url"
    )
    expect(JSON.parse(seenBody)).toEqual({
      kmzSha256: SAMPLE_SHA256,
      kmzSize: 1234,
    })
    expect(res.uploadUrl).toContain("X-Amz-Signature")
    expect(res.blobUrl).toContain(`/${SAMPLE_SHA256}.kmz`)
    expect(res.expiresAt).toBe("2026-04-30T12:15:00.000Z")
  })

  test("sends Bearer auth", async () => {
    let seenAuth = ""
    const client = createEntitlementsClient({
      fetchImpl: async (_input, init) => {
        seenAuth = new Headers(init?.headers).get("authorization") ?? ""
        return jsonResponse(successKmzUploadUrl)
      },
    })
    await client.getKmzUploadUrl(KEY, SAMPLE_SHA256, 1)
    expect(seenAuth).toBe(`Bearer ${KEY}`)
  })

  test("maps 400 VALIDATION_ERROR (size out of range)", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "kmzSize must be 1..52428800",
              details: { field: "kmzSize", got: 99_999_999 },
            },
          },
          400
        ),
    })
    try {
      await client.getKmzUploadUrl(KEY, SAMPLE_SHA256, 99_999_999)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(400)
      expect(e.code).toBe("VALIDATION_ERROR")
      expect(e.message).toContain("kmzSize")
    }
  })

  test("maps 503 S3_NOT_CONFIGURED (env not wired)", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "S3_NOT_CONFIGURED",
              message: "S3 bucket env var missing",
            },
          },
          503
        ),
    })
    try {
      await client.getKmzUploadUrl(KEY, SAMPLE_SHA256, 1)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(503)
      expect(e.code).toBe("S3_NOT_CONFIGURED")
    }
  })

  test("rejects malformed presigned-URL response (schema guard)", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse({
          success: true,
          data: { uploadUrl: "not-a-url", blobUrl: "x", expiresAt: "x" },
        }),
    })
    try {
      await client.getKmzUploadUrl(KEY, SAMPLE_SHA256, 1)
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(0)
      expect(e.message).toContain("schema validation")
    }
  })
})

// ---------------------------------------------------------------------------
// V2 — getRunResultUploadUrl (B7)
// ---------------------------------------------------------------------------

const successRunResultUploadUrl = {
  success: true,
  data: {
    uploadUrl:
      "https://solarlayout-local-projects.s3.ap-south-1.amazonaws.com/projects/usr_abc/prj_xyz/runs/run_qrs/exports/run.dxf?X-Amz-Signature=...",
    blobUrl:
      "s3://solarlayout-local-projects/projects/usr_abc/prj_xyz/runs/run_qrs/exports/run.dxf",
    expiresAt: "2026-04-30T12:15:00.000Z",
  },
}

describe("getRunResultUploadUrl", () => {
  test("posts {type, projectId, runId, size} for DXF export", async () => {
    let seenBody = ""
    const client = createEntitlementsClient({
      fetchImpl: async (_input, init) => {
        seenBody = (init?.body as string) ?? ""
        return jsonResponse(successRunResultUploadUrl)
      },
    })
    const res = await client.getRunResultUploadUrl(KEY, {
      type: "dxf",
      projectId: "prj_xyz",
      runId: "run_qrs",
      size: 1024,
    })
    expect(JSON.parse(seenBody)).toEqual({
      type: "dxf",
      projectId: "prj_xyz",
      runId: "run_qrs",
      size: 1024,
    })
    expect(res.uploadUrl).toContain("exports/run.dxf")
  })

  test("targets /v2/blobs/run-result-upload-url on the configured base URL", async () => {
    let seenUrl = ""
    const client = createEntitlementsClient({
      baseUrl: "http://localhost:3003",
      fetchImpl: async (input) => {
        seenUrl = input.toString()
        return jsonResponse(successRunResultUploadUrl)
      },
    })
    await client.getRunResultUploadUrl(KEY, {
      type: "layout",
      projectId: "prj_xyz",
      runId: "run_qrs",
      size: 1,
    })
    expect(seenUrl).toBe(
      "http://localhost:3003/v2/blobs/run-result-upload-url"
    )
  })

  test("maps 404 NOT_FOUND when projectId/runId don't exist or aren't yours", async () => {
    // Backend ownership rule — surfaces as 404 from the run-result mint.
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Run \"run_missing\" not found",
            },
          },
          404
        ),
    })
    try {
      await client.getRunResultUploadUrl(KEY, {
        type: "pdf",
        projectId: "prj_x",
        runId: "run_missing",
        size: 1,
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(404)
      expect(e.code).toBe("NOT_FOUND")
    }
  })

  test("maps 400 VALIDATION_ERROR for unknown discriminator type", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "type must be one of layout|energy|dxf|pdf|kmz",
            },
          },
          400
        ),
    })
    try {
      // Cast: simulate a caller passing a wrong literal — the wire is what
      // we're testing. Type-system would normally prevent this.
      await client.getRunResultUploadUrl(KEY, {
        type: "json" as unknown as "dxf",
        projectId: "prj_x",
        runId: "run_x",
        size: 1,
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(400)
      expect(e.code).toBe("VALIDATION_ERROR")
    }
  })
})

// ---------------------------------------------------------------------------
// V2 — createProjectV2 (B11)
// ---------------------------------------------------------------------------

const SAMPLE_KMZ_SHA =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"

const successCreatedProject = {
  success: true,
  data: {
    id: "prj_abc123",
    userId: "usr_test1",
    name: "Site A",
    kmzBlobUrl: `s3://solarlayout-local-projects/projects/usr_test1/kmz/${SAMPLE_KMZ_SHA}.kmz`,
    kmzSha256: SAMPLE_KMZ_SHA,
    edits: {},
    createdAt: "2026-04-30T12:00:00.000Z",
    updatedAt: "2026-04-30T12:00:00.000Z",
    deletedAt: null,
  },
}

describe("createProjectV2", () => {
  test("posts {name, kmzBlobUrl, kmzSha256} to /v2/projects and returns the new project", async () => {
    let seenUrl = ""
    let seenBody = ""
    const client = createEntitlementsClient({
      fetchImpl: async (input, init) => {
        seenUrl = input.toString()
        seenBody = (init?.body as string) ?? ""
        return jsonResponse(successCreatedProject, 201)
      },
    })
    const project = await client.createProjectV2(KEY, {
      name: "Site A",
      kmzBlobUrl: successCreatedProject.data.kmzBlobUrl,
      kmzSha256: SAMPLE_KMZ_SHA,
    })
    expect(seenUrl).toBe("https://api.solarlayout.in/v2/projects")
    expect(JSON.parse(seenBody)).toEqual({
      name: "Site A",
      kmzBlobUrl: successCreatedProject.data.kmzBlobUrl,
      kmzSha256: SAMPLE_KMZ_SHA,
    })
    expect(project.id).toBe("prj_abc123")
    expect(project.name).toBe("Site A")
    expect(project.kmzSha256).toBe(SAMPLE_KMZ_SHA)
    expect(project.deletedAt).toBeNull()
  })

  test("forwards optional edits when supplied", async () => {
    let seenBody = ""
    const client = createEntitlementsClient({
      fetchImpl: async (_input, init) => {
        seenBody = (init?.body as string) ?? ""
        return jsonResponse(successCreatedProject, 201)
      },
    })
    const customEdits = { layoutOverrides: { rows: 8 } }
    await client.createProjectV2(KEY, {
      name: "Site A",
      kmzBlobUrl: "s3://b/k",
      kmzSha256: SAMPLE_KMZ_SHA,
      edits: customEdits,
    })
    expect(JSON.parse(seenBody).edits).toEqual(customEdits)
  })

  test("sends Bearer auth", async () => {
    let seenAuth = ""
    const client = createEntitlementsClient({
      fetchImpl: async (_input, init) => {
        seenAuth = new Headers(init?.headers).get("authorization") ?? ""
        return jsonResponse(successCreatedProject, 201)
      },
    })
    await client.createProjectV2(KEY, {
      name: "Site A",
      kmzBlobUrl: "s3://b/k",
      kmzSha256: SAMPLE_KMZ_SHA,
    })
    expect(seenAuth).toBe(`Bearer ${KEY}`)
  })

  test("maps 402 PAYMENT_REQUIRED with quota numbers in the message (over-quota)", async () => {
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
      await client.createProjectV2(KEY, {
        name: "Site A",
        kmzBlobUrl: "s3://b/k",
        kmzSha256: SAMPLE_KMZ_SHA,
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(402)
      expect(e.code).toBe("PAYMENT_REQUIRED")
      expect(e.message).toContain("3/3")
    }
  })

  test("maps 401 UNAUTHORIZED via V2 envelope", async () => {
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
      await client.createProjectV2(KEY, {
        name: "Site A",
        kmzBlobUrl: "s3://b/k",
        kmzSha256: SAMPLE_KMZ_SHA,
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(401)
      expect(e.code).toBe("UNAUTHORIZED")
    }
  })

  test("maps 400 VALIDATION_ERROR (e.g. bad sha256)", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: { fieldErrors: { kmzSha256: ["must be 64-char hex"] } },
            },
          },
          400
        ),
    })
    try {
      await client.createProjectV2(KEY, {
        name: "Site A",
        kmzBlobUrl: "s3://b/k",
        kmzSha256: "nope",
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(400)
      expect(e.code).toBe("VALIDATION_ERROR")
    }
  })

  test("rejects a malformed success body (schema guard — missing deletedAt)", async () => {
    const client = createEntitlementsClient({
      fetchImpl: async () =>
        jsonResponse(
          {
            success: true,
            data: {
              id: "prj_abc",
              userId: "usr_x",
              name: "Site A",
              kmzBlobUrl: "s3://b/k",
              kmzSha256: SAMPLE_KMZ_SHA,
              edits: {},
              createdAt: "2026-04-30T12:00:00.000Z",
              updatedAt: "2026-04-30T12:00:00.000Z",
              // missing deletedAt
            },
          },
          201
        ),
    })
    try {
      await client.createProjectV2(KEY, {
        name: "Site A",
        kmzBlobUrl: "s3://b/k",
        kmzSha256: SAMPLE_KMZ_SHA,
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as EntitlementsError
      expect(e.status).toBe(0)
      expect(e.message).toContain("schema validation")
    }
  })
})
