import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

/**
 * B6 — POST /v2/blobs/kmz-upload-url
 *
 * Returns a presigned S3 PUT URL the desktop client can use to upload
 * a KMZ directly. License-key auth (covered by license-key-auth.test.ts —
 * not re-tested here), MIME locked to KMZ, size cap 50 MB, key layout
 * content-addressed by sha256 under the user's prefix.
 */

const FIFTY_MB = 50 * 1024 * 1024

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

const mockOwnedRun = {
  id: "run_test_owned",
  projectId: "prj_test_owned",
  name: "Owned Run",
  deletedAt: null as Date | null,
  project: { userId: mockUser.id },
}

const mockRunFindFirst = mock(
  async (_args: unknown): Promise<typeof mockOwnedRun | null> => mockOwnedRun,
)

mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: async () => mockLicenseKey },
    run: { findFirst: mockRunFindFirst },
  },
}))

const mockGetPresignedUploadUrl = mock(
  async (
    _key: string,
    _contentType: string,
    _expiresIn?: number,
    _contentLength?: number,
  ): Promise<string | null> => "https://s3.example.com/signed-put?sig=abc",
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

const { blobsRoutes } = await import("./blobs.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", blobsRoutes)
  app.onError(errorHandler)
  return app
}

const VALID_SHA256 = "a".repeat(64) // 64-char lowercase hex
const validBody = (overrides: Partial<{ kmzSha256: string; kmzSize: number }> = {}) =>
  JSON.stringify({
    kmzSha256: VALID_SHA256,
    kmzSize: 1024 * 1024,
    ...overrides,
  })

const post = (app: Hono<MvpHonoEnv>, body: string) =>
  app.request("/v2/blobs/kmz-upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer sl_live_testkey",
    },
    body,
  })

describe("POST /v2/blobs/kmz-upload-url", () => {
  beforeEach(() => {
    mockGetPresignedUploadUrl.mockClear()
    mockGetPresignedUploadUrl.mockImplementation(
      async () => "https://s3.example.com/signed-put?sig=abc",
    )
  })

  it("returns 200 with uploadUrl, blobUrl, expiresAt for a valid request", async () => {
    const app = makeApp()
    const res = await post(app, validBody())
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      success: boolean
      data: { uploadUrl: string; blobUrl: string; expiresAt: string }
    }
    expect(json.success).toBe(true)
    expect(json.data.uploadUrl).toBe("https://s3.example.com/signed-put?sig=abc")
    expect(json.data.blobUrl).toBe(
      `s3://solarlayout-test-projects/projects/usr_test1/kmz/${VALID_SHA256}.kmz`,
    )
    const expiresAt = new Date(json.data.expiresAt).getTime()
    const now = Date.now()
    expect(expiresAt - now).toBeGreaterThan(14 * 60 * 1000)
    expect(expiresAt - now).toBeLessThan(16 * 60 * 1000)
  })

  it("calls getPresignedUploadUrl with the right key, MIME, expiry, and content-length", async () => {
    const app = makeApp()
    await post(app, validBody())
    expect(mockGetPresignedUploadUrl).toHaveBeenCalledTimes(1)
    const call = mockGetPresignedUploadUrl.mock.calls[0]
    expect(call?.[0]).toBe(`projects/usr_test1/kmz/${VALID_SHA256}.kmz`)
    expect(call?.[1]).toBe("application/vnd.google-earth.kmz")
    expect(call?.[2]).toBe(900)
    expect(call?.[3]).toBe(1024 * 1024)
  })

  it("returns 400 for non-hex kmzSha256", async () => {
    const app = makeApp()
    const res = await post(
      app,
      validBody({
        kmzSha256:
          "not-hex-not-hex-not-hex-not-hex-not-hex-not-hex-not-hex-not-he",
      }),
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 for sha256 of wrong length", async () => {
    const app = makeApp()
    const res = await post(app, validBody({ kmzSha256: "a".repeat(63) }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for kmzSize > 50 MB", async () => {
    const app = makeApp()
    const res = await post(app, validBody({ kmzSize: FIFTY_MB + 1 }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for kmzSize = 0", async () => {
    const app = makeApp()
    const res = await post(app, validBody({ kmzSize: 0 }))
    expect(res.status).toBe(400)
  })

  it("accepts kmzSize at exactly 50 MB", async () => {
    const app = makeApp()
    const res = await post(app, validBody({ kmzSize: FIFTY_MB }))
    expect(res.status).toBe(200)
  })

  it("returns 503 when the S3 helper returns null (degraded env)", async () => {
    mockGetPresignedUploadUrl.mockImplementationOnce(async () => null)
    const app = makeApp()
    const res = await post(app, validBody())
    expect(res.status).toBe(503)
  })

  it("rejects requests without a JSON body with 400", async () => {
    const app = makeApp()
    const res = await app.request("/v2/blobs/kmz-upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sl_live_testkey",
      },
      body: "not json",
    })
    expect(res.status).toBe(400)
  })
})

// ─── B7 — POST /v2/blobs/run-result-upload-url ───────────────────────────────

const ONE_MB = 1024 * 1024
const TWENTY_FIVE_MB = 25 * ONE_MB
const TEN_MB = 10 * ONE_MB
const HUNDRED_MB = 100 * ONE_MB

interface RunResultBody {
  type: "layout" | "energy" | "dxf" | "pdf" | "kmz" | "thumbnail"
  projectId: string
  runId: string
  size: number
}

const runResultBody = (overrides: Partial<RunResultBody> = {}): string =>
  JSON.stringify({
    type: "layout",
    projectId: "prj_test_owned",
    runId: "run_test_owned",
    size: ONE_MB,
    ...overrides,
  } satisfies RunResultBody)

const postRunResult = (app: Hono<MvpHonoEnv>, body: string) =>
  app.request("/v2/blobs/run-result-upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer sl_live_testkey",
    },
    body,
  })

describe("POST /v2/blobs/run-result-upload-url", () => {
  beforeEach(() => {
    mockGetPresignedUploadUrl.mockClear()
    mockGetPresignedUploadUrl.mockImplementation(
      async () => "https://s3.example.com/signed-put?sig=run",
    )
    mockRunFindFirst.mockClear()
    mockRunFindFirst.mockImplementation(async () => mockOwnedRun)
  })

  it("happy path layout: keys at projects/<u>/<p>/runs/<r>/layout.json with application/json and 25MB cap", async () => {
    const app = makeApp()
    const res = await postRunResult(app, runResultBody({ type: "layout" }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      success: boolean
      data: { uploadUrl: string; blobUrl: string; expiresAt: string }
    }
    expect(json.data.uploadUrl).toBe("https://s3.example.com/signed-put?sig=run")
    expect(json.data.blobUrl).toBe(
      "s3://solarlayout-test-projects/projects/usr_test1/prj_test_owned/runs/run_test_owned/layout.json",
    )
    const call = mockGetPresignedUploadUrl.mock.calls[0]
    expect(call?.[0]).toBe(
      "projects/usr_test1/prj_test_owned/runs/run_test_owned/layout.json",
    )
    expect(call?.[1]).toBe("application/json")
    expect(call?.[3]).toBe(ONE_MB)
  })

  it("happy path energy: keys layout-equivalent for energy.json with 10MB cap", async () => {
    const app = makeApp()
    const res = await postRunResult(app, runResultBody({ type: "energy" }))
    expect(res.status).toBe(200)
    const call = mockGetPresignedUploadUrl.mock.calls[0]
    expect(call?.[0]).toBe(
      "projects/usr_test1/prj_test_owned/runs/run_test_owned/energy.json",
    )
    expect(call?.[1]).toBe("application/json")
  })

  it("happy path dxf: keys under exports/run.dxf with application/dxf and 100MB cap", async () => {
    const app = makeApp()
    const res = await postRunResult(app, runResultBody({ type: "dxf" }))
    expect(res.status).toBe(200)
    const call = mockGetPresignedUploadUrl.mock.calls[0]
    expect(call?.[0]).toBe(
      "projects/usr_test1/prj_test_owned/runs/run_test_owned/exports/run.dxf",
    )
    expect(call?.[1]).toBe("application/dxf")
  })

  it("happy path pdf: application/pdf, 50MB cap, exports/run.pdf", async () => {
    const app = makeApp()
    const res = await postRunResult(app, runResultBody({ type: "pdf" }))
    expect(res.status).toBe(200)
    const call = mockGetPresignedUploadUrl.mock.calls[0]
    expect(call?.[0]).toBe(
      "projects/usr_test1/prj_test_owned/runs/run_test_owned/exports/run.pdf",
    )
    expect(call?.[1]).toBe("application/pdf")
  })

  it("happy path kmz: application/vnd.google-earth.kmz, 50MB cap, exports/run.kmz", async () => {
    const app = makeApp()
    const res = await postRunResult(app, runResultBody({ type: "kmz" }))
    expect(res.status).toBe(200)
    const call = mockGetPresignedUploadUrl.mock.calls[0]
    expect(call?.[0]).toBe(
      "projects/usr_test1/prj_test_owned/runs/run_test_owned/exports/run.kmz",
    )
    expect(call?.[1]).toBe("application/vnd.google-earth.kmz")
  })

  it("happy path thumbnail: image/webp, 50KB cap, thumbnail.webp at run root", async () => {
    const app = makeApp()
    const res = await postRunResult(
      app,
      runResultBody({ type: "thumbnail", size: 30_000 }),
    )
    expect(res.status).toBe(200)
    const call = mockGetPresignedUploadUrl.mock.calls[0]
    expect(call?.[0]).toBe(
      "projects/usr_test1/prj_test_owned/runs/run_test_owned/thumbnail.webp",
    )
    expect(call?.[1]).toBe("image/webp")
    expect(call?.[3]).toBe(30_000)
  })

  it("accepts thumbnail at exactly 50_000 bytes (50KB ceiling)", async () => {
    const app = makeApp()
    const res = await postRunResult(
      app,
      runResultBody({ type: "thumbnail", size: 50_000 }),
    )
    expect(res.status).toBe(200)
  })

  it("returns 400 when thumbnail size > 50_000", async () => {
    const app = makeApp()
    const res = await postRunResult(
      app,
      runResultBody({ type: "thumbnail", size: 50_001 }),
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when the run does not belong to the caller (or does not exist)", async () => {
    mockRunFindFirst.mockImplementationOnce(async () => null)
    const app = makeApp()
    const res = await postRunResult(app, runResultBody())
    expect(res.status).toBe(404)
  })

  it("returns 400 for an invalid type", async () => {
    const app = makeApp()
    const res = await postRunResult(
      app,
      JSON.stringify({
        type: "garbage",
        projectId: "prj_test_owned",
        runId: "run_test_owned",
        size: ONE_MB,
      }),
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when layout size > 25MB", async () => {
    const app = makeApp()
    const res = await postRunResult(
      app,
      runResultBody({ type: "layout", size: TWENTY_FIVE_MB + 1 }),
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when energy size > 10MB", async () => {
    const app = makeApp()
    const res = await postRunResult(
      app,
      runResultBody({ type: "energy", size: TEN_MB + 1 }),
    )
    expect(res.status).toBe(400)
  })

  it("accepts dxf at exactly 100MB", async () => {
    const app = makeApp()
    const res = await postRunResult(
      app,
      runResultBody({ type: "dxf", size: HUNDRED_MB }),
    )
    expect(res.status).toBe(200)
  })

  it("returns 400 when size = 0", async () => {
    const app = makeApp()
    const res = await postRunResult(app, runResultBody({ size: 0 }))
    expect(res.status).toBe(400)
  })

  it("returns 503 when the S3 helper returns null", async () => {
    mockGetPresignedUploadUrl.mockImplementationOnce(async () => null)
    const app = makeApp()
    const res = await postRunResult(app, runResultBody())
    expect(res.status).toBe(503)
  })
})
