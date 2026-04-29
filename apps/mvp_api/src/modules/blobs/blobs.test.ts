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

mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: async () => mockLicenseKey },
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
