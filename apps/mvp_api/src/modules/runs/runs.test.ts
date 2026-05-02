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

interface MockRunDetail {
  id: string
  projectId: string
  name: string
  params: unknown
  inputsSnapshot: unknown
  layoutResultBlobUrl: string | null
  energyResultBlobUrl: string | null
  exportsBlobUrls: unknown
  billedFeatureKey: string
  usageRecordId: string
  createdAt: Date
  deletedAt: Date | null
  status: string
  cancelledAt: Date | null
  failedAt: Date | null
  failureReason: string | null
  project: { userId: string }
}

const mockRunDetailFindFirst = mock(
  async (..._args: unknown[]): Promise<MockRunDetail | null> => null,
)

const mockRunUpdate = mock(
  async (args: {
    where: { id: string }
    data: { deletedAt?: Date | null }
  }) => ({
    id: args.where.id,
    deletedAt: args.data.deletedAt ?? null,
  }),
)

const mockUsageRecordFindFirst = mock(
  async (..._args: unknown[]): Promise<{
    id: string
    productId?: string
    userId?: string
    licenseKeyId?: string
    featureKey?: string
    run?: {
      id: string
      projectId: string
      name: string
      params: unknown
      inputsSnapshot: unknown
      billedFeatureKey: string
      usageRecordId: string
      createdAt: Date
      deletedAt: Date | null
      status: string
      cancelledAt: Date | null
      failedAt: Date | null
      failureReason: string | null
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

const mockQueryRaw = mock(
  async (..._args: unknown[]): Promise<
    Array<{
      id: string
      status: string
      usageRecordId: string
    }>
  > => [],
)

const mockEntitlementUpdateMany = mock(
  async (..._args: unknown[]): Promise<{ count: number }> => ({ count: 1 }),
)

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
    status: "RUNNING",
    cancelledAt: null,
    failedAt: null,
    failureReason: null,
  }),
)

const mockTransaction = mock(async (arg: unknown) => {
  if (typeof arg === "function") {
    return await (
      arg as (tx: {
        $executeRaw: typeof mockExecuteRaw
        $queryRaw: typeof mockQueryRaw
        usageRecord: { create: typeof mockUsageRecordCreate }
        run: {
          create: typeof mockRunCreate
          update: typeof mockRunUpdate
        }
        entitlement: { updateMany: typeof mockEntitlementUpdateMany }
      }) => Promise<unknown>
    )({
      $executeRaw: mockExecuteRaw,
      $queryRaw: mockQueryRaw,
      usageRecord: { create: mockUsageRecordCreate },
      run: { create: mockRunCreate, update: mockRunUpdate },
      entitlement: { updateMany: mockEntitlementUpdateMany },
    })
  }
  // batch shape (not used by B16/B30 but harmless to keep)
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

const mockGetPresignedDownloadUrl = mock(
  async (
    key: string,
    _filename: string,
    _expiresIn?: number,
    _bucket?: string,
  ): Promise<string | null> => `https://s3.example.com/signed-get?key=${key}`,
)

mock.module("../../lib/s3.js", () => ({
  getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
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
    run: {
      findMany: mockRunFindMany,
      findFirst: mockRunDetailFindFirst,
      create: mockRunCreate,
      update: mockRunUpdate,
    },
    usageRecord: {
      findFirst: mockUsageRecordFindFirst,
      create: mockUsageRecordCreate,
    },
    productFeature: { findFirst: mockProductFeatureFindFirst },
    entitlement: {
      findMany: mockEntitlementFindMany,
      updateMany: mockEntitlementUpdateMany,
    },
    $queryRaw: mockQueryRaw,
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
  thumbnailBlobUrl: string | null
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

  it("returns 200 + run summaries with always-signed thumbnail URLs (Path A)", async () => {
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
    // Path A — every run gets an always-signed deterministic URL
    expect(body.data[0]!.thumbnailBlobUrl).toContain(
      "projects/usr_test1/prj_x/runs/run_b/thumbnail.webp",
    )
    expect(body.data[1]!.thumbnailBlobUrl).toContain(
      "projects/usr_test1/prj_x/runs/run_a/thumbnail.webp",
    )
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
      status: "DONE",
      cancelledAt: null,
      failedAt: null,
      failureReason: null,
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

// ─── B17 — GET /v2/projects/:id/runs/:runId ──────────────────────────────────

interface RunDetailWire {
  id: string
  projectId: string
  name: string
  params: unknown
  inputsSnapshot: unknown
  layoutResultBlobUrl: string | null
  energyResultBlobUrl: string | null
  thumbnailBlobUrl: string | null
  exportsBlobUrls: unknown[]
  billedFeatureKey: string
  usageRecordId: string
  createdAt: string
  deletedAt: string | null
  status: string
  cancelledAt: string | null
  failedAt: string | null
  failureReason: string | null
}

const getRun = (projectId: string, runId: string) =>
  makeApp().request(`/v2/projects/${projectId}/runs/${runId}`, {
    headers: { Authorization: "Bearer sl_live_testkey" },
  })

const baseRun: MockRunDetail = {
  id: "run_x",
  projectId: "prj_x",
  name: "Run X",
  params: { rows: 4, cols: 4 },
  inputsSnapshot: { kmzSha256: "0".repeat(64) },
  layoutResultBlobUrl: null,
  energyResultBlobUrl: null,
  exportsBlobUrls: [],
  billedFeatureKey: "plant_layout",
  usageRecordId: "ur_x",
  createdAt: new Date("2026-04-15T12:00:00Z"),
  deletedAt: null,
  status: "DONE",
  cancelledAt: null,
  failedAt: null,
  failureReason: null,
  project: { userId: "usr_test1" },
}

describe("GET /v2/projects/:id/runs/:runId", () => {
  beforeEach(() => {
    mockRunDetailFindFirst.mockReset()
    mockRunDetailFindFirst.mockImplementation(async () => ({ ...baseRun }))
    mockGetPresignedDownloadUrl.mockClear()
    mockGetPresignedDownloadUrl.mockImplementation(
      async (key: string) => `https://s3.example.com/signed-get?key=${key}`,
    )
  })

  it("returns 200 + full Run row with layout URL signed (layout-class feature)", async () => {
    const res = await getRun("prj_x", "run_x")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: RunDetailWire }
    expect(body.data.id).toBe("run_x")
    expect(body.data.projectId).toBe("prj_x")
    expect(body.data.name).toBe("Run X")
    expect(body.data.params).toEqual({ rows: 4, cols: 4 })
    expect(body.data.inputsSnapshot).toEqual({ kmzSha256: "0".repeat(64) })
    expect(body.data.billedFeatureKey).toBe("plant_layout")
    expect(body.data.usageRecordId).toBe("ur_x")
    expect(body.data.createdAt).toBe(baseRun.createdAt.toISOString())
    expect(body.data.deletedAt).toBeNull()
    // Layout URL signed against the conventional key path
    expect(body.data.layoutResultBlobUrl).toContain(
      "/runs/run_x/layout.json",
    )
    // Energy URL null for layout-class feature
    expect(body.data.energyResultBlobUrl).toBeNull()
    // Thumbnail URL always-signed deterministically (Path A); pre-SP1 runs
    // get a valid URL that 404s on read — desktop's <img onError> falls back.
    expect(body.data.thumbnailBlobUrl).toContain(
      "/runs/run_x/thumbnail.webp",
    )
    // exportsBlobUrls is [] for v1
    expect(body.data.exportsBlobUrls).toEqual([])
  })

  it("thumbnail URL signed for energy-class feature too (always-sign, regardless of feature)", async () => {
    mockRunDetailFindFirst.mockImplementation(async () => ({
      ...baseRun,
      billedFeatureKey: "energy_yield",
    }))
    const res = await getRun("prj_x", "run_x")
    const body = (await res.json()) as { data: RunDetailWire }
    expect(body.data.thumbnailBlobUrl).toContain(
      "/runs/run_x/thumbnail.webp",
    )
  })

  it("energy-class feature: BOTH layoutResultBlobUrl AND energyResultBlobUrl set", async () => {
    mockRunDetailFindFirst.mockImplementation(async () => ({
      ...baseRun,
      billedFeatureKey: "energy_yield",
    }))
    const res = await getRun("prj_x", "run_x")
    const body = (await res.json()) as { data: RunDetailWire }
    expect(body.data.layoutResultBlobUrl).toContain(
      "/runs/run_x/layout.json",
    )
    expect(body.data.energyResultBlobUrl).toContain(
      "/runs/run_x/energy.json",
    )
  })

  it("generation_estimates also gets both layout + energy URLs", async () => {
    mockRunDetailFindFirst.mockImplementation(async () => ({
      ...baseRun,
      billedFeatureKey: "generation_estimates",
    }))
    const res = await getRun("prj_x", "run_x")
    const body = (await res.json()) as { data: RunDetailWire }
    expect(body.data.layoutResultBlobUrl).not.toBeNull()
    expect(body.data.energyResultBlobUrl).not.toBeNull()
  })

  it("signs against the projects bucket (4th arg = MVP_S3_PROJECTS_BUCKET)", async () => {
    await getRun("prj_x", "run_x")
    const call = mockGetPresignedDownloadUrl.mock.calls[0]
    // Args: (key, filename, expiresIn?, bucket?)
    expect(call?.[3]).toBe("solarlayout-test-projects")
  })

  it("returns 404 when the run doesn't exist", async () => {
    mockRunDetailFindFirst.mockImplementation(async () => null)
    const res = await getRun("prj_x", "run_nope")
    expect(res.status).toBe(404)
    expect(mockGetPresignedDownloadUrl).not.toHaveBeenCalled()
  })

  it("returns 404 when the run belongs to another user (where filter excludes)", async () => {
    // The where filter joins through project.userId, so a different user's
    // run produces null from findFirst.
    mockRunDetailFindFirst.mockImplementation(async () => null)
    const res = await getRun("prj_x", "run_other")
    expect(res.status).toBe(404)
  })

  it("returns 404 when the run is soft-deleted", async () => {
    mockRunDetailFindFirst.mockImplementation(async () => null)
    const res = await getRun("prj_x", "run_deleted")
    expect(res.status).toBe(404)
  })

  it("returns 404 when the parent project is soft-deleted (cascade-aware where filter)", async () => {
    mockRunDetailFindFirst.mockImplementation(async () => null)
    const res = await getRun("prj_deleted", "run_x")
    expect(res.status).toBe(404)
  })

  it("scopes the lookup with where: { id, projectId, deletedAt: null, project: { userId, deletedAt: null } }", async () => {
    await getRun("prj_x", "run_x")
    const call = mockRunDetailFindFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(call?.[0]?.where).toMatchObject({
      id: "run_x",
      projectId: "prj_x",
      deletedAt: null,
      project: { userId: "usr_test1", deletedAt: null },
    })
  })
})

// ─── B18 — DELETE /v2/projects/:id/runs/:runId ───────────────────────────────

const delRun = (projectId: string, runId: string) =>
  makeApp().request(`/v2/projects/${projectId}/runs/${runId}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer sl_live_testkey" },
  })

describe("DELETE /v2/projects/:id/runs/:runId", () => {
  beforeEach(() => {
    mockRunDetailFindFirst.mockReset()
    mockRunDetailFindFirst.mockImplementation(async () => ({ ...baseRun }))
    mockRunUpdate.mockClear()
    // Clear cross-test pollution — these mocks accumulate calls across all
    // describes in this file, and B18's "does NOT touch" assertions need
    // fresh counters.
    mockUsageRecordCreate.mockClear()
    mockGetPresignedUploadUrl.mockClear()
    mockGetPresignedDownloadUrl.mockClear()
  })

  it("returns 204 with empty body on success", async () => {
    const res = await delRun("prj_x", "run_x")
    expect(res.status).toBe(204)
    const body = await res.text()
    expect(body).toBe("")
  })

  it("scopes ownership lookup with the joined where filter", async () => {
    await delRun("prj_x", "run_x")
    const call = mockRunDetailFindFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(call?.[0]?.where).toMatchObject({
      id: "run_x",
      projectId: "prj_x",
      deletedAt: null,
      project: { userId: "usr_test1", deletedAt: null },
    })
  })

  it("sets run.deletedAt to a Date and only updates by id", async () => {
    await delRun("prj_x", "run_x")
    const call = mockRunUpdate.mock.calls[0] as unknown as [
      { where: { id: string }; data: { deletedAt?: Date } },
    ]
    expect(call?.[0]?.where).toEqual({ id: "run_x" })
    expect(call?.[0]?.data?.deletedAt).toBeInstanceOf(Date)
  })

  it("does NOT refund the calc — the linked UsageRecord stays untouched", async () => {
    await delRun("prj_x", "run_x")
    // The mock surface for runs.test.ts includes usageRecord.create but NOT
    // any update/delete — and the service file imports neither. We assert
    // the contract by ensuring the service never triggers anything outside
    // its narrow soft-delete scope.
    expect(mockUsageRecordCreate).not.toHaveBeenCalled()
    expect(mockRunUpdate).toHaveBeenCalledTimes(1)
  })

  it("returns 404 when the run doesn't exist (or belongs to another user)", async () => {
    mockRunDetailFindFirst.mockImplementation(async () => null)
    const res = await delRun("prj_x", "run_other")
    expect(res.status).toBe(404)
    expect(mockRunUpdate).not.toHaveBeenCalled()
  })

  it("returns 404 when the run is soft-deleted (where filter excludes)", async () => {
    mockRunDetailFindFirst.mockImplementation(async () => null)
    const res = await delRun("prj_x", "run_deleted")
    expect(res.status).toBe(404)
  })

  it("returns 404 when the parent project is soft-deleted (joined ownership filter)", async () => {
    mockRunDetailFindFirst.mockImplementation(async () => null)
    const res = await delRun("prj_deleted", "run_x")
    expect(res.status).toBe(404)
  })

  it("idempotency: a second DELETE on a soft-deleted run returns 404", async () => {
    mockRunDetailFindFirst.mockImplementationOnce(async () => ({
      ...baseRun,
    }))
    mockRunDetailFindFirst.mockImplementationOnce(async () => null)
    const r1 = await delRun("prj_x", "run_x")
    expect(r1.status).toBe(204)
    const r2 = await delRun("prj_x", "run_x")
    expect(r2.status).toBe(404)
  })

  it("does not perform any S3 / blob operations on delete", async () => {
    await delRun("prj_x", "run_x")
    // No upload or download URL signed — DELETE is a metadata-only op
    expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled()
    expect(mockGetPresignedDownloadUrl).not.toHaveBeenCalled()
  })
})

// ─── B30 — POST /v2/projects/:id/runs/:runId/cancel ──────────────────────────

const cancel = (projectId: string, runId: string) =>
  makeApp().request(
    `/v2/projects/${projectId}/runs/${runId}/cancel`,
    {
      method: "POST",
      headers: { Authorization: "Bearer sl_live_testkey" },
    },
  )

describe("POST /v2/projects/:id/runs/:runId/cancel", () => {
  beforeEach(() => {
    mockProjectFindFirst.mockReset()
    mockProjectFindFirst.mockImplementation(async () => ({ id: "prj_x" }))
    mockQueryRaw.mockReset()
    mockRunUpdate.mockClear()
    mockUsageRecordCreate.mockClear()
    mockUsageRecordFindFirst.mockReset()
    mockUsageRecordFindFirst.mockImplementation(async () => ({
      id: "ur_x",
      productId: "prod_basic",
      userId: "usr_test1",
      licenseKeyId: "lk_test1",
      featureKey: "plant_layout",
    }))
    mockEntitlementUpdateMany.mockReset()
    mockEntitlementUpdateMany.mockImplementation(async () => ({ count: 1 }))
  })

  it("RUNNING → flips to CANCELLED, writes refund row, decrements entitlement, returns 200", async () => {
    // The locked SELECT returns the run in RUNNING state.
    mockQueryRaw.mockImplementation(async () => [
      { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
    ])
    // run.update returns the post-cancel row used by toRunWire.
    mockRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      projectId: "prj_x",
      name: "Run X",
      params: {},
      inputsSnapshot: {},
      billedFeatureKey: "plant_layout",
      usageRecordId: "ur_x",
      createdAt: new Date("2026-05-01T10:00:00Z"),
      deletedAt: null,
      status: "CANCELLED",
      cancelledAt: new Date("2026-05-02T12:00:00Z"),
      failedAt: null,
      failureReason: null,
    }))

    const res = await cancel("prj_x", "run_x")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: RunDetailWire }
    expect(body.data.id).toBe("run_x")
    expect(body.data.status).toBe("CANCELLED")
    expect(body.data.cancelledAt).toBe("2026-05-02T12:00:00.000Z")

    // Transaction-internal effects
    expect(mockQueryRaw).toHaveBeenCalledTimes(1)
    expect(mockRunUpdate).toHaveBeenCalledTimes(1)
    expect(mockUsageRecordCreate).toHaveBeenCalledTimes(1)
    expect(mockEntitlementUpdateMany).toHaveBeenCalledTimes(1)

    // Refund row shape
    const urCall = mockUsageRecordCreate.mock.calls[0] as unknown as [
      {
        data: {
          userId: string
          productId: string
          featureKey: string
          count: number
          kind: string
          refundsRecordId: string
          licenseKeyId: string
        }
      },
    ]
    expect(urCall[0].data.count).toBe(-1)
    expect(urCall[0].data.kind).toBe("refund")
    expect(urCall[0].data.refundsRecordId).toBe("ur_x")
    expect(urCall[0].data.userId).toBe("usr_test1")
    expect(urCall[0].data.productId).toBe("prod_basic")

    // Entitlement decrement scoped to the user + productId
    const entCall = mockEntitlementUpdateMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ]
    expect(entCall[0].where).toMatchObject({
      userId: "usr_test1",
      productId: "prod_basic",
      deactivatedAt: null,
    })
  })

  // ── Task 5: CANCELLED idempotent no-op ─────────────────────────────────────

  it("CANCELLED → idempotent no-op, returns 200, no second refund or decrement", async () => {
    mockQueryRaw.mockImplementation(async () => [
      { id: "run_x", status: "CANCELLED", usageRecordId: "ur_x" },
    ])
    mockRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      projectId: "prj_x",
      name: "Run X",
      params: {},
      inputsSnapshot: {},
      billedFeatureKey: "plant_layout",
      usageRecordId: "ur_x",
      createdAt: new Date("2026-05-01T10:00:00Z"),
      deletedAt: null,
      status: "CANCELLED",
      cancelledAt: new Date("2026-05-02T11:00:00Z"),
      failedAt: null,
      failureReason: null,
    }))

    const res = await cancel("prj_x", "run_x")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: RunDetailWire }
    expect(body.data.status).toBe("CANCELLED")
    // No second refund row, no second decrement
    expect(mockUsageRecordCreate).not.toHaveBeenCalled()
    expect(mockEntitlementUpdateMany).not.toHaveBeenCalled()
  })

  // ── Task 6: DONE → 409 ─────────────────────────────────────────────────────

  it("DONE → 409 CONFLICT with descriptive message; no state mutations", async () => {
    mockQueryRaw.mockImplementation(async () => [
      { id: "run_x", status: "DONE", usageRecordId: "ur_x" },
    ])

    const res = await cancel("prj_x", "run_x")
    expect(res.status).toBe(409)
    const body = (await res.json()) as {
      success: false
      error: { code: string; message: string }
    }
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("CONFLICT")
    expect(body.error.message).toContain("already completed")
    // Zero state mutations
    expect(mockRunUpdate).not.toHaveBeenCalled()
    expect(mockUsageRecordCreate).not.toHaveBeenCalled()
    expect(mockEntitlementUpdateMany).not.toHaveBeenCalled()
  })

  // ── Task 7: FAILED → no-op ─────────────────────────────────────────────────

  it("FAILED → idempotent no-op, returns 200, no second refund (B32 already issued it)", async () => {
    mockQueryRaw.mockImplementation(async () => [
      { id: "run_x", status: "FAILED", usageRecordId: "ur_x" },
    ])
    mockRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      projectId: "prj_x",
      name: "Run X",
      params: {},
      inputsSnapshot: {},
      billedFeatureKey: "plant_layout",
      usageRecordId: "ur_x",
      createdAt: new Date("2026-05-01T10:00:00Z"),
      deletedAt: null,
      status: "FAILED",
      cancelledAt: null,
      failedAt: new Date("2026-05-02T10:30:00Z"),
      failureReason: "validation_error",
    }))

    const res = await cancel("prj_x", "run_x")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: RunDetailWire }
    expect(body.data.status).toBe("FAILED")
    expect(body.data.failedAt).toBe("2026-05-02T10:30:00.000Z")
    expect(body.data.failureReason).toBe("validation_error")
    expect(mockUsageRecordCreate).not.toHaveBeenCalled()
    expect(mockEntitlementUpdateMany).not.toHaveBeenCalled()
  })

  // ── Task 8: 404 ownership filters ──────────────────────────────────────────

  it("returns 404 when the project doesn't exist (or belongs to another user)", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await cancel("prj_other", "run_x")
    expect(res.status).toBe(404)
    expect(mockQueryRaw).not.toHaveBeenCalled()
    expect(mockRunUpdate).not.toHaveBeenCalled()
  })

  it("returns 404 when the project is soft-deleted", async () => {
    mockProjectFindFirst.mockImplementation(async () => null) // where filter excludes
    const res = await cancel("prj_deleted", "run_x")
    expect(res.status).toBe(404)
  })

  it("returns 404 when the run doesn't exist", async () => {
    // project ownership passes, but FOR UPDATE returns no rows
    mockQueryRaw.mockImplementation(async () => [])
    const res = await cancel("prj_x", "run_nope")
    expect(res.status).toBe(404)
    expect(mockRunUpdate).not.toHaveBeenCalled()
  })

  it("returns 404 when the run is soft-deleted (where filter excludes deletedAt)", async () => {
    mockQueryRaw.mockImplementation(async () => [])
    const res = await cancel("prj_x", "run_deleted")
    expect(res.status).toBe(404)
  })

  it("scopes the project ownership check with where: { id, userId, deletedAt: null }", async () => {
    mockQueryRaw.mockImplementation(async () => [
      { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
    ])
    mockRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      projectId: "prj_x",
      name: "Run X",
      params: {},
      inputsSnapshot: {},
      billedFeatureKey: "plant_layout",
      usageRecordId: "ur_x",
      createdAt: new Date(),
      deletedAt: null,
      status: "CANCELLED",
      cancelledAt: new Date(),
      failedAt: null,
      failureReason: null,
    }))

    await cancel("prj_x", "run_x")
    const call = mockProjectFindFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(call?.[0]?.where).toMatchObject({
      id: "prj_x",
      userId: "usr_test1",
      deletedAt: null,
    })
  })

  // ── Task 9: detail-shape assertions ────────────────────────────────────────

  it("refund UsageRecord captures the original's userId/licenseKeyId/productId/featureKey + new kind/count/refundsRecordId", async () => {
    mockQueryRaw.mockImplementation(async () => [
      { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
    ])
    mockUsageRecordFindFirst.mockImplementation(async () => ({
      id: "ur_x",
      productId: "prod_pro",
      userId: "usr_test1",
      licenseKeyId: "lk_test1",
      featureKey: "energy_yield",
    }))
    mockRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      projectId: "prj_x",
      name: "Run X",
      params: {},
      inputsSnapshot: {},
      billedFeatureKey: "energy_yield",
      usageRecordId: "ur_x",
      createdAt: new Date(),
      deletedAt: null,
      status: "CANCELLED",
      cancelledAt: new Date(),
      failedAt: null,
      failureReason: null,
    }))

    await cancel("prj_x", "run_x")

    const urCall = mockUsageRecordCreate.mock.calls[0] as unknown as [
      {
        data: {
          userId: string
          licenseKeyId: string
          productId: string
          featureKey: string
          count: number
          kind: string
          refundsRecordId: string
        }
      },
    ]
    expect(urCall[0].data).toEqual({
      userId: "usr_test1",
      licenseKeyId: "lk_test1",
      productId: "prod_pro",
      featureKey: "energy_yield",
      count: -1,
      kind: "refund",
      refundsRecordId: "ur_x",
    })
  })

  it("entitlement decrement uses { decrement: 1 } and filters to active matching product", async () => {
    mockQueryRaw.mockImplementation(async () => [
      { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
    ])
    mockUsageRecordFindFirst.mockImplementation(async () => ({
      id: "ur_x",
      productId: "prod_basic",
      userId: "usr_test1",
      licenseKeyId: "lk_test1",
      featureKey: "plant_layout",
    }))
    mockRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      projectId: "prj_x",
      name: "Run X",
      params: {},
      inputsSnapshot: {},
      billedFeatureKey: "plant_layout",
      usageRecordId: "ur_x",
      createdAt: new Date(),
      deletedAt: null,
      status: "CANCELLED",
      cancelledAt: new Date(),
      failedAt: null,
      failureReason: null,
    }))

    await cancel("prj_x", "run_x")
    const entCall = mockEntitlementUpdateMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ]
    expect(entCall[0].where).toEqual({
      userId: "usr_test1",
      productId: "prod_basic",
      deactivatedAt: null,
      usedCalculations: { gt: 0 },
    })
    expect(entCall[0].data).toEqual({
      usedCalculations: { decrement: 1 },
    })
  })
})
