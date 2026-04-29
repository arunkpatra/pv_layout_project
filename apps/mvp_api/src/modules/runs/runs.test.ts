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
  async (..._args: unknown[]): Promise<{ id: string } | null> => null,
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

mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: async () => mockLicenseKey },
    project: { findFirst: mockProjectFindFirst },
    run: { findMany: mockRunFindMany },
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
