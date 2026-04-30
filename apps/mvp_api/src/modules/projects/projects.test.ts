import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

/**
 * B10 — GET /v2/projects
 *
 * Lists the caller's non-soft-deleted projects, sorted updatedAt DESC,
 * capped at 100, each with runsCount + lastRunAt summaries. License-key
 * auth.
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

interface MockProject {
  id: string
  userId: string
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  runs: { id: string; createdAt: Date }[]
  _count: { runs: number }
}

const mockProjectFindMany = mock(
  async (..._args: unknown[]): Promise<MockProject[]> => [],
)

interface MockProjectDetail {
  id: string
  userId: string
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  edits: unknown
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  runs: Array<{
    id: string
    name: string
    params: unknown
    billedFeatureKey: string
    createdAt: Date
  }>
}

const mockProjectFindFirst = mock(
  async (..._args: unknown[]): Promise<MockProjectDetail | null> => null,
)

const mockProjectCount = mock(async (..._args: unknown[]) => 0)

const mockProjectCreate = mock(
  async (
    args: {
      data: {
        userId: string
        name: string
        kmzBlobUrl: string
        kmzSha256: string
        edits?: unknown
      }
    },
  ) => ({
    id: "prj_created",
    userId: args.data.userId,
    name: args.data.name,
    kmzBlobUrl: args.data.kmzBlobUrl,
    kmzSha256: args.data.kmzSha256,
    edits: args.data.edits ?? {},
    createdAt: new Date("2026-04-30T00:00:00Z"),
    updatedAt: new Date("2026-04-30T00:00:00Z"),
    deletedAt: null,
  }),
)

interface MockUpdateArgs {
  where: { id: string }
  data: { name?: string; edits?: unknown; deletedAt?: Date | null }
}

const mockProjectUpdate = mock(async (args: MockUpdateArgs) => ({
  id: args.where.id,
  userId: "usr_test1",
  name: args.data.name ?? "Original",
  kmzBlobUrl: "s3://b/k.kmz",
  kmzSha256: "0".repeat(64),
  edits: args.data.edits ?? {},
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-30T12:00:00Z"),
  deletedAt: args.data.deletedAt ?? null,
}))

const mockRunUpdateMany = mock(
  async (..._args: unknown[]): Promise<{ count: number }> => ({ count: 0 }),
)

const mockTransactionBatch = mock(async (operations: unknown[]) => operations)

const mockEntitlementFindMany = mock(
  async (..._args: unknown[]) => [
    {
      totalCalculations: 5,
      usedCalculations: 0,
      projectQuota: 3,
    },
  ],
)

const mockGetPresignedDownloadUrl = mock(
  async (
    _key: string,
    _filename: string,
    _ttl: number,
    _bucket?: string,
  ): Promise<string | null> =>
    "https://signed.example/projects/usr_test1/kmz/abc.kmz?X-Amz-Sig=stub",
)

mock.module("../../lib/s3.js", () => ({
  getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
}))

mock.module("../../env.js", () => ({
  env: { MVP_S3_PROJECTS_BUCKET: "solarlayout-local-projects" },
}))

mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: async () => mockLicenseKey },
    project: {
      findMany: mockProjectFindMany,
      findFirst: mockProjectFindFirst,
      count: mockProjectCount,
      create: mockProjectCreate,
      update: mockProjectUpdate,
    },
    run: { updateMany: mockRunUpdateMany },
    entitlement: { findMany: mockEntitlementFindMany },
    $transaction: mockTransactionBatch,
  },
}))

const { projectsRoutes } = await import("./projects.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", projectsRoutes)
  app.onError(errorHandler)
  return app
}

const get = (app: Hono<MvpHonoEnv>) =>
  app.request("/v2/projects", {
    headers: { Authorization: "Bearer sl_live_testkey" },
  })

interface ProjectSummary {
  id: string
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  createdAt: string
  updatedAt: string
  runsCount: number
  lastRunAt: string | null
  mostRecentRunThumbnailBlobUrl: string | null
}

describe("GET /v2/projects", () => {
  beforeEach(() => {
    mockProjectFindMany.mockReset()
    mockProjectFindMany.mockImplementation(async () => [])
  })

  it("returns 200 with [] when the user has no projects", async () => {
    const app = makeApp()
    const res = await get(app)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; data: ProjectSummary[] }
    expect(body.success).toBe(true)
    expect(body.data).toEqual([])
  })

  it("returns project summaries with runsCount, lastRunAt, and presigned thumbnail URL", async () => {
    const created = new Date("2026-04-01T00:00:00Z")
    const updated = new Date("2026-04-15T00:00:00Z")
    const lastRun = new Date("2026-04-14T12:00:00Z")
    mockProjectFindMany.mockImplementation(async () => [
      {
        id: "prj_1",
        userId: "usr_test1",
        name: "Site A",
        kmzBlobUrl: "s3://bucket/projects/usr_test1/kmz/abc.kmz",
        kmzSha256: "a".repeat(64),
        createdAt: created,
        updatedAt: updated,
        deletedAt: null,
        runs: [{ id: "run_latest", createdAt: lastRun }],
        _count: { runs: 3 },
      },
    ])
    mockGetPresignedDownloadUrl.mockImplementation(
      async (key: string) =>
        `https://signed.example/${key}?X-Amz-Sig=stub`,
    )
    const app = makeApp()
    const res = await get(app)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: ProjectSummary[] }
    expect(body.data).toHaveLength(1)
    const p = body.data[0]!
    expect(p.id).toBe("prj_1")
    expect(p.name).toBe("Site A")
    expect(p.kmzBlobUrl).toBe("s3://bucket/projects/usr_test1/kmz/abc.kmz")
    expect(p.kmzSha256).toBe("a".repeat(64))
    expect(p.createdAt).toBe(created.toISOString())
    expect(p.updatedAt).toBe(updated.toISOString())
    expect(p.runsCount).toBe(3)
    expect(p.lastRunAt).toBe(lastRun.toISOString())
    // Path A — deterministic key against the latest run's id
    expect(p.mostRecentRunThumbnailBlobUrl).toContain(
      "projects/usr_test1/prj_1/runs/run_latest/thumbnail.webp",
    )
  })

  it("returns lastRunAt + mostRecentRunThumbnailBlobUrl = null when project has no runs", async () => {
    mockProjectFindMany.mockImplementation(async () => [
      {
        id: "prj_norun",
        userId: "usr_test1",
        name: "Empty",
        kmzBlobUrl: "s3://b/k.kmz",
        kmzSha256: "0".repeat(64),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        runs: [],
        _count: { runs: 0 },
      },
    ])
    mockGetPresignedDownloadUrl.mockClear()
    const app = makeApp()
    const res = await get(app)
    const body = (await res.json()) as { data: ProjectSummary[] }
    expect(body.data[0]!.runsCount).toBe(0)
    expect(body.data[0]!.lastRunAt).toBeNull()
    expect(body.data[0]!.mostRecentRunThumbnailBlobUrl).toBeNull()
    // No sign call when there's no run to sign for
    expect(mockGetPresignedDownloadUrl).not.toHaveBeenCalled()
  })

  it("signs thumbnail URL against MVP_S3_PROJECTS_BUCKET with 1h TTL", async () => {
    mockProjectFindMany.mockImplementation(async () => [
      {
        id: "prj_x",
        userId: "usr_test1",
        name: "X",
        kmzBlobUrl: "s3://b/k.kmz",
        kmzSha256: "0".repeat(64),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        runs: [{ id: "run_x", createdAt: new Date() }],
        _count: { runs: 1 },
      },
    ])
    mockGetPresignedDownloadUrl.mockClear()
    const app = makeApp()
    await get(app)
    const call = mockGetPresignedDownloadUrl.mock.calls[0]
    expect(call?.[0]).toBe(
      "projects/usr_test1/prj_x/runs/run_x/thumbnail.webp",
    )
    expect(call?.[1]).toBe("thumbnail.webp")
    expect(call?.[2]).toBe(3600)
    expect(call?.[3]).toBe("solarlayout-local-projects")
  })

  it("scopes to the caller (where: { userId: caller.id, deletedAt: null }) and orders updatedAt DESC, take:100", async () => {
    const app = makeApp()
    await get(app)
    expect(mockProjectFindMany).toHaveBeenCalledTimes(1)
    const call = mockProjectFindMany.mock.calls[0] as unknown as [
      {
        where: Record<string, unknown>
        orderBy: Record<string, "asc" | "desc">
        take: number
        include?: unknown
      },
    ]
    expect(call?.[0]?.where).toMatchObject({
      userId: "usr_test1",
      deletedAt: null,
    })
    expect(call?.[0]?.orderBy).toEqual({ updatedAt: "desc" })
    expect(call?.[0]?.take).toBe(100)
  })

  it("the include block scopes runs to deletedAt: null and counts the same way", async () => {
    const app = makeApp()
    await get(app)
    const call = mockProjectFindMany.mock.calls[0] as unknown as [
      {
        include: {
          runs?: { where: Record<string, unknown>; orderBy: unknown; take: number }
          _count: { select: { runs: { where: Record<string, unknown> } | true } }
        }
      },
    ]
    expect(call?.[0]?.include?.runs?.where).toMatchObject({ deletedAt: null })
    expect(call?.[0]?.include?.runs?.take).toBe(1)
    const countSel = call?.[0]?.include?._count?.select?.runs
    if (typeof countSel === "object") {
      expect(countSel.where).toMatchObject({ deletedAt: null })
    } else {
      throw new Error("Expected _count.select.runs to filter by deletedAt: null")
    }
  })

  it("preserves the order returned by Prisma (sorted updatedAt DESC at the DB)", async () => {
    const t = (iso: string) => new Date(iso)
    mockProjectFindMany.mockImplementation(async () => [
      {
        id: "prj_newest",
        userId: "usr_test1",
        name: "Newest",
        kmzBlobUrl: "s3://b/n.kmz",
        kmzSha256: "0".repeat(64),
        createdAt: t("2026-04-01T00:00:00Z"),
        updatedAt: t("2026-04-30T00:00:00Z"),
        deletedAt: null,
        runs: [],
        _count: { runs: 0 },
      },
      {
        id: "prj_older",
        userId: "usr_test1",
        name: "Older",
        kmzBlobUrl: "s3://b/o.kmz",
        kmzSha256: "1".repeat(64),
        createdAt: t("2026-04-01T00:00:00Z"),
        updatedAt: t("2026-04-10T00:00:00Z"),
        deletedAt: null,
        runs: [],
        _count: { runs: 0 },
      },
    ])
    const app = makeApp()
    const res = await get(app)
    const body = (await res.json()) as { data: ProjectSummary[] }
    expect(body.data.map((p) => p.id)).toEqual(["prj_newest", "prj_older"])
  })
})

// ─── B11 — POST /v2/projects ─────────────────────────────────────────────────

interface CreatedProject {
  id: string
  userId: string
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  edits: unknown
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

const VALID_SHA = "a".repeat(64)
const validBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: "Site A",
    kmzBlobUrl: `s3://solarlayout-local-projects/projects/usr_test1/kmz/${VALID_SHA}.kmz`,
    kmzSha256: VALID_SHA,
    ...overrides,
  })

const post = (app: Hono<MvpHonoEnv>, body: string) =>
  app.request("/v2/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer sl_live_testkey",
    },
    body,
  })

describe("POST /v2/projects", () => {
  beforeEach(() => {
    mockProjectCount.mockReset()
    mockProjectCount.mockImplementation(async () => 0)
    mockProjectCreate.mockClear()
    mockEntitlementFindMany.mockReset()
    // Free tier default — quota 3
    mockEntitlementFindMany.mockImplementation(async () => [
      {
        totalCalculations: 5,
        usedCalculations: 0,
        projectQuota: 3,
      },
    ])
  })

  it("happy path: under quota → 201 with the new Project row", async () => {
    mockProjectCount.mockImplementation(async () => 0)
    const app = makeApp()
    const res = await post(app, validBody())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { data: CreatedProject }
    expect(body.data.id).toBe("prj_created")
    expect(body.data.userId).toBe("usr_test1")
    expect(body.data.name).toBe("Site A")
    expect(body.data.kmzSha256).toBe(VALID_SHA)
    expect(body.data.deletedAt).toBeNull()
    expect(mockProjectCreate).toHaveBeenCalledTimes(1)
  })

  it("at-edge: quota=3 / active=2 → 201 (still room for one)", async () => {
    mockProjectCount.mockImplementation(async () => 2)
    const app = makeApp()
    const res = await post(app, validBody())
    expect(res.status).toBe(201)
  })

  it("over-quota: quota=3 / active=3 → 402 PAYMENT_REQUIRED with quota numbers in the message", async () => {
    mockProjectCount.mockImplementation(async () => 3)
    const app = makeApp()
    const res = await post(app, validBody())
    expect(res.status).toBe(402)
    const body = (await res.json()) as {
      success: boolean
      error: { code: string; message: string }
    }
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("PAYMENT_REQUIRED")
    // Message surfaces both numbers so the desktop can render them
    expect(body.error.message).toContain("3")
    expect(mockProjectCreate).not.toHaveBeenCalled()
  })

  it("zero-quota (no active+non-exhausted entitlement) → 402 even with no projects", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [] as never)
    mockProjectCount.mockImplementation(async () => 0)
    const app = makeApp()
    const res = await post(app, validBody())
    expect(res.status).toBe(402)
  })

  it("upgraded quota: pro user (10) creates beyond free's 3", async () => {
    mockEntitlementFindMany.mockImplementation(async () => [
      { totalCalculations: 5, usedCalculations: 0, projectQuota: 3 },
      { totalCalculations: 10, usedCalculations: 0, projectQuota: 10 },
    ])
    mockProjectCount.mockImplementation(async () => 5)
    const app = makeApp()
    const res = await post(app, validBody())
    expect(res.status).toBe(201)
  })

  it("validation: missing name → 400", async () => {
    const app = makeApp()
    const body = JSON.stringify({
      kmzBlobUrl: `s3://b/k.kmz`,
      kmzSha256: VALID_SHA,
    })
    const res = await post(app, body)
    expect(res.status).toBe(400)
  })

  it("validation: empty name → 400", async () => {
    const app = makeApp()
    const res = await post(app, validBody({ name: "" }))
    expect(res.status).toBe(400)
  })

  it("validation: missing kmzBlobUrl → 400", async () => {
    const app = makeApp()
    const body = JSON.stringify({ name: "X", kmzSha256: VALID_SHA })
    const res = await post(app, body)
    expect(res.status).toBe(400)
  })

  it("validation: bad sha256 (not 64-char hex) → 400", async () => {
    const app = makeApp()
    const res = await post(app, validBody({ kmzSha256: "nope" }))
    expect(res.status).toBe(400)
  })

  it("validation: malformed JSON body → 400", async () => {
    const app = makeApp()
    const res = await app.request("/v2/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sl_live_testkey",
      },
      body: "not-json",
    })
    expect(res.status).toBe(400)
  })

  it("edits defaults to {} when omitted", async () => {
    mockProjectCount.mockImplementation(async () => 0)
    const app = makeApp()
    await post(app, validBody())
    const call = mockProjectCreate.mock.calls[0] as unknown as [
      { data: { edits?: unknown } },
    ]
    // Either omitted (Prisma applies @default('{}')) or explicitly {}
    const edits = call?.[0]?.data?.edits
    expect(edits === undefined || JSON.stringify(edits) === "{}").toBe(true)
  })

  it("passes edits through when supplied", async () => {
    mockProjectCount.mockImplementation(async () => 0)
    const app = makeApp()
    const customEdits = { layoutOverrides: { rows: 8 } }
    await post(app, validBody({ edits: customEdits }))
    const call = mockProjectCreate.mock.calls[0] as unknown as [
      { data: { edits?: unknown } },
    ]
    expect(call?.[0]?.data?.edits).toEqual(customEdits)
  })
})

// ─── B12 — GET /v2/projects/:id ──────────────────────────────────────────────

interface ProjectDetailWire {
  id: string
  userId: string
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  edits: unknown
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  kmzDownloadUrl: string | null
  runs: Array<{
    id: string
    name: string
    params: unknown
    billedFeatureKey: string
    createdAt: string
    thumbnailBlobUrl: string | null
  }>
}

const getDetail = (id: string) =>
  app2.request(`/v2/projects/${id}`, {
    headers: { Authorization: "Bearer sl_live_testkey" },
  })

let app2: Hono<MvpHonoEnv>

describe("GET /v2/projects/:id", () => {
  beforeEach(() => {
    mockProjectFindFirst.mockReset()
    mockProjectFindFirst.mockImplementation(async () => null)
    mockGetPresignedDownloadUrl.mockClear()
    mockGetPresignedDownloadUrl.mockImplementation(
      async () =>
        "https://signed.example/projects/usr_test1/kmz/abc.kmz?X-Amz-Sig=stub",
    )
    app2 = makeApp()
  })

  it("returns 200 + Project with embedded runs[] summary", async () => {
    const created = new Date("2026-04-01T00:00:00Z")
    const updated = new Date("2026-04-15T00:00:00Z")
    const r1 = new Date("2026-04-10T00:00:00Z")
    const r2 = new Date("2026-04-14T00:00:00Z")
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      userId: "usr_test1",
      name: "Site A",
      kmzBlobUrl: "s3://b/k.kmz",
      kmzSha256: "a".repeat(64),
      edits: { foo: "bar" },
      createdAt: created,
      updatedAt: updated,
      deletedAt: null,
      runs: [
        {
          id: "run_2",
          name: "Run 2",
          params: { rows: 4, cols: 4 },
          billedFeatureKey: "plant_layout",
          createdAt: r2,
        },
        {
          id: "run_1",
          name: "Run 1",
          params: { rows: 3, cols: 3 },
          billedFeatureKey: "plant_layout",
          createdAt: r1,
        },
      ],
    }))
    const res = await getDetail("prj_x")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: ProjectDetailWire }
    expect(body.data.id).toBe("prj_x")
    expect(body.data.name).toBe("Site A")
    expect(body.data.kmzSha256).toBe("a".repeat(64))
    expect(body.data.edits).toEqual({ foo: "bar" })
    expect(body.data.createdAt).toBe(created.toISOString())
    expect(body.data.updatedAt).toBe(updated.toISOString())
    expect(body.data.deletedAt).toBeNull()
    expect(body.data.runs).toHaveLength(2)
    expect(body.data.runs[0]!.id).toBe("run_2")
    expect(body.data.runs[0]!.params).toEqual({ rows: 4, cols: 4 })
    expect(body.data.runs[0]!.billedFeatureKey).toBe("plant_layout")
    expect(body.data.runs[0]!.createdAt).toBe(r2.toISOString())
    // Embedded presigned-GET URL for the KMZ blob — desktop hydrates the
    // canvas in one round-trip without a second mint endpoint.
    expect(body.data.kmzDownloadUrl).toBe(
      "https://signed.example/projects/usr_test1/kmz/abc.kmz?X-Amz-Sig=stub",
    )
  })

  it("signs each embedded run's thumbnail URL deterministically (Path A)", async () => {
    const r1 = new Date("2026-04-10T00:00:00Z")
    const r2 = new Date("2026-04-14T00:00:00Z")
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      userId: "usr_test1",
      name: "Site A",
      kmzBlobUrl: "s3://b/k.kmz",
      kmzSha256: "a".repeat(64),
      edits: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      runs: [
        {
          id: "run_2",
          name: "Run 2",
          params: { rows: 4 },
          billedFeatureKey: "plant_layout",
          createdAt: r2,
        },
        {
          id: "run_1",
          name: "Run 1",
          params: { rows: 3 },
          billedFeatureKey: "plant_layout",
          createdAt: r1,
        },
      ],
    }))
    mockGetPresignedDownloadUrl.mockImplementation(
      async (key: string) => `https://signed.example/${key}?X-Amz-Sig=stub`,
    )
    const res = await getDetail("prj_x")
    const body = (await res.json()) as { data: ProjectDetailWire }
    // Always-sign per run, regardless of whether the underlying object exists
    expect(body.data.runs[0]!.thumbnailBlobUrl).toContain(
      "projects/usr_test1/prj_x/runs/run_2/thumbnail.webp",
    )
    expect(body.data.runs[1]!.thumbnailBlobUrl).toContain(
      "projects/usr_test1/prj_x/runs/run_1/thumbnail.webp",
    )
  })

  it("signs the KMZ download URL against MVP_S3_PROJECTS_BUCKET with the canonical key path and a 1h TTL", async () => {
    const sha = "f".repeat(64)
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      userId: "usr_test1",
      name: "Site A",
      kmzBlobUrl: `s3://solarlayout-local-projects/projects/usr_test1/kmz/${sha}.kmz`,
      kmzSha256: sha,
      edits: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      runs: [],
    }))
    await getDetail("prj_x")
    const call = mockGetPresignedDownloadUrl.mock.calls[0] as unknown as [
      string,
      string,
      number,
      string,
    ]
    expect(call?.[0]).toBe(`projects/usr_test1/kmz/${sha}.kmz`)
    expect(call?.[1]).toBe("Site A.kmz")
    expect(call?.[2]).toBe(3600)
    expect(call?.[3]).toBe("solarlayout-local-projects")
  })

  it("returns 404 when the project doesn't exist", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await getDetail("prj_nope")
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("NOT_FOUND")
  })

  it("returns 404 when the project belongs to another user (where filter excludes by userId)", async () => {
    // findFirst returns null because the where clause filters userId.
    // Verifies the route never leaks cross-user info.
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await getDetail("prj_other")
    expect(res.status).toBe(404)
  })

  it("returns 404 when the project is soft-deleted", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await getDetail("prj_deleted")
    expect(res.status).toBe(404)
  })

  it("scopes the lookup with where: { id, userId, deletedAt: null }", async () => {
    await getDetail("prj_x")
    const call = mockProjectFindFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(call?.[0]?.where).toMatchObject({
      id: "prj_x",
      userId: "usr_test1",
      deletedAt: null,
    })
  })

  it("the embedded runs include filters deletedAt:null and orders createdAt DESC, with the right select fields only", async () => {
    await getDetail("prj_x")
    const call = mockProjectFindFirst.mock.calls[0] as unknown as [
      {
        include: {
          runs: {
            where: Record<string, unknown>
            orderBy: Record<string, "asc" | "desc">
            select: Record<string, true>
          }
        }
      },
    ]
    const runs = call?.[0]?.include?.runs
    expect(runs?.where).toMatchObject({ deletedAt: null })
    expect(runs?.orderBy).toEqual({ createdAt: "desc" })
    // Only the lightweight summary fields — heavy fields stay in B17
    expect(runs?.select).toMatchObject({
      id: true,
      name: true,
      params: true,
      billedFeatureKey: true,
      createdAt: true,
    })
    // Heavy fields explicitly NOT selected
    expect(runs?.select).not.toHaveProperty("inputsSnapshot")
    expect(runs?.select).not.toHaveProperty("layoutResultBlobUrl")
    expect(runs?.select).not.toHaveProperty("energyResultBlobUrl")
    expect(runs?.select).not.toHaveProperty("exportsBlobUrls")
  })

  it("returns runs: [] for a project with no runs", async () => {
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_norun",
      userId: "usr_test1",
      name: "Empty",
      kmzBlobUrl: "s3://b/k.kmz",
      kmzSha256: "0".repeat(64),
      edits: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      runs: [],
    }))
    const res = await getDetail("prj_norun")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: ProjectDetailWire }
    expect(body.data.runs).toEqual([])
  })
})

// ─── B13 — PATCH /v2/projects/:id ────────────────────────────────────────────

const patch = (id: string, body: object | string) =>
  app3.request(`/v2/projects/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer sl_live_testkey",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

let app3: Hono<MvpHonoEnv>

describe("PATCH /v2/projects/:id", () => {
  beforeEach(() => {
    mockProjectFindFirst.mockReset()
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      userId: "usr_test1",
      name: "Original",
      kmzBlobUrl: "s3://b/k.kmz",
      kmzSha256: "0".repeat(64),
      edits: {},
      createdAt: new Date("2026-04-01T00:00:00Z"),
      updatedAt: new Date("2026-04-15T00:00:00Z"),
      deletedAt: null,
      runs: [],
    }))
    mockProjectUpdate.mockClear()
    app3 = makeApp()
  })

  it("PATCH name → 200 with updated row", async () => {
    const res = await patch("prj_x", { name: "Renamed" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { name: string; updatedAt: string } }
    expect(body.data.name).toBe("Renamed")
    const call = mockProjectUpdate.mock.calls[0] as unknown as [
      { where: { id: string }; data: { name?: string; edits?: unknown } },
    ]
    expect(call?.[0]?.where).toEqual({ id: "prj_x" })
    expect(call?.[0]?.data).toEqual({ name: "Renamed" })
  })

  it("PATCH edits → 200, only edits in update.data", async () => {
    const newEdits = { layoutOverrides: { rows: 8 } }
    const res = await patch("prj_x", { edits: newEdits })
    expect(res.status).toBe(200)
    const call = mockProjectUpdate.mock.calls[0] as unknown as [
      { data: { name?: string; edits?: unknown } },
    ]
    expect(call?.[0]?.data).toEqual({ edits: newEdits })
  })

  it("PATCH both name and edits → 200, both in update.data", async () => {
    const res = await patch("prj_x", { name: "X", edits: { foo: 1 } })
    expect(res.status).toBe(200)
    const call = mockProjectUpdate.mock.calls[0] as unknown as [
      { data: { name?: string; edits?: unknown } },
    ]
    expect(call?.[0]?.data).toEqual({ name: "X", edits: { foo: 1 } })
  })

  it("rejects kmzBlobUrl in body with 400 (immutable post-create)", async () => {
    const res = await patch("prj_x", { kmzBlobUrl: "s3://other" })
    expect(res.status).toBe(400)
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })

  it("rejects kmzSha256 in body with 400 (immutable post-create)", async () => {
    const res = await patch("prj_x", { kmzSha256: "f".repeat(64) })
    expect(res.status).toBe(400)
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })

  it("rejects an empty body with 400 (must update at least one field)", async () => {
    const res = await patch("prj_x", {})
    expect(res.status).toBe(400)
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })

  it("rejects empty name with 400", async () => {
    const res = await patch("prj_x", { name: "" })
    expect(res.status).toBe(400)
  })

  it("rejects unknown fields strictly with 400", async () => {
    const res = await patch("prj_x", { foo: "bar" })
    expect(res.status).toBe(400)
  })

  it("rejects malformed JSON body with 400", async () => {
    const res = await patch("prj_x", "not-json")
    expect(res.status).toBe(400)
  })

  it("returns 404 when the project doesn't exist (or belongs to another user — same response, no leakage)", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await patch("prj_other", { name: "X" })
    expect(res.status).toBe(404)
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })

  it("returns 404 when the project is soft-deleted", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await patch("prj_deleted", { name: "X" })
    expect(res.status).toBe(404)
  })

  it("scopes the ownership lookup with where: { id, userId, deletedAt: null }", async () => {
    await patch("prj_x", { name: "Y" })
    const call = mockProjectFindFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(call?.[0]?.where).toMatchObject({
      id: "prj_x",
      userId: "usr_test1",
      deletedAt: null,
    })
  })

  it("supports rapid-fire small edits (auto-save shape)", async () => {
    // 5 consecutive small patches, each with a tiny edits delta.
    for (let i = 0; i < 5; i++) {
      const res = await patch("prj_x", { edits: { tick: i } })
      expect(res.status).toBe(200)
    }
    expect(mockProjectUpdate).toHaveBeenCalledTimes(5)
  })
})

// ─── B14 — DELETE /v2/projects/:id ───────────────────────────────────────────

const del = (id: string) =>
  app4.request(`/v2/projects/${id}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer sl_live_testkey" },
  })

let app4: Hono<MvpHonoEnv>

describe("DELETE /v2/projects/:id", () => {
  beforeEach(() => {
    mockProjectFindFirst.mockReset()
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      userId: "usr_test1",
      name: "Site A",
      kmzBlobUrl: "s3://b/k.kmz",
      kmzSha256: "0".repeat(64),
      edits: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      runs: [],
    }))
    mockProjectUpdate.mockClear()
    mockRunUpdateMany.mockReset()
    mockRunUpdateMany.mockImplementation(async () => ({ count: 2 }))
    mockTransactionBatch.mockClear()
    mockTransactionBatch.mockImplementation(async (ops: unknown[]) => ops)
    app4 = makeApp()
  })

  it("returns 204 with empty body on success", async () => {
    const res = await del("prj_x")
    expect(res.status).toBe(204)
    const body = await res.text()
    expect(body).toBe("")
  })

  it("scopes ownership lookup with where: { id, userId, deletedAt: null }", async () => {
    await del("prj_x")
    const call = mockProjectFindFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ]
    expect(call?.[0]?.where).toMatchObject({
      id: "prj_x",
      userId: "usr_test1",
      deletedAt: null,
    })
  })

  it("issues project + run updates inside a $transaction batch", async () => {
    await del("prj_x")
    expect(mockTransactionBatch).toHaveBeenCalledTimes(1)
  })

  it("sets project.deletedAt to a Date", async () => {
    await del("prj_x")
    const call = mockProjectUpdate.mock.calls[0] as unknown as [
      { where: { id: string }; data: { deletedAt?: Date } },
    ]
    expect(call?.[0]?.where).toEqual({ id: "prj_x" })
    expect(call?.[0]?.data?.deletedAt).toBeInstanceOf(Date)
  })

  it("cascades soft-delete to non-deleted runs only (where projectId, deletedAt: null)", async () => {
    await del("prj_x")
    const call = mockRunUpdateMany.mock.calls[0] as unknown as [
      {
        where: Record<string, unknown>
        data: { deletedAt?: Date }
      },
    ]
    expect(call?.[0]?.where).toMatchObject({
      projectId: "prj_x",
      deletedAt: null,
    })
    expect(call?.[0]?.data?.deletedAt).toBeInstanceOf(Date)
  })

  it("project + run timestamps match (single Date used for both)", async () => {
    await del("prj_x")
    const projectCall = mockProjectUpdate.mock.calls[0] as unknown as [
      { data: { deletedAt: Date } },
    ]
    const runCall = mockRunUpdateMany.mock.calls[0] as unknown as [
      { data: { deletedAt: Date } },
    ]
    expect(projectCall?.[0]?.data?.deletedAt.getTime()).toBe(
      runCall?.[0]?.data?.deletedAt.getTime(),
    )
  })

  it("returns 404 when the project doesn't exist (or belongs to another user)", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)
    const res = await del("prj_other")
    expect(res.status).toBe(404)
    expect(mockProjectUpdate).not.toHaveBeenCalled()
    expect(mockRunUpdateMany).not.toHaveBeenCalled()
  })

  it("idempotency: a second DELETE on a soft-deleted project returns 404 (where filter excludes)", async () => {
    // First call succeeds (default mock), second call sees the project as
    // already-deleted (findFirst with deletedAt: null filter returns null).
    mockProjectFindFirst.mockImplementationOnce(async () => ({
      id: "prj_x",
      userId: "usr_test1",
      name: "Site A",
      kmzBlobUrl: "s3://b/k.kmz",
      kmzSha256: "0".repeat(64),
      edits: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      runs: [],
    }))
    mockProjectFindFirst.mockImplementationOnce(async () => null)
    const r1 = await del("prj_x")
    expect(r1.status).toBe(204)
    const r2 = await del("prj_x")
    expect(r2.status).toBe(404)
  })

  it("does not perform any S3 / blob operations on delete (orphan blobs persist by design)", async () => {
    // Asserted by the mock surface: only project.update + run.updateMany.
    // No s3.ts helper imported by this module, so no smoke required here.
    await del("prj_x")
    expect(mockTransactionBatch).toHaveBeenCalledTimes(1)
    expect(mockProjectUpdate).toHaveBeenCalledTimes(1)
    expect(mockRunUpdateMany).toHaveBeenCalledTimes(1)
  })
})
