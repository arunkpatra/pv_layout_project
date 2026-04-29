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
  runs: { createdAt: Date }[]
  _count: { runs: number }
}

const mockProjectFindMany = mock(
  async (..._args: unknown[]): Promise<MockProject[]> => [],
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

const mockEntitlementFindMany = mock(
  async (..._args: unknown[]) => [
    {
      totalCalculations: 5,
      usedCalculations: 0,
      product: { projectQuota: 3 },
    },
  ],
)

mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: async () => mockLicenseKey },
    project: {
      findMany: mockProjectFindMany,
      count: mockProjectCount,
      create: mockProjectCreate,
    },
    entitlement: { findMany: mockEntitlementFindMany },
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

  it("returns project summaries with runsCount and lastRunAt", async () => {
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
        runs: [{ createdAt: lastRun }],
        _count: { runs: 3 },
      },
    ])
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
  })

  it("returns lastRunAt = null when project has no runs", async () => {
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
    const app = makeApp()
    const res = await get(app)
    const body = (await res.json()) as { data: ProjectSummary[] }
    expect(body.data[0]!.runsCount).toBe(0)
    expect(body.data[0]!.lastRunAt).toBeNull()
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
        product: { projectQuota: 3 },
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
      { totalCalculations: 5, usedCalculations: 0, product: { projectQuota: 3 } },
      { totalCalculations: 10, usedCalculations: 0, product: { projectQuota: 10 } },
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
