// prisma.config.ts — Prisma v7 configuration file.
//
// The datasource url is defined here rather than in schema.prisma, which is
// the Prisma v7 recommended approach for keeping secrets out of schema files.

import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "./prisma/",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url:
      process.env.MVP_DATABASE_URL ??
      "postgresql://mvp:mvp@localhost:5433/mvp_db",
  },
})
