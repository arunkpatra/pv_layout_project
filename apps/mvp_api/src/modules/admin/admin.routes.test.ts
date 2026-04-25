import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import { errorHandler, type MvpHonoEnv } from "../../middleware/error-handler.js"

// ─── @clerk/backend mock ────────────────────────────────────────────────────
// Must be registered before any module that imports clerk-auth.js is loaded.
// clerkAuth calls verifyToken + createClerkClient (for new-user path).
mock.module("@clerk/backend", () => ({
  verifyToken: async (_token: string) => ({ sub: "ck_admin" }),
  createClerkClient: () => ({
    users: {
      getUser: async () => ({
        id: "ck_admin",
        emailAddresses: [{ id: "ea_1", emailAddress: "admin@test.com" }],
        primaryEmailAddressId: "ea_1",
        firstName: "Admin",
        lastName: null,
        publicMetadata: { roles: ["ADMIN"] },
      }),
      createUser: async () => ({
        id: "ck_new",
        emailAddresses: [{ id: "ea_2", emailAddress: "new@b.com" }],
        primaryEmailAddressId: "ea_2",
        firstName: "New",
        lastName: null,
      }),
      updateUser: async () => ({}),
    },
  }),
}))

// ─── db mock ────────────────────────────────────────────────────────────────
// clerkAuth calls db.user.findFirst; admin service calls findMany/count/etc.
// findFirst returns an ADMIN user so clerkAuth sets user with roles:["ADMIN"].
const mockUserFindFirst = mock(async () => ({
  id: "usr_admin",
  clerkId: "ck_admin",
  email: "admin@test.com",
  name: "Admin",
  stripeCustomerId: null,
  roles: ["ADMIN"],
  status: "ACTIVE",
}))
const mockUserFindMany = mock(async () => [
  {
    id: "u1",
    clerkId: "ck1",
    email: "a@b.com",
    name: "Alice",
    roles: ["OPS"],
    status: "ACTIVE",
    createdAt: new Date(),
  },
])
const mockUserCount = mock(async () => 1)
const mockUserFindUnique = mock(async () => ({
  id: "u1",
  clerkId: "ck1",
  email: "a@b.com",
  name: "Alice",
  roles: ["OPS"],
  status: "ACTIVE",
  createdAt: new Date(),
}))
const mockUserCreate = mock(async () => ({
  id: "u2",
  clerkId: "ck_new",
  email: "new@b.com",
  name: "New",
  roles: ["ADMIN"],
  status: "ACTIVE",
  createdAt: new Date(),
}))
const mockUserUpsert = mock(async () => ({
  id: "u2",
  clerkId: "ck_new",
  email: "new@b.com",
  name: "New",
  roles: ["ADMIN"],
  status: "ACTIVE",
  createdAt: new Date(),
}))
const mockUserUpdate = mock(async () => ({}))

mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findFirst: mockUserFindFirst,
      findMany: mockUserFindMany,
      count: mockUserCount,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      upsert: mockUserUpsert,
      update: mockUserUpdate,
    },
    product: {
      findFirst: async () => null,
    },
    $transaction: async () => {},
  },
}))

const { adminRoutes } = await import("./admin.routes.js")

function makeApp() {
  const app = new Hono<MvpHonoEnv>()
  app.route("/", adminRoutes)
  app.onError(errorHandler)
  return app
}

beforeEach(() => {
  mockUserFindFirst.mockReset()
  mockUserFindFirst.mockImplementation(async () => ({
    id: "usr_admin",
    clerkId: "ck_admin",
    email: "admin@test.com",
    name: "Admin",
    stripeCustomerId: null,
    roles: ["ADMIN"],
    status: "ACTIVE",
  }))
  mockUserFindMany.mockReset()
  mockUserFindMany.mockImplementation(async () => [
    {
      id: "u1",
      clerkId: "ck1",
      email: "a@b.com",
      name: "Alice",
      roles: ["OPS"],
      status: "ACTIVE",
      createdAt: new Date(),
    },
  ])
  mockUserCount.mockReset()
  mockUserCount.mockImplementation(async () => 1)
  mockUserFindUnique.mockReset()
  mockUserFindUnique.mockImplementation(async () => ({
    id: "u1",
    clerkId: "ck1",
    email: "a@b.com",
    name: "Alice",
    roles: ["OPS"],
    status: "ACTIVE",
    createdAt: new Date(),
  }))
  mockUserCreate.mockReset()
  mockUserCreate.mockImplementation(async () => ({
    id: "u2",
    clerkId: "ck_new",
    email: "new@b.com",
    name: "New",
    roles: ["ADMIN"],
    status: "ACTIVE",
    createdAt: new Date(),
  }))
  mockUserUpsert.mockReset()
  mockUserUpsert.mockImplementation(async () => ({
    id: "u2",
    clerkId: "ck_new",
    email: "new@b.com",
    name: "New",
    roles: ["ADMIN"],
    status: "ACTIVE",
    createdAt: new Date(),
  }))
  mockUserUpdate.mockReset()
  mockUserUpdate.mockImplementation(async () => ({}))
})

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

describe("Role enforcement", () => {
  it("returns 403 when user has OPS role on admin routes", async () => {
    // Build a mini-app that sets OPS user directly (no clerk-auth mock needed)
    const { requireRole } = await import("../../middleware/rbac.js")
    const app = new Hono<MvpHonoEnv>()
    app.use("*", async (c, next) => {
      c.set("user", {
        id: "usr_ops",
        clerkId: "ck_ops",
        email: "ops@test.com",
        name: "Ops User",
        stripeCustomerId: null,
        roles: ["OPS"],
        status: "ACTIVE",
      })
      return next()
    })
    app.get("/admin/users", requireRole("ADMIN"), (c) => c.json({ ok: true }))
    app.onError(errorHandler)
    const res = await app.request("/admin/users")
    expect(res.status).toBe(403)
  })
})
