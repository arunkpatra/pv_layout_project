import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

// Mock clerkAuth — ADMIN user
mock.module("../../middleware/clerk-auth.js", () => ({
  clerkAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", {
      id: "usr_admin",
      clerkId: "ck_admin",
      email: "admin@test.com",
      name: "Admin",
      stripeCustomerId: null,
      roles: ["ADMIN"],
      status: "ACTIVE",
    })
    return next()
  },
}))

mock.module("../../lib/db.js", () => ({ db: {} }))

// Mock admin service
const mockListAdminUsers = mock(async () => ({
  data: [{ id: "u1", clerkId: "ck1", email: "a@b.com", name: "Alice", roles: ["OPS"], status: "ACTIVE", createdAt: new Date() }],
  pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
}))
const mockGetAdminUser = mock(async () => ({
  id: "u1", clerkId: "ck1", email: "a@b.com", name: "Alice", roles: ["OPS"], status: "ACTIVE", createdAt: new Date(),
}))
const mockCreateAdminUser = mock(async () => ({
  id: "u2", clerkId: "ck2", email: "new@b.com", name: "New", roles: ["ADMIN"], status: "ACTIVE", createdAt: new Date(),
}))
const mockUpdateUserRoles = mock(async () => undefined)
const mockUpdateUserStatus = mock(async () => undefined)

mock.module("./admin.service.js", () => ({
  listAdminUsers: mockListAdminUsers,
  getAdminUser: mockGetAdminUser,
  createAdminUser: mockCreateAdminUser,
  updateUserRoles: mockUpdateUserRoles,
  updateUserStatus: mockUpdateUserStatus,
}))

const { adminRoutes } = await import("./admin.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", adminRoutes)
  app.onError(errorHandler)
  return app
}

describe("GET /admin/users", () => {
  it("returns 200 with paginated user list", async () => {
    const res = await makeApp().request("/admin/users", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; data: { data: unknown[]; pagination: unknown } }
    expect(body.success).toBe(true)
    expect(body.data.data).toHaveLength(1)
  })
})

describe("GET /admin/users/:id", () => {
  it("returns 200 with user detail", async () => {
    const res = await makeApp().request("/admin/users/u1", {
      headers: { Authorization: "Bearer token" },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; data: { id: string } }
    expect(body.data.id).toBe("u1")
  })
})

describe("POST /admin/users", () => {
  it("returns 201 with created user", async () => {
    const res = await makeApp().request("/admin/users", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New User", email: "new@b.com", roles: ["ADMIN"] }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { success: boolean; data: { email: string } }
    expect(body.data.email).toBe("new@b.com")
  })

  it("returns 400 for invalid body (missing email)", async () => {
    const res = await makeApp().request("/admin/users", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Email", roles: ["ADMIN"] }),
    })
    expect(res.status).toBe(400)
  })
})

describe("PATCH /admin/users/:id/roles", () => {
  it("returns 200 on valid role update", async () => {
    const res = await makeApp().request("/admin/users/u1/roles", {
      method: "PATCH",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ role: "OPS", action: "remove" }),
    })
    expect(res.status).toBe(200)
  })
})

describe("PATCH /admin/users/:id/status", () => {
  it("returns 200 on valid status update", async () => {
    const res = await makeApp().request("/admin/users/u1/status", {
      method: "PATCH",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" }),
    })
    expect(res.status).toBe(200)
  })
})
