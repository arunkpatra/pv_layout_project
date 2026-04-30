// prisma.config.ts — Prisma v7 configuration file.
//
// The datasource url is defined here rather than in schema.prisma, which is
// the Prisma v7 recommended approach for keeping secrets out of schema files.
// Reference: https://www.prisma.io/docs/orm/reference/prisma-config-reference

import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "./prisma/",
  migrations: {
    path: "./prisma/migrations",
    seed: "bun ./prisma/seed.ts",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://renewable:renewable@localhost:5432/renewable_energy",
  },
})
