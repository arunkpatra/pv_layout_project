import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "./error-handler.js"

const mockLicenseKeyFindFirst = mock(async () => ({
  id: "lk_test1",
  key: "sl_live_testkey",
  userId: "usr_test1",
  createdAt: new Date(),
  revokedAt: null,
  user: {
    id: "usr_test1",
    clerkId: "clerk_abc",
    email: "test@example.com",
    name: "Test User",
    stripeCustomerId: null,
  },
}))

mock.module("../lib/db.js", () => ({
  db: { licenseKey: { findFirst: mockLicenseKeyFindFirst } },
}))

const { licenseKeyAuth } = await import("./license-key-auth.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.use("/protected", licenseKeyAuth)
  app.get("/protected", (c) => {
    const user = c.get("user")
    const licenseKey = c.get("licenseKey")
    return c.json({ ok: true, userId: user.id, keyId: licenseKey?.id })
  })
  app.onError(errorHandler)
  return app
}

describe("licenseKeyAuth middleware", () => {
  beforeEach(() => {
    mockLicenseKeyFindFirst.mockReset()
    mockLicenseKeyFindFirst.mockImplementation(async () => ({
      id: "lk_test1",
      key: "sl_live_testkey",
      userId: "usr_test1",
      createdAt: new Date(),
      revokedAt: null,
      user: {
        id: "usr_test1",
        clerkId: "clerk_abc",
        email: "test@example.com",
        name: "Test User",
        stripeCustomerId: null,
      },
    }))
  })

  it("returns 401 when Authorization header is missing", async () => {
    const app = makeApp()
    const res = await app.request("/protected", { method: "GET" })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it("returns 401 when header is malformed (no Bearer prefix)", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "sl_live_testkey" },
    })
    expect(res.status).toBe(401)
  })

  it("returns 401 when key is not found", async () => {
    mockLicenseKeyFindFirst.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer sl_live_unknown" },
    })
    expect(res.status).toBe(401)
  })

  it("returns 401 when key is revoked (findFirst with revokedAt:null returns nothing)", async () => {
    mockLicenseKeyFindFirst.mockImplementation(async () => null as never)
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer sl_live_revoked" },
    })
    expect(res.status).toBe(401)
  })

  it("passes through, sets user and licenseKey on context when key is valid", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer sl_live_testkey" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; userId: string; keyId: string }
    expect(body.ok).toBe(true)
    expect(body.userId).toBe("usr_test1")
    expect(body.keyId).toBe("lk_test1")
  })
})
