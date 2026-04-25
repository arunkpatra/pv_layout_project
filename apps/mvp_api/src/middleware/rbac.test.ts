import { describe, expect, it, mock } from "bun:test"
import { Hono } from "hono"
import type { MvpHonoEnv } from "./error-handler.js"
import { errorHandler } from "./error-handler.js"

// Import after mocks
mock.module("../lib/db.js", () => ({ db: {} }))

const { requireRole } = await import("./rbac.js")

function makeApp(userRoles: string[]) {
  const app = new Hono<MvpHonoEnv>()
  app.use("*", async (c, next) => {
    c.set("user", {
      id: "u1",
      clerkId: "ck1",
      email: "a@b.com",
      name: null,
      stripeCustomerId: null,
      roles: userRoles,
      status: "ACTIVE",
    })
    return next()
  })
  app.get("/protected", requireRole("ADMIN"), (c) => c.json({ ok: true }))
  app.onError(errorHandler)
  return app
}

describe("requireRole", () => {
  it("allows user with required role", async () => {
    const res = await makeApp(["ADMIN"]).request("/protected")
    expect(res.status).toBe(200)
  })

  it("rejects user without required role", async () => {
    const res = await makeApp(["OPS"]).request("/protected")
    expect(res.status).toBe(403)
  })

  it("rejects user with empty roles", async () => {
    const res = await makeApp([]).request("/protected")
    expect(res.status).toBe(403)
  })

  it("allows when user has any of multiple accepted roles", async () => {
    const app = new Hono<MvpHonoEnv>()
    app.use("*", async (c, next) => {
      c.set("user", {
        id: "u1",
        clerkId: "ck1",
        email: "a@b.com",
        name: null,
        stripeCustomerId: null,
        roles: ["OPS"],
        status: "ACTIVE",
      })
      return next()
    })
    app.get("/", requireRole("ADMIN", "OPS"), (c) => c.json({ ok: true }))
    app.onError(errorHandler)
    const res = await app.request("/")
    expect(res.status).toBe(200)
  })
})
