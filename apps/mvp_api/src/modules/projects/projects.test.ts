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

mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: async () => mockLicenseKey },
    project: { findMany: mockProjectFindMany },
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
