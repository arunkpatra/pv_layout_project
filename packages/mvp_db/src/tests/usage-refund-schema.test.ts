import { describe, expect, test } from "bun:test"

/**
 * B29 — UsageRecord refund fields.
 *
 * Refund-on-cancel policy (decision memo 2026-05-02-002 §B.1) writes
 * refunds as a separate negative-count UsageRecord row with kind='refund'
 * and refundsRecordId pointing at the original charge. Original charge
 * row stays immutable (audit trail). Quota math: SUM(count) over rows.
 */

describe("B29 UsageRecord refund Prisma DMMF", () => {
  test("UsageRecord exposes count, kind, refundsRecordId, refundsRecord, refundedBy", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const ur = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "UsageRecord",
    )
    expect(ur).toBeDefined()
    const fieldNames = (ur?.fields ?? []).map(
      (f: { name: string }) => f.name,
    )
    for (const name of [
      "count",
      "kind",
      "refundsRecordId",
      "refundsRecord",
      "refundedBy",
    ]) {
      expect(fieldNames).toContain(name)
    }
  })

  // Prisma v7.8's runtime DMMF exposes only `{ name, kind, type }` for
  // scalar fields and adds `relationName` for relation fields. Defaults
  // and nullability are pinned by the migration-SQL tests in Task 8.

  test("UsageRecord.count is Int; UsageRecord.kind / refundsRecordId are String", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const ur = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "UsageRecord",
    )
    const findField = (name: string) =>
      ur?.fields.find((f: { name: string }) => f.name === name)
    expect(findField("count")?.type).toBe("Int")
    expect(findField("kind")?.type).toBe("String")
    expect(findField("refundsRecordId")?.type).toBe("String")
  })

  test("refundsRecord and refundedBy are UsageRecord-typed self-relations", async () => {
    // The 'Refunds' named self-relation is verified at the schema level
    // (Prisma generate would fail otherwise) and at the SQL level (Task 8's
    // FK regex). DMMF in Prisma v7 may not expose relationName/isList
    // reliably, so we just assert the field existence + type here.
    const { Prisma } = await import("../generated/prisma/index.js")
    const ur = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "UsageRecord",
    )
    const refundsRecord = ur?.fields.find(
      (f: { name: string }) => f.name === "refundsRecord",
    )
    const refundedBy = ur?.fields.find(
      (f: { name: string }) => f.name === "refundedBy",
    )
    expect(refundsRecord?.type).toBe("UsageRecord")
    expect(refundedBy?.type).toBe("UsageRecord")
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

describe("B29 UsageRecord refund migration SQL", () => {
  const PKG_ROOT = findPackageRoot(import.meta.dir)
  const sql = readFileSync(findB29Migration(PKG_ROOT), "utf8")

  test("adds count column with NOT NULL DEFAULT 1", () => {
    expect(sql).toMatch(
      /ADD COLUMN\s+"count"\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1/,
    )
  })

  test("adds kind column with NOT NULL DEFAULT 'charge'", () => {
    expect(sql).toMatch(
      /ADD COLUMN\s+"kind"\s+TEXT\s+NOT NULL\s+DEFAULT\s+'charge'/,
    )
  })

  test("adds refundsRecordId as nullable TEXT", () => {
    expect(sql).toMatch(/ADD COLUMN\s+"refundsRecordId"\s+TEXT/)
    expect(sql).not.toMatch(/"refundsRecordId"\s+TEXT\s+NOT NULL/)
  })

  test("adds self-referencing FK refundsRecordId → usage_records(id) with ON DELETE RESTRICT", () => {
    expect(sql).toMatch(
      /FOREIGN KEY\s*\(\s*"refundsRecordId"\s*\)\s*REFERENCES\s+"usage_records"\s*\(\s*"id"\s*\)[\s\S]*?ON DELETE RESTRICT/,
    )
  })

  test("creates a composite index on usage_records(userId, kind)", () => {
    expect(sql).toMatch(
      /CREATE INDEX[\s\S]*?ON\s+"usage_records"\s*\(\s*"userId"\s*,\s*"kind"\s*\)/,
    )
  })
})
