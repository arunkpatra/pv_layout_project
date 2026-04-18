import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const connectionString =
  process.env["DATABASE_URL"] ??
  "postgresql://renewable:renewable@localhost:5432/renewable_energy"

const adapter = new PrismaPg({ connectionString })

export const prisma = new PrismaClient({ adapter, log: ["error", "warn"] })

export type { Prisma } from "@prisma/client"
