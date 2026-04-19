import { describe, test, expect, mock, beforeEach } from "bun:test"
import { Hono } from "hono"

// ─── Mock env ─────────────────────────────────────────────────────────────────
// Start with no CLERK_SECRET_KEY (dev mode). Production-mode tests override this.

mock.module("../env.js", () => ({
  env: { CLERK_SECRET_KEY: undefined, NODE_ENV: "test" },
}))

// ─── Mock @clerk/backend ───────────────────────────────────────────────────────

const mockVerifyToken = mock(() =>
  Promise.resolve({ sub: "clerk_real123" })
)
const mockGetUser = mock(() =>
  Promise.resolve({
    emailAddresses: [{ emailAddress: "real@example.com" }],
    firstName: "Real",
    lastName: "User",
    imageUrl: "https://example.com/avatar.jpg",
  })
)

mock.module("@clerk/backend", () => ({
  verifyToken: mockVerifyToken,
  createClerkClient: () => ({ users: { getUser: mockGetUser } }),
}))

// ─── Mock db ───────────────────────────────────────────────────────────────────

const mockFindUnique = mock(() => Promise.resolve(null))
const mockUpsert = mock(() =>
  Promise.resolve({
    id: "usr_testUser000000000000000000000000000000",
    clerkId: "dev-clerk-id",
    status: "ACTIVE",
  })
)

mock.module("../lib/db.js", () => ({
  db: { user: { findUnique: mockFindUnique, upsert: mockUpsert } },
}))

import { authMiddleware } from "./auth.js"
import { UnauthorizedError } from "../lib/errors.js"
import type { HonoEnv } from "./auth.js"

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono<HonoEnv>()
  app.onError((err, c) => {
    if (err instanceof UnauthorizedError)
      return c.json({ error: err.message }, 401)
    return c.json({ error: "unexpected" }, 500)
  })
  return app
}

// ─── Dev mode (no CLERK_SECRET_KEY) ───────────────────────────────────────────

describe("authMiddleware — dev mode (no CLERK_SECRET_KEY)", () => {
  beforeEach(() => {
    mockUpsert.mockClear()
    mockFindUnique.mockClear()
  })

  test("upserts dev user and sets context", async () => {
    const app = makeApp()
    app.use("*", authMiddleware)
    app.get("/test", (c) => {
      const user = c.get("user")
      return c.json({ id: user.id, clerkId: user.clerkId, status: user.status })
    })

    const res = await app.request("/test")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; clerkId: string; status: string }
    expect(body.clerkId).toBe("dev-clerk-id")
    expect(body.status).toBe("ACTIVE")
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  test("proceeds to next handler after setting user", async () => {
    const app = makeApp()
    app.use("*", authMiddleware)
    app.get("/test", (c) => c.json({ reached: true }))

    const res = await app.request("/test")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { reached: boolean }
    expect(body.reached).toBe(true)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })
})

// ─── Production mode (CLERK_SECRET_KEY present) ───────────────────────────────

describe("authMiddleware — production mode", () => {
  beforeEach(() => {
    mockFindUnique.mockClear()
    mockUpsert.mockClear()
    mockVerifyToken.mockClear()
    mockGetUser.mockClear()
    // Override env to simulate production
    mock.module("../env.js", () => ({
      env: { CLERK_SECRET_KEY: "test_secret_key", NODE_ENV: "test" },
    }))
  })

  test("returns 401 when Authorization header is missing", async () => {
    const app = makeApp()
    app.use("*", authMiddleware)
    app.get("/test", (c) => c.json({ ok: true }))

    const res = await app.request("/test") // no Authorization header
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Missing or invalid Authorization header")
  })

  test("returns 401 when token verification fails", async () => {
    mockVerifyToken.mockImplementationOnce(() =>
      Promise.reject(new Error("invalid token"))
    )

    const app = makeApp()
    app.use("*", authMiddleware)
    app.get("/test", (c) => c.json({ ok: true }))

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer bad_token" },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Invalid or expired token")
  })

  test("upserts new user on first sign-in and sets context", async () => {
    mockFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockUpsert.mockImplementationOnce(() =>
      Promise.resolve({
        id: "usr_newUser000000000000000000000000000000",
        clerkId: "clerk_real123",
        status: "ACTIVE",
      } as any)
    )

    const app = makeApp()
    app.use("*", authMiddleware)
    app.get("/test", (c) => {
      const user = c.get("user")
      return c.json({ id: user.id, clerkId: user.clerkId })
    })

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer valid_token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; clerkId: string }
    expect(body.clerkId).toBe("clerk_real123")
    expect(mockGetUser).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  test("returns 401 when account is inactive", async () => {
    mockFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: "usr_inactiveUser00000000000000000000000000",
        clerkId: "clerk_real123",
        status: "INACTIVE",
      } as any)
    )

    const app = makeApp()
    app.use("*", authMiddleware)
    app.get("/test", (c) => c.json({ ok: true }))

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer valid_token" },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Account is not active")
  })
})
