// Test preload: runs before every test file.
// Prevents env.ts from calling process.exit(1) on missing DATABASE_URL,
// and prevents PrismaClient from attempting a real DB connection.
import { mock } from "bun:test"

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ?? "postgresql://test:test@localhost/test_placeholder"
process.env["NODE_ENV"] = "test"

const noopPrismaClient = {
  user: {
    findUnique: () => Promise.resolve(null),
    upsert: () => Promise.resolve(null),
    create: () => Promise.resolve(null),
    update: () => Promise.resolve(null),
    findMany: () => Promise.resolve([]),
  },
  project: {
    findUnique: () => Promise.resolve(null),
    findMany: () => Promise.resolve([]),
    create: () => Promise.resolve(null),
    update: () => Promise.resolve(null),
    delete: () => Promise.resolve(null),
  },
  version: {
    findUnique: () => Promise.resolve(null),
    findMany: () => Promise.resolve([]),
    create: () => Promise.resolve(null),
    count: () => Promise.resolve(0),
  },
  layoutJob: {
    findUnique: () => Promise.resolve(null),
    create: () => Promise.resolve(null),
    update: () => Promise.resolve(null),
  },
  energyJob: {
    findUnique: () => Promise.resolve(null),
    create: () => Promise.resolve(null),
    update: () => Promise.resolve(null),
  },
  $connect: () => Promise.resolve(),
  $disconnect: () => Promise.resolve(),
}

mock.module("@renewable-energy/db", () => ({
  prisma: noopPrismaClient,
  appPrisma: noopPrismaClient,
  adminPrisma: noopPrismaClient,
  Prisma: {},
}))
