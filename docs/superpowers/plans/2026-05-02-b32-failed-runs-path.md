# B32 Failed-Runs Internal Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `failRun(runId, failureReason)` — an idempotent internal-only service + endpoint that flips a RUNNING run to FAILED, writes a refund `UsageRecord` (count=-1, kind='refund'), decrements the matching `Entitlement.usedCalculations`, and records `failureReason`. Symmetric with `cancelRun` (B30) but triggered by the orchestrator/sidecar on engine failure, not by the customer.

**Architecture:** `failRun` mirrors `cancelRun`'s structure — same `SELECT … FOR UPDATE` lock, same single-transaction refund cascade — but takes only `runId + failureReason` (no userId/projectId; failures are detected without user context, and the service resolves identity from the locked Run row + its UsageRecord). Exposed via `POST /v2/internal/runs/:runId/fail` guarded by a shared-secret middleware (`MVP_INTERNAL_SHARED_SECRET` env var checked against the `x-internal-secret` request header). No license-key auth — this endpoint is service-to-service.

**Tech Stack:** Hono v4 + Bun runtime + Prisma 7 + Postgres. Tests via `bun:test` with `mock.module(...)` fakes.

**Spec source:** [`docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md`](../../initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md) §A.3 (failed-runs path) + §B.6 (internal endpoint shape).

**Plan row:** `B32` in [`docs/initiatives/post-parity-v2-backend-plan.md`](../../initiatives/post-parity-v2-backend-plan.md). Tier T1.

**Scope boundary:**
- B32 ships: `failRun` service function + internal endpoint + minimal shared-secret auth middleware + tests covering all status branches.
- B32 does NOT ship: a caller for the endpoint. The orchestrator/sidecar wires this up when there's a real failure detection path (Spike 2 timeline). For v1 the desktop runs the engine locally and handles failures client-side; this endpoint is dormant infrastructure for the cloud-offload future.
- B32 does NOT add desktop frontend handling of FAILED runs (that's B28/B33).
- B32 does NOT modify B30's `cancelRun` — they're siblings, not refactor targets.

**Out of scope (explicit):**
- Production wiring of `MVP_INTERNAL_SHARED_SECRET` in Vercel env. Add a note in the commit body. Operator deploys it.
- Failure-type taxonomy (validation_error, timeout, sidecar_exception, etc.). v1 stores `failureReason` as a free-text String. Memo §A.3: "v1 customers see one badge."
- Retry semantics on the orchestrator side (e.g., transient failures auto-retry before calling `/fail`). Out of scope; orchestrator's call.
- Admin-tool endpoint to inspect failed runs forensically. Separate UI/auth scope.

---

## Status Branch Table

| Locked `Run.status` | Behavior | HTTP |
|---|---|---|
| **RUNNING** | Flip to FAILED + write refund UsageRecord + decrement Entitlement. Update `failedAt = NOW()` + `failureReason`. Single transaction. | 200 |
| **CANCELLED** | 409 CONFLICT. Cancel already issued the refund; failure-after-cancel is an orchestrator bug (sidecar should have aborted per B31's marker check). No second refund. | 409 |
| **DONE** | 409 CONFLICT. Run completed successfully; failure-after-DONE is an orchestrator race (would require S3 cleanup + retroactive refund — out of scope for v1). | 409 |
| **FAILED** | Idempotent 200 no-op. Refund already issued; second `/fail` call is treated as a retry. Optional: update `failureReason` if the new one is more specific (decided: NO — keep first-write-wins for audit clarity). | 200 |
| **404** | Run doesn't exist OR is soft-deleted. | 404 |

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/mvp_api/src/env.ts` | Modify | Add `MVP_INTERNAL_SHARED_SECRET: z.string().optional()` to the zod schema. |
| `apps/mvp_api/src/middleware/internal-auth.ts` | Create | New middleware (~20 LOC) that checks `x-internal-secret` header against the env var. 401 on mismatch. 503 if env var unset (avoids accidental open endpoint in misconfigured envs). |
| `apps/mvp_api/src/modules/runs/runs.service.ts` | Modify | Append `failRun(runId, failureReason)` function (~70 LOC). Mirrors `cancelRun`'s transaction pattern. |
| `apps/mvp_api/src/modules/runs/runs.routes.ts` | Modify | Add `POST /v2/internal/runs/:runId/fail` route + import `internalAuth` middleware. |
| `apps/mvp_api/src/modules/runs/runs.test.ts` | Modify | Append `describe("POST /v2/internal/runs/:runId/fail", ...)` block — covers all status branches + auth + ownership. |

No new tests for `internal-auth.ts` directly — its behavior is fully covered by the route tests' authed/unauthed/missing-secret cases.

---

## Key Design Decisions

1. **Service function signature: `failRun(runId, failureReason): Promise<RunDetailWire>`** — no userId/projectId. The Run row's joined `usageRecord` provides the identity (userId, productId, licenseKeyId, featureKey) needed for the refund + decrement. Cancel needed userId for ownership-leakage protection (404 vs cross-user); fail doesn't (it's internal, no user context to leak).
2. **`failedAt` set inside the transaction** with `new Date()` at write time. `failureReason` from the request body, capped at 500 chars (defensive — orchestrator may send stack traces; we don't want unbounded text).
3. **Shared-secret auth via header** — simple, sufficient for service-to-service. Properly hardened (timing-attack-safe) auth is overkill for v1; if Spike 2 needs IP allowlisting / mTLS it'll add it.
4. **`MVP_INTERNAL_SHARED_SECRET` is optional in the zod schema.** When unset, the middleware returns 503 — fails-closed, never accidentally open.
5. **No userId match on the entitlement decrement** — the original UsageRecord's `userId` is the source of truth (same as B30's pattern).
6. **First-write-wins on `failureReason`** — if `/fail` is called twice on the same run, the FAILED branch returns the existing state and does NOT update `failureReason`. Audit clarity beats latest-detail.

---

## Task 1: Branch setup + baseline gate

**Files:** none (workspace state)

- [ ] **Step 1: Pull main and branch off**

```bash
git checkout main
git pull --ff-only origin main
git log --oneline -3
git checkout -b parity/b32-failed-runs-path
```

Expected: `main` includes B30 + slow-test fix (commits `49c8ff2`, `ece58c5`, `cab9cc0` should be in history). HEAD is at the merged tip. New branch created from there.

If `main` doesn't yet have B30 merged (e.g., merge conflict in flight), STOP and resolve before proceeding — B32 needs `cancelRun` and the lifecycle wire shape from B30.

- [ ] **Step 2: Confirm baseline gate is green**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: ALL PASS. Capture per-workspace test counts. mvp-api should be at 361 (post-B30 baseline).

Skip the sidecar pytest gate — B32 doesn't touch the sidecar (saves ~3 min now that the slow cable test is opt-in).

---

## Task 2: Add `MVP_INTERNAL_SHARED_SECRET` to env schema

**Files:**
- Modify: `apps/mvp_api/src/env.ts:14-22` (zod schema)

- [ ] **Step 1: Add the new env var to the zod schema**

In `apps/mvp_api/src/env.ts`, find the `EnvSchema = z.object({...})` block. Insert this line right after `STRIPE_WEBHOOK_SECRET`:

```ts
  // Internal service-to-service auth — used by the sidecar/orchestrator
  // when calling internal endpoints like POST /v2/internal/runs/:runId/fail.
  // Optional in dev; in staging/prod it MUST be set or internal endpoints
  // return 503. Set in Vercel env.
  MVP_INTERNAL_SHARED_SECRET: z.string().optional(),
```

The closing `})` of the schema follows. The full schema block becomes:

```ts
const EnvSchema = z.object({
  MVP_DATABASE_URL: z.string().min(1, "MVP_DATABASE_URL is required"),
  PORT: z.string().default("3003"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Comma-separated list of allowed CORS origins
  MVP_CORS_ORIGINS: z.string().optional(),
  // S3 — optional for graceful degradation
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  MVP_S3_DOWNLOADS_BUCKET: z.string().optional(),
  MVP_S3_PROJECTS_BUCKET: z.string().optional(),
  // Clerk — used to verify dashboard JWT tokens
  CLERK_SECRET_KEY: z.string().optional(),
  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Internal service-to-service auth — used by the sidecar/orchestrator
  // when calling internal endpoints like POST /v2/internal/runs/:runId/fail.
  // Optional in dev; in staging/prod it MUST be set or internal endpoints
  // return 503. Set in Vercel env.
  MVP_INTERNAL_SHARED_SECRET: z.string().optional(),
})
```

- [ ] **Step 2: Verify env loads cleanly**

```bash
bunx turbo typecheck --filter=@solarlayout/mvp-api --force
```

Expected: PASS. The new optional field doesn't require any existing env to change.

---

## Task 3: Create the internal-auth middleware

**Files:**
- Create: `apps/mvp_api/src/middleware/internal-auth.ts`

- [ ] **Step 1: Write the middleware**

```ts
import type { MiddlewareHandler } from "hono"
import { AppError } from "../lib/errors.js"
import { env } from "../env.js"

/**
 * Service-to-service auth for internal endpoints.
 *
 * Checks the `x-internal-secret` request header against
 * MVP_INTERNAL_SHARED_SECRET env. Used by the sidecar/orchestrator
 * to call internal-only routes like POST /v2/internal/runs/:runId/fail
 * (B32). Not for customer-facing routes — those use license-key-auth.
 *
 * Fail-closed: when MVP_INTERNAL_SHARED_SECRET is unset (e.g., in a
 * misconfigured env), all requests are rejected with 503. This prevents
 * the endpoint from accidentally being open in production if someone
 * forgets to wire the env var.
 */
export const internalAuth: MiddlewareHandler = async (c, next) => {
  const expected = env.MVP_INTERNAL_SHARED_SECRET
  if (!expected) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Internal endpoint not configured (MVP_INTERNAL_SHARED_SECRET unset)",
      503,
    )
  }
  const provided = c.req.header("x-internal-secret")
  if (provided !== expected) {
    throw new AppError("UNAUTHORIZED", "Invalid internal secret", 401)
  }
  await next()
}
```

- [ ] **Step 2: Verify it compiles**

```bash
bunx turbo typecheck --filter=@solarlayout/mvp-api --force
```

Expected: PASS. The middleware is unused so far; it compiles standalone.

---

## Task 4: Failing test for failRun — RUNNING happy path + auth surface

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.test.ts` (append at the end of the file, after the B30 describe block)

- [ ] **Step 1: Append the B32 describe scaffold + happy-path test**

Append to the end of `runs.test.ts`:

```ts
// ─── B32 — POST /v2/internal/runs/:runId/fail ────────────────────────────────

const INTERNAL_SECRET = "test-internal-secret-b32"

// Override the env mock module to set MVP_INTERNAL_SHARED_SECRET. The
// existing mock.module("../../env.js", ...) at line ~209 already returns
// a bag of envs; we extend it.
mock.module("../../env.js", () => ({
  env: {
    AWS_ACCESS_KEY_ID: "test-key",
    AWS_SECRET_ACCESS_KEY: "test-secret",
    AWS_REGION: "ap-south-1",
    MVP_S3_PROJECTS_BUCKET: "solarlayout-test-projects",
    MVP_S3_DOWNLOADS_BUCKET: "solarlayout-test-downloads",
    MVP_INTERNAL_SHARED_SECRET: INTERNAL_SECRET,
  },
}))

const failRunRequest = (
  runId: string,
  body: object | string,
  headers?: Record<string, string>,
) =>
  makeApp().request(`/v2/internal/runs/${runId}/fail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

describe("POST /v2/internal/runs/:runId/fail", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset()
    mockRunUpdate.mockClear()
    mockUsageRecordCreate.mockClear()
    mockEntitlementUpdateMany.mockReset()
    mockEntitlementUpdateMany.mockImplementation(async () => ({ count: 1 }))
    mockUsageRecordFindFirst.mockReset()
    mockUsageRecordFindFirst.mockImplementation(async () => ({
      id: "ur_x",
      productId: "prod_basic",
      userId: "usr_test1",
      licenseKeyId: "lk_test1",
      featureKey: "plant_layout",
    }))
  })

  it("RUNNING → flips to FAILED, writes refund row, decrements entitlement, records failureReason, returns 200", async () => {
    mockQueryRaw.mockImplementation(async () => [
      { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
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
      failedAt: new Date("2026-05-02T13:00:00Z"),
      failureReason: "validation_error",
    }))

    const res = await failRunRequest("run_x", {
      failureReason: "validation_error",
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: RunDetailWire }
    expect(body.data.id).toBe("run_x")
    expect(body.data.status).toBe("FAILED")
    expect(body.data.failedAt).toBe("2026-05-02T13:00:00.000Z")
    expect(body.data.failureReason).toBe("validation_error")

    // Transaction-internal effects
    expect(mockQueryRaw).toHaveBeenCalledTimes(1)
    expect(mockRunUpdate).toHaveBeenCalledTimes(1)
    expect(mockUsageRecordCreate).toHaveBeenCalledTimes(1)
    expect(mockEntitlementUpdateMany).toHaveBeenCalledTimes(1)

    // Refund row shape (same fields as B30 but kind='refund' from FAILED)
    const urCall = mockUsageRecordCreate.mock.calls[0] as unknown as [
      {
        data: {
          userId: string
          productId: string
          count: number
          kind: string
          refundsRecordId: string
        }
      },
    ]
    expect(urCall[0].data.count).toBe(-1)
    expect(urCall[0].data.kind).toBe("refund")
    expect(urCall[0].data.refundsRecordId).toBe("ur_x")

    // Run.update payload includes failedAt + failureReason
    const updateCall = mockRunUpdate.mock.calls[0] as unknown as [
      { where: { id: string }; data: Record<string, unknown> },
    ]
    expect(updateCall[0].data.status).toBe("FAILED")
    expect(updateCall[0].data.failedAt).toBeInstanceOf(Date)
    expect(updateCall[0].data.failureReason).toBe("validation_error")
  })
})
```

- [ ] **Step 2: Run the test to verify it FAILS**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "B32|fail|pass" | tail -10
```

Expected: 1 FAIL (the new B32 happy-path test) — likely `expect(res.status).toBe(200)` got `404` because the route doesn't exist yet. The 361 pre-existing tests still PASS.

If the failure is a different shape (a TypeError, env import error, etc.), STOP and report — that's a setup bug.

---

## Task 5: Implement failRun service + add internal route

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.service.ts` (append at end)
- Modify: `apps/mvp_api/src/modules/runs/runs.routes.ts` (add import + route)

- [ ] **Step 1: Append `failRun` to runs.service.ts**

Append at the end of `runs.service.ts`:

```ts
const FAILURE_REASON_MAX_LEN = 500

/**
 * Mark a Run as FAILED. Internal-only — invoked by the orchestrator/sidecar
 * when engine work errors out. Idempotent. Per refund-on-cancel policy
 * (B27 memo 2026-05-02-002 §A.3 + §B.6):
 *
 *   RUNNING   → flip to FAILED, write refund UsageRecord (count=-1,
 *               kind='refund', refundsRecordId=<original>), decrement
 *               the matching Entitlement.usedCalculations, persist
 *               failedAt + failureReason. Single Postgres transaction.
 *   CANCELLED → 409 CONFLICT. Cancel already issued the refund.
 *   DONE      → 409 CONFLICT. Run completed; orchestrator race.
 *   FAILED    → idempotent 200 no-op. Refund already issued; first-
 *               write-wins on failureReason for audit clarity.
 *   404       → run doesn't exist or is soft-deleted.
 *
 * No userId/projectId argument: failure is detected without user
 * context. Identity (userId/productId/licenseKeyId/featureKey) is
 * resolved from the locked Run row's UsageRecord — same as cancelRun
 * after its ownership pre-check.
 */
export async function failRun(
  runId: string,
  failureReason: string,
): Promise<RunDetailWire> {
  const cleanReason = failureReason.slice(0, FAILURE_REASON_MAX_LEN)

  const { run: updatedRun, userId } = await db.$transaction(async (tx) => {
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

    // 1. Lock the Run row + read its current status.
    const rows = await txClient.$queryRaw<
      Array<{ id: string; status: string; usageRecordId: string }>
    >`
      SELECT id, status, "usageRecordId"
      FROM runs
      WHERE id = ${runId}
        AND "deletedAt" IS NULL
      FOR UPDATE
    `

    if (rows.length === 0) {
      throw new NotFoundError("Run", runId)
    }
    const locked = rows[0]!

    // 2. Branch on status.
    if (locked.status === "DONE") {
      throw new AppError(
        "CONFLICT",
        "Run already completed; cannot mark as failed",
        409,
      )
    }
    if (locked.status === "CANCELLED") {
      throw new AppError(
        "CONFLICT",
        "Run already cancelled; refund already issued",
        409,
      )
    }
    if (locked.status === "FAILED") {
      // Idempotent — first-write-wins on failureReason. Re-read state.
      const current = await txClient.run.update({
        where: { id: runId },
        data: {},
      })
      // Resolve userId for S3 URL signing.
      const owner = await db.usageRecord.findFirst({
        where: { id: current.usageRecordId },
        select: { userId: true },
      })
      return { run: current, userId: owner?.userId ?? "unknown" }
    }

    // RUNNING → execute the refund cascade.
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
      throw new AppError(
        "INTERNAL_ERROR",
        `UsageRecord ${locked.usageRecordId} missing for run ${runId}`,
        500,
      )
    }

    // 3. Flip the Run status + record failure metadata.
    const updated = await txClient.run.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: cleanReason,
      },
    })

    // 4. Insert refund UsageRecord.
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

    // 5. Decrement Entitlement.usedCalculations on a matching active
    //    entitlement for the same product. Same logic as cancelRun.
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

    return { run: updated, userId: original.userId }
  })

  // Convert to wire shape + sign download URLs. userId came back
  // from the transaction (resolved from the original UsageRecord).
  // Failed runs may have partial S3 uploads; we still sign the URLs
  // so the orchestrator/admin can inspect.
  const bucket = env.MVP_S3_PROJECTS_BUCKET
  const layoutKey = `projects/${userId}/${updatedRun.projectId}/runs/${runId}/layout.json`
  const energyKey = `projects/${userId}/${updatedRun.projectId}/runs/${runId}/energy.json`
  const thumbnailKey = `projects/${userId}/${updatedRun.projectId}/runs/${runId}/thumbnail.webp`

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

- [ ] **Step 2: Add the internal route in runs.routes.ts**

Update `apps/mvp_api/src/modules/runs/runs.routes.ts`. First, update the imports at the top to include `failRun` and `internalAuth`:

```ts
import { Hono } from "hono"
import { z } from "zod"
import { internalAuth } from "../../middleware/internal-auth.js"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import { AppError } from "../../lib/errors.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import {
  cancelRun,
  createRunForProject,
  deleteRun,
  failRun,
  getRunDetail,
  listRunsForProject,
} from "./runs.service.js"
```

Then append at the END of the file (after the existing cancel route):

```ts
// Internal endpoint — service-to-service auth, NOT license-key auth.
runsRoutes.use("/v2/internal/*", internalAuth)

const FailRunBodySchema = z.object({
  failureReason: z.string().min(1).max(500),
})

runsRoutes.post(
  "/v2/internal/runs/:runId/fail",
  async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new AppError("VALIDATION_ERROR", "Body must be valid JSON", 400)
    }
    const parsed = FailRunBodySchema.safeParse(body)
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid request body",
        400,
        parsed.error.flatten(),
      )
    }
    const result = await failRun(c.req.param("runId"), parsed.data.failureReason)
    return c.json(ok(result))
  },
)
```

- [ ] **Step 3: Run the test to verify the happy path PASSES**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "B32|fail|pass" | tail -10
```

Expected: 362 pass / 0 fail (361 baseline + B32 happy-path test). All other tests still PASS.

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: 13/13 PASS.

---

## Task 6: Add tests for status branches + auth + ownership (batched)

**Files:**
- Modify: `apps/mvp_api/src/modules/runs/runs.test.ts` (append more tests inside the B32 describe block)

The implementation in Task 5 covers all branches. These tests verify them and should pass on first run.

- [ ] **Step 1: Append the branch + auth tests**

Append inside the `describe("POST /v2/internal/runs/:runId/fail", ...)` block (after the happy-path test from Task 4):

```ts
it("CANCELLED → 409 CONFLICT (cancel already refunded); no state mutations", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "CANCELLED", usageRecordId: "ur_x" },
  ])

  const res = await failRunRequest("run_x", {
    failureReason: "validation_error",
  })
  expect(res.status).toBe(409)
  const body = (await res.json()) as {
    success: false
    error: { code: string; message: string }
  }
  expect(body.success).toBe(false)
  expect(body.error.code).toBe("CONFLICT")
  expect(body.error.message).toContain("cancelled")
  expect(mockRunUpdate).not.toHaveBeenCalled()
  expect(mockUsageRecordCreate).not.toHaveBeenCalled()
  expect(mockEntitlementUpdateMany).not.toHaveBeenCalled()
})

it("DONE → 409 CONFLICT (run completed); no state mutations", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "DONE", usageRecordId: "ur_x" },
  ])

  const res = await failRunRequest("run_x", {
    failureReason: "post_done_failure",
  })
  expect(res.status).toBe(409)
  const body = (await res.json()) as {
    success: false
    error: { code: string; message: string }
  }
  expect(body.error.code).toBe("CONFLICT")
  expect(body.error.message).toContain("completed")
  expect(mockRunUpdate).not.toHaveBeenCalled()
  expect(mockUsageRecordCreate).not.toHaveBeenCalled()
})

it("FAILED → idempotent 200 no-op; first-write-wins on failureReason", async () => {
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
    failedAt: new Date("2026-05-02T13:00:00Z"),
    failureReason: "first_failure_reason",
  }))

  const res = await failRunRequest("run_x", {
    failureReason: "second_failure_reason",
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: RunDetailWire }
  expect(body.data.status).toBe("FAILED")
  // First-write-wins: returned reason is the original, not the new one
  expect(body.data.failureReason).toBe("first_failure_reason")
  // No second refund or decrement
  expect(mockUsageRecordCreate).not.toHaveBeenCalled()
  expect(mockEntitlementUpdateMany).not.toHaveBeenCalled()
})

it("returns 404 when the run doesn't exist", async () => {
  mockQueryRaw.mockImplementation(async () => [])
  const res = await failRunRequest("run_nope", {
    failureReason: "validation_error",
  })
  expect(res.status).toBe(404)
  expect(mockRunUpdate).not.toHaveBeenCalled()
})

it("returns 404 when the run is soft-deleted (where filter excludes deletedAt)", async () => {
  mockQueryRaw.mockImplementation(async () => [])
  const res = await failRunRequest("run_deleted", {
    failureReason: "validation_error",
  })
  expect(res.status).toBe(404)
})

it("returns 401 when x-internal-secret header is missing", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
  ])
  const res = await makeApp().request(`/v2/internal/runs/run_x/fail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ failureReason: "validation_error" }),
  })
  expect(res.status).toBe(401)
  expect(mockQueryRaw).not.toHaveBeenCalled()
})

it("returns 401 when x-internal-secret header is wrong", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
  ])
  const res = await failRunRequest(
    "run_x",
    { failureReason: "validation_error" },
    { "x-internal-secret": "wrong-secret" },
  )
  expect(res.status).toBe(401)
  expect(mockQueryRaw).not.toHaveBeenCalled()
})

it("validates failureReason is required (empty body → 400)", async () => {
  const res = await failRunRequest("run_x", {})
  expect(res.status).toBe(400)
})

it("validates failureReason is non-empty string (empty string → 400)", async () => {
  const res = await failRunRequest("run_x", { failureReason: "" })
  expect(res.status).toBe(400)
})

it("truncates failureReason longer than 500 chars (defensive, no 400)", async () => {
  mockQueryRaw.mockImplementation(async () => [
    { id: "run_x", status: "RUNNING", usageRecordId: "ur_x" },
  ])
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
    status: "FAILED",
    cancelledAt: null,
    failedAt: new Date(),
    failureReason: "x".repeat(500),
  }))

  // 500 chars = exactly at the zod cap → accepted.
  const reason500 = "x".repeat(500)
  const res = await failRunRequest("run_x", { failureReason: reason500 })
  expect(res.status).toBe(200)

  // 501 chars → zod rejects with 400 (route guards before service).
  const reason501 = "x".repeat(501)
  const res2 = await failRunRequest("run_x", { failureReason: reason501 })
  expect(res2.status).toBe(400)
})
```

- [ ] **Step 2: Run all mvp-api tests**

```bash
bunx turbo test --filter=@solarlayout/mvp-api --force 2>&1 | grep -E "B32|fail|pass" | tail -15
```

Expected: 372 pass / 0 fail (361 baseline + 11 B32 tests = 1 happy-path + 3 status branches + 2 ownership 404s + 2 auth + 2 validation + 1 truncation).

If any test fails, paste the failure verbatim and report. The implementation in Task 5 should cover all of these — failures indicate either a copy-paste mismatch in the implementation or a test setup issue.

---

## Task 7: Full monorepo gate

**Files:** none

- [ ] **Step 1: Run all four JS gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: per-workspace test counts unchanged from main baseline EXCEPT:
- `mvp-api`: +11 (B32 tests, baseline 361 → 372)
- All others: 0 delta

If any other workspace's count moves, STOP — that means a new env import or middleware export leaked through.

Skip sidecar pytest (B32 is mvp-api-only).

---

## Task 8: Update backend plan + commit + push

**Files:**
- Modify: `docs/initiatives/post-parity-v2-backend-plan.md` (flip B32 row to done)

- [ ] **Step 1: Update B32 row in backend plan**

Find the `| B32 |` row (around line 149). Update Status column from `**todo**` to `**done**` and append a closure note matching B30's style:

> **Closed 2026-05-02.** Internal endpoint `POST /v2/internal/runs/:runId/fail` shipped behind `MVP_INTERNAL_SHARED_SECRET` shared-secret auth. failRun service mirrors cancelRun (B30) — single-tx FOR UPDATE lock, refund row + entitlement decrement, status branch handling. failureReason capped at 500 chars; first-write-wins on FAILED idempotency. Caller (sidecar/orchestrator) wires up in Spike 2. Plan: `docs/superpowers/plans/2026-05-02-b32-failed-runs-path.md`. 11 mvp-api integration tests covering all status branches + auth + validation.

- [ ] **Step 2: Stage all changes**

```bash
git status
git add apps/mvp_api/src/env.ts \
        apps/mvp_api/src/middleware/internal-auth.ts \
        apps/mvp_api/src/modules/runs/runs.service.ts \
        apps/mvp_api/src/modules/runs/runs.routes.ts \
        apps/mvp_api/src/modules/runs/runs.test.ts \
        docs/initiatives/post-parity-v2-backend-plan.md \
        docs/superpowers/plans/2026-05-02-b32-failed-runs-path.md
```

- [ ] **Step 3: Atomic commit**

```bash
git commit -m "$(cat <<'EOF'
feat(mvp-api): B32 — failed-runs internal path with refund

Internal endpoint POST /v2/internal/runs/:runId/fail — symmetric with
B30's cancel endpoint but triggered by orchestrator/sidecar on engine
failure (validation error, timeout, sidecar exception). Idempotent.

Behavior:
- RUNNING   → flip to FAILED + refund UsageRecord + decrement Entitlement;
              persist failedAt + failureReason; return 200 with updated Run
- CANCELLED → 409 CONFLICT (cancel already issued the refund)
- DONE      → 409 CONFLICT (run completed; orchestrator race)
- FAILED    → idempotent 200 no-op (first-write-wins on failureReason)
- 404 on missing or soft-deleted run

Auth: shared-secret via x-internal-secret header against
MVP_INTERNAL_SHARED_SECRET env var. Fails closed (503) when env unset.
Operator wires the env in staging/prod separately.

failureReason capped at 500 chars (zod schema + service-side truncation
defense). v1 free-text; admin tools may differentiate later.

Caller wiring (orchestrator → /fail) lands with Spike 2's persisted-job
work. For now this is dormant infrastructure: desktop runs the engine
locally and handles failures client-side.

Tests: +11 mvp-api integration tests (RUNNING/CANCELLED/DONE/FAILED
branches, 404 ownership, auth missing/wrong, validation, truncation).

Spec: docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md §B.6
Plan: docs/superpowers/plans/2026-05-02-b32-failed-runs-path.md
B30:  cancelRun pattern (mvp-api/runs.service.ts:cancelRun)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push -u origin parity/b32-failed-runs-path
```

- [ ] **Step 5: Confirm clean state**

```bash
git status
git log --oneline -3
```

Expected: clean tree, branch tracking origin, log shows the new B32 commit on top of main's tip.

CI/CD will deploy on merge. Operator must set `MVP_INTERNAL_SHARED_SECRET` in Vercel staging + prod env BEFORE the endpoint sees real traffic — otherwise it returns 503. Until Spike 2's caller is wired, that's harmless.

---

## Task 9: Hand off to next row

- [ ] **Step 1: Surface what's now unblocked**

Summarize for the user:
- **B32 done.** Failed-runs path shipped end-to-end. CI/CD will deploy.
- **B31 still next** — sidecar's completion-path FOR UPDATE check (closes the cancel race story end-to-end at the engine layer; v1 race already DB-safe but B31 adds sidecar-side abort + S3 cleanup).
- **B28** still todo — desktop RunsList renders CANCELLED + FAILED variants. The wire shape is ready (B30 shipped lifecycle fields).
- **B33** unblocked once B28 lands — desktop cancel modal + cancelRunV2 wiring.
- **B34** unblocked anytime — `/dashboard/usage` calc-history extension; standalone mvp-web work.
- **Spike 2 readiness:** B30 + B32 are shipped. B31 is the last engine-layer prerequisite. After B31, Spike 2 can kick off (cloud-compute offload).

The CLAUDE.md non-negotiable applies: do not start the next row's planning without explicit user "go."

---

## Risks + Watch-Items

- **Endpoint is dormant in v1.** Desktop runs the engine locally; no caller exists for `/fail` yet. Risk: code rots before Spike 2 wires it up. Mitigation: tests cover the contract; if Spike 2 deviates, the wire shape is locked here.
- **`MVP_INTERNAL_SHARED_SECRET` rotation.** Once Spike 2 wires a caller, rotating the secret requires coordinated env-var update across mvp-api (Vercel) + the caller. Note in operator runbook (out of scope here).
- **`updateMany` decrement on no-match scenarios.** Same as B30: if the matching active entitlement is already deactivated by failure-detect time, the decrement no-ops. Refund row + Run flip still land. SUM(count) quota math (B34) reflects refund correctly.
- **Body parse / json error handling.** The route uses `c.req.json()` inside a try/catch (matches B16's pattern at runs.routes.ts:53-57). Malformed JSON → 400. Empty body → 400 via zod.
- **Failure detection at sidecar (Spike 2 concern).** Distinguishing "transient error retry" vs "permanent failure call /fail" is the orchestrator's call. Out of scope for B32; we just expose the contract.

---

## Self-Review Checklist (run by the executor before handoff)

- [ ] All 9 tasks marked complete.
- [ ] No `TODO`/`TBD`/placeholder strings in service/route/test code.
- [ ] B27 memo §A.3 (failed-runs scope) → covered by Task 5's failRun + tests.
- [ ] B27 memo §B.6 (internal endpoint, transactional refund) → covered by Task 5 + auth middleware.
- [ ] All 4 status branches (RUNNING/CANCELLED/DONE/FAILED) + 404 + auth × 2 + validation × 2 + truncation = 11 tests in B32 describe block.
- [ ] No regression in mvp-api's other 361 tests.
- [ ] No regression in any other workspace's test count.
- [ ] Single atomic commit pushed; B32 row marked done.
- [ ] `MVP_INTERNAL_SHARED_SECRET` env var registered as optional (zod schema); commit body documents Vercel deploy ask for staging + prod.
