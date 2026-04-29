import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

/**
 * B15 — GET /v2/projects/:id/runs
 *
 * Lists the caller's runs for a given project. Verifies project ownership
 * (404 on not-yours / soft-deleted / non-existent — no cross-user leakage),
 * excludes soft-deleted runs, sorts createdAt DESC.
 */

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
  user: mockUser,
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

const mockProjectFindFirst = mock(
  async (..._args: unknown[]): Promise<{ id: string; userId?: string } | null> =>
    null,
)

interface MockRun {
  id: string
  name: string
  params: unknown
  billedFeatureKey: string
  createdAt: Date
}

const mockRunFindMany = mock(
  async (..._args: unknown[]): Promise<MockRun[]> => [],
)

const mockUsageRecordFindFirst = mock(
  async (..._args: unknown[]): Promise<{
    id: string
    run: {
      id: string
      projectId: string
      name: string
      params: unknown
      inputsSnapshot: unknown
      billedFeatureKey: string
      usageRecordId: string
      createdAt: Date
      deletedAt: Date | null
    } | null
  } | null> => null,
)

const mockProductFeatureFindFirst = mock(
  async (..._args: unknown[]): Promise<{ featureKey: string } | null> => ({
    featureKey: "plant_layout",
  }),
)

const mockEntitlementFindMany = mock(async (..._args: unknown[]) => [
  {
    id: "ent_basic",
    userId: "usr_test1",
    productId: "prod_basic",
    totalCalculations: 5,
    usedCalculations: 0,
    deactivatedAt: null,
    purchasedAt: new Date(),
    product: {
      name: "Basic",
      displayOrder: 1,
      features: [{ featureKey: "plant_layout", label: "Plant Layout" }],
    },
  },
])

const mockExecuteRaw = mock(async () => 1)

const mockUsageRecordCreate = mock(async () => ({
  id: "ur_new",
  userId: "usr_test1",
  productId: "prod_basic",
  featureKey: "plant_layout",
}))

const mockRunCreate = mock(
  async (
    args: {
      data: {
        projectId: string
        name: string
        params: unknown
        inputsSnapshot: unknown
        billedFeatureKey: string
        usageRecordId: string
      }
    },
  ) => ({
    id: "run_new",
    projectId: args.data.projectId,
    name: args.data.name,
    params: args.data.params,
    inputsSnapshot: args.data.inputsSnapshot,
    layoutResultBlobUrl: null,
    energyResultBlobUrl: null,
    exportsBlobUrls: [],
    billedFeatureKey: args.data.billedFeatureKey,
    usageRecordId: args.data.usageRecordId,
    createdAt: new Date("2026-04-30T00:00:00Z"),
    deletedAt: null,
  }),
)

const mockTransaction = mock(async (arg: unknown) => {
  if (typeof arg === "function") {
    return await (
      arg as (tx: {
        $executeRaw: typeof mockExecuteRaw
        usageRecord: { create: typeof mockUsageRecordCreate }
        run: { create: typeof mockRunCreate }
      }) => Promise<unknown>
    )({
      $executeRaw: mockExecuteRaw,
      usageRecord: { create: mockUsageRecordCreate },
      run: { create: mockRunCreate },
    })
  }
  // batch shape (not used by B15/B16 but harmless to keep)
  return arg
})

const mockGetPresignedUploadUrl = mock(
  async (
    _key: string,
    _contentType: string,
    _expiresIn?: number,
    _contentLength?: number,
  ): Promise<string | null> =>
    "https://s3.example.com/signed-put?sig=run-result",
)

mock.module("../../lib/s3.js", () => ({
  getPresignedDownloadUrl: async () => null,
  getPresignedUploadUrl: mockGetPresignedUploadUrl,
}))

mock.module("../../env.js", () => ({
  env: {
    AWS_ACCESS_KEY_ID: "test-key",
    AWS_SECRET_ACCESS_KEY: "test-secret",
    AWS_REGION: "ap-south-1",
    MVP_S3_PROJECTS_BUCKET: "solarlayout-test-projects",
    MVP_S3_DOWNLOADS_BUCKET: "solarlayout-test-downloads",
  },
}))

mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: async () => mockLicenseKey },
    project: { findFirst: mockProjectFindFirst },
    run: { findMany: mockRunFindMany, create: mockRunCreate },
    usageRecord: {
      findFirst: mockUsageRecordFindFirst,
      create: mockUsageRecordCreate,
    },
    productFeature: { findFirst: mockProductFeatureFindFirst },
    entitlement: { findMany: mockEntitlementFindMany },
    $transaction: mockTransaction,
  },
}))

const { runsRoutes } = await import("./runs.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", runsRoutes)
  app.onError(errorHandler)
  return app
}

const list = (id: string) =>
  makeApp().request(`/v2/projects/${id}/runs`, {
    headers: { Authorization: "Bearer sl_live_testkey" },
  })

interface RunSummaryWire {
  id: string
  name: string
  params: unknown
  billedFeatureKey: string
  createdAt: string
}

describe("GET /v2/projects/:id/runs", () => {
  beforeEach(() => {
    mockProjectFindFirst.mockReset()
    mockProjectFindFirst.mockImplementation(async () => ({ id: "prj_x" }))
    mockRunFindMany.mockReset()
    mockRunFindMany.mockImplementation(async () => [])
  })

  it("returns 200 + [] when project exists but has no runs", async () => {
    const res = await list("prj_x")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: RunSummaryWire[] }
    expect(body.data).toEqual([])
  })

  it("returns 200 + run summaries (id, name, params, billedFeatureKey, createdAt)", async () => {
    const t1 = new Date("2026-04-15T00:00:00Z")
    const t2 = new Date("2026-04-20T00:00:00Z")
    mockRunFindMany.mockImplementation(async () => [
      {
        id: "run_b",
        name: "Run B",
        params: { rows: 8 },
        billedFeatureKey: "energy_yield",
        createdAt: t2,
      },
      {
        id: "run_a",
        name: "Run A",
        params: { rows: 4 },
        billedFeatureKey: "plant_layout",
        createdAt: t1,
      },
    ])
    const res = await list("prj_x")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: RunSummaryWire[] }
    expect(body.data).toHaveLength(2)
    expect(body.data[0]!.id).toBe("run_b")
    expect(body.data[0]!.params).toEqual({ rows: 8 })
    expect(body.data[0]!.billedFeatureKey).toBe("energy_yield")
    expect(body.data[0]!.createdAt).toBe(t2.toISOString())
    expect(body.data[1]!.id).toBe("run_a")
  })

  it("returns 404 when the project doesn't exist (or belongs to another user)", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await list("prj_other")
    expect(res.status).toBe(404)
    expect(mockRunFindMany).not.toHaveBeenCalled()
  })

  it("returns 404 when the project is soft-deleted", async () => {
    // Same null path — where filter includes deletedAt: null
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await list("prj_deleted")
    expect(res.status).toBe(404)
  })

  it("scopes ownership lookup with where: { id, userId, deletedAt: null }", async () => {
    await list("prj_x")
    const call = mockProjectFindFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(call?.[0]?.where).toMatchObject({
      id: "prj_x",
      userId: "usr_test1",
      deletedAt: null,
    })
  })

  it("filters runs to projectId + deletedAt: null, orders createdAt DESC, selects only summary fields", async () => {
    await list("prj_x")
    const call = mockRunFindMany.mock.calls[0] as unknown as [
      {
        where: Record<string, unknown>
        orderBy: Record<string, "asc" | "desc">
        select: Record<string, true>
      },
    ]
    expect(call?.[0]?.where).toMatchObject({
      projectId: "prj_x",
      deletedAt: null,
    })
    expect(call?.[0]?.orderBy).toEqual({ createdAt: "desc" })
    expect(call?.[0]?.select).toMatchObject({
      id: true,
      name: true,
      params: true,
      billedFeatureKey: true,
      createdAt: true,
    })
    // Heavy fields stay in B17, not the list view
    expect(call?.[0]?.select).not.toHaveProperty("inputsSnapshot")
    expect(call?.[0]?.select).not.toHaveProperty("layoutResultBlobUrl")
    expect(call?.[0]?.select).not.toHaveProperty("energyResultBlobUrl")
    expect(call?.[0]?.select).not.toHaveProperty("exportsBlobUrls")
  })
})

// ─── B16 — POST /v2/projects/:id/runs ────────────────────────────────────────

interface CreateRunWire {
  run: {
    id: string
    projectId: string
    name: string
    params: unknown
    inputsSnapshot: unknown
    billedFeatureKey: string
    usageRecordId: string
    createdAt: string
    deletedAt: string | null
  }
  upload: {
    uploadUrl: string
    blobUrl: string
    expiresAt: string
    type: "layout" | "energy"
  }
}

const VALID_BODY = {
  name: "Run 1",
  params: { rows: 4, cols: 4 },
  inputsSnapshot: { kmzSha256: "0".repeat(64), edits: {} },
  billedFeatureKey: "plant_layout",
  idempotencyKey: "idem-create-run-1",
}

const create = (id: string, body: object | string) =>
  makeApp().request(`/v2/projects/${id}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer sl_live_testkey",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

describe("POST /v2/projects/:id/runs", () => {
  beforeEach(() => {
    mockProjectFindFirst.mockReset()
    mockProjectFindFirst.mockImplementation(async () => ({ id: "prj_x" }))
    mockUsageRecordFindFirst.mockReset()
    mockUsageRecordFindFirst.mockImplementation(async () => null)
    mockProductFeatureFindFirst.mockReset()
    mockProductFeatureFindFirst.mockImplementation(async () => ({
      featureKey: "plant_layout",
    }))
    mockEntitlementFindMany.mockReset()
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_basic",
        userId: "usr_test1",
        productId: "prod_basic",
        totalCalculations: 5,
        usedCalculations: 0,
        deactivatedAt: null,
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
    mockUsageRecordCreate.mockImplementation(async () => ({
      id: "ur_new",
      userId: "usr_test1",
      productId: "prod_basic",
      featureKey: "plant_layout",
    }))
    mockRunCreate.mockClear()
    mockGetPresignedUploadUrl.mockClear()
    mockGetPresignedUploadUrl.mockImplementation(
      async () => "https://s3.example.com/signed-put?sig=run-result",
    )
    mockTransaction.mockClear()
  })

  it("happy path: 201 with { run, upload } and a fresh debit", async () => {
    const res = await create("prj_x", VALID_BODY)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { data: CreateRunWire }
    expect(body.data.run.id).toBe("run_new")
    expect(body.data.run.projectId).toBe("prj_x")
    expect(body.data.run.name).toBe("Run 1")
    expect(body.data.run.billedFeatureKey).toBe("plant_layout")
    expect(body.data.run.usageRecordId).toBe("ur_new")
    expect(body.data.upload.uploadUrl).toBe(
      "https://s3.example.com/signed-put?sig=run-result",
    )
    expect(body.data.upload.type).toBe("layout")
    expect(body.data.upload.blobUrl).toContain(
      "/runs/run_new/layout.json",
    )
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1)
    expect(mockUsageRecordCreate).toHaveBeenCalledTimes(1)
    expect(mockRunCreate).toHaveBeenCalledTimes(1)
  })

  it("debits the entitlement and persists idempotencyKey on the UsageRecord", async () => {
    await create("prj_x", VALID_BODY)
    const urCall = mockUsageRecordCreate.mock.calls[0] as unknown as [
      { data: { idempotencyKey?: string; featureKey: string } },
    ]
    expect(urCall?.[0]?.data?.idempotencyKey).toBe("idem-create-run-1")
    expect(urCall?.[0]?.data?.featureKey).toBe("plant_layout")
  })

  it("creates Run with usageRecordId link and the supplied params + inputsSnapshot", async () => {
    await create("prj_x", VALID_BODY)
    const runCall = mockRunCreate.mock.calls[0] as unknown as [
      {
        data: {
          projectId: string
          name: string
          params: unknown
          inputsSnapshot: unknown
          billedFeatureKey: string
          usageRecordId: string
        }
      },
    ]
    expect(runCall?.[0]?.data?.projectId).toBe("prj_x")
    expect(runCall?.[0]?.data?.params).toEqual({ rows: 4, cols: 4 })
    expect(runCall?.[0]?.data?.inputsSnapshot).toEqual({
      kmzSha256: "0".repeat(64),
      edits: {},
    })
    expect(runCall?.[0]?.data?.usageRecordId).toBe("ur_new")
  })

  it("uses 'energy' upload type for energy_yield billedFeatureKey", async () => {
    mockProductFeatureFindFirst.mockImplementation(async () => ({
      featureKey: "energy_yield",
    }))
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        id: "ent_pp",
        userId: "usr_test1",
        productId: "prod_pp",
        totalCalculations: 50,
        usedCalculations: 0,
        deactivatedAt: null,
        purchasedAt: new Date(),
        product: {
          name: "Pro Plus",
          displayOrder: 3,
          features: [{ featureKey: "energy_yield", label: "Energy Yield" }],
        },
      },
    ])
    const res = await create("prj_x", {
      ...VALID_BODY,
      billedFeatureKey: "energy_yield",
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { data: CreateRunWire }
    expect(body.data.upload.type).toBe("energy")
    expect(body.data.upload.blobUrl).toContain("/runs/run_new/energy.json")
  })

  it("idempotent replay: existing UsageRecord+Run for the same key → returns existing Run, no new debit", async () => {
    const existingRun = {
      id: "run_existing",
      projectId: "prj_x",
      name: "Run 1 (original)",
      params: { rows: 4, cols: 4 },
      inputsSnapshot: { foo: "bar" },
      billedFeatureKey: "plant_layout",
      usageRecordId: "ur_existing",
      createdAt: new Date("2026-04-25T00:00:00Z"),
      deletedAt: null,
    }
    mockUsageRecordFindFirst.mockImplementation(async () => ({
      id: "ur_existing",
      run: existingRun,
    }))
    const res = await create("prj_x", VALID_BODY)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { data: CreateRunWire }
    expect(body.data.run.id).toBe("run_existing")
    expect(body.data.run.name).toBe("Run 1 (original)")
    expect(body.data.upload.uploadUrl).toBe(
      "https://s3.example.com/signed-put?sig=run-result",
    )
    expect(mockExecuteRaw).not.toHaveBeenCalled()
    expect(mockUsageRecordCreate).not.toHaveBeenCalled()
    expect(mockRunCreate).not.toHaveBeenCalled()
  })

  it("returns 404 when project doesn't exist or is owned by another user", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await create("prj_other", VALID_BODY)
    expect(res.status).toBe(404)
    expect(mockUsageRecordCreate).not.toHaveBeenCalled()
    expect(mockRunCreate).not.toHaveBeenCalled()
  })

  it("returns 402 when no entitlement covers the feature (no debit, no Run)", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [])
    const res = await create("prj_x", VALID_BODY)
    expect(res.status).toBe(402)
    expect(mockUsageRecordCreate).not.toHaveBeenCalled()
    expect(mockRunCreate).not.toHaveBeenCalled()
  })

  it("returns 400 for unknown billedFeatureKey", async () => {
    mockProductFeatureFindFirst.mockImplementation(async () => null)
    const res = await create("prj_x", {
      ...VALID_BODY,
      billedFeatureKey: "made_up",
    })
    expect(res.status).toBe(400)
    expect(mockUsageRecordCreate).not.toHaveBeenCalled()
  })

  it("validation: missing name → 400", async () => {
    const { name: _n, ...rest } = VALID_BODY
    const res = await create("prj_x", rest)
    expect(res.status).toBe(400)
  })

  it("validation: missing idempotencyKey → 400", async () => {
    const { idempotencyKey: _k, ...rest } = VALID_BODY
    const res = await create("prj_x", rest)
    expect(res.status).toBe(400)
  })

  it("validation: missing params → 400", async () => {
    const { params: _p, ...rest } = VALID_BODY
    const res = await create("prj_x", rest)
    expect(res.status).toBe(400)
  })

  it("validation: missing inputsSnapshot → 400", async () => {
    const { inputsSnapshot: _i, ...rest } = VALID_BODY
    const res = await create("prj_x", rest)
    expect(res.status).toBe(400)
  })

  it("validation: missing billedFeatureKey → 400", async () => {
    const { billedFeatureKey: _f, ...rest } = VALID_BODY
    const res = await create("prj_x", rest)
    expect(res.status).toBe(400)
  })

  it("validation: malformed JSON → 400", async () => {
    const res = await create("prj_x", "not-json")
    expect(res.status).toBe(400)
  })

  it("returns 409 when entitlement was deactivated between selection and atomic UPDATE (rowsUpdated=0)", async () => {
    mockExecuteRaw.mockImplementation(async () => 0)
    const res = await create("prj_x", VALID_BODY)
    expect(res.status).toBe(409)
    expect(mockRunCreate).not.toHaveBeenCalled()
  })

  it("scopes the project ownership check with where: { id, userId, deletedAt: null }", async () => {
    await create("prj_x", VALID_BODY)
    const call = mockProjectFindFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(call?.[0]?.where).toMatchObject({
      id: "prj_x",
      userId: "usr_test1",
      deletedAt: null,
    })
  })

  it("scopes the idempotency pre-lookup with where: { userId, idempotencyKey } and includes run", async () => {
    await create("prj_x", VALID_BODY)
    const call = mockUsageRecordFindFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown>; include?: { run: true } },
    ]
    expect(call?.[0]?.where).toMatchObject({
      userId: "usr_test1",
      idempotencyKey: "idem-create-run-1",
    })
    expect(call?.[0]?.include?.run).toBe(true)
  })
})
