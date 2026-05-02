import { describe, expect, test } from "bun:test"

/**
 * B29 — Run lifecycle fields.
 *
 * Refund-on-cancel policy (decision memo 2026-05-02-002) requires
 * Run.status to track the four terminal/in-flight states + matching
 * timestamps + an optional failureReason. See
 * docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md
 * §A.1 for the state table.
 */

describe("B29 Run lifecycle Prisma DMMF", () => {
  test("Run model exposes status, cancelledAt, failedAt, failureReason", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const run = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "Run",
    )
    expect(run).toBeDefined()
    const fieldNames = (run?.fields ?? []).map(
      (f: { name: string }) => f.name,
    )
    for (const name of [
      "status",
      "cancelledAt",
      "failedAt",
      "failureReason",
    ]) {
      expect(fieldNames).toContain(name)
    }
  })

  // Prisma v7.8's runtime DMMF exposes only `{ name, kind, type }` per
  // scalar field — `isRequired` and `default` are not accessible at
  // runtime. Defaults + nullability are pinned by the migration-SQL
  // tests below (Task 8 of the B29 plan).

  test("Run.status / cancelledAt / failedAt / failureReason have expected scalar types", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const run = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "Run",
    )
    const findField = (name: string) =>
      run?.fields.find((f: { name: string }) => f.name === name)
    expect(findField("status")?.type).toBe("String")
    expect(findField("cancelledAt")?.type).toBe("DateTime")
    expect(findField("failedAt")?.type).toBe("DateTime")
    expect(findField("failureReason")?.type).toBe("String")
  })
})

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

function findPackageRoot(start: string): string {
  let dir = start
  while (dir.length > 1) {
    if (existsSync(join(dir, "prisma", "schema.prisma"))) return dir
    dir = dirname(dir)
  }
  throw new Error(`Could not locate mvp_db package root from ${start}`)
}

function findB29Migration(pkgRoot: string): string {
  const migrationsDir = join(pkgRoot, "prisma", "migrations")
  const dirs = readdirSync(migrationsDir).filter((d) =>
    d.endsWith("_add_run_lifecycle_and_usage_kind"),
  )
  if (dirs.length !== 1) {
    throw new Error(
      `Expected exactly one *_add_run_lifecycle_and_usage_kind migration, found ${dirs.length}`,
    )
  }
  return join(migrationsDir, dirs[0]!, "migration.sql")
}

describe("B29 Run lifecycle migration SQL", () => {
  const PKG_ROOT = findPackageRoot(import.meta.dir)
  const sql = readFileSync(findB29Migration(PKG_ROOT), "utf8")

  test("adds status column to runs with NOT NULL DEFAULT 'RUNNING'", () => {
    expect(sql).toMatch(
      /ALTER TABLE\s+"runs"[\s\S]*?ADD COLUMN\s+"status"\s+TEXT\s+NOT NULL\s+DEFAULT\s+'RUNNING'/,
    )
  })

  test("adds cancelledAt, failedAt as nullable TIMESTAMP(3)", () => {
    expect(sql).toMatch(/ADD COLUMN\s+"cancelledAt"\s+TIMESTAMP\(3\)/)
    expect(sql).toMatch(/ADD COLUMN\s+"failedAt"\s+TIMESTAMP\(3\)/)
    expect(sql).not.toMatch(/"cancelledAt"\s+TIMESTAMP\(3\)\s+NOT NULL/)
    expect(sql).not.toMatch(/"failedAt"\s+TIMESTAMP\(3\)\s+NOT NULL/)
  })

  test("adds failureReason as nullable TEXT", () => {
    expect(sql).toMatch(/ADD COLUMN\s+"failureReason"\s+TEXT/)
    expect(sql).not.toMatch(/"failureReason"\s+TEXT\s+NOT NULL/)
  })

  test("backfills existing rows to status='DONE'", () => {
    expect(sql).toMatch(
      /UPDATE\s+"runs"\s+SET\s+"status"\s*=\s*'DONE'/,
    )
  })

  test("creates an index on runs(status)", () => {
    expect(sql).toMatch(
      /CREATE INDEX[\s\S]*?ON\s+"runs"\s*\(\s*"status"\s*\)/,
    )
  })
})
