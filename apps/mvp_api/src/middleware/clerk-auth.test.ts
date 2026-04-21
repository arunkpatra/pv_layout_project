import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
  errorHandler,
  type MvpHonoEnv,
} from "./error-handler.js"

// Mock @clerk/backend BEFORE importing the middleware
const mockVerifyToken = mock(async (_token: string) => ({ sub: "user_abc" }))
mock.module("@clerk/backend", () => ({
  verifyToken: mockVerifyToken,
}))

const { clerkAuth } = await import("./clerk-auth.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.use("/protected", clerkAuth)
  app.get("/protected", (c) => c.json({ ok: true }))
  app.onError(errorHandler)
  return app
}

describe("clerkAuth middleware", () => {
  beforeEach(() => {
    mockVerifyToken.mockReset()
    mockVerifyToken.mockImplementation(async () => ({ sub: "user_abc" }))
  })

  it("returns 401 when Authorization header is missing", async () => {
    const app = makeApp()
    const res = await app.request("/protected", { method: "GET" })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it("returns 401 when token is invalid", async () => {
    mockVerifyToken.mockImplementation(async () => {
      throw new Error("invalid token")
    })
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer bad-token" },
    })
    expect(res.status).toBe(401)
  })

  it("passes through when token is valid", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})
