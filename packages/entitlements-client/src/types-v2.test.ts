/**
 * Schema-validation tests for the V2 wire-shape mirrors. Confirms that
 * (a) the V2 envelope shapes parse cleanly against representative fixtures,
 * (b) the V2 error code union is exhaustive against the backend's commit,
 * (c) EntitlementSummaryV2 remains a strict superset of V1 (the backend's
 *     locked decision is that the V1 sub-shape is bit-stable inside V2).
 *
 * If any of these fails after a backend type bump, this file is the first
 * place to look — drift between this mirror and the canonical source at
 * `renewable_energy/packages/shared/src/types/api-v2.ts` is what these
 * tests are watching for.
 */
import { describe, test, expect } from "bun:test"
import {
  v2ErrorCodes,
  v2ErrorBodySchema,
  v2ErrorResponseSchema,
  v2SuccessResponseSchema,
  projectQuotaStateSchema,
  entitlementSummaryV2DataSchema,
  entitlementSummaryV2ResponseSchema,
  createProjectV2RequestSchema,
  createProjectV2ResponseSchema,
  projectV2WireSchema,
  runSummaryV2WireSchema,
  projectDetailV2WireSchema,
  getProjectV2ResponseSchema,
  runWireV2Schema,
  runUploadDescriptorSchema,
  createRunV2RequestSchema,
  createRunV2ResultSchema,
  createRunV2ResponseSchema,
  patchProjectV2RequestSchema,
  patchProjectV2ResponseSchema,
  projectSummaryListRowV2Schema,
  listProjectsV2ResponseSchema,
  type EntitlementSummaryV2,
  type V2ErrorCode,
} from "./types-v2"
import { entitlementsDataSchema } from "./types"
import { z } from "zod"

describe("V2 error codes", () => {
  test("exhaustive union matches the backend's V2ErrorCode commit", () => {
    // If the backend adds or removes a code, update this list in lockstep
    // with the union in types-v2.ts. Keeping them anchored to the same
    // canonical source ensures the desktop's exhaustive `switch` consumers
    // stay safe. Compare as `string[]` to sidestep `.sort()` widening the
    // tuple element type.
    const actual: string[] = [...v2ErrorCodes].sort()
    const expected: string[] = [
      "CONFLICT",
      "INTERNAL_SERVER_ERROR",
      "NOT_FOUND",
      "PAYMENT_REQUIRED",
      "S3_NOT_CONFIGURED",
      "UNAUTHORIZED",
      "VALIDATION_ERROR",
    ]
    expect(actual).toEqual(expected)
  })
})

describe("v2ErrorBodySchema", () => {
  test("parses a minimal error body (code + message only)", () => {
    const r = v2ErrorBodySchema.safeParse({
      code: "UNAUTHORIZED",
      message: "License key not recognised.",
    })
    expect(r.success).toBe(true)
  })

  test("parses an error body with details", () => {
    const r = v2ErrorBodySchema.safeParse({
      code: "VALIDATION_ERROR",
      message: "kmzSize must be 1..52428800",
      details: { field: "kmzSize", got: 99999999 },
    })
    expect(r.success).toBe(true)
  })

  test("rejects an unknown error code", () => {
    const r = v2ErrorBodySchema.safeParse({
      code: "NOT_A_REAL_CODE",
      message: "hi",
    })
    expect(r.success).toBe(false)
  })

  test("rejects when message is missing", () => {
    const r = v2ErrorBodySchema.safeParse({ code: "UNAUTHORIZED" })
    expect(r.success).toBe(false)
  })
})

describe("v2ErrorResponseSchema", () => {
  test("parses a full error envelope", () => {
    const r = v2ErrorResponseSchema.safeParse({
      success: false,
      error: { code: "PAYMENT_REQUIRED", message: "No remaining calcs" },
    })
    expect(r.success).toBe(true)
  })

  test("rejects success: true (that's the success envelope)", () => {
    const r = v2ErrorResponseSchema.safeParse({
      success: true,
      error: { code: "UNAUTHORIZED", message: "x" },
    })
    expect(r.success).toBe(false)
  })

  test("rejects when the success flag is missing", () => {
    const r = v2ErrorResponseSchema.safeParse({
      error: { code: "UNAUTHORIZED", message: "x" },
    })
    expect(r.success).toBe(false)
  })
})

describe("v2SuccessResponseSchema factory", () => {
  test("parses { success: true, data: T } for a given inner schema", () => {
    const innerSchema = z.object({ foo: z.string() })
    const schema = v2SuccessResponseSchema(innerSchema)
    const r = schema.safeParse({ success: true, data: { foo: "bar" } })
    expect(r.success).toBe(true)
  })

  test("rejects when data is shape-wrong for the inner schema", () => {
    const innerSchema = z.object({ foo: z.string() })
    const schema = v2SuccessResponseSchema(innerSchema)
    const r = schema.safeParse({ success: true, data: { foo: 42 } })
    expect(r.success).toBe(false)
  })

  test("rejects { success: false } envelopes", () => {
    const innerSchema = z.object({ foo: z.string() })
    const schema = v2SuccessResponseSchema(innerSchema)
    const r = schema.safeParse({
      success: false,
      error: { code: "UNAUTHORIZED", message: "x" },
    })
    expect(r.success).toBe(false)
  })
})

describe("projectQuotaStateSchema", () => {
  test("parses Free tier (3 / 0 / 3)", () => {
    expect(
      projectQuotaStateSchema.safeParse({
        projectQuota: 3,
        projectsActive: 0,
        projectsRemaining: 3,
      }).success
    ).toBe(true)
  })

  test("parses Pro tier at quota edge (10 / 10 / 0)", () => {
    expect(
      projectQuotaStateSchema.safeParse({
        projectQuota: 10,
        projectsActive: 10,
        projectsRemaining: 0,
      }).success
    ).toBe(true)
  })

  test("parses deactivated/exhausted (0 / 0 / 0)", () => {
    expect(
      projectQuotaStateSchema.safeParse({
        projectQuota: 0,
        projectsActive: 0,
        projectsRemaining: 0,
      }).success
    ).toBe(true)
  })

  test("rejects negative quota", () => {
    expect(
      projectQuotaStateSchema.safeParse({
        projectQuota: -1,
        projectsActive: 0,
        projectsRemaining: 0,
      }).success
    ).toBe(false)
  })
})

describe("entitlementSummaryV2DataSchema", () => {
  // Reusable V2 fixture across these tests. Mirrors the FREE fixture from
  // the backend's seed script.
  const v2Fixture: EntitlementSummaryV2 = {
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
    entitlementsActive: true,
  }

  test("parses a full V2 EntitlementSummary fixture", () => {
    expect(entitlementSummaryV2DataSchema.safeParse(v2Fixture).success).toBe(
      true
    )
  })

  test("parses a deactivated user (licensed=false + entitlementsActive=false)", () => {
    const r = entitlementSummaryV2DataSchema.safeParse({
      ...v2Fixture,
      licensed: false,
      entitlementsActive: false,
      projectQuota: 0,
      projectsRemaining: 0,
      remainingCalculations: 0,
      availableFeatures: [],
    })
    expect(r.success).toBe(true)
  })

  test("parses an exhausted user (licensed=false + entitlementsActive=true)", () => {
    const r = entitlementSummaryV2DataSchema.safeParse({
      ...v2Fixture,
      licensed: false,
      entitlementsActive: true, // entitlement still active, just no calcs left
      remainingCalculations: 0,
    })
    expect(r.success).toBe(true)
  })

  test("rejects when entitlementsActive is missing (required field)", () => {
    const v: Record<string, unknown> = { ...v2Fixture }
    delete v.entitlementsActive
    expect(entitlementSummaryV2DataSchema.safeParse(v).success).toBe(false)
  })

  test("V2 data still parses against V1's entitlementsDataSchema (sub-type)", () => {
    // Sub-type substitutability — V2 fields are extra; V1 schema ignores
    // unknown keys and parses the V1 sub-shape successfully.
    expect(entitlementsDataSchema.safeParse(v2Fixture).success).toBe(true)
  })

  test("rejects when V2 fields are missing", () => {
    const v1Only: Record<string, unknown> = { ...v2Fixture }
    delete v1Only.projectQuota
    delete v1Only.projectsActive
    delete v1Only.projectsRemaining
    expect(entitlementSummaryV2DataSchema.safeParse(v1Only).success).toBe(false)
  })
})

describe("entitlementSummaryV2ResponseSchema", () => {
  test("parses a full success envelope", () => {
    const r = entitlementSummaryV2ResponseSchema.safeParse({
      success: true,
      data: {
        user: { name: "A", email: "a@b" },
        plans: [],
        licensed: false,
        availableFeatures: [],
        totalCalculations: 0,
        usedCalculations: 0,
        remainingCalculations: 0,
        projectQuota: 0,
        projectsActive: 0,
        projectsRemaining: 0,
        entitlementsActive: false,
      },
    })
    expect(r.success).toBe(true)
  })

  test("rejects an envelope missing the V2 fields inside data", () => {
    const r = entitlementSummaryV2ResponseSchema.safeParse({
      success: true,
      data: {
        user: { name: null, email: "a@b" },
        plans: [],
        licensed: true,
        availableFeatures: [],
        totalCalculations: 0,
        usedCalculations: 0,
        remainingCalculations: 0,
        // missing V2 fields
      },
    })
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// B11 — POST /v2/projects (create-project request + project wire shape)
// ---------------------------------------------------------------------------

const VALID_SHA = "a".repeat(64)

describe("createProjectV2RequestSchema", () => {
  test("parses a minimal valid body", () => {
    const r = createProjectV2RequestSchema.safeParse({
      name: "Site A",
      kmzBlobUrl: `s3://b/projects/u/kmz/${VALID_SHA}.kmz`,
      kmzSha256: VALID_SHA,
    })
    expect(r.success).toBe(true)
  })

  test("accepts optional edits passthrough", () => {
    const r = createProjectV2RequestSchema.safeParse({
      name: "Site A",
      kmzBlobUrl: "s3://b/k",
      kmzSha256: VALID_SHA,
      edits: { layoutOverrides: { rows: 8 } },
    })
    expect(r.success).toBe(true)
  })

  test("rejects empty name", () => {
    const r = createProjectV2RequestSchema.safeParse({
      name: "",
      kmzBlobUrl: "s3://b/k",
      kmzSha256: VALID_SHA,
    })
    expect(r.success).toBe(false)
  })

  test("rejects name longer than 200 chars", () => {
    const r = createProjectV2RequestSchema.safeParse({
      name: "x".repeat(201),
      kmzBlobUrl: "s3://b/k",
      kmzSha256: VALID_SHA,
    })
    expect(r.success).toBe(false)
  })

  test("rejects non-hex sha256", () => {
    const r = createProjectV2RequestSchema.safeParse({
      name: "ok",
      kmzBlobUrl: "s3://b/k",
      kmzSha256: "nope",
    })
    expect(r.success).toBe(false)
  })

  test("rejects sha256 with uppercase hex (backend wants lowercase)", () => {
    const r = createProjectV2RequestSchema.safeParse({
      name: "ok",
      kmzBlobUrl: "s3://b/k",
      kmzSha256: "A".repeat(64),
    })
    expect(r.success).toBe(false)
  })
})

describe("projectV2WireSchema", () => {
  const wireFixture = {
    id: "prj_abc123",
    userId: "usr_test1",
    name: "Site A",
    kmzBlobUrl: `s3://solarlayout-local-projects/projects/usr_test1/kmz/${VALID_SHA}.kmz`,
    kmzSha256: VALID_SHA,
    edits: {},
    createdAt: "2026-04-30T12:00:00.000Z",
    updatedAt: "2026-04-30T12:00:00.000Z",
    deletedAt: null,
  }

  test("parses the full backend ProjectWire shape", () => {
    expect(projectV2WireSchema.safeParse(wireFixture).success).toBe(true)
  })

  test("accepts deletedAt as a soft-delete timestamp", () => {
    const r = projectV2WireSchema.safeParse({
      ...wireFixture,
      deletedAt: "2026-04-30T13:00:00.000Z",
    })
    expect(r.success).toBe(true)
  })

  test("accepts arbitrary edits (unknown JSON)", () => {
    const r = projectV2WireSchema.safeParse({
      ...wireFixture,
      edits: { layoutOverrides: { rows: 8 } },
    })
    expect(r.success).toBe(true)
  })

  test("rejects when deletedAt is missing entirely (must be string|null)", () => {
    const v = { ...wireFixture } as Record<string, unknown>
    delete v.deletedAt
    expect(projectV2WireSchema.safeParse(v).success).toBe(false)
  })

  test("rejects when userId is missing", () => {
    const v = { ...wireFixture } as Record<string, unknown>
    delete v.userId
    expect(projectV2WireSchema.safeParse(v).success).toBe(false)
  })
})

describe("createProjectV2ResponseSchema", () => {
  test("parses the V2 success envelope around a Project wire", () => {
    const r = createProjectV2ResponseSchema.safeParse({
      success: true,
      data: {
        id: "prj_abc",
        userId: "usr_x",
        name: "Site A",
        kmzBlobUrl: "s3://b/k",
        kmzSha256: VALID_SHA,
        edits: {},
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z",
        deletedAt: null,
      },
    })
    expect(r.success).toBe(true)
  })

  test("rejects {success: false} (that's the V2 error envelope)", () => {
    const r = createProjectV2ResponseSchema.safeParse({
      success: false,
      error: { code: "PAYMENT_REQUIRED", message: "x" },
    })
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// B12 — GET /v2/projects/:id (RunSummary + ProjectDetail wire shapes)
// ---------------------------------------------------------------------------

describe("runSummaryV2WireSchema", () => {
  const sample = {
    id: "run_01HX7Z3K9D2MN5Q8R7T1V4W6Y0",
    name: "Run 1",
    params: { rows: 8, cols: 12 },
    billedFeatureKey: "plant_layout",
    createdAt: "2026-04-30T12:00:00.000Z",
  }

  test("parses a typical run-list-row shape", () => {
    expect(runSummaryV2WireSchema.safeParse(sample).success).toBe(true)
  })

  test("accepts opaque params (unknown JSON)", () => {
    const r = runSummaryV2WireSchema.safeParse({
      ...sample,
      params: null,
    })
    expect(r.success).toBe(true)
  })

  test("rejects when billedFeatureKey is missing (required for cost attribution)", () => {
    const v: Record<string, unknown> = { ...sample }
    delete v.billedFeatureKey
    expect(runSummaryV2WireSchema.safeParse(v).success).toBe(false)
  })

  test("rejects when id is missing", () => {
    const v: Record<string, unknown> = { ...sample }
    delete v.id
    expect(runSummaryV2WireSchema.safeParse(v).success).toBe(false)
  })
})

describe("projectDetailV2WireSchema", () => {
  const baseProject = {
    id: "prj_abc123",
    userId: "usr_test1",
    name: "Site A",
    kmzBlobUrl: `s3://b/projects/u/kmz/${VALID_SHA}.kmz`,
    kmzSha256: VALID_SHA,
    edits: {},
    createdAt: "2026-04-30T12:00:00.000Z",
    updatedAt: "2026-04-30T12:00:00.000Z",
    deletedAt: null,
  }
  const sampleRun = {
    id: "run_xyz",
    name: "Run 1",
    params: {},
    billedFeatureKey: "plant_layout",
    createdAt: "2026-04-30T12:05:00.000Z",
  }

  test("parses a project with empty runs array (fresh project)", () => {
    const r = projectDetailV2WireSchema.safeParse({
      ...baseProject,
      kmzDownloadUrl: "https://s3.ap-south-1.amazonaws.com/b/k.kmz?X-Amz-Sig=...",
      runs: [],
    })
    expect(r.success).toBe(true)
  })

  test("parses a project with multiple runs", () => {
    const r = projectDetailV2WireSchema.safeParse({
      ...baseProject,
      kmzDownloadUrl: "https://s3.example/presigned",
      runs: [sampleRun, { ...sampleRun, id: "run_2" }],
    })
    expect(r.success).toBe(true)
  })

  test("accepts kmzDownloadUrl=null (S3 bucket env unset on backend)", () => {
    // Backend's documented graceful-degradation: returns null when
    // MVP_S3_PROJECTS_BUCKET is unset (local dev without S3). The desktop
    // surfaces a "KMZ unretrievable" error rather than crashing on a parse
    // failure.
    const r = projectDetailV2WireSchema.safeParse({
      ...baseProject,
      kmzDownloadUrl: null,
      runs: [],
    })
    expect(r.success).toBe(true)
  })

  test("rejects kmzDownloadUrl=undefined (must be string|null, not absent)", () => {
    const v: Record<string, unknown> = {
      ...baseProject,
      runs: [],
    }
    expect(projectDetailV2WireSchema.safeParse(v).success).toBe(false)
  })

  test("rejects when runs is missing entirely (must be array, even if empty)", () => {
    const v: Record<string, unknown> = {
      ...baseProject,
      kmzDownloadUrl: null,
    }
    expect(projectDetailV2WireSchema.safeParse(v).success).toBe(false)
  })

  test("rejects when a run-summary entry is malformed", () => {
    const r = projectDetailV2WireSchema.safeParse({
      ...baseProject,
      kmzDownloadUrl: null,
      runs: [{ id: "run_x", name: "x" }], // missing billedFeatureKey + createdAt + params
    })
    expect(r.success).toBe(false)
  })
})

describe("getProjectV2ResponseSchema", () => {
  test("parses the V2 success envelope around a ProjectDetail", () => {
    const r = getProjectV2ResponseSchema.safeParse({
      success: true,
      data: {
        id: "prj_abc",
        userId: "usr_x",
        name: "Site A",
        kmzBlobUrl: "s3://b/k",
        kmzSha256: VALID_SHA,
        edits: {},
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z",
        deletedAt: null,
        kmzDownloadUrl: "https://s3.example/presigned",
        runs: [],
      },
    })
    expect(r.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// B16 — POST /v2/projects/:id/runs (atomic debit + Run create)
// ---------------------------------------------------------------------------

describe("createRunV2RequestSchema", () => {
  const validBody = {
    name: "Run 1",
    params: { rows: 8, cols: 12 },
    inputsSnapshot: { module_length: 2, module_width: 1 },
    billedFeatureKey: "plant_layout",
    idempotencyKey: "9c4f3e8a-5d6b-4f7c-9e2d-1a8b3c4d5e6f",
  }

  test("parses a typical create-run body", () => {
    expect(createRunV2RequestSchema.safeParse(validBody).success).toBe(true)
  })

  test("rejects empty name", () => {
    expect(
      createRunV2RequestSchema.safeParse({ ...validBody, name: "" }).success
    ).toBe(false)
  })

  test("rejects name longer than 200 chars", () => {
    expect(
      createRunV2RequestSchema.safeParse({
        ...validBody,
        name: "x".repeat(201),
      }).success
    ).toBe(false)
  })

  test("rejects empty billedFeatureKey", () => {
    expect(
      createRunV2RequestSchema.safeParse({
        ...validBody,
        billedFeatureKey: "",
      }).success
    ).toBe(false)
  })

  test("rejects empty idempotencyKey (backend's @@unique guard would race-fail anyway)", () => {
    expect(
      createRunV2RequestSchema.safeParse({
        ...validBody,
        idempotencyKey: "",
      }).success
    ).toBe(false)
  })
})

describe("runWireV2Schema", () => {
  const sample = {
    id: "run_abc",
    projectId: "prj_xyz",
    name: "Run 1",
    params: { rows: 8 },
    inputsSnapshot: { module_length: 2 },
    billedFeatureKey: "plant_layout",
    usageRecordId: "ur_qrs",
    createdAt: "2026-04-30T12:05:00.000Z",
    deletedAt: null,
  }

  test("parses the full RunWire shape", () => {
    expect(runWireV2Schema.safeParse(sample).success).toBe(true)
  })

  test("accepts deletedAt as a soft-delete timestamp", () => {
    expect(
      runWireV2Schema.safeParse({
        ...sample,
        deletedAt: "2026-04-30T13:00:00.000Z",
      }).success
    ).toBe(true)
  })

  test("rejects when usageRecordId is missing (links Run to UsageRecord)", () => {
    const v: Record<string, unknown> = { ...sample }
    delete v.usageRecordId
    expect(runWireV2Schema.safeParse(v).success).toBe(false)
  })

  // Note: `inputsSnapshot` and `params` use z.unknown(), which Zod treats
  // as optional in the inferred type — schema-level "rejects missing" isn't
  // expressible. Backend enforces presence at the route layer via explicit
  // `if (parsed.data.inputsSnapshot === undefined)` guards, so the wire is
  // safe; the desktop's mirror tracks what Zod can express.
})

describe("runUploadDescriptorSchema", () => {
  test("parses a layout-class descriptor", () => {
    const r = runUploadDescriptorSchema.safeParse({
      uploadUrl: "https://s3.example/presigned?X-Amz-Sig=...",
      blobUrl:
        "s3://solarlayout-local-projects/projects/u/p/runs/r/layout.json",
      expiresAt: "2026-04-30T13:00:00.000Z",
      type: "layout",
    })
    expect(r.success).toBe(true)
  })

  test("parses an energy-class descriptor", () => {
    const r = runUploadDescriptorSchema.safeParse({
      uploadUrl: "https://s3.example/presigned",
      blobUrl: "s3://b/r/energy.json",
      expiresAt: "2026-04-30T13:00:00.000Z",
      type: "energy",
    })
    expect(r.success).toBe(true)
  })

  test("rejects unknown type discriminator (DXF/PDF/KMZ go through B7)", () => {
    const r = runUploadDescriptorSchema.safeParse({
      uploadUrl: "https://s3.example/presigned",
      blobUrl: "s3://b/r/x.dxf",
      expiresAt: "2026-04-30T13:00:00.000Z",
      type: "dxf",
    })
    expect(r.success).toBe(false)
  })
})

describe("createRunV2ResponseSchema", () => {
  test("parses the V2 success envelope around { run, upload }", () => {
    const r = createRunV2ResponseSchema.safeParse({
      success: true,
      data: {
        run: {
          id: "run_abc",
          projectId: "prj_xyz",
          name: "Run 1",
          params: {},
          inputsSnapshot: {},
          billedFeatureKey: "plant_layout",
          usageRecordId: "ur_q",
          createdAt: "2026-04-30T12:05:00.000Z",
          deletedAt: null,
        },
        upload: {
          uploadUrl: "https://s3.example/presigned",
          blobUrl: "s3://b/p/r/layout.json",
          expiresAt: "2026-04-30T13:00:00.000Z",
          type: "layout",
        },
      },
    })
    expect(r.success).toBe(true)
  })

  test("rejects when upload field is missing", () => {
    const r = createRunV2ResponseSchema.safeParse({
      success: true,
      data: {
        run: {
          id: "run_a",
          projectId: "prj_x",
          name: "x",
          params: {},
          inputsSnapshot: {},
          billedFeatureKey: "plant_layout",
          usageRecordId: "ur_q",
          createdAt: "2026-04-30T12:00:00.000Z",
          deletedAt: null,
        },
        // missing upload
      },
    })
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// B13 — PATCH /v2/projects/:id (rename / edits update — auto-save target)
// ---------------------------------------------------------------------------

describe("patchProjectV2RequestSchema", () => {
  test("parses a name-only patch (rename UX)", () => {
    expect(
      patchProjectV2RequestSchema.safeParse({ name: "Renamed site" }).success
    ).toBe(true)
  })

  test("parses an edits-only patch (auto-save / P4)", () => {
    expect(
      patchProjectV2RequestSchema.safeParse({ edits: { obstructions: [] } })
        .success
    ).toBe(true)
  })

  test("parses both fields together", () => {
    expect(
      patchProjectV2RequestSchema.safeParse({
        name: "New name",
        edits: { obstructions: [] },
      }).success
    ).toBe(true)
  })

  test("rejects an empty body (backend requires at least one field)", () => {
    expect(patchProjectV2RequestSchema.safeParse({}).success).toBe(false)
  })

  test("rejects empty name", () => {
    expect(
      patchProjectV2RequestSchema.safeParse({ name: "" }).success
    ).toBe(false)
  })

  test("rejects name longer than 200 chars", () => {
    expect(
      patchProjectV2RequestSchema.safeParse({ name: "x".repeat(201) }).success
    ).toBe(false)
  })

  test("rejects forbidden fields (kmzBlobUrl, kmzSha256 are immutable post-create)", () => {
    // Backend uses `.strict()` so any extra key fails. The mirror does the
    // same to catch typos before the wire round-trip.
    expect(
      patchProjectV2RequestSchema.safeParse({
        name: "ok",
        kmzBlobUrl: "s3://b/k",
      }).success
    ).toBe(false)
  })
})

describe("patchProjectV2ResponseSchema", () => {
  // Response is the lighter ProjectV2Wire shape (no kmzDownloadUrl, no
  // runs[]) — those live on B12's ProjectDetail. PATCH only echoes what
  // can change.
  test("parses a successful rename response", () => {
    const r = patchProjectV2ResponseSchema.safeParse({
      success: true,
      data: {
        id: "prj_abc",
        userId: "usr_x",
        name: "Renamed site",
        kmzBlobUrl: "s3://b/k",
        kmzSha256: "a".repeat(64),
        edits: {},
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:30:00.000Z",
        deletedAt: null,
      },
    })
    expect(r.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// B10 — GET /v2/projects (recents list)
// ---------------------------------------------------------------------------

describe("projectSummaryListRowV2Schema", () => {
  const sample = {
    id: "prj_abc",
    name: "Site A",
    kmzBlobUrl: `s3://b/projects/u/kmz/${VALID_SHA}.kmz`,
    kmzSha256: VALID_SHA,
    createdAt: "2026-04-30T10:00:00.000Z",
    updatedAt: "2026-04-30T10:00:00.000Z",
    runsCount: 0,
    lastRunAt: null,
  }

  test("parses a fresh-project list row (zero runs)", () => {
    expect(projectSummaryListRowV2Schema.safeParse(sample).success).toBe(true)
  })

  test("parses a project with runs (lastRunAt populated)", () => {
    const r = projectSummaryListRowV2Schema.safeParse({
      ...sample,
      runsCount: 3,
      lastRunAt: "2026-04-30T11:00:00.000Z",
    })
    expect(r.success).toBe(true)
  })

  test("rejects when runsCount is missing", () => {
    const v: Record<string, unknown> = { ...sample }
    delete v.runsCount
    expect(projectSummaryListRowV2Schema.safeParse(v).success).toBe(false)
  })

  test("rejects when lastRunAt is missing entirely (must be string|null)", () => {
    const v: Record<string, unknown> = { ...sample }
    delete v.lastRunAt
    expect(projectSummaryListRowV2Schema.safeParse(v).success).toBe(false)
  })

  test("rejects negative runsCount", () => {
    expect(
      projectSummaryListRowV2Schema.safeParse({ ...sample, runsCount: -1 })
        .success
    ).toBe(false)
  })
})

describe("listProjectsV2ResponseSchema", () => {
  test("parses an empty list (new user, no projects yet)", () => {
    expect(
      listProjectsV2ResponseSchema.safeParse({ success: true, data: [] })
        .success
    ).toBe(true)
  })

  test("parses a populated list", () => {
    const r = listProjectsV2ResponseSchema.safeParse({
      success: true,
      data: [
        {
          id: "prj_a",
          name: "A",
          kmzBlobUrl: "s3://b/k",
          kmzSha256: VALID_SHA,
          createdAt: "2026-04-30T10:00:00.000Z",
          updatedAt: "2026-04-30T10:00:00.000Z",
          runsCount: 0,
          lastRunAt: null,
        },
        {
          id: "prj_b",
          name: "B",
          kmzBlobUrl: "s3://b/k2",
          kmzSha256: VALID_SHA,
          createdAt: "2026-04-30T09:00:00.000Z",
          updatedAt: "2026-04-30T11:00:00.000Z",
          runsCount: 2,
          lastRunAt: "2026-04-30T11:00:00.000Z",
        },
      ],
    })
    expect(r.success).toBe(true)
  })
})

describe("createRunV2ResultSchema (inner data)", () => {
  test("rejects when run.id is empty (semantic-id contract)", () => {
    expect(
      createRunV2ResultSchema.safeParse({
        run: {
          id: "",
          projectId: "prj_x",
          name: "x",
          params: {},
          inputsSnapshot: {},
          billedFeatureKey: "plant_layout",
          usageRecordId: "ur_q",
          createdAt: "2026-04-30T12:00:00.000Z",
          deletedAt: null,
        },
        upload: {
          uploadUrl: "https://s3.example/presigned",
          blobUrl: "s3://b/r/x.json",
          expiresAt: "2026-04-30T13:00:00.000Z",
          type: "layout",
        },
      }).success
    ).toBe(false)
  })
})

// Compile-time anchor: a V2ErrorCode value is assignable to a string. If the
// union ever changes shape unexpectedly (e.g. the backend ships a numeric
// code), this assignment fails at typecheck.
const _codeIsString: string = "UNAUTHORIZED" satisfies V2ErrorCode
void _codeIsString
