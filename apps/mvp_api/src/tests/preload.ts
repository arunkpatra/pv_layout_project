// Test preload: runs before every test file.
// Prevents env.ts from calling process.exit(1) on missing MVP_DATABASE_URL,
// and prevents PrismaClient from attempting a real DB connection.
//
// Also provides a baseline @clerk/backend mock so that any test file which
// does NOT set up its own mock still gets a safe no-op implementation.
// Individual test files override specific functions via mockImplementation().
import { mock } from "bun:test"

process.env["MVP_DATABASE_URL"] =
  process.env["MVP_DATABASE_URL"] ??
  "postgresql://test:test@localhost/test_placeholder"
process.env["NODE_ENV"] = "test"
process.env["CLERK_SECRET_KEY"] =
  process.env["CLERK_SECRET_KEY"] ?? "sk_test_preload_placeholder"

const noopPrismaClient = {
  downloadRegistration: {
    findUnique: () => Promise.resolve(null),
    findMany: () => Promise.resolve([]),
    create: () => Promise.resolve(null),
    count: () => Promise.resolve(0),
  },
  contactSubmission: {
    findUnique: () => Promise.resolve(null),
    findMany: () => Promise.resolve([]),
    create: () => Promise.resolve(null),
    count: () => Promise.resolve(0),
  },
  $connect: () => Promise.resolve(),
  $disconnect: () => Promise.resolve(),
  $queryRaw: () => Promise.resolve([{ "?column?": 1 }]),
}

mock.module("@solarlayout/mvp-db", () => ({
  prisma: noopPrismaClient,
  appPrisma: noopPrismaClient,
  adminPrisma: noopPrismaClient,
  Prisma: {},
}))

// Baseline @clerk/backend mock — covers verifyToken, createClerkClient with
// all user methods used across the test suite.  Individual test files call
// mockImplementation() on the exported mock functions to tailor behaviour.
// This mock is registered first (in preload) so it is always the cached entry
// that every subsequent mock.module("@clerk/backend", ...) in individual test
// files will REPLACE cleanly.
mock.module("@clerk/backend", () => ({
  verifyToken: async (_token: string) => ({ sub: "preload_user" }),
  createClerkClient: () => ({
    users: {
      getUser: async () => ({
        id: "preload_user",
        emailAddresses: [{ id: "ea_0", emailAddress: "preload@test.com" }],
        primaryEmailAddressId: "ea_0",
        firstName: "Preload",
        lastName: "User",
        publicMetadata: { roles: [] },
      }),
      createUser: async () => ({
        id: "preload_new_user",
        emailAddresses: [{ id: "ea_0", emailAddress: "preload@test.com" }],
        primaryEmailAddressId: "ea_0",
        firstName: "Preload",
        lastName: "User",
      }),
      updateUser: async () => ({}),
    },
  }),
}))
