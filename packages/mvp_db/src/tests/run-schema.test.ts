import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { ID_PREFIXES } from "../extensions/semantic-id/id-prefixes.js"
import { generateSemanticId } from "../extensions/semantic-id/id-generator.js"

/**
 * B4 — Run model.
 *
 * Each "Generate Layout" click on the desktop is one Run row + one calc
 * debit (UsageRecord). Run.usageRecordId is the audit link back to the
 * debit so a deleted run cannot orphan or hide the billed unit. Cascade
 * soft-delete from Project is application-level (B14); DB FK stays
 * RESTRICT to defend against accidental hard deletes.
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
  "20260430150000_add_run_model",
  "migration.sql",
)

describe("B4 Run semantic-ID prefix", () => {
  test("ID_PREFIXES registers Run as 'run'", () => {
    expect(ID_PREFIXES["Run"]).toBe("run")
  })

  test("generateSemanticId('run') produces a run_<base62> id", () => {
    const id = generateSemanticId("run")
    expect(id.startsWith("run_")).toBe(true)
    expect(id.length).toBe(40)
    const suffix = id.slice("run_".length)
    expect(/^[A-Za-z0-9]+$/.test(suffix)).toBe(true)
  })
})

describe("B4 Run migration SQL", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8")

  test("creates a runs table", () => {
    expect(sql).toMatch(/CREATE TABLE\s+"runs"/)
  })

  test("includes scalar columns id, projectId, name, billedFeatureKey, usageRecordId", () => {
    for (const col of [
      "id",
      "projectId",
      "name",
      "billedFeatureKey",
      "usageRecordId",
    ]) {
      expect(sql).toMatch(new RegExp(`"${col}"\\s+TEXT[\\s\\S]*?NOT NULL`))
    }
  })

  test("params and inputsSnapshot are JSONB NOT NULL (no default)", () => {
    expect(sql).toMatch(/"params"\s+JSONB[\s\S]*?NOT NULL/)
    expect(sql).toMatch(/"inputsSnapshot"\s+JSONB[\s\S]*?NOT NULL/)
  })

  test("exportsBlobUrls is JSONB NOT NULL with default '[]'", () => {
    expect(sql).toMatch(/"exportsBlobUrls"\s+JSONB[\s\S]*?DEFAULT\s+'\[\]'/)
  })

  test("layoutResultBlobUrl + energyResultBlobUrl are nullable TEXT", () => {
    expect(sql).toMatch(/"layoutResultBlobUrl"\s+TEXT\s*,/)
    expect(sql).toMatch(/"energyResultBlobUrl"\s+TEXT\s*,/)
    expect(sql).not.toMatch(/"layoutResultBlobUrl"\s+TEXT[^,]*NOT NULL/)
    expect(sql).not.toMatch(/"energyResultBlobUrl"\s+TEXT[^,]*NOT NULL/)
  })

  test("createdAt is NOT NULL with CURRENT_TIMESTAMP default; deletedAt nullable", () => {
    expect(sql).toMatch(/"createdAt"\s+TIMESTAMP[\s\S]*?NOT NULL[\s\S]*?DEFAULT/)
    expect(sql).toMatch(/"deletedAt"\s+TIMESTAMP(?:\(3\))?\s*,?\s*$/m)
    expect(sql).not.toMatch(/"deletedAt"\s+TIMESTAMP[^,]*NOT NULL/)
  })

  test("foreign-keys: projectId → projects(id), usageRecordId → usage_records(id)", () => {
    expect(sql).toMatch(
      /FOREIGN KEY\s*\(\s*"projectId"\s*\)\s*REFERENCES\s+"projects"\s*\(\s*"id"\s*\)/,
    )
    expect(sql).toMatch(
      /FOREIGN KEY\s*\(\s*"usageRecordId"\s*\)\s*REFERENCES\s+"usage_records"\s*\(\s*"id"\s*\)/,
    )
  })

  test("usageRecordId has a unique index (1:1 with UsageRecord)", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*?ON\s+"runs"\s*\(\s*"usageRecordId"\s*\)/,
    )
  })

  test("indexes on projectId and deletedAt", () => {
    expect(sql).toMatch(/CREATE INDEX[\s\S]*?"runs"\s*\(\s*"projectId"\s*\)/)
    expect(sql).toMatch(/CREATE INDEX[\s\S]*?"runs"\s*\(\s*"deletedAt"\s*\)/)
  })
})

describe("B4 Run Prisma DMMF", () => {
  test("generated Run model exposes the expected scalar fields", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const run = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "Run",
    )
    expect(run).toBeDefined()
    const fieldNames = (run?.fields ?? []).map(
      (f: { name: string }) => f.name,
    )
    for (const name of [
      "id",
      "projectId",
      "name",
      "params",
      "inputsSnapshot",
      "layoutResultBlobUrl",
      "energyResultBlobUrl",
      "exportsBlobUrls",
      "billedFeatureKey",
      "usageRecordId",
      "createdAt",
      "deletedAt",
    ]) {
      expect(fieldNames).toContain(name)
    }
  })

  test("Run.project relation points at Project, Run.usageRecord at UsageRecord", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const run = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "Run",
    )
    const projectRel = run?.fields.find(
      (f: { name: string }) => f.name === "project",
    )
    const usageRel = run?.fields.find(
      (f: { name: string }) => f.name === "usageRecord",
    )
    expect(projectRel?.type).toBe("Project")
    expect(usageRel?.type).toBe("UsageRecord")
  })

  test("Project gains a runs back-relation; UsageRecord gains a run back-relation", async () => {
    const { Prisma } = await import("../generated/prisma/index.js")
    const project = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "Project",
    )
    const usage = Prisma.dmmf.datamodel.models.find(
      (m: { name: string }) => m.name === "UsageRecord",
    )
    const projectRuns = project?.fields.find(
      (f: { name: string }) => f.name === "runs",
    )
    const usageRun = usage?.fields.find(
      (f: { name: string }) => f.name === "run",
    )
    expect(projectRuns?.type).toBe("Run")
    expect(usageRun?.type).toBe("Run")
  })
})
