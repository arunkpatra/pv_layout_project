import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { ID_PREFIXES } from "../extensions/semantic-id/id-prefixes.js"
import { generateSemanticId } from "../extensions/semantic-id/id-generator.js"

/**
 * B3 — Project model.
 *
 * Asserts the schema additions, the migration SQL, and the semantic-ID
 * prefix registration for the new Project entity. CRUD against the live
 * Prisma client (basic create/read/update/delete) is exercised manually
 * during the row's local verification step; the column-level invariants
 * below are what catches regressions in CI.
 */

function findPackageRoot(start: string): string {
  let dir = start
  while (dir.length > 1) {
    if (existsSync(join(dir, "prisma", "schema.prisma"))) return dir
    dir = dirname(dir)
  }
  throw new Error(`Could not locate mvp_db package root from ${start}`)
}

const PKG_ROOT = findPackageRoot(import.meta.dir)
const MIGRATION_PATH = join(
  PKG_ROOT,
  "prisma",
  "migrations",
  "20260430140000_add_project_model",
  "migration.sql",
)

describe("B3 Project semantic-ID prefix", () => {
  test("ID_PREFIXES registers Project as 'prj'", () => {
    expect(ID_PREFIXES["Project"]).toBe("prj")
  })

  test("generateSemanticId('prj') produces a prj_<base62> id", () => {
    const id = generateSemanticId("prj")
    expect(id.startsWith("prj_")).toBe(true)
    expect(id.length).toBe(40)
    const suffix = id.slice("prj_".length)
    expect(/^[A-Za-z0-9]+$/.test(suffix)).toBe(true)
  })
})

describe("B3 Project migration SQL", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8")

  test("creates a projects table", () => {
    expect(sql).toMatch(/CREATE TABLE\s+"projects"/)
  })

  test("includes id, userId, name, kmzBlobUrl, kmzSha256 columns", () => {
    for (const col of ["id", "userId", "name", "kmzBlobUrl", "kmzSha256"]) {
      expect(sql).toMatch(new RegExp(`"${col}"\\s+TEXT`))
    }
  })

  test("edits column is JSONB with default '{}'", () => {
    expect(sql).toMatch(/"edits"\s+JSONB[\s\S]*?DEFAULT\s+'\{\}'/)
  })

  test("createdAt + updatedAt + deletedAt are timestamps; deletedAt is nullable", () => {
    expect(sql).toMatch(/"createdAt"\s+TIMESTAMP[^,]*NOT NULL/)
    expect(sql).toMatch(/"updatedAt"\s+TIMESTAMP[^,]*NOT NULL/)
    expect(sql).toMatch(/"deletedAt"\s+TIMESTAMP(?:\(3\))?\s*,?\s*$/m)
    expect(sql).not.toMatch(/"deletedAt"\s+TIMESTAMP[^,]*NOT NULL/)
  })

  test("foreign-key from userId to users(id)", () => {
    expect(sql).toMatch(
      /FOREIGN KEY\s*\(\s*"userId"\s*\)\s*REFERENCES\s+"users"\s*\(\s*"id"\s*\)/,
    )
  })

  test("creates index on userId and on deletedAt", () => {
    expect(sql).toMatch(/CREATE INDEX[\s\S]*?"projects"\s*\(\s*"userId"\s*\)/)
    expect(sql).toMatch(
      /CREATE INDEX[\s\S]*?"projects"\s*\(\s*"deletedAt"\s*\)/,
    )
  })
})

describe("B3 Project Prisma DMMF", () => {
  test("generated Project model exposes the expected scalar fields", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const project = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "Project",
    )
    expect(project).toBeDefined()
    const fieldNames = (project?.fields ?? []).map(
      (f: { name: string }) => f.name,
    )
    for (const name of [
      "id",
      "userId",
      "name",
      "kmzBlobUrl",
      "kmzSha256",
      "edits",
      "createdAt",
      "updatedAt",
      "deletedAt",
    ]) {
      expect(fieldNames).toContain(name)
    }
  })

  test("Project.user relation points at User", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const project = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "Project",
    )
    const userRel = project?.fields.find(
      (f: { name: string }) => f.name === "user",
    )
    expect(userRel).toBeDefined()
    expect(userRel?.type).toBe("User")
  })
})
