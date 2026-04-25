import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
  errorHandler,
  type MvpHonoEnv,
} from "../../middleware/error-handler.js"

// ─── @clerk/backend mock ────────────────────────────────────────────────────
// clerkAuth calls verifyToken (always) and createClerkClient.users.getUser
// (only when user is not in the DB).  We make findFirst return a user so the
// getUser branch is never exercised — but register a safe mock anyway in case
// the module registry picks up a stale mock from an earlier test file.
mock.module("@clerk/backend", () => ({
  verifyToken: async (_token: string) => ({ sub: "clerk_user_123" }),
  createClerkClient: () => ({
    users: {
      getUser: async () => ({
        id: "clerk_user_123",
        emailAddresses: [{ id: "ea_1", emailAddress: "test@example.com" }],
        primaryEmailAddressId: "ea_1",
        firstName: "Test",
        lastName: "User",
        publicMetadata: { roles: [] },
      }),
      createUser: async () => ({
        id: "clerk_user_123",
        emailAddresses: [{ id: "ea_1", emailAddress: "test@example.com" }],
        primaryEmailAddressId: "ea_1",
        firstName: "Test",
        lastName: "User",
      }),
      updateUser: async () => ({}),
    },
  }),
}))

// ─── db mock ────────────────────────────────────────────────────────────────
// findFirst must return a user so clerkAuth short-circuits without calling
// createClerkClient.users.getUser.
mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findFirst: async () => ({
        id: "usr_test1",
        clerkId: "clerk_user_123",
        email: "test@example.com",
        name: "Test User",
        stripeCustomerId: null,
        roles: [],
        status: "ACTIVE",
      }),
      upsert: async () => ({
        id: "usr_test1",
        clerkId: "clerk_user_123",
        email: "test@example.com",
        name: "Test User",
        stripeCustomerId: null,
        roles: [],
        status: "ACTIVE",
      }),
    },
    product: { findFirst: async () => null },
    $transaction: async () => {},
  },
}))

// ─── S3 presigned URL helper mock ───────────────────────────────────────────
const mockGetPresignedDownloadUrl = mock(
  async (_key: string, _filename: string, _expiresIn: number) =>
    "https://s3.example.com/presigned-url"
)
mock.module("../../lib/s3.js", () => ({
  getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
}))

const { dashboardRoutes } = await import("./dashboard.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
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
    mockGetPresignedDownloadUrl.mockImplementation(async () => null as unknown as string)
    const app = makeApp()
    const res = await app.request("/dashboard/download/pv-layout-basic", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(500)
  })
})
