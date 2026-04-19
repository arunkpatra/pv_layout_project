import { describe, test, expect, mock, beforeEach } from "bun:test"

// ─── Mock db ───────────────────────────────────────────────────────────────────

const now = new Date("2026-04-19T00:00:00.000Z")

const mockDbUser = {
  id: "usr_testUser000000000000000000000000000000",
  clerkId: "clerk_test123",
  email: "test@example.com",
  name: "Test User",
  avatarUrl: null,
  status: "ACTIVE" as const,
  createdAt: now,
  updatedAt: now,
}

const mockFindUnique = mock(() => Promise.resolve(mockDbUser))

mock.module("../../lib/db.js", () => ({
  db: { user: { findUnique: mockFindUnique } },
}))

import { getMe } from "./identity.service.js"
import { NotFoundError } from "../../lib/errors.js"

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("getMe", () => {
  beforeEach(() => mockFindUnique.mockClear())

  test("returns shaped User when found", async () => {
    const user = await getMe(mockDbUser.id)

    expect(user.id).toBe(mockDbUser.id)
    expect(user.clerkId).toBe(mockDbUser.clerkId)
    expect(user.email).toBe(mockDbUser.email)
    expect(user.name).toBe(mockDbUser.name)
    expect(user.avatarUrl).toBeNull()
    expect(user.status).toBe("ACTIVE")
    expect(user.createdAt).toBe(now.toISOString())
    expect(user.updatedAt).toBe(now.toISOString())
  })

  test("queries by userId", async () => {
    await getMe(mockDbUser.id)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: mockDbUser.id },
    })
  })

  test("throws NotFoundError when user does not exist", async () => {
    mockFindUnique.mockImplementationOnce(() => Promise.resolve(null as any))
    await expect(getMe("usr_nonexistent000000000000000000000000")).rejects.toThrow(
      NotFoundError
    )
  })
})
