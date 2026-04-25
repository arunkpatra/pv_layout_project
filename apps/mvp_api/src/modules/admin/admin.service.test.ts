import { describe, expect, it, mock, beforeEach } from "bun:test"

// Must set env before importing anything that reads env.ts
process.env["MVP_DATABASE_URL"] = "postgresql://test:test@localhost/test"
process.env["NODE_ENV"] = "test"
process.env["CLERK_SECRET_KEY"] = "sk_test_fake"

// Mock db
const mockDb = {
  user: {
    findUnique: mock(
      async (): Promise<{
        id: string
        clerkId: string
        email: string
        name: string
        roles: string[]
        status: string
      } | null> => null,
    ),
    findMany: mock(
      async (): Promise<{
        id: string
        clerkId: string
        email: string
        name: string
        roles: string[]
        status: string
        createdAt: Date
      }[]> => [],
    ),
    count: mock(async () => 0),
    create: mock(async (args: { data: Record<string, unknown> }) => ({
      id: "usr_1",
      clerkId: "clerk_1",
      email: "admin@test.com",
      name: "Admin User",
      roles: (args.data["roles"] as string[]) ?? [],
      status: "ACTIVE",
      createdAt: new Date(),
    })),
    update: mock(async () => ({})),
  },
}
mock.module("../../lib/db.js", () => ({ db: mockDb }))

// Mock Clerk
const mockCreateUser = mock(async () => ({
  id: "clerk_new_1",
  emailAddresses: [{ emailAddress: "new@test.com", id: "ea_1" }],
  primaryEmailAddressId: "ea_1",
  firstName: "New",
  lastName: "Admin",
}))
const mockGetUser = mock(async () => ({
  id: "clerk_1",
  publicMetadata: { roles: ["ADMIN"] },
}))
const mockUpdateUser = mock(async () => ({}))
mock.module("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      createUser: mockCreateUser,
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
  }),
}))

const {
  listAdminUsers,
  createAdminUser,
  updateUserRoles,
  updateUserStatus,
} = await import("./admin.service.js")

describe("listAdminUsers", () => {
  beforeEach(() => {
    mockDb.user.findMany.mockReset()
    mockDb.user.count.mockReset()
  })

  it("returns paginated user list", async () => {
    mockDb.user.findMany.mockImplementation(async () => [
      {
        id: "u1",
        clerkId: "ck1",
        email: "a@b.com",
        name: "Alice",
        roles: ["ADMIN"],
        status: "ACTIVE",
        createdAt: new Date(),
      },
    ])
    mockDb.user.count.mockImplementation(async () => 1)

    const result = await listAdminUsers({ page: 1, pageSize: 10 })
    expect(result.data).toHaveLength(1)
    expect(result.pagination.total).toBe(1)
    expect(result.pagination.totalPages).toBe(1)
  })
})

describe("createAdminUser", () => {
  beforeEach(() => {
    mockCreateUser.mockReset()
    mockDb.user.create.mockReset()
  })

  it("calls Clerk createUser with skipPasswordRequirement and publicMetadata roles", async () => {
    mockCreateUser.mockImplementation(async () => ({
      id: "clerk_new_1",
      emailAddresses: [{ emailAddress: "new@test.com", id: "ea_1" }],
      primaryEmailAddressId: "ea_1",
      firstName: "New",
      lastName: "Admin",
    }))
    mockDb.user.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: "usr_new",
        clerkId: "clerk_new_1",
        email: "new@test.com",
        name: "New Admin",
        roles: (args.data["roles"] as string[]) ?? [],
        status: "ACTIVE",
        createdAt: new Date(),
      }),
    )

    const result = await createAdminUser({
      name: "New Admin",
      email: "new@test.com",
      roles: ["ADMIN"],
    })

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: ["new@test.com"],
        skipPasswordRequirement: true,
        publicMetadata: { roles: ["ADMIN"] },
      }),
    )
    expect(result.email).toBe("new@test.com")
    expect(result.roles).toContain("ADMIN")
  })
})

describe("updateUserRoles", () => {
  beforeEach(() => {
    mockDb.user.findUnique.mockReset()
    mockGetUser.mockReset()
    mockUpdateUser.mockReset()
    mockDb.user.update.mockReset()
  })

  it("adds a role using read-spread-write pattern", async () => {
    mockDb.user.findUnique.mockImplementation(async () => ({
      id: "u1",
      clerkId: "ck1",
      email: "a@b.com",
      name: "Alice",
      roles: ["OPS"],
      status: "ACTIVE",
    }))
    mockGetUser.mockImplementation(async () => ({
      id: "ck1",
      publicMetadata: { roles: ["OPS"], someOtherField: "preserved" },
    }))
    mockUpdateUser.mockImplementation(async () => ({}))
    mockDb.user.update.mockImplementation(async () => ({}))

    await updateUserRoles({ userId: "u1", role: "ADMIN", action: "add" })

    expect(mockUpdateUser).toHaveBeenCalledWith("ck1", {
      publicMetadata: { roles: ["OPS", "ADMIN"], someOtherField: "preserved" },
    })
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { roles: ["OPS", "ADMIN"] },
    })
  })

  it("removes a role", async () => {
    mockDb.user.findUnique.mockImplementation(async () => ({
      id: "u1",
      clerkId: "ck1",
      email: "a@b.com",
      name: "Alice",
      roles: ["OPS", "ADMIN"],
      status: "ACTIVE",
    }))
    mockGetUser.mockImplementation(async () => ({
      id: "ck1",
      publicMetadata: { roles: ["OPS", "ADMIN"] },
    }))
    mockUpdateUser.mockImplementation(async () => ({}))
    mockDb.user.update.mockImplementation(async () => ({}))

    await updateUserRoles({ userId: "u1", role: "ADMIN", action: "remove" })

    expect(mockUpdateUser).toHaveBeenCalledWith("ck1", {
      publicMetadata: { roles: ["OPS"] },
    })
  })
})

describe("updateUserStatus", () => {
  beforeEach(() => {
    mockDb.user.findUnique.mockReset()
    mockDb.user.update.mockReset()
    mockUpdateUser.mockReset()
  })

  it("sets status to INACTIVE in DB only", async () => {
    mockDb.user.findUnique.mockImplementation(async () => ({
      id: "u1",
      clerkId: "ck1",
      email: "a@b.com",
      name: "Alice",
      roles: ["OPS"],
      status: "ACTIVE",
    }))
    mockDb.user.update.mockImplementation(async () => ({}))

    await updateUserStatus({ userId: "u1", status: "INACTIVE" })

    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { status: "INACTIVE" },
    })
    // Clerk updateUser must NOT be called for status changes
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})
