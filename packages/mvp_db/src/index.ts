import { PrismaClient } from "./generated/prisma/index.js"
import { PrismaPg } from "@prisma/adapter-pg"
import { semanticIdExtension, strictIdExtension } from "./extensions/index.js"

const connectionString =
  process.env["MVP_DATABASE_URL"] ??
  "postgresql://mvp:mvp@localhost:5433/mvp_db"

const adapter = new PrismaPg({ connectionString })

const rawClient = new PrismaClient({ adapter, log: ["error", "warn"] })

// ─── Extension chain ──────────────────────────────────────────────────────────
//
// strictIdExtension   → removes manually-provided IDs (logs warning)
// semanticIdExtension → generates prefixed IDs (drg_abc..., etc.)
//
// appPrisma:   strict + semantic — all application code paths
// adminPrisma: semantic only    — seed scripts / admin utilities

/**
 * appPrisma — strict ID enforcement + semantic IDs.
 * Use in: all API services, middleware, application code.
 */
export const appPrisma = rawClient
  .$extends(strictIdExtension)
  .$extends(semanticIdExtension)

/**
 * adminPrisma — semantic IDs only (no strict ID enforcement).
 * Use in: seed scripts, migration utilities.
 */
export const adminPrisma = rawClient.$extends(semanticIdExtension)

/**
 * prisma — alias for appPrisma. Default export for convenience.
 */
export const prisma = appPrisma

export type { Prisma } from "./generated/prisma/index.js"
