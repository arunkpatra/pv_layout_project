import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler } from "../../middleware/error-handler.js"

// Mock Clerk auth to pass by default
mock.module("../../middleware/clerk-auth.js", () => ({
  clerkAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}))

// Mock S3 presigned URL helper
const mockGetPresignedDownloadUrl = mock(
  async (_key: string, _filename: string, _expiresIn: number) =>
    "https://s3.example.com/presigned-url"
)
mock.module("../../lib/s3.js", () => ({
  getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
}))

const { dashboardRoutes } = await import("./dashboard.routes.js")

function makeApp() {
  const app = new Hono()
  app.route("/", dashboardRoutes)
  app.onError(errorHandler)
  return app
}

describe("GET /dashboard/download/:product", () => {
  beforeEach(() => {
    mockGetPresignedDownloadUrl.mockReset()
    mockGetPresignedDownloadUrl.mockImplementation(
      async () => "https://s3.example.com/presigned-url"
    )
  })

  it("returns 200 with url for pv-layout-basic", async () => {
    const app = makeApp()
    const res = await app.request("/dashboard/download/pv-layout-basic", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { url: string }
    }
    expect(body.success).toBe(true)
    expect(body.data.url).toContain("s3.example.com")
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      "downloads/pv-layout-basic.exe",
      "pv-layout-basic.exe",
      60
    )
  })

  it("returns 200 for pv-layout-pro", async () => {
    const app = makeApp()
    const res = await app.request("/dashboard/download/pv-layout-pro", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      data: { url: string }
    }
    expect(body.success).toBe(true)
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      "downloads/pv-layout-pro.exe",
      "pv-layout-pro.exe",
      60
    )
  })

  it("returns 400 for invalid product slug", async () => {
    const app = makeApp()
    const res = await app.request(
      "/dashboard/download/nonexistent-product",
      {
        method: "GET",
        headers: { Authorization: "Bearer valid-token" },
      }
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it("returns 500 when S3 is not configured (url is null)", async () => {
    mockGetPresignedDownloadUrl.mockImplementation(async () => null)
    const app = makeApp()
    const res = await app.request("/dashboard/download/pv-layout-basic", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(500)
  })
})
