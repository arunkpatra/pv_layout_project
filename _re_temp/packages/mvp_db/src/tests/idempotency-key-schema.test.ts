import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

/**
 * Asserts that the B2 migration adds the idempotencyKey columns and the
 * unique index that protects usage_records against duplicate reports.
 *
 * The runtime / route-level idempotency test (two concurrent reportUsage
 * calls with the same key returning the same response) lives with B9 in
 * apps/mvp_api/src/modules/usage/, where the new V2 route is implemented.
 */

function findPackageRoot(start: string): string {
  let dir = start
  while (dir.length > 1) {
    if (existsSync(join(dir, "prisma", "schema.prisma"))) return dir
    dir = dirname(dir)
  }
  throw new Error(`Could not locate mvp_db package root from ${start}`)
}

const MIGRATION_PATH = join(
  findPackageRoot(import.meta.dir),
  "prisma",
  "migrations",
  "20260430130000_add_idempotency_key",
  "migration.sql",
)

describe("B2 idempotencyKey migration", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8")

  test("adds idempotencyKey column to usage_records (nullable)", () => {
    expect(sql).toMatch(
      /ALTER TABLE "usage_records"[\s\S]*?ADD COLUMN[\s\S]*?"idempotencyKey"\s+TEXT\b/,
    )
    // Must be nullable (not NOT NULL) so existing rows back-fill cleanly.
    expect(sql).not.toMatch(
      /ADD COLUMN\s+"idempotencyKey"\s+TEXT[^;]*NOT NULL/i,
    )
  })

  test("adds idempotencyKey column to checkout_sessions (nullable)", () => {
    expect(sql).toMatch(
      /ALTER TABLE "checkout_sessions"[\s\S]*?ADD COLUMN[\s\S]*?"idempotencyKey"\s+TEXT\b/,
    )
  })

  test("creates a unique index on usage_records (userId, idempotencyKey)", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*?ON\s+"usage_records"\s*\(\s*"userId"\s*,\s*"idempotencyKey"\s*\)/,
    )
  })
})

describe("B2 idempotencyKey Prisma client types", () => {
  test("generated UsageRecord includes a String idempotencyKey field", async () => {
    // Confirms the regenerated Prisma client knows about the field.
    // Nullability is asserted via the migration SQL test above
    // (Postgres column TEXT without NOT NULL = nullable).
    const { Prisma } = await import("../generated/prisma/index.js")
    const usageRecord = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "UsageRecord",
    )
    expect(usageRecord).toBeDefined()
    const field = usageRecord?.fields.find(
      (f: { name: string }) => f.name === "idempotencyKey",
    )
    expect(field).toBeDefined()
    expect(field?.type).toBe("String")
  })

  test("generated CheckoutSession includes a String idempotencyKey field", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const checkoutSession = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "CheckoutSession",
    )
    expect(checkoutSession).toBeDefined()
    const field = checkoutSession?.fields.find(
      (f: { name: string }) => f.name === "idempotencyKey",
    )
    expect(field).toBeDefined()
    expect(field?.type).toBe("String")
  })
})
