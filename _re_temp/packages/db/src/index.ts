import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { semanticIdExtension, strictIdExtension } from "./extensions/index.js"

const connectionString =
  process.env["DATABASE_URL"] ??
  "postgresql://renewable:renewable@localhost:5432/renewable_energy"

const adapter = new PrismaPg({ connectionString })

const rawClient = new PrismaClient({ adapter, log: ["error", "warn"] })

// ─── Extension chain ──────────────────────────────────────────────────────────
//
// strictIdExtension   → removes manually-provided IDs (logs warning)
// semanticIdExtension → generates prefixed IDs (usr_abc..., etc.)
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

export type { Prisma } from "@prisma/client"
