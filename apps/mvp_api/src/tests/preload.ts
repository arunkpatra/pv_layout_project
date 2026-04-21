// Test preload: runs before every test file.
// Prevents env.ts from calling process.exit(1) on missing MVP_DATABASE_URL,
// and prevents PrismaClient from attempting a real DB connection.
import { mock } from "bun:test"

process.env["MVP_DATABASE_URL"] =
  process.env["MVP_DATABASE_URL"] ??
  "postgresql://test:test@localhost/test_placeholder"
process.env["NODE_ENV"] = "test"

const noopPrismaClient = {
  downloadRegistration: {
    findUnique: () => Promise.resolve(null),
    findMany: () => Promise.resolve([]),
    create: () => Promise.resolve(null),
    count: () => Promise.resolve(0),
  },
  $connect: () => Promise.resolve(),
  $disconnect: () => Promise.resolve(),
  $queryRaw: () => Promise.resolve([{ "?column?": 1 }]),
}

mock.module("@renewable-energy/mvp-db", () => ({
  prisma: noopPrismaClient,
  appPrisma: noopPrismaClient,
  adminPrisma: noopPrismaClient,
  Prisma: {},
}))
