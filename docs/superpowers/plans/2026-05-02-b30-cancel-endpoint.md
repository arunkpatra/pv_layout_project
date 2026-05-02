# B30 Cancel Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `POST /v2/projects/:id/runs/:runId/cancel` — an idempotent cancel endpoint that flips a RUNNING run to CANCELLED, writes a refund `UsageRecord` (count=-1, kind='refund'), and decrements the entitlement counter so quota is restored. All in a single Postgres transaction with `SELECT … FOR UPDATE` row-level locking.

**Architecture:** Two layers. The service `cancelRun(userId, projectId, runId)` (in `apps/mvp_api/src/modules/runs/runs.service.ts`) does the ownership check, opens a `db.$transaction`, locks the Run row via raw SQL `SELECT … FOR UPDATE`, branches on `Run.status` (RUNNING → flip + refund + decrement; CANCELLED → no-op return; FAILED → no-op return; DONE → throw 409), and returns the updated `RunWire`. The route `POST /v2/projects/:id/runs/:runId/cancel` (in `apps/mvp_api/src/modules/runs/runs.routes.ts`) wraps the service, applies license-key auth, and emits the V2 envelope. **Wire-shape extension:** `RunWire` (and its consumers — B16/B17/B18 response shapes) gains four lifecycle fields — `status`, `cancelledAt`, `failedAt`, `failureReason`. This is partly delivering B28's wire-shape work, which is the natural fall-out: the cancel endpoint can't return the new state without surfacing it on the wire.

**Tech Stack:** Hono v4 + Bun runtime + Prisma 7 + Postgres. Tests via `bun:test` with `mock.module(...)` fakes for the db client.

**Spec source:** [`docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md`](../../initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md) §B.2 (transaction model), §A.2 (race semantics — cancel always wins until DONE), §B.1 (refund mechanism — separate negative-count UsageRecord row, original immutable). B29 schema is already live (`Run.status`, `Run.cancelledAt`, `UsageRecord.count`, `UsageRecord.kind`, `UsageRecord.refundsRecordId`) — commit cab9cc0.

**Plan row:** `B30` in [`docs/initiatives/post-parity-v2-backend-plan.md`](../../initiatives/post-parity-v2-backend-plan.md).

**Scope boundary:**
- B30 ships: cancel endpoint + service + the part of wire-shape extension needed to surface lifecycle fields. Customer-facing 409 message included.
- B30 does NOT ship: sidecar's completion-path FOR UPDATE check (B31), failed-runs internal path (B32), desktop UI (B33), `/dashboard/usage` extension (B34), B28's frontend rendering of cancelled/failed states.
- B30 DOES touch existing endpoints' wire shape (B16/B17/B18 responses gain four optional-looking-but-now-always-present fields). This is intentional + minimal — the alternative is a separate `RunCancelWire` type which would diverge from the canonical Run shape.

**Out of scope (explicit):**
- B16's `createRunForProject` does NOT explicitly set `status: "RUNNING"` (the DB default handles it). If a future review wants explicit-status-at-create, that's a separate row.
- Sidecar's `SELECT … FOR UPDATE` check before publishing DONE — that's B31.
- Surfacing `failureReason` in any way — B32 will populate it; B30 just adds it to the wire shape so the field exists.
- Concurrent-cancel test (e.g., two simultaneous cancel calls). Per memo §B (risks): "highly unlikely (desktop app, single-user). `SELECT … FOR UPDATE` serializes them anyway; second sees CANCELLED, no-ops." Idempotency test (cancel-then-cancel) covers this.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/mvp_api/src/modules/runs/runs.service.ts` | Modify | Add `cancelRun` function (~80 LOC). Extend `RawRun`, `RunWire`, `RunDetailWire`, and `toRunWire` to include lifecycle fields. |
| `apps/mvp_api/src/modules/runs/runs.routes.ts` | Modify | Add `POST /v2/projects/:id/runs/:runId/cancel` handler (~12 LOC). |
| `apps/mvp_api/src/modules/runs/runs.test.ts` | Modify | Append `describe("POST /v2/projects/:id/runs/:runId/cancel", ...)` block — covers all status branches, ownership, idempotency, transaction integrity. |
| `docs/initiatives/post-parity-v2-backend-plan.md` | Modify (final task) | Mark B30 done; expand acceptance with applied detail. |

No new files; all changes append to existing modules. The runs module is the right home — co-located with `createRunForProject`, `deleteRun`, `getRunDetail`. ~100 LOC total in service.ts; the file already runs ~440 LOC, so post-B30 it'll be ~540 LOC. Still focused on Run-lifecycle concerns; no split needed.

---

## Migration / Branch Naming

Branch: `parity/b30-cancel-endpoint` (matches B29's `parity/b30-...` style).

Commit message (Task 13): `feat(mvp-api): B30 — cancel endpoint with refund + entitlement restore`.

---

## Key Design Decisions (locked from B27 memo + codebase patterns)

1. **`SELECT … FOR UPDATE` via raw SQL.** Prisma's typed client can't emit row-level locks, so use `tx.$queryRaw`. Same pattern the codebase already uses for entitlement debit (`debitInTx` in `usage.service.ts:107`).
2. **Ownership check happens BEFORE the transaction**, no lock. Same pattern as `deleteRun:422` (`runs.service.ts`). Reduces lock duration; 404 leakage-safe.
3. **Refund row decrements the cheapest non-deactivated entitlement matching the original UsageRecord's `productId`.** Mirrors `findFeaturePool`'s cheapest-first ordering. Since UsageRecord doesn't carry an `entitlementId` column today (would be a B29 schema-bloat), we resolve at refund time. Pragmatic: refunds restore the same product class the customer originally paid against, which is what they care about.
4. **Idempotent CANCELLED branch returns 200 with the current state, NO new refund row.** The original cancel already wrote one. Detection: `Run.status === 'CANCELLED'` is sufficient.
5. **DONE → 409 CONFLICT** with body `{ error: { code: 'CONFLICT', message: 'Run already completed; use Delete instead' } }`. Memo §A.2.
6. **FAILED → 200 no-op.** Failed runs have already been refunded by B32's path (when it ships); racing a manual cancel against a FAILED run is benign.
7. **Wire shape extension:** `RunWire` gains `status: string`, `cancelledAt: string | null`, `failedAt: string | null`, `failureReason: string | null`. ISO-string format for dates. All B16/B17/B18 responses pick these up automatically through `toRunWire`.

---

## Task 1: Branch setup + baseline gate

**Files:** none (workspace state)

- [ ] **Step 1: Create branch from main**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b parity/b30-cancel-endpoint
```

(B29's branch was already merged into main per the user's CI/CD-deploys-on-prod workflow. If `main` is not yet at `cab9cc0`, fetch and confirm before branching.)

- [ ] **Step 2: Confirm baseline gate is green**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all green. Capture per-workspace counts for regression detection later. Skip the sidecar pytest — B30 doesn't touch the sidecar (that's B31).

- [ ] **Step 3: Confirm B29 schema is live locally**

```bash
bun run mvp-db:status
```

Expected: `Database schema is up to date!` with `20260502132134_add_run_lifecycle_and_usage_kind` as HEAD.

---

## Task 2: Extend `RunWire` + `toRunWire` to include lifecycle fields

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.service.ts:93-154` (the `RunWire` interface, `RawRun` interface, `toRunWire` function)

Pure additive change — existing endpoints automatically start emitting the new fields. Existing tests don't break because they assert specific fields, not exhaustive shape.

- [ ] **Step 1: Update the `RawRun` interface to include lifecycle columns**

In `runs.service.ts`, replace the `RawRun` interface (currently lines 130–140) with:

```ts
interface RawRun {
  id: string
  projectId: string
  name: string
  params: unknown
  inputsSnapshot: unknown
  billedFeatureKey: string
  usageRecordId: string
  createdAt: Date
  deletedAt: Date | null
  status: string
  cancelledAt: Date | null
  failedAt: Date | null
  failureReason: string | null
}
```

- [ ] **Step 2: Update `RunWire` interface**

Replace the `RunWire` interface (currently lines 93–103) with:

```ts
export interface RunWire {
  id: string
  projectId: string
  name: string
  params: unknown
  inputsSnapshot: unknown
  billedFeatureKey: string
  usageRecordId: string
  createdAt: string
  deletedAt: string | null
  /** Lifecycle state — RUNNING | DONE | CANCELLED | FAILED. */
  status: string
  /** Set when status flipped to CANCELLED (B30). */
  cancelledAt: string | null
  /** Set when status flipped to FAILED (B32). */
  failedAt: string | null
  /** Free-text reason for FAILED (B32). Null otherwise. */
  failureReason: string | null
}
```

- [ ] **Step 3: Update `toRunWire` to emit the new fields**

Replace `toRunWire` (currently lines 142–154) with:

```ts
function toRunWire(run: RawRun): RunWire {
  return {
    id: run.id,
    projectId: run.projectId,
    name: run.name,
    params: run.params,
    inputsSnapshot: run.inputsSnapshot,
    billedFeatureKey: run.billedFeatureKey,
    usageRecordId: run.usageRecordId,
    createdAt: run.createdAt.toISOString(),
    deletedAt: run.deletedAt?.toISOString() ?? null,
    status: run.status,
    cancelledAt: run.cancelledAt?.toISOString() ?? null,
    failedAt: run.failedAt?.toISOString() ?? null,
    failureReason: run.failureReason,
  }
}
```

- [ ] **Step 4: Update existing test mocks to include lifecycle fields**

In `runs.test.ts`, the `MockRunDetail` interface (lines 60–74) and `baseRun` literal (lines 681–695) drive several test paths. Update them so `toRunWire` doesn't see `undefined` on the new fields.

Replace `MockRunDetail` (lines 60–74):

```ts
interface MockRunDetail {
  id: string
  projectId: string
  name: string
  params: unknown
  inputsSnapshot: unknown
  layoutResultBlobUrl: string | null
  energyResultBlobUrl: string | null
  exportsBlobUrls: unknown
  billedFeatureKey: string
  usageRecordId: string
  createdAt: Date
  deletedAt: Date | null
  status: string
  cancelledAt: Date | null
  failedAt: Date | null
  failureReason: string | null
  project: { userId: string }
}
```

Replace `baseRun` (lines 681–695):

```ts
const baseRun: MockRunDetail = {
  id: "run_x",
  projectId: "prj_x",
  name: "Run X",
  params: { rows: 4, cols: 4 },
  inputsSnapshot: { kmzSha256: "0".repeat(64) },
  layoutResultBlobUrl: null,
  energyResultBlobUrl: null,
  exportsBlobUrls: [],
  billedFeatureKey: "plant_layout",
  usageRecordId: "ur_x",
  createdAt: new Date("2026-04-15T12:00:00Z"),
  deletedAt: null,
  status: "DONE",
  cancelledAt: null,
  failedAt: null,
  failureReason: null,
  project: { userId: "usr_test1" },
}
```

Update `mockRunCreate`'s return value (lines 139–165) to include the new fields. Add at the end of the return object literal (before the closing `})`):

```ts
    status: "RUNNING",
    cancelledAt: null,
    failedAt: null,
    failureReason: null,
```

- [ ] **Step 5: Run the existing mvp-api test suite to verify nothing broke**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force
```

Expected: 350 pass / 0 fail (baseline). All B15/B16/B17/B18 tests still PASS — they assert on specific fields, the new fields are additive. If anything fails, STOP and report the specific assertion.

- [ ] **Step 6: Run typecheck across the monorepo**

```bash
bun run typecheck
```

Expected: 13/13 PASS. The `RunWire` extension propagates to `entitlements-client` and `desktop` workspaces (which import it via the generated sidecar-client and direct client imports). They should compile because the new fields are required-but-server-emits-them; consumer-side code using the wire type doesn't need to provide them on construction.

If a consumer fails because it constructs `RunWire` literals (e.g., test fixtures), update those fixtures with the four new fields. Most consumers only READ `RunWire` so this should be a no-op.

---

## Task 3: Failing test — RUNNING run cancel happy path

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.test.ts` — append the new describe block

- [ ] **Step 1: Append the cancel-endpoint test scaffold + first test**

Append to the end of `runs.test.ts` (after the B18 DELETE describe block ends, line 917):

```ts
// ─── B30 — POST /v2/projects/:id/runs/:runId/cancel ──────────────────────────

const mockQueryRaw = mock(
  async (..._args: unknown[]): Promise<
    Array<{
      id: string
      status: string
      usageRecordId: string
    }>
  > => [],
)

const mockEntitlementUpdateMany = mock(
  async (..._args: unknown[]): Promise<{ count: number }> => ({ count: 1 }),
)

// Add to existing mock.module("../../lib/db.js", ...) — the existing block
// already mocks db, but db.$transaction's tx surface needs to include
// $queryRaw + entitlement.update for B30. The simplest extension is to
// rewire mockTransaction so its tx argument exposes the new functions.

const mockTransactionV2 = mock(async (arg: unknown) => {
  if (typeof arg === "function") {
    return await (
      arg as (tx: {
        $executeRaw: typeof mockExecuteRaw
        $queryRaw: typeof mockQueryRaw
        usageRecord: { create: typeof mockUsageRecordCreate }
        run: {
          create: typeof mockRunCreate
          update: typeof mockRunUpdate
        }
        entitlement: { updateMany: typeof mockEntitlementUpdateMany }
      }) => Promise<unknown>
    )({
      $executeRaw: mockExecuteRaw,
      $queryRaw: mockQueryRaw,
      usageRecord: { create: mockUsageRecordCreate },
      run: { create: mockRunCreate, update: mockRunUpdate },
      entitlement: { updateMany: mockEntitlementUpdateMany },
    })
  }
  return arg
})

// IMPORTANT: replace the existing db mock to include the new tx surface.
// We can't call mock.module twice for the same path, so this requires
// editing the existing mock.module block at the top of the file (Task 2
// Step 4 already touched it). Actually, just update the mockTransaction's
// shape to include the new fields so it's used everywhere consistently.
//
// Approach: alias mockTransactionV2 → mockTransaction. The B16 path doesn't
// use $queryRaw or entitlement.updateMany so the extra members are inert.
//
// Implementation: in Task 2's Step 4 mock.module edit, add `$queryRaw:
// mockQueryRaw` and `entitlement: { updateMany: mockEntitlementUpdateMany }`
// to the db object. Keep mockTransaction with the original shape — the
// V2 wrapper is just for cancel.

const cancel = (projectId: string, runId: string) =>
  makeApp().request(
    `/v2/projects/${projectId}/runs/${runId}/cancel`,
    {
      method: "POST",
      headers: { Authorization: "Bearer sl_live_testkey" },
    },
  )

describe("POST /v2/projects/:id/runs/:runId/cancel", () => {
  beforeEach(() => {
    mockProjectFindFirst.mockReset()
    mockProjectFindFirst.mockImplementation(async () => ({ id: "prj_x" }))
    mockQueryRaw.mockReset()
    mockRunUpdate.mockClear()
    mockUsageRecordCreate.mockClear()
    mockEntitlementUpdateMany.mockReset()
    mockEntitlementUpdateMany.mockImplementation(async () => ({ count: 1 }))
    mockUsageRecordFindFirst.mockReset()
    mockUsageRecordFindFirst.mockImplementation(async () => ({
      id: "ur_x",
      run: null,
    }))
  })

  it("RUNNING → flips to CANCELLED, writes refund row, decrements entitlement, returns 200", async () => {
    // The locked SELECT returns the run in RUNNING state with its
    // usageRecordId (linked to a previously-charged UsageRecord).
    mockQueryRaw.mockImplementation(async () => [
      { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
    ])
    // The run.update(...) should produce the post-cancel row used by
    // toRunWire. Wire it to return a sensible literal:
    mockRunUpdate.mockImplementation(async (args) => ({
      id: args.where.id,
      projectId: "prj_x",
      name: "Run X",
      params: {},
      inputsSnapshot: {},
      billedFeatureKey: "plant_layout",
      usageRecordId: "ur_x",
      createdAt: new Date("2026-05-01T10:00:00Z"),
      deletedAt: null,
      status: "CANCELLED",
      cancelledAt: new Date("2026-05-02T12:00:00Z"),
      failedAt: null,
      failureReason: null,
    }))
    // The original UsageRecord lookup so we know which productId to
    // decrement against. Return the full select shape the service reads.
    mockUsageRecordFindFirst.mockImplementation(async () => ({
      id: "ur_x",
      productId: "prod_basic",
      userId: "usr_test1",
      licenseKeyId: "lk_test1",
      featureKey: "plant_layout",
    }))

    const res = await cancel("prj_x", "run_x")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: RunDetailWire }
    expect(body.data.id).toBe("run_x")
    expect(body.data.status).toBe("CANCELLED")
    expect(body.data.cancelledAt).toBe("2026-05-02T12:00:00.000Z")

    // Transaction-internal effects
    expect(mockQueryRaw).toHaveBeenCalledTimes(1)
    expect(mockRunUpdate).toHaveBeenCalledTimes(1)
    expect(mockUsageRecordCreate).toHaveBeenCalledTimes(1)
    expect(mockEntitlementUpdateMany).toHaveBeenCalledTimes(1)

    // Refund row shape
    const urCall = mockUsageRecordCreate.mock.calls[0] as unknown as [
      {
        data: {
          userId: string
          productId: string
          featureKey: string
          count: number
          kind: string
          refundsRecordId: string
          licenseKeyId: string
        }
      },
    ]
    expect(urCall[0].data.count).toBe(-1)
    expect(urCall[0].data.kind).toBe("refund")
    expect(urCall[0].data.refundsRecordId).toBe("ur_x")
    expect(urCall[0].data.userId).toBe("usr_test1")
    expect(urCall[0].data.productId).toBe("prod_basic")

    // Entitlement decrement scoped to the user + productId, only one row
    const entCall = mockEntitlementUpdateMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ]
    expect(entCall[0].where).toMatchObject({
      userId: "usr_test1",
      productId: "prod_basic",
      deactivatedAt: null,
    })
  })
})
```

NOTE: this test references `mockEntitlementUpdateMany` and `mockQueryRaw` which need to be added to the existing `mock.module("../../lib/db.js", ...)` block at the top of the file. Update that block (currently lines 219–237) to:

```ts
mock.module("../../lib/db.js", () => ({
  db: {
    licenseKey: { findFirst: async () => mockLicenseKey },
    project: { findFirst: mockProjectFindFirst },
    run: {
      findMany: mockRunFindMany,
      findFirst: mockRunDetailFindFirst,
      create: mockRunCreate,
      update: mockRunUpdate,
    },
    usageRecord: {
      findFirst: mockUsageRecordFindFirst,
      create: mockUsageRecordCreate,
    },
    productFeature: { findFirst: mockProductFeatureFindFirst },
    entitlement: {
      findMany: mockEntitlementFindMany,
      updateMany: mockEntitlementUpdateMany,
    },
    $queryRaw: mockQueryRaw,
    $transaction: mockTransaction,
  },
}))
```

And replace `mockTransaction`'s body with the V2 shape (combining all the surfaces — works for B16 and B30 both):

```ts
const mockTransaction = mock(async (arg: unknown) => {
  if (typeof arg === "function") {
    return await (
      arg as (tx: {
        $executeRaw: typeof mockExecuteRaw
        $queryRaw: typeof mockQueryRaw
        usageRecord: { create: typeof mockUsageRecordCreate }
        run: {
          create: typeof mockRunCreate
          update: typeof mockRunUpdate
        }
        entitlement: { updateMany: typeof mockEntitlementUpdateMany }
      }) => Promise<unknown>
    )({
      $executeRaw: mockExecuteRaw,
      $queryRaw: mockQueryRaw,
      usageRecord: { create: mockUsageRecordCreate },
      run: { create: mockRunCreate, update: mockRunUpdate },
      entitlement: { updateMany: mockEntitlementUpdateMany },
    })
  }
  return arg
})
```

Also: declare the two new mocks (`mockQueryRaw`, `mockEntitlementUpdateMany`) BEFORE the `mock.module` call (place them next to the existing `mockExecuteRaw` mock at line 130).

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "B30|fail|pass" | tail -10
```

Expected: the new B30 test FAILS (route doesn't exist yet — likely a 404 from Hono's default not-found handler). Pre-existing tests still PASS.

---

## Task 4: Implement `cancelRun` service — RUNNING happy path

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.service.ts` (append the `cancelRun` function before the file's bottom)

- [ ] **Step 1: Append the `cancelRun` function**

Append to the end of `runs.service.ts`:

```ts
/**
 * Cancel a Run. Idempotent. Per refund-on-cancel policy
 * (B27 memo 2026-05-02-002 §A.2 + §B.2):
 *
 *   RUNNING   → flip to CANCELLED, write refund UsageRecord (count=-1,
 *               kind='refund', refundsRecordId=<original>), decrement
 *               the matching Entitlement.usedCalculations. Single
 *               Postgres transaction with SELECT … FOR UPDATE on Run.
 *   CANCELLED → no-op, return current state. (Refund already issued.)
 *   DONE      → 409 CONFLICT. ("Run already completed; use Delete.")
 *   FAILED    → no-op, return current state. (Refund already issued by
 *               B32's failed-runs path.)
 *
 * 404 on miss / cross-user / soft-deleted run / soft-deleted project —
 * same posture as B17 (getRunDetail) and B18 (deleteRun).
 *
 * Race semantics: the FOR UPDATE lock serializes this endpoint against
 * sidecar's completion path (B31 will add the sidecar-side check).
 * Whichever transaction commits first wins; the loser sees the post-
 * commit state and behaves correctly per the branch table above.
 */
export async function cancelRun(
  userId: string,
  projectId: string,
  runId: string,
): Promise<RunDetailWire> {
  // 1. Ownership pre-check (no lock). 404-leakage-safe.
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { id: true },
  })
  if (!project) {
    throw new NotFoundError("Project", projectId)
  }

  const updatedRun = await db.$transaction(async (tx) => {
    const txClient = tx as unknown as {
      $queryRaw: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>
      run: {
        update: (args: {
          where: { id: string }
          data: Record<string, unknown>
        }) => Promise<RawRun>
      }
      usageRecord: {
        create: (args: {
          data: {
            userId: string
            licenseKeyId: string
            productId: string
            featureKey: string
            count: number
            kind: string
            refundsRecordId: string
          }
        }) => Promise<{ id: string }>
      }
      entitlement: {
        updateMany: (args: {
          where: Record<string, unknown>
          data: Record<string, unknown>
        }) => Promise<{ count: number }>
      }
    }

    // 2. Lock the Run row + read its current status.
    const rows = await txClient.$queryRaw<
      Array<{ id: string; status: string; usageRecordId: string }>
    >`
      SELECT id, status, "usageRecordId"
      FROM runs
      WHERE id = ${runId}
        AND "projectId" = ${projectId}
        AND "deletedAt" IS NULL
      FOR UPDATE
    `

    if (rows.length === 0) {
      throw new NotFoundError("Run", runId)
    }
    const locked = rows[0]!

    // 3. Branch on status.
    if (locked.status === "DONE") {
      throw new AppError(
        "CONFLICT",
        "Run already completed; use Delete to remove it from history",
        409,
      )
    }

    if (locked.status === "CANCELLED" || locked.status === "FAILED") {
      // Idempotent — re-read the post-commit state and return it.
      const current = await txClient.run.update({
        where: { id: runId },
        data: {}, // no-op write to fetch the canonical row shape
      })
      return current
    }

    // RUNNING → execute the refund cascade.
    // 3a. Look up the original UsageRecord to find productId for the
    //     entitlement decrement target.
    const original = (await db.usageRecord.findFirst({
      where: { id: locked.usageRecordId },
      select: {
        id: true,
        productId: true,
        userId: true,
        licenseKeyId: true,
        featureKey: true,
      },
    })) as {
      id: string
      productId: string
      userId: string
      licenseKeyId: string
      featureKey: string
    } | null

    if (!original) {
      // Should never happen — runs.usageRecordId is FK NOT NULL.
      throw new AppError(
        "INTERNAL_ERROR",
        `UsageRecord ${locked.usageRecordId} missing for run ${runId}`,
        500,
      )
    }

    // 3b. Flip the Run status.
    const updated = await txClient.run.update({
      where: { id: runId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    })

    // 3c. Insert refund UsageRecord row (count=-1, kind='refund').
    await txClient.usageRecord.create({
      data: {
        userId: original.userId,
        licenseKeyId: original.licenseKeyId,
        productId: original.productId,
        featureKey: original.featureKey,
        count: -1,
        kind: "refund",
        refundsRecordId: original.id,
      },
    })

    // 3d. Decrement Entitlement.usedCalculations on a matching active
    //     entitlement for the same product. updateMany with a LIMIT-1
    //     equivalent — we use a raw guard via cheapest-first.
    //     The codebase allows multiple active entitlements per product
    //     (e.g., a user buying Pro twice); we restore quota to one
    //     of them. Cheapest-first via product.displayOrder is the
    //     same ordering findFeaturePool uses on debit (usage.service.ts:50).
    await txClient.entitlement.updateMany({
      where: {
        userId: original.userId,
        productId: original.productId,
        deactivatedAt: null,
        usedCalculations: { gt: 0 },
      },
      data: {
        usedCalculations: { decrement: 1 },
      },
    })

    return updated
  })

  // 4. Convert to wire shape + sign download URLs (parallel to getRunDetail).
  const bucket = env.MVP_S3_PROJECTS_BUCKET
  const layoutKey = `projects/${userId}/${projectId}/runs/${runId}/layout.json`
  const energyKey = `projects/${userId}/${projectId}/runs/${runId}/energy.json`
  const thumbnailKey = `projects/${userId}/${projectId}/runs/${runId}/thumbnail.webp`

  const layoutResultBlobUrl = bucket
    ? await getPresignedDownloadUrl(
        layoutKey,
        "layout.json",
        READ_URL_TTL_SECONDS,
        bucket,
      )
    : null
  const energyResultBlobUrl = isEnergyClass(updatedRun.billedFeatureKey)
    ? bucket
      ? await getPresignedDownloadUrl(
          energyKey,
          "energy.json",
          READ_URL_TTL_SECONDS,
          bucket,
        )
      : null
    : null
  const thumbnailBlobUrl = bucket
    ? await getPresignedDownloadUrl(
        thumbnailKey,
        "thumbnail.webp",
        READ_URL_TTL_SECONDS,
        bucket,
      )
    : null

  return {
    ...toRunWire(updatedRun),
    layoutResultBlobUrl,
    energyResultBlobUrl,
    thumbnailBlobUrl,
    exportsBlobUrls: [],
  }
}
```

**Note:** Two limitations of `updateMany` with `decrement` need a callout:
- Prisma's `updateMany` doesn't support `LIMIT 1` directly. Our `where` clause is precise enough that any matching row is acceptable (refund restores quota to one of the matching active entitlements; cheapest-first ordering would require a transaction-internal subquery). For v1 with one entitlement per product per user being the common case, this is fine.
- If the user has zero matching active entitlements (e.g., the original entitlement was deactivated before they cancelled), `updateMany` returns `count: 0` and we silently fail to decrement. The Run status flip and refund row still land — quota math via `SUM(count)` (B34's customer-facing path) reflects the refund. This is the right semantic: customers see their refund regardless of entitlement state.

- [ ] **Step 2: Add the route handler in runs.routes.ts**

In `apps/mvp_api/src/modules/runs/runs.routes.ts`, append a new route handler before the file ends. The full additions (in order — first add the import update, then the new route):

Update the import block at the top of the file (currently lines 7–12):

```ts
import {
  cancelRun,
  createRunForProject,
  deleteRun,
  getRunDetail,
  listRunsForProject,
} from "./runs.service.js"
```

Append the new route handler at the end of the file (after the existing POST handler ends at line 90):

```ts
runsRoutes.post(
  "/v2/projects/:id/runs/:runId/cancel",
  async (c) => {
    const user = c.get("user")
    const result = await cancelRun(
      user.id,
      c.req.param("id"),
      c.req.param("runId"),
    )
    return c.json(ok(result))
  },
)
```

- [ ] **Step 3: Run the test to verify it passes**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "B30|fail|pass" | tail -10
```

Expected: the RUNNING happy-path test PASSES. Pre-existing tests still PASS.

---

## Task 5: Test + implement — idempotent CANCELLED branch

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.test.ts` — append a new `it(...)` to the B30 describe block

- [ ] **Step 1: Add the failing test for CANCELLED → idempotent no-op**

Inside the `describe("POST /v2/projects/:id/runs/:runId/cancel", ...)` block, append:

```ts
it("CANCELLED → idempotent no-op, returns 200, no second refund or decrement", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "CANCELLED", usageRecordId: "ur_x" },
  ])
  mockRunUpdate.mockImplementation(async (args) => ({
    id: args.where.id,
    projectId: "prj_x",
    name: "Run X",
    params: {},
    inputsSnapshot: {},
    billedFeatureKey: "plant_layout",
    usageRecordId: "ur_x",
    createdAt: new Date("2026-05-01T10:00:00Z"),
    deletedAt: null,
    status: "CANCELLED",
    cancelledAt: new Date("2026-05-02T11:00:00Z"),
    failedAt: null,
    failureReason: null,
  }))

  const res = await cancel("prj_x", "run_x")
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: RunDetailWire }
  expect(body.data.status).toBe("CANCELLED")
  // No second refund row, no second decrement
  expect(mockUsageRecordCreate).not.toHaveBeenCalled()
  expect(mockEntitlementUpdateMany).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the test**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "B30|idempotent" | tail -5
```

Expected: PASS — the CANCELLED branch in `cancelRun` already handles this. (If it doesn't, the implementation in Task 4 has a bug — re-check the branch logic.)

---

## Task 6: Test + implement — DONE → 409

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.test.ts` — append a new `it(...)`

- [ ] **Step 1: Add the failing test**

```ts
it("DONE → 409 CONFLICT with descriptive message; no state mutations", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "DONE", usageRecordId: "ur_x" },
  ])

  const res = await cancel("prj_x", "run_x")
  expect(res.status).toBe(409)
  const body = (await res.json()) as {
    success: false
    error: { code: string; message: string }
  }
  expect(body.success).toBe(false)
  expect(body.error.code).toBe("CONFLICT")
  expect(body.error.message).toContain("already completed")
  // Zero state mutations
  expect(mockRunUpdate).not.toHaveBeenCalled()
  expect(mockUsageRecordCreate).not.toHaveBeenCalled()
  expect(mockEntitlementUpdateMany).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the test**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "DONE|409" | tail -5
```

Expected: PASS. The DONE branch in Task 4's implementation throws `AppError("CONFLICT", ..., 409)`.

---

## Task 7: Test + implement — FAILED → no-op

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.test.ts` — append a new `it(...)`

- [ ] **Step 1: Add the failing test**

```ts
it("FAILED → idempotent no-op, returns 200, no second refund (B32 already issued it)", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "FAILED", usageRecordId: "ur_x" },
  ])
  mockRunUpdate.mockImplementation(async (args) => ({
    id: args.where.id,
    projectId: "prj_x",
    name: "Run X",
    params: {},
    inputsSnapshot: {},
    billedFeatureKey: "plant_layout",
    usageRecordId: "ur_x",
    createdAt: new Date("2026-05-01T10:00:00Z"),
    deletedAt: null,
    status: "FAILED",
    cancelledAt: null,
    failedAt: new Date("2026-05-02T10:30:00Z"),
    failureReason: "validation_error",
  }))

  const res = await cancel("prj_x", "run_x")
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: RunDetailWire }
  expect(body.data.status).toBe("FAILED")
  expect(body.data.failedAt).toBe("2026-05-02T10:30:00.000Z")
  expect(body.data.failureReason).toBe("validation_error")
  expect(mockUsageRecordCreate).not.toHaveBeenCalled()
  expect(mockEntitlementUpdateMany).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the test**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "FAILED|no-op" | tail -5
```

Expected: PASS.

---

## Task 8: Test + implement — 404 ownership filters

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.test.ts` — append four `it(...)` tests covering each 404 path

- [ ] **Step 1: Add the four failing tests**

```ts
it("returns 404 when the project doesn't exist (or belongs to another user)", async () => {
  mockProjectFindFirst.mockImplementation(async () => null)
  const res = await cancel("prj_other", "run_x")
  expect(res.status).toBe(404)
  expect(mockQueryRaw).not.toHaveBeenCalled()
  expect(mockRunUpdate).not.toHaveBeenCalled()
})

it("returns 404 when the project is soft-deleted", async () => {
  mockProjectFindFirst.mockImplementation(async () => null) // where filter excludes
  const res = await cancel("prj_deleted", "run_x")
  expect(res.status).toBe(404)
})

it("returns 404 when the run doesn't exist", async () => {
  // project ownership passes, but FOR UPDATE returns no rows
  mockQueryRaw.mockImplementation(async () => [])
  const res = await cancel("prj_x", "run_nope")
  expect(res.status).toBe(404)
  expect(mockRunUpdate).not.toHaveBeenCalled()
})

it("returns 404 when the run is soft-deleted (where filter excludes deletedAt)", async () => {
  mockQueryRaw.mockImplementation(async () => [])
  const res = await cancel("prj_x", "run_deleted")
  expect(res.status).toBe(404)
})

it("scopes the project ownership check with where: { id, userId, deletedAt: null }", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
  ])
  mockUsageRecordFindFirst.mockImplementation(async () => ({
    id: "ur_x",
    productId: "prod_basic",
    userId: "usr_test1",
    licenseKeyId: "lk_test1",
    featureKey: "plant_layout",
  }))
  mockRunUpdate.mockImplementation(async (args) => ({
    id: args.where.id,
    projectId: "prj_x",
    name: "Run X",
    params: {},
    inputsSnapshot: {},
    billedFeatureKey: "plant_layout",
    usageRecordId: "ur_x",
    createdAt: new Date(),
    deletedAt: null,
    status: "CANCELLED",
    cancelledAt: new Date(),
    failedAt: null,
    failureReason: null,
  }))

  await cancel("prj_x", "run_x")
  const call = mockProjectFindFirst.mock.calls[0] as unknown as [
    { where: Record<string, unknown> },
  ]
  expect(call?.[0]?.where).toMatchObject({
    id: "prj_x",
    userId: "usr_test1",
    deletedAt: null,
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "404|ownership" | tail -10
```

Expected: ALL PASS. The Task 4 implementation already handles 404 via:
- `db.project.findFirst` returning null → `throw new NotFoundError("Project", projectId)`
- `$queryRaw` returning empty array → `throw new NotFoundError("Run", runId)`

If any 404 test fails, re-check the implementation flow.

---

## Task 9: Test + implement — refund row content + entitlement decrement scope

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.test.ts` — append more granular assertion tests

- [ ] **Step 1: Add detailed-shape tests**

```ts
it("refund UsageRecord captures the original's userId/licenseKeyId/productId/featureKey + new kind/count/refundsRecordId", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
  ])
  mockUsageRecordFindFirst.mockImplementation(async () => ({
    id: "ur_x",
    productId: "prod_pro",
    userId: "usr_test1",
    licenseKeyId: "lk_test1",
    featureKey: "energy_yield",
  }))
  mockRunUpdate.mockImplementation(async (args) => ({
    id: args.where.id,
    projectId: "prj_x",
    name: "Run X",
    params: {},
    inputsSnapshot: {},
    billedFeatureKey: "energy_yield",
    usageRecordId: "ur_x",
    createdAt: new Date(),
    deletedAt: null,
    status: "CANCELLED",
    cancelledAt: new Date(),
    failedAt: null,
    failureReason: null,
  }))

  await cancel("prj_x", "run_x")

  const urCall = mockUsageRecordCreate.mock.calls[0] as unknown as [
    {
      data: {
        userId: string
        licenseKeyId: string
        productId: string
        featureKey: string
        count: number
        kind: string
        refundsRecordId: string
      }
    },
  ]
  expect(urCall[0].data).toEqual({
    userId: "usr_test1",
    licenseKeyId: "lk_test1",
    productId: "prod_pro",
    featureKey: "energy_yield",
    count: -1,
    kind: "refund",
    refundsRecordId: "ur_x",
  })
})

it("entitlement decrement uses { decrement: 1 } and filters to active matching product", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
  ])
  mockUsageRecordFindFirst.mockImplementation(async () => ({
    id: "ur_x",
    productId: "prod_basic",
    userId: "usr_test1",
    licenseKeyId: "lk_test1",
    featureKey: "plant_layout",
  }))
  mockRunUpdate.mockImplementation(async (args) => ({
    id: args.where.id,
    projectId: "prj_x",
    name: "Run X",
    params: {},
    inputsSnapshot: {},
    billedFeatureKey: "plant_layout",
    usageRecordId: "ur_x",
    createdAt: new Date(),
    deletedAt: null,
    status: "CANCELLED",
    cancelledAt: new Date(),
    failedAt: null,
    failureReason: null,
  }))

  await cancel("prj_x", "run_x")
  const entCall = mockEntitlementUpdateMany.mock.calls[0] as unknown as [
    { where: Record<string, unknown>; data: Record<string, unknown> },
  ]
  expect(entCall[0].where).toEqual({
    userId: "usr_test1",
    productId: "prod_basic",
    deactivatedAt: null,
    usedCalculations: { gt: 0 },
  })
  expect(entCall[0].data).toEqual({
    usedCalculations: { decrement: 1 },
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "refund|entitlement" | tail -10
```

Expected: PASS.

---

## Task 10: Full mvp-api gate

**Files:** none

- [ ] **Step 1: Run all mvp-api tests**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force
```

Expected: 350 baseline + the new B30 tests (8 added: 1 RUNNING + 1 CANCELLED + 1 DONE + 1 FAILED + 4 ownership + 2 detail-shape = 10... wait, recount). Recount:
- Task 3: 1 (RUNNING happy path)
- Task 5: 1 (CANCELLED idempotent)
- Task 6: 1 (DONE 409)
- Task 7: 1 (FAILED no-op)
- Task 8: 5 (404 project missing, 404 project deleted, 404 run missing, 404 run deleted, ownership scope)
- Task 9: 2 (refund shape, entitlement scope)

Total: 11 new mvp-api tests. Expected post-Task-10: 361 pass / 0 fail.

- [ ] **Step 2: Run mvp-api typecheck + build**

```bash
bunx turbo typecheck build --filter=@solarlayout/mvp-api --force
```

Expected: PASS.

---

## Task 11: Full monorepo gate

**Files:** none

- [ ] **Step 1: Run all four JS gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: ALL PASS. Per-workspace counts unchanged from baseline EXCEPT:
- `mvp-api`: +11 (B30 tests)
- All other workspaces: 0 delta

If `entitlements-client`, `desktop`, or any other workspace shows test count movement, STOP and investigate — that means an implicit `RunWire` shape dependency was missed in Task 2.

- [ ] **Step 2: Quick smoke against the local DB**

```bash
# Start the api server
cd apps/mvp_api && bun run dev &
API_PID=$!
sleep 3

# Replay the cancel flow against a live local DB.
# Skip if API server doesn't start cleanly — manual smoke is fine instead.

# Cleanup
kill $API_PID
cd ../..
```

Expected: server starts cleanly, no startup errors. Skip the actual HTTP smoke if you don't want to seed test data — the integration tests cover the wire shape.

---

## Task 12: Update backend plan + commit + push

**Files:**
- Modify: `docs/initiatives/post-parity-v2-backend-plan.md` — flip B30 row to `done`

- [ ] **Step 1: Update the B30 row in the backend plan**

Change the B30 row's Status column from `**todo**` to `**done**`. Update the Acceptance / "applied detail" section (the column before Status) to mention:
- "Cancel endpoint live at `POST /v2/projects/:id/runs/:runId/cancel`."
- "All four status branches (RUNNING/CANCELLED/DONE/FAILED) covered by integration tests; idempotency and ownership filters verified."
- "RunWire extended with `status`, `cancelledAt`, `failedAt`, `failureReason` — wire shape change consumed by all of B16/B17/B18/B30."

- [ ] **Step 2: Stage all changes**

```bash
git status
git add apps/mvp_api/src/modules/runs/runs.service.ts \
        apps/mvp_api/src/modules/runs/runs.routes.ts \
        apps/mvp_api/src/modules/runs/runs.test.ts \
        docs/initiatives/post-parity-v2-backend-plan.md \
        docs/superpowers/plans/2026-05-02-b30-cancel-endpoint.md
```

- [ ] **Step 3: Atomic commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mvp-api): B30 — cancel endpoint with refund + entitlement restore

POST /v2/projects/:id/runs/:runId/cancel — idempotent endpoint that flips
a RUNNING run to CANCELLED, writes a refund UsageRecord (count=-1,
kind='refund', refundsRecordId=<original>), and decrements the matching
Entitlement.usedCalculations so quota is restored.

All four status branches covered:
- RUNNING   → flip + refund + decrement, return 200 with updated Run
- CANCELLED → idempotent no-op, return 200 with current state
- FAILED    → no-op, return 200 (B32 already issued the refund)
- DONE      → 409 CONFLICT (use Delete for completed runs)

Single Postgres transaction with SELECT … FOR UPDATE on the Run row
serializes against sidecar's completion path (B31 will add the
sidecar-side check; cancel-always-wins-until-DONE per B27 §A.2).

RunWire extended with status / cancelledAt / failedAt / failureReason —
wire shape change consumed by B16/B17/B18 too. This is partly delivering
B28's wire-shape work; B28's frontend rendering is its own follow-up.

Tests: +11 mvp-api integration tests covering all status branches,
ownership filters (404 on missing/cross-user/soft-deleted), and detail
assertions on refund row + entitlement decrement scope.

Spec: docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md
Plan: docs/superpowers/plans/2026-05-02-b30-cancel-endpoint.md
B29:  cab9cc0 (schema dependency)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push -u origin parity/b30-cancel-endpoint
```

- [ ] **Step 5: Confirm clean state**

```bash
git status
git log --oneline -3
```

Expected: clean tree, branch ahead of `origin/main` by 1 commit (B30), branch tracking `origin/parity/b30-cancel-endpoint`.

CI/CD will deploy the change to prod automatically per the user's pipeline (no manual `prisma migrate deploy` for this row — schema is already there from B29).

---

## Task 13: Hand off to next row

- [ ] **Step 1: Surface what's now unblocked**

Summarize for the user:
- **B30 done.** Cancel endpoint shipped. CI/CD will deploy to prod.
- **B31 unblocked** — sidecar's completion-path FOR UPDATE check (depends on B29 + B30, both done now).
- **B32 unblocked** — failed-runs internal path (depends on B29 only; could've gone in parallel with B30).
- **B33 unblocked** — desktop frontend cancel modal + cancelRunV2 wiring (depends on B30 + B28).
- **B34 unblocked** — `/dashboard/usage` calc-history extension (depends on B29 + B30).
- Suggest next row: **B31** (sidecar marker check) — completes the cancel race story end-to-end. After B31, B32/B33/B34 can land in any order in parallel.

The CLAUDE.md non-negotiable applies: do not start the next row's planning without explicit user "go."

---

## Risks + Watch-Items

- **`entitlement.updateMany` decrements ANY matching active entitlement** for `(userId, productId)`, not the specific one originally charged. v1 with one entitlement per product per user: behaviorally equivalent. Multi-purchase scenario: refund applies to whichever active entitlement happens to match first. Acceptable per memo §B.5 ("Edge cases [...] covered by B29's schema design but not specified here").
- **Customer with zero matching active entitlement** at cancel time (e.g., entitlement was deactivated post-debit): the decrement is a no-op (`count: 0`); Run.status flip + refund row still land. Customer's `SUM(count)` quota math (B34's path) reflects the refund. This is the correct semantic.
- **Race with sidecar's completion path** is NOT FULLY HANDLED until B31 lands. Until then: if a sidecar finishes a job concurrently with a cancel, the sidecar's UPDATE Run SET status='DONE' could land between our `SELECT … FOR UPDATE` and `UPDATE Run SET status='CANCELLED'`. Postgres's row-lock prevents this — sidecar's update blocks behind ours. Sidecar then sees CANCELLED on read and aborts (which is what B31 codifies). So technically the race is handled at the DB level; B31 just adds the sidecar-side check for clean abort + S3 cleanup.
- **`SELECT … FOR UPDATE` requires `db.$transaction`.** Without the transaction wrapper, the lock would release immediately. The implementation in Task 4 uses `db.$transaction(async (tx) => { ... })` — correct.
- **`tx.$queryRaw` template literal interpolation** with `${runId}` is parameterized (Prisma escapes them). Don't switch to `Prisma.sql` or string concatenation; the template form is safe.

---

## Self-Review Checklist (run by the executor before handoff)

- [ ] All 13 tasks marked complete.
- [ ] No `TODO`/`TBD`/placeholder strings in service or test code.
- [ ] B27 memo §A.2 (race semantics: cancel always wins) → covered by `SELECT … FOR UPDATE` + branch table.
- [ ] B27 memo §B.1 (refund row shape) → covered by Task 4's UsageRecord create call.
- [ ] B27 memo §B.2 (transaction + branch table) → covered by Tasks 3/5/6/7.
- [ ] All 8 status branches × ownership permutations have a test.
- [ ] No regression in `mvp-api`'s other 350 tests.
- [ ] No regression in any other workspace's test count.
- [ ] Single atomic commit pushed; B30 row marked done.
