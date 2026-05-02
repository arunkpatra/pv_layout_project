# B29 Schema Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a single Prisma migration that adds `Run` lifecycle fields (`status`, `cancelledAt`, `failedAt`, `failureReason`) and `UsageRecord` refund fields (`count`, `kind`, `refundsRecordId`) to the mvp_db schema, with safe backfill for all existing rows on local + staging + production.

**Architecture:** Pure additive Prisma schema change in `packages/mvp_db/prisma/schema.prisma`. Migration generated via `prisma migrate dev`, hand-edited to add a `UPDATE runs SET "status" = 'DONE'` backfill so pre-existing Runs end up with the correct terminal state (the column default `'RUNNING'` is the right value for new rows going forward). `UsageRecord.count INTEGER NOT NULL DEFAULT 1` matches the implicit "one row = one calc" semantic of the existing 8 records and supports the `count = -1` refund-row pattern from the B27 memo §B.1. `UsageRecord.kind TEXT NOT NULL DEFAULT 'charge'` lets the legacy `debitInTx` keep inserting without code changes; refund rows in B30/B32 will explicitly set `kind = 'refund'`. Self-referencing FK `UsageRecord.refundsRecordId → usage_records.id` provides the audit link from refund row → original charge.

**Tech Stack:** Prisma 7 + Postgres (RDS) + Bun workspaces + `@solarlayout/mvp-db` package. Tests in `packages/mvp_db/src/tests/` use `bun:test` and follow the B4 pattern (DMMF datamodel assertions + migration SQL regex assertions).

**Spec source:** [`docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md`](../../initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md) (B27 decision memo, locked 2026-05-02). Plan row in [`docs/initiatives/post-parity-v2-backend-plan.md`](../../initiatives/post-parity-v2-backend-plan.md) §B29.

**Scope boundary:** B29 ships **schema + migration only**. It does NOT modify any wire shape (RunWire/RunSummary/RunDetail), endpoint, or service code. Existing `createRunForProject` keeps working unchanged because (a) `Run.status` has DB default `'RUNNING'` and (b) `UsageRecord.kind`/`count` have safe defaults. The runtime behavior changes that consume these new fields land in B30 (cancel endpoint), B31 (sidecar marker check), B32 (failed-runs path), B33 (desktop UI), B34 (dashboard UI).

**Out of scope (explicit):**
- Updating `Entitlement.usedCalculations` decrement on refund (B30/B32 concern).
- Adding a `count` argument to `debitInTx` (debit path keeps using DEFAULT 1).
- Changing wire shapes to surface `status` (B30/B17/B15/B12 work; coordinated with B28).
- Any S3 / blob / sidecar changes.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/mvp_db/prisma/schema.prisma` | Modify | Add 4 fields to `Run`, 3 fields to `UsageRecord`, self-relation for refund link, two `@@index` lines |
| `packages/mvp_db/prisma/migrations/20260502120000_add_run_lifecycle_and_usage_kind/migration.sql` | Create | Single hand-edited migration with column adds + custom UPDATE backfill for `Run.status` |
| `packages/mvp_db/src/tests/run-lifecycle-schema.test.ts` | Create | DMMF + migration-SQL assertions for the new Run fields |
| `packages/mvp_db/src/tests/usage-refund-schema.test.ts` | Create | DMMF + migration-SQL assertions for the new UsageRecord fields |
| `packages/mvp_db/src/generated/prisma/**` | Auto-regenerated | `bun run mvp-db:generate` overwrites — do not hand-edit |

The two new test files mirror the existing `run-schema.test.ts` (B4) split-by-model convention.

---

## Migration Naming

Migration directory: `20260502120000_add_run_lifecycle_and_usage_kind`. The timestamp is `YYYYMMDDhhmmss` per the existing convention (`20260430170000_add_boundary_geojson_to_project` was the previous head). When invoking `prisma migrate dev`, pass `--name add_run_lifecycle_and_usage_kind` so the timestamp is auto-prefixed correctly.

---

## Task 1: Branch setup + baseline gate

**Files:** none (branch + workspace state only)

- [ ] **Step 1: Create the branch from main**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b parity/b29-schema-migration
```

- [ ] **Step 2: Confirm the local DB is at migration HEAD before any changes**

Run from repo root:

```bash
bun run mvp-db:status
```

Expected: `Database schema is up to date!` referencing `20260430170000_add_boundary_geojson_to_project` as the latest applied migration. If the local DB is behind, run `bun run mvp-db:migrate` to catch up before proceeding (no new migration is being created yet — `prisma migrate dev` with no schema diff just applies pending ones).

- [ ] **Step 3: Run the full baseline gate to capture a green starting point**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
cd python/pvlayout_engine && uv run pytest tests/ -q && cd ../..
```

Expected: all green. Sidecar pytest reports `123 passed, 6 skipped` (or whatever the current head is) — capture the exact JS test count too. Note this in your scratch buffer as the regression baseline; if any of these counts move post-migration we want to know why.

---

## Task 2: Write failing DMMF + Prisma-validate test for Run lifecycle fields

**Files:**
- Create: `packages/mvp_db/src/tests/run-lifecycle-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bunx turbo test --filter=@solarlayout/mvp-db
```

Expected: FAIL with `expected ['id', 'projectId', ...] to contain 'status'` (or similar). Reason: the Prisma client at `packages/mvp_db/src/generated/prisma/` was generated from the pre-B29 schema; the new fields are not present yet.

---

## Task 3: Add Run lifecycle fields to schema.prisma + regenerate client

**Files:**
- Modify: `packages/mvp_db/prisma/schema.prisma:203-222` (Run model)

- [ ] **Step 1: Add the four fields + status index to the Run model**

Edit `packages/mvp_db/prisma/schema.prisma` — the `Run` model block (currently lines 203–222). Insert the four new fields after `deletedAt` and add a `@@index([status])` line. The full Run block becomes:

```prisma
model Run {
  id                  String      @id @default("")
  projectId           String
  project             Project     @relation(fields: [projectId], references: [id])
  name                String
  params              Json
  inputsSnapshot      Json
  layoutResultBlobUrl String?
  energyResultBlobUrl String?
  exportsBlobUrls     Json        @default("[]")
  billedFeatureKey    String
  usageRecordId       String      @unique
  usageRecord         UsageRecord @relation(fields: [usageRecordId], references: [id])
  createdAt           DateTime    @default(now())
  deletedAt           DateTime?
  /// Lifecycle state — one of "RUNNING" | "DONE" | "CANCELLED" | "FAILED".
  /// Per refund-on-cancel policy (B27 memo 2026-05-02-002 §A.1):
  ///   RUNNING   = job submitted, sidecar still working
  ///   DONE      = job completed, deliverables published, charge stands
  ///   CANCELLED = user clicked Cancel before DONE; UsageRecord refund row written
  ///   FAILED    = system or user-input error; UsageRecord refund row written
  /// Default 'RUNNING' is the correct value for new rows; the B29 migration
  /// backfills all pre-existing rows to 'DONE' (every persisted Run today
  /// has a result blob → completed).
  status              String      @default("RUNNING")
  /// Set when status transitions to CANCELLED (B30 cancel endpoint).
  cancelledAt         DateTime?
  /// Set when status transitions to FAILED (B32 failed-runs path).
  failedAt            DateTime?
  /// Free-text describing why the run failed. Internal-grade; v1 does
  /// not surface this to the customer (B27 §A.3 — single 'Failed' badge).
  failureReason       String?

  @@index([projectId])
  @@index([deletedAt])
  @@index([status])
  @@map("runs")
}
```

- [ ] **Step 2: Regenerate the Prisma client**

Run from repo root:

```bash
bun run mvp-db:generate
```

Expected: `✔ Generated Prisma Client` with no errors. The generated TypeScript types under `packages/mvp_db/src/generated/prisma/` now include the four new fields on `Run`.

- [ ] **Step 3: Run the test to verify it passes**

Run:

```bash
bunx turbo test --filter=@solarlayout/mvp-db
```

Expected: the three tests in `run-lifecycle-schema.test.ts` PASS. The B4 `run-schema.test.ts` tests still PASS (additive change, no removals). All other mvp_db tests still PASS.

- [ ] **Step 4: Verify no downstream typecheck breakage**

Run:

```bash
bun run mvp-db:generate && bunx turbo build --filter=@solarlayout/mvp-db && bun run typecheck
```

Expected: PASS. `mvp_db` rebuild propagates new types to consumers (`mvp_api`, `mvp_admin`, etc.). Because the additions are purely additive (no field removed, no required field added that consumers must pass), all consuming code still compiles. If anything fails, STOP and surface — that means a consumer is iterating Run fields exhaustively somewhere; investigate before proceeding.

---

## Task 4: Write failing DMMF test for UsageRecord refund fields

**Files:**
- Create: `packages/mvp_db/src/tests/usage-refund-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bunx turbo test --filter=@solarlayout/mvp-db
```

Expected: FAIL on the new file with `expected [...] to contain 'count'`. The Run-lifecycle tests from Task 3 still PASS.

---

## Task 5: Add UsageRecord refund fields to schema.prisma + regenerate

**Files:**
- Modify: `packages/mvp_db/prisma/schema.prisma:135-151` (UsageRecord model)

- [ ] **Step 1: Add the three fields + self-relation + index to UsageRecord**

Edit `packages/mvp_db/prisma/schema.prisma` — the `UsageRecord` model block (currently lines 135–151). Add `count`, `kind`, `refundsRecordId`, the `refundsRecord` relation, and the `refundedBy` back-relation. Add `@@index([userId, kind])` for the dashboard hot path. The full UsageRecord block becomes:

```prisma
model UsageRecord {
  id             String        @id @default("")
  userId         String
  user           User          @relation(fields: [userId], references: [id])
  licenseKeyId   String
  licenseKey     LicenseKey    @relation(fields: [licenseKeyId], references: [id])
  productId      String
  product        Product       @relation(fields: [productId], references: [id])
  featureKey     String
  metadata       Json?
  idempotencyKey String?
  /// Magnitude of this usage event in calc-units. v1 always +1 (charge)
  /// or -1 (refund). Forward-looking: multi-plot may charge >1 per event.
  /// Quota math is SUM(count) over a user's rows in an entitlement window.
  count          Int           @default(1)
  /// Type of usage event. v1: 'charge' | 'refund'. Forward-extensible.
  /// Refund rows hidden from /dashboard/usage; quota math sums all kinds.
  /// See B27 memo §B.1 — refund preserves immutable charge audit trail.
  kind           String        @default("charge")
  /// FK to the original UsageRecord this row refunds. Null for charges.
  /// Self-relation named "Refunds" (Prisma requires named self-relations).
  refundsRecordId String?
  refundsRecord  UsageRecord?  @relation("Refunds", fields: [refundsRecordId], references: [id])
  refundedBy     UsageRecord[] @relation("Refunds")
  createdAt      DateTime      @default(now())
  run            Run?

  @@unique([userId, idempotencyKey])
  @@index([userId, kind])
  @@map("usage_records")
}
```

- [ ] **Step 2: Regenerate the Prisma client**

Run:

```bash
bun run mvp-db:generate
```

Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 3: Run the test to verify it passes**

Run:

```bash
bunx turbo test --filter=@solarlayout/mvp-db
```

Expected: all four `usage-refund-schema.test.ts` tests PASS. All previous tests still PASS.

- [ ] **Step 4: Verify no downstream typecheck breakage**

Run:

```bash
bunx turbo build --filter=@solarlayout/mvp-db && bun run typecheck
```

Expected: PASS across the monorepo. Existing call sites of `usageRecord.create({ data: { userId, licenseKeyId, productId, featureKey, ... } })` still compile because all three new columns have DB defaults — Prisma's type for `data` makes them optional. Verify in particular: `apps/mvp_api/src/modules/usage/usage.service.ts:123` (debitInTx call) and `apps/mvp_api/src/modules/runs/runs.service.ts:243` (create-run transaction) — both omit the new fields and that must remain valid.

---

## Task 6: Generate migration via prisma migrate dev

**Files:**
- Create: `packages/mvp_db/prisma/migrations/<TIMESTAMP>_add_run_lifecycle_and_usage_kind/migration.sql`

- [ ] **Step 1: Run prisma migrate dev with the canonical name**

```bash
cd packages/mvp_db
bunx prisma migrate dev --name add_run_lifecycle_and_usage_kind
cd ../..
```

Expected: Prisma reports `Applied migration <TIMESTAMP>_add_run_lifecycle_and_usage_kind` and the new migration directory appears under `packages/mvp_db/prisma/migrations/`. The local DB now has the new columns. The `<TIMESTAMP>` will be the current `YYYYMMDDhhmmss` (e.g., `20260502143012`) — that's fine and matches the existing convention.

- [ ] **Step 2: Inspect the auto-generated SQL**

Read the newly-created `migration.sql`. It will contain something like:

```sql
-- AlterTable
ALTER TABLE "runs" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RUNNING',
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "failureReason" TEXT;

-- AlterTable
ALTER TABLE "usage_records" ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'charge',
ADD COLUMN "refundsRecordId" TEXT;

-- CreateIndex
CREATE INDEX "runs_status_idx" ON "runs"("status");

-- CreateIndex
CREATE INDEX "usage_records_userId_kind_idx" ON "usage_records"("userId", "kind");

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_refundsRecordId_fkey" FOREIGN KEY ("refundsRecordId") REFERENCES "usage_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

The exact column ordering and FK ON DELETE policy may vary slightly. Confirm the structure matches; flag any surprises (e.g., Prisma defaulting to `ON DELETE SET NULL` instead of RESTRICT — we want **RESTRICT** for the audit-trail FK, see Step 3).

---

## Task 7: Hand-edit migration to add backfill UPDATE + verify FK policy

**Files:**
- Modify: the `migration.sql` from Task 6

- [ ] **Step 1: Append the Run.status backfill UPDATE to migration.sql**

After the `ALTER TABLE "runs" ADD COLUMN ...` block, add a backfill UPDATE so existing Runs (all of which are completed today) end up with `status = 'DONE'` rather than the column default `'RUNNING'`. The final state of `migration.sql` should be:

```sql
-- AlterTable
ALTER TABLE "runs" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RUNNING',
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "failureReason" TEXT;

-- Backfill: every persisted Run today has a result blob → completed.
-- New rows going forward use the column default 'RUNNING'.
-- Source: B27 memo 2026-05-02-002 §A.1 (refund-on-cancel policy).
UPDATE "runs" SET "status" = 'DONE';

-- AlterTable
ALTER TABLE "usage_records" ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'charge',
ADD COLUMN "refundsRecordId" TEXT;

-- CreateIndex
CREATE INDEX "runs_status_idx" ON "runs"("status");

-- CreateIndex
CREATE INDEX "usage_records_userId_kind_idx" ON "usage_records"("userId", "kind");

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_refundsRecordId_fkey" FOREIGN KEY ("refundsRecordId") REFERENCES "usage_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

UsageRecord rows do NOT need a backfill — every existing row is a charge, and the column default `'charge'` already covers them. `count` defaults to 1 which matches the implicit "one row = one calc" pre-B29 semantic.

- [ ] **Step 2: Verify FK ON DELETE policy is RESTRICT**

Confirm the `usage_records_refundsRecordId_fkey` line ends with `ON DELETE RESTRICT ON UPDATE CASCADE`. If Prisma generated `ON DELETE SET NULL` instead, change it to `RESTRICT`. Reason: the original charge row is the audit anchor for its refund — deleting it should not be possible while a refund row references it (RESTRICT enforces that). This matches the existing pattern (e.g., `runs_usageRecordId_fkey` is `ON DELETE RESTRICT` in `20260430150000_add_run_model/migration.sql:21`).

- [ ] **Step 3: Reset the local DB and re-apply to verify the hand-edit applies cleanly**

```bash
cd packages/mvp_db
bunx prisma migrate reset --force
cd ../..
```

Expected: all migrations re-applied from scratch including the new B29 migration with the hand-edited backfill. The local DB is wiped to empty + re-migrated. (`--force` skips the interactive confirm; safe locally because the local DB has no production data.)

- [ ] **Step 4: Verify backfill semantics on a hand-seeded row**

Open a psql session against the local DB:

```bash
PGPASSWORD=mvp psql -h localhost -p 5433 -U mvp -d mvp_db -c "
INSERT INTO users (id, \"clerkId\", email, status) VALUES ('usr_b29test', 'clerk_b29', 'b29@test.com', 'ACTIVE');
INSERT INTO license_keys (id, key, \"userId\") VALUES ('lk_b29test', 'sl_test_b29', 'usr_b29test');
INSERT INTO products (id, slug, name, description, \"priceAmount\", calculations, \"stripePriceId\")
  VALUES ('prod_b29', 'prod-b29', 'B29Test', 'B29 test', 0, 1, 'price_b29');
INSERT INTO usage_records (id, \"userId\", \"licenseKeyId\", \"productId\", \"featureKey\")
  VALUES ('ur_b29test', 'usr_b29test', 'lk_b29test', 'prod_b29', 'plant_layout');
SELECT id, \"count\", kind, \"refundsRecordId\" FROM usage_records WHERE id = 'ur_b29test';
"
```

Expected output: one row showing `count=1`, `kind=charge`, `refundsRecordId=NULL`. Confirms defaults apply on insert when the new fields are omitted.

- [ ] **Step 5: Verify Run.status default is 'RUNNING' for new rows after the backfill**

Continue in psql:

```bash
PGPASSWORD=mvp psql -h localhost -p 5433 -U mvp -d mvp_db -c "
INSERT INTO projects (id, \"userId\", name, \"kmzBlobUrl\", \"kmzSha256\")
  VALUES ('proj_b29test', 'usr_b29test', 'B29Test', 's3://test/b29.kmz', 'deadbeef');
INSERT INTO runs (id, \"projectId\", name, params, \"inputsSnapshot\", \"billedFeatureKey\", \"usageRecordId\")
  VALUES ('run_b29test', 'proj_b29test', 'B29Test run', '{}', '{}', 'plant_layout', 'ur_b29test');
SELECT id, status, \"cancelledAt\", \"failedAt\", \"failureReason\" FROM runs WHERE id = 'run_b29test';
"
```

Expected output: `status=RUNNING`, all three nullable columns NULL. Confirms new Runs default to the in-flight state.

- [ ] **Step 6: Clean up the test rows**

```bash
PGPASSWORD=mvp psql -h localhost -p 5433 -U mvp -d mvp_db -c "
DELETE FROM runs WHERE id = 'run_b29test';
DELETE FROM projects WHERE id = 'proj_b29test';
DELETE FROM usage_records WHERE id = 'ur_b29test';
DELETE FROM license_keys WHERE id = 'lk_b29test';
DELETE FROM products WHERE id = 'prod_b29';
DELETE FROM users WHERE id = 'usr_b29test';
"
```

---

## Task 8: Add migration-SQL regex tests

**Files:**
- Modify: `packages/mvp_db/src/tests/run-lifecycle-schema.test.ts` (add a new `describe` block)
- Modify: `packages/mvp_db/src/tests/usage-refund-schema.test.ts` (add a new `describe` block)

These tests pin the migration SQL shape so a future `prisma migrate dev` regeneration can't silently drift (e.g., Prisma changing default-value formatting or column ordering). Pattern matches `run-schema.test.ts:49-108`.

- [ ] **Step 1: Add migration-SQL test block to run-lifecycle-schema.test.ts**

Append this to `packages/mvp_db/src/tests/run-lifecycle-schema.test.ts`. The `findB29Migration` helper resolves the directory by suffix at test-time, so no manual `<TIMESTAMP>` substitution is needed in the test code:

```ts
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
```

- [ ] **Step 2: Add migration-SQL test block to usage-refund-schema.test.ts**

Append to `packages/mvp_db/src/tests/usage-refund-schema.test.ts` (re-use the same `findPackageRoot` + `findB29Migration` helpers — copy them into this file too so each test file is self-contained):

```ts
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
```

- [ ] **Step 3: Run all mvp_db tests to verify everything is green**

```bash
bunx turbo test --filter=@solarlayout/mvp-db
```

Expected: ALL tests PASS — the four pre-existing schema tests (B4 etc.), the four new DMMF tests (Tasks 2 + 4), and the ten new migration-SQL tests (Task 8).

---

## Task 9: Run the full monorepo gate

**Files:** none (CI parity check)

- [ ] **Step 1: Run all four JS gates from the repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all PASS. `@solarlayout/mvp-db` test count grows by **+30** vs the Task-1 baseline. Source tests added: 2 Run-DMMF + 3 UsageRecord-DMMF + 5 Run-SQL + 5 UsageRecord-SQL = 15. The mvp_db package's tsconfig includes `src/` in the build output, so each source test file is compiled into `dist/src/tests/` and `bun test` picks up both copies → counts double. Baseline 76 → expected 106 mvp-db tests. If the count moves anywhere else (e.g., a snapshot test in `mvp_api` shifts), STOP and investigate.

- [ ] **Step 2: Run the sidecar pytest gate**

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q && cd ../..
```

Expected: same count as the Task 1 baseline (`123 passed, 6 skipped` or current head). The sidecar doesn't touch mvp_db so this should be a no-op verification — but skipping it leaves a blind spot, so we run it.

- [ ] **Step 3: Verify migration status against the local DB**

```bash
bun run mvp-db:status
```

Expected: `Database schema is up to date!` referencing the new `*_add_run_lifecycle_and_usage_kind` migration as the latest.

---

## Task 10: Apply migration to staging — STOP for user approval first

**Files:** none (DB deploy)

⚠️ **GATE:** Before running this task, surface the plan summary to the user and get explicit approval. Migration deploys are not strictly destructive (additive change with safe defaults + small backfill UPDATE), but they affect a shared environment that other developers / staging-tier customers may be using. The user should know: *"about to deploy the B29 migration to staging, ETA <1 second, no destructive operations, will be followed by a one-shot SELECT to verify backfill."* Wait for go.

- [ ] **Step 1: Apply the migration to staging via prisma migrate deploy**

```bash
set -a; . ./.env.staging; set +a; bunx prisma migrate deploy --schema=packages/mvp_db/prisma/schema.prisma
```

Expected: `1 migration found in prisma/migrations` followed by `Applying migration <TIMESTAMP>_add_run_lifecycle_and_usage_kind` and `All migrations have been successfully applied.`

- [ ] **Step 2: Verify staging is at HEAD**

```bash
set -a; . ./.env.staging; set +a; bunx prisma migrate status --schema=packages/mvp_db/prisma/schema.prisma
```

Expected: `Database schema is up to date!`

- [ ] **Step 3: Verify backfill on staging — every existing Run has status='DONE'**

```bash
set -a; . ./.env.staging; set +a; \
psql "$MVP_DATABASE_URL" -c "
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'DONE') AS done_count,
  COUNT(*) FILTER (WHERE status = 'RUNNING') AS running_count
FROM runs;
"
```

Expected: `total = done_count`, `running_count = 0`. Every persisted Run pre-B29 was a completed run, so the backfill UPDATE should have flipped them all. If `running_count > 0` STOP — that means we missed the UPDATE in the migration; investigate before proceeding to prod.

- [ ] **Step 4: Verify backfill on staging — every existing UsageRecord has kind='charge', count=1**

```bash
set -a; . ./.env.staging; set +a; \
psql "$MVP_DATABASE_URL" -c "
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE kind = 'charge') AS charge_count,
  COUNT(*) FILTER (WHERE \"count\" = 1) AS count_one,
  COUNT(*) FILTER (WHERE \"refundsRecordId\" IS NULL) AS no_refund_link
FROM usage_records;
"
```

Expected: all four counts equal `total`. Every existing usage_records row is a single-calc charge with no refund linkage — DB column defaults handled the backfill automatically.

---

## Task 11: Apply migration to production — STOP for user approval first

**Files:** none (DB deploy)

⚠️ **GATE:** Production deploy. **Get explicit user approval again, separately from the staging gate.** This is the production database. The change is additive + backfill-safe, but the user must say "go to prod" before this runs. Surface: *"staging migration applied + backfill verified ✅; ready to apply same migration to production. Same migration file, same SQL, same ~1-second timeline."*

- [ ] **Step 1: Apply the migration to production**

```bash
set -a; . ./.env.production; set +a; bunx prisma migrate deploy --schema=packages/mvp_db/prisma/schema.prisma
```

Expected: same output as Task 10 Step 1 — `Applying migration ...`, `All migrations have been successfully applied.`

- [ ] **Step 2: Verify prod is at HEAD**

```bash
set -a; . ./.env.production; set +a; bunx prisma migrate status --schema=packages/mvp_db/prisma/schema.prisma
```

Expected: `Database schema is up to date!`

- [ ] **Step 3: Verify backfill on production — runs**

```bash
set -a; . ./.env.production; set +a; \
psql "$MVP_DATABASE_URL" -c "
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'DONE') AS done_count,
  COUNT(*) FILTER (WHERE status = 'RUNNING') AS running_count
FROM runs;
"
```

Expected: `total = done_count`, `running_count = 0`.

- [ ] **Step 4: Verify backfill on production — usage_records**

```bash
set -a; . ./.env.production; set +a; \
psql "$MVP_DATABASE_URL" -c "
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE kind = 'charge') AS charge_count,
  COUNT(*) FILTER (WHERE \"count\" = 1) AS count_one,
  COUNT(*) FILTER (WHERE \"refundsRecordId\" IS NULL) AS no_refund_link
FROM usage_records;
"
```

Expected: all four counts equal `total`.

---

## Task 12: Update backend plan + commit + push

**Files:**
- Modify: `docs/initiatives/post-parity-v2-backend-plan.md` (B29 row → done)

- [ ] **Step 1: Mark B29 row done in the backend plan**

Edit the B29 row's Status column in `docs/initiatives/post-parity-v2-backend-plan.md` from `**todo**` to `**done**`. Also bump any "X of Y done" counter in the file's header if one exists. Acceptance text already says *"Schema migration applied; backfill verified; existing test fixtures pass with new schema"* — no further edits needed beyond the status flip.

- [ ] **Step 2: Stage all changes**

```bash
git status
git diff --stat
```

Expected files modified or created (all inside `git ls-files` — the generated Prisma client at `packages/mvp_db/src/generated/` and the built output at `packages/mvp_db/dist/` are gitignored and NOT committed; consumers regenerate them on `bun install`):
- `packages/mvp_db/prisma/schema.prisma` (modified)
- `packages/mvp_db/prisma/migrations/<TIMESTAMP>_add_run_lifecycle_and_usage_kind/migration.sql` (new)
- `packages/mvp_db/src/tests/run-lifecycle-schema.test.ts` (new)
- `packages/mvp_db/src/tests/usage-refund-schema.test.ts` (new)
- `docs/initiatives/post-parity-v2-backend-plan.md` (modified)

- [ ] **Step 3: Create the atomic commit**

```bash
git add packages/mvp_db/prisma/schema.prisma \
        packages/mvp_db/prisma/migrations \
        packages/mvp_db/src/tests/run-lifecycle-schema.test.ts \
        packages/mvp_db/src/tests/usage-refund-schema.test.ts \
        docs/initiatives/post-parity-v2-backend-plan.md

git commit -m "$(cat <<'EOF'
feat(mvp-db): B29 — Run lifecycle + UsageRecord refund schema

Adds the persistence model for the refund-on-cancel policy locked in B27
(decision memo 2026-05-02-002). Pure additive Prisma migration covering:

- Run.status TEXT NOT NULL DEFAULT 'RUNNING' (RUNNING|DONE|CANCELLED|FAILED)
- Run.cancelledAt / failedAt / failureReason — nullable lifecycle metadata
- UsageRecord.count INTEGER DEFAULT 1 — supports refund row count = -1
- UsageRecord.kind TEXT DEFAULT 'charge' — extensible event-type column
- UsageRecord.refundsRecordId — self-FK to original charge (audit trail,
  ON DELETE RESTRICT)
- Indexes on runs(status), usage_records(userId, kind)

Backfill: existing Runs flipped to status='DONE' via migration UPDATE
(every persisted Run today has a result blob → completed). UsageRecord
backfill via column defaults (every row is a single-calc charge).

Migration applied to local + staging + production with zero data
divergence. B30/B31/B32 will start consuming these fields.

Spec: docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md
Plan: docs/superpowers/plans/2026-05-02-b29-schema-migration.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push to origin**

```bash
git push -u origin parity/b29-schema-migration
```

- [ ] **Step 5: Confirm clean tree + remote-tracking state**

```bash
git status
git log --oneline -3
```

Expected: clean tree, branch ahead of `origin/main` by exactly 1 commit (the B29 commit), branch tracking `origin/parity/b29-schema-migration`.

---

## Task 13: Hand off to next row

- [ ] **Step 1: Surface what's now unblocked**

Summarize for the user:
- **B29 done.** Schema migration shipped to local + staging + prod.
- **B30 unblocked** — cancel endpoint can now write `Run.status = 'CANCELLED'` + insert refund UsageRecord row.
- **B32 unblocked** — failed-runs path can now write `Run.status = 'FAILED'`.
- **B31 unblocked once B30 lands** — sidecar marker check needs both schema + cancel endpoint.
- **B33 / B34 unblocked once B30 lands** — frontend + dashboard need the cancel endpoint to call.
- Suggest next row: **B30 (cancel endpoint)** since B33/B34 chain off it. Offer `superpowers:writing-plans` for B30.

The CLAUDE.md non-negotiable applies: do not start the next row's planning without explicit user "go."

---

## Risks + Watch-Items

- **Prisma client regeneration on deployed services.** `prisma migrate deploy` does NOT regenerate the client — only `prisma generate` does. `packages/mvp_db/src/generated/` is gitignored, so deployed services must run `bun run mvp-db:generate` (or rely on Vercel's build step doing it via the `@solarlayout/mvp-db#build` task chain) before they pick up the new types. Verify Vercel deploys for `mvp_api` / `mvp_admin` / `mvp_web` succeed post-migration; if any service still references the old client shape, force a redeploy.
- **`dist/` regeneration.** `mvp_db`'s build output is gitignored per the existing repo convention. The compiled-dist + NodeNext pattern (CLAUDE.md §11) means consumers depend on the BUILT output, but the build runs as part of `turbo build` on every deploy — no manual coordination needed beyond making sure the build pipeline runs on whatever environment consumes the package.
- **Concurrent migrations from another developer.** Unlikely (small team) but if a teammate has a competing `prisma migrate dev` in flight, the timestamp ordering could conflict. Coordinate before pushing — `git pull --rebase` at the start of Task 12 catches it.
- **Self-referencing FK + Prisma generation.** Prisma 7 fully supports self-relations with explicit `@relation("name")` syntax. If `prisma generate` complains about missing inverse relation, add `refundedBy UsageRecord[] @relation("Refunds")` (already in the Task 5 schema block).
- **Backfill UPDATE running on a large prod table.** Today the prod `runs` table has on the order of dozens of rows (post-merge clean state); `UPDATE runs SET "status" = 'DONE'` is sub-second. If this plan is rerun later when the table has grown to millions of rows, consider chunking the UPDATE — but that's a future re-baseline concern, not a Task-7 concern today.

---

## Self-Review Checklist (run by the executor before handoff)

- [ ] All 13 tasks marked complete.
- [ ] No `TODO` / `TBD` / placeholder strings in the migration SQL.
- [ ] Migration applies cleanly via `prisma migrate reset` on a fresh local DB.
- [ ] Staging + prod backfill query results: 100% `status='DONE'` on existing runs, 100% `kind='charge'` + `count=1` on existing usage_records.
- [ ] All consumers (mvp_api, mvp_admin) typecheck and test green with no code changes — confirms the migration is purely additive.
- [ ] B27 memo §B.1, §A.1, §A.3 (the persistence claims) all map to a concrete column added by this plan.
- [ ] Single atomic commit pushed; B29 row marked done in the backend plan.
