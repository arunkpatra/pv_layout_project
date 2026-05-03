import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

/**
 * C4 — POST /v2/projects/:id/parse-kmz
 *
 * Orchestrator route between desktop create-project flow and the
 * parse-kmz Lambda. Tests cover:
 *   - Happy path (Lambda → ok=true → persist + V2 envelope echo).
 *   - All failure paths collapse to the same 500 INTERNAL_SERVER_ERROR
 *     + generic message + soft-delete (per spec C4 brainstorm Q3):
 *       * Lambda returns ok=false (any code).
 *       * Lambda invocation throws (network / cloud invoke crash).
 *       * Project.kmzBlobUrl is malformed (DB corruption).
 *   - 404 paths (no cleanup): project doesn't exist; project has empty
 *     kmzBlobUrl.
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

interface MockProjectRow {
  id: string
  kmzBlobUrl: string
}

const mockProjectFindFirst = mock(
  async (..._args: unknown[]): Promise<MockProjectRow | null> => null,
)

interface UpdateArgs {
  where: { id: string }
  data: {
    parsedKmz?: unknown
    boundaryGeojson?: unknown
    deletedAt?: Date | null
  }
}

const mockProjectUpdate = mock(async (args: UpdateArgs) => ({
  id: args.where.id,
  ...args.data,
}))

const mockInvoke = mock(
  async (_purpose: string, _payload: object): Promise<unknown> => ({
    ok: true,
    parsed: {
      boundaries: [],
      centroid_lat: 0,
      centroid_lon: 0,
    },
  }),
)

mock.module("../../lib/lambda-invoker.js", () => ({
  invoke: mockInvoke,
}))

mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: async () => mockLicenseKey },
    project: {
      findFirst: mockProjectFindFirst,
      update: mockProjectUpdate,
    },
  },
}))

mock.module("../../env.js", () => ({
  env: { MVP_S3_PROJECTS_BUCKET: "solarlayout-local-projects" },
}))

const { projectsRoutes } = await import("./projects.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", projectsRoutes)
  app.onError(errorHandler)
  return app
}

const post = (id: string) =>
  makeApp().request(`/v2/projects/${id}/parse-kmz`, {
    method: "POST",
    headers: { Authorization: "Bearer sl_live_testkey" },
  })

const VALID_S3_URL =
  "s3://solarlayout-local-projects/projects/usr_test1/prj_x/kmz/abc.kmz"

const PARSED_FIXTURE = {
  boundaries: [
    {
      name: "Site A",
      coords: [
        [77.5, 12.9],
        [77.6, 12.9],
        [77.6, 13.0],
        [77.5, 13.0],
        [77.5, 12.9],
      ],
      obstacles: [],
      water_obstacles: [],
      line_obstructions: [],
    },
  ],
  centroid_lat: 12.95,
  centroid_lon: 77.55,
}

interface SuccessBody {
  success: true
  data: typeof PARSED_FIXTURE
}

interface ErrorBody {
  success: false
  error: { code: string; message: string }
}

describe("POST /v2/projects/:id/parse-kmz", () => {
  beforeEach(() => {
    mockProjectFindFirst.mockReset()
    mockProjectUpdate.mockClear()
    mockInvoke.mockReset()
  })

  it("happy path: Lambda ok=true → 200, V2 envelope wraps snake_case ParsedKmz, persists parsedKmz + boundaryGeojson", async () => {
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      kmzBlobUrl: VALID_S3_URL,
    }))
    mockInvoke.mockImplementation(async (_purpose, _payload) => ({
      ok: true,
      parsed: PARSED_FIXTURE,
    }))

    const res = await post("prj_x")
    expect(res.status).toBe(200)
    const body = (await res.json()) as SuccessBody
    expect(body.success).toBe(true)
    // Snake_case preserved end-to-end (no camelCase conversion).
    expect(body.data.centroid_lat).toBe(12.95)
    expect(body.data.centroid_lon).toBe(77.55)
    expect(body.data.boundaries).toHaveLength(1)
    expect(body.data.boundaries[0]!.water_obstacles).toEqual([])
    expect(body.data.boundaries[0]!.line_obstructions).toEqual([])

    // Lambda invoked with parsed {bucket, key} from VALID_S3_URL.
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    const invokeCall = mockInvoke.mock.calls[0]!
    expect(invokeCall[0]).toBe("parse-kmz")
    expect(invokeCall[1]).toEqual({
      bucket: "solarlayout-local-projects",
      key: "projects/usr_test1/prj_x/kmz/abc.kmz",
    })

    // Persists BOTH parsedKmz (verbatim) + derived boundaryGeojson.
    expect(mockProjectUpdate).toHaveBeenCalledTimes(1)
    const updateCall = mockProjectUpdate.mock.calls[0]!
    const updateArgs = updateCall[0] as UpdateArgs
    expect(updateArgs.where.id).toBe("prj_x")
    expect(updateArgs.data.parsedKmz).toEqual(PARSED_FIXTURE)
    expect(updateArgs.data.boundaryGeojson).toEqual({
      type: "Polygon",
      coordinates: [PARSED_FIXTURE.boundaries[0]!.coords],
    })
    // No deletedAt set on success.
    expect(updateArgs.data.deletedAt).toBeUndefined()
  })

  it("happy path with multiple boundaries → boundaryGeojson is MultiPolygon", async () => {
    const multi = {
      boundaries: [
        {
          name: "A",
          coords: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
          obstacles: [],
          water_obstacles: [],
          line_obstructions: [],
        },
        {
          name: "B",
          coords: [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 2],
          ],
          obstacles: [],
          water_obstacles: [],
          line_obstructions: [],
        },
      ],
      centroid_lat: 1.5,
      centroid_lon: 1.5,
    }
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      kmzBlobUrl: VALID_S3_URL,
    }))
    mockInvoke.mockImplementation(async () => ({ ok: true, parsed: multi }))

    const res = await post("prj_x")
    expect(res.status).toBe(200)
    const updateArgs = mockProjectUpdate.mock.calls[0]![0] as UpdateArgs
    expect(updateArgs.data.boundaryGeojson).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [multi.boundaries[0]!.coords],
        [multi.boundaries[1]!.coords],
      ],
    })
  })

  it("Lambda returns ok=false → 500 INTERNAL_SERVER_ERROR + generic message + soft-delete", async () => {
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      kmzBlobUrl: VALID_S3_URL,
    }))
    mockInvoke.mockImplementation(async () => ({
      ok: false,
      code: "INVALID_KMZ",
      message: "internal lambda detail leaks here",
      trace: "Traceback (most recent call last)…",
      key: "projects/usr_test1/prj_x/kmz/abc.kmz",
    }))

    const res = await post("prj_x")
    expect(res.status).toBe(500)
    const body = (await res.json()) as ErrorBody
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR")
    // Generic, customer-safe message — never the Lambda's structured
    // code/message/trace.
    expect(body.error.message).toContain("Something went wrong")
    expect(body.error.message).not.toContain("INVALID_KMZ")
    expect(body.error.message).not.toContain("Traceback")
    // Cleanup: project soft-deleted.
    expect(mockProjectUpdate).toHaveBeenCalledTimes(1)
    const updateArgs = mockProjectUpdate.mock.calls[0]![0] as UpdateArgs
    expect(updateArgs.where.id).toBe("prj_x")
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date)
    // Cleanup update doesn't write parsedKmz / boundaryGeojson.
    expect(updateArgs.data.parsedKmz).toBeUndefined()
    expect(updateArgs.data.boundaryGeojson).toBeUndefined()
  })

  it("Lambda invocation throws → 500 INTERNAL_SERVER_ERROR + generic message + soft-delete", async () => {
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      kmzBlobUrl: VALID_S3_URL,
    }))
    mockInvoke.mockImplementation(async () => {
      throw new Error("network down")
    })

    const res = await post("prj_x")
    expect(res.status).toBe(500)
    const body = (await res.json()) as ErrorBody
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR")
    expect(body.error.message).toContain("Something went wrong")
    expect(body.error.message).not.toContain("network down")
    expect(mockProjectUpdate).toHaveBeenCalledTimes(1)
    const updateArgs = mockProjectUpdate.mock.calls[0]![0] as UpdateArgs
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date)
  })

  it("project not found → 404 NOT_FOUND, no Lambda call, no cleanup", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)

    const res = await post("prj_missing")
    expect(res.status).toBe(404)
    const body = (await res.json()) as ErrorBody
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("NOT_FOUND")
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })

  it("project has empty kmzBlobUrl → 404, no Lambda call, no cleanup", async () => {
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      kmzBlobUrl: "",
    }))

    const res = await post("prj_x")
    expect(res.status).toBe(404)
    const body = (await res.json()) as ErrorBody
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("NOT_FOUND")
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })

  it("kmzBlobUrl is malformed (not s3://) → parseS3Url throws → 500 + soft-delete", async () => {
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      kmzBlobUrl: "http://wrong.com/x",
    }))

    const res = await post("prj_x")
    expect(res.status).toBe(500)
    const body = (await res.json()) as ErrorBody
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR")
    expect(body.error.message).toContain("Something went wrong")
    // Lambda was not invoked (parse failed first).
    expect(mockInvoke).not.toHaveBeenCalled()
    // Cleanup still runs.
    expect(mockProjectUpdate).toHaveBeenCalledTimes(1)
    const updateArgs = mockProjectUpdate.mock.calls[0]![0] as UpdateArgs
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date)
  })

  it("Lambda returns ok=true with malformed parsed payload → 500 INTERNAL_SERVER_ERROR + generic message + soft-delete + no leak of Zod internals", async () => {
    mockProjectFindFirst.mockImplementation(async () => ({
      id: "prj_x",
      kmzBlobUrl: VALID_S3_URL,
    }))
    // ok=true but `parsed` doesn't conform to parsedKmzSchema (missing
    // boundaries / centroid_lat / centroid_lon — entirely wrong shape).
    mockInvoke.mockImplementation(async () => ({
      ok: true,
      parsed: { malformed: "shape" },
    }))

    const res = await post("prj_x")
    expect(res.status).toBe(500)
    const body = (await res.json()) as ErrorBody
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR")
    // Generic, customer-safe message — never Zod's internal error surface.
    expect(body.error.message).toContain("Something went wrong")
    expect(body.error.message).not.toContain("ZodError")
    expect(body.error.message).not.toContain("invalid_type")
    expect(body.error.message).not.toContain("malformed")
    expect(body.error.message).not.toContain("boundaries")

    // Cleanup ran exactly like the other failure paths — soft-delete only,
    // no parsedKmz / boundaryGeojson written.
    expect(mockProjectUpdate).toHaveBeenCalledTimes(1)
    const updateArgs = mockProjectUpdate.mock.calls[0]![0] as UpdateArgs
    expect(updateArgs.where.id).toBe("prj_x")
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date)
    expect(updateArgs.data.parsedKmz).toBeUndefined()
    expect(updateArgs.data.boundaryGeojson).toBeUndefined()
  })

  it("scopes findFirst to caller (userId, deletedAt: null)", async () => {
    mockProjectFindFirst.mockImplementation(async () => null)
    await post("prj_x")
    const findCall = mockProjectFindFirst.mock.calls[0]!
    const findArgs = findCall[0] as {
      where: Record<string, unknown>
    }
    expect(findArgs.where).toMatchObject({
      id: "prj_x",
      userId: "usr_test1",
      deletedAt: null,
    })
  })
})
