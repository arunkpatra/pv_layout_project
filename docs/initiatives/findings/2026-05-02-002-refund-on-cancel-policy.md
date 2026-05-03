# Refund-on-Cancel Policy Decision Memo

**Date:** 2026-05-02
**Plan row:** [B27](../post-parity-v2-backend-plan.md) — Refund-on-cancel policy
**Tier:** T3 (decision memo per B27's row spec; per Prasanta's free-hand directive on solar-domain calls supported by industry standards)
**Owner:** Arun (engineering + product) — locked via interview 2026-05-02
**Status:** Locked — supersedes the "no refund" defaults at V2-plan §49 + offload-memo §14
**Related:** [B28 — visible cancelled runs](../post-parity-v2-backend-plan.md) (this memo's policy is B28's implementation foundation)

---

## Decision summary

**Cancel and Failed runs trigger a full refund. The Run is preserved with status `CANCELLED` or `FAILED` (not soft-deleted), shown in customer history (Tauri Runs gallery + `/dashboard/usage` calculation history) with status badges. The cancel marker is persisted at the Run row before any potentially-completing job-completion logic; sidecar's completion path checks the marker before publishing deliverables. The cancel UI presents a confirmation modal (cancel is destructive; modal matches user mental model). The user explicitly affirmed pre-paid-pack reliability concerns — losing a single calc is not acceptable.**

This supersedes:

- **V2-plan §49**: *"Run delete does not refund the calc"* — partially superseded. Run **delete** (B18) still does not refund (delete = "remove from history," post-completion). Run **cancel** (new endpoint) does refund.
- **Offload-memo §14**: *"cancelling a job after submission charges the user the full calc"* — fully superseded.

## Why now

B27 was queued P0 because Spike 2's persisted Job state, the planned `POST /v2/jobs/:id/cancel` endpoint, and the Job/Run/UsageRecord lifecycle all depend on this policy. Decision had to lock before Spike 2 kickoff. Trigger was SMOKE-LOG `S3-02` (2026-05-01) — Arun cancelled a multi-plot generate, observed orphan Run + debited calc + no refund + no UI surface for cancelled runs, flagged for explicit revisit.

## Decision A — Refund yes

### A.1 Scope

| Run terminal state | Calc refund? | Quota impact | Visible to user? | Status badge |
|---|---|---|---|---|
| **DONE** (job completed, deliverables exist) | No | Counts as 1 used | Yes, current Tauri behavior | `Completed` |
| **CANCELLED** (user clicked Cancel mid-job) | **Yes (full)** | Does not count | Yes, B28 schema | `Cancelled` |
| **FAILED** (system OR user-input error) | **Yes (full)** | Does not count | Yes, B28 schema | `Failed` |
| **soft-deleted** (B18 `deletedAt != null`) | No (B18 unchanged) | Original quota impact stands | No, hidden from UI | n/a |

User-input errors get the same refund as system errors — *standard SaaS behavior* per Arun's interview answer. Granularity (e.g. "Failed during validation" vs "Failed during compute") is not surfaced to the customer at v1; one `Failed` badge covers both.

### A.2 Race semantics — cancel always wins ("intent-based")

Locked decision: cancel arriving after the user clicks the Cancel button is honored, even if the sidecar has begun publishing deliverables. The cancel marker is persisted at the Run entity FIRST; sidecar's job-completion path re-reads the marker before committing the DONE state.

Two boundary cases:
- **Cancel arrives before sidecar finishes:** clean win — Run flips to CANCELLED, refund row written, sidecar aborts upload (or rolls back).
- **Cancel arrives after sidecar has flipped Run to DONE:** cancel returns 409 (conflict — already completed). Customer-facing copy: "This run has already completed; use Delete to remove it from history (no refund)." This is the "you can't unsend a settled Stripe charge" boundary.

Rationale for 409 boundary rather than "always allow cancel even after DONE": (a) once DONE is committed, the user can already see the deliverables (UI shows them); reversing course would require deleting blobs the user has potentially viewed; (b) commercially analogous to other SaaS cancel semantics (Vercel deploy cancel, AWS job cancel — all bounded by completion state).

### A.3 Failed-runs path (analogous to cancel)

When the orchestrator detects a failure (sidecar exception, validation failure, timeout), the same transactional path runs:
- Run.status: RUNNING → FAILED
- UsageRecord refund row written
- Single Postgres transaction

The customer sees "Failed" in calc history, the calc is back in their quota, and they can re-run.

Failure capture happens at the same transactional point that DONE would have happened. The endpoint shape is *internal* (sidecar callback or orchestrator-emitted), not user-facing. Customer never sees a failure-specific endpoint; the experience is "I clicked Generate, the dashboard said Failed, my calc is back."

## Decision B — Mechanics

### B.1 Refund-write mechanism: separate negative `UsageRecord` row

- Original charge stays immutable (audit trail preserved for regulators / accountants / support).
- Refund = new `UsageRecord` row with:
  - `count = -1` (or matching the original's count value if multi-plot ever charges differently)
  - `kind = "refund"`
  - `refundsRecordId = <original UsageRecord.id>`
- Quota math is `SUM(count) WHERE userId = ? AND kind != 'expired'` over the entitlement window.
- Customer-facing dashboard hides refund rows; just shows the original entries with status badges from joined Run.

Why over annotating the original: regulators / accountants / support reviewers expect immutable charge records. Annotation creates "is this row the original or the refund?" schema ambiguity. Negative-count refund rows are the canonical pattern (Stripe, Square, every billing system).

### B.2 Transaction model: synchronous Postgres transaction with row-level locking

Cancel endpoint (`POST /v2/projects/:id/runs/:runId/cancel`):

1. `BEGIN`.
2. `SELECT … FOR UPDATE` on the Run row (joined ownership filter from existing B17/B18 pattern).
3. Branch on `Run.status`:
   - **RUNNING** → `UPDATE Run SET status='CANCELLED', cancelledAt=NOW()` + `INSERT UsageRecord (count=-1, kind='refund', refundsRecordId=<original>)`. `COMMIT`. Return 200 with updated Run.
   - **CANCELLED** → no-op, idempotent. Return 200 with current Run state. (Refund row already exists; no second refund.)
   - **DONE** → `ROLLBACK`. Return 409 CONFLICT. ("Run already completed.")
   - **FAILED** → no-op. Return 200. (Refund already issued by failure path.)
4. If Run not found OR cross-user OR parent project soft-deleted → 404 (existing pattern).

Why synchronous (vs eventual via reconciler): user explicitly demanded reliability — pre-paid-pack model means a lost calc generates support churn. Synchronous transaction gives the customer immediate confirmation and avoids any window of inconsistency. No background reconcilers, no "did my refund land yet?" UI states.

### B.3 Sidecar's completion path checks the cancel marker

Before/around committing DONE, sidecar's flow:

1. `BEGIN`.
2. `SELECT Run.status … FOR UPDATE` (locks the row).
3. If `status == CANCELLED` → **abort** the completion. If S3 blobs were already uploaded, fire best-effort delete; orphan blobs are tolerable (S3 lifecycle policy reaps; cleanup not in scope per Arun's interview disposition).
4. If `status == RUNNING` → upload deliverables (if not already done) + `UPDATE Run SET status='DONE'`. `COMMIT`.
5. If `status == DONE` (concurrent sidecar retry hits already-completed) → no-op.

The `SELECT … FOR UPDATE` serializes the cancel endpoint and the sidecar completion path at the row level. Whichever transaction commits first wins; the other sees the post-commit state on its next read and behaves correctly. Cancel always wins per A.2 only because cancel persists FIRST in the typical flow (user click → cancel API → DB transaction). If the sidecar has already committed DONE, the cancel endpoint sees DONE and returns 409 per A.2's boundary.

### B.4 Orphan Run row stays visible (status = CANCELLED, `deletedAt = null`)

- Frontend's current `useGenerateLayout` cleanup-on-cancel call swaps from `deleteRunV2` → new `cancelRunV2` (this is in the implementation rows below).
- The Run row keeps `deletedAt = null`, status = CANCELLED.
- Listed in Tauri Runs gallery with Ban icon (B28's frontend rendering).
- Listed in `/dashboard/usage` calculation history with status = "Cancelled" badge.
- User can later soft-delete via B18 if they want to clean up history (B18 unchanged: `deletedAt` set, refund row preserved). A user-deleted CANCELLED run hides from history but the calc stays refunded — the user got their money back already; deletion is just hiding the record.

### B.5 `/dashboard/usage` UI: charge rows only, status badges from Run join

The page reads `UsageRecord WHERE kind = 'charge'` joined with `Run` for status. Refund rows are NOT shown to the customer. The customer sees three status badges (Completed | Cancelled | Failed) on their charge entries, with the quota-remaining number reflecting the refunds invisibly.

If forensic detail is ever needed (e.g., a support inquiry "I see N charges but my quota says M remaining, why?"), that's an admin/support tool concern — separate UI, separate auth scope. Not a customer-page concern.

### B.6 Failed-runs path uses the same B.1–B.5 mechanism

Failed runs are not user-cancellable (no user click). The orchestrator emits the failure transition internally:
- `BEGIN`.
- `SELECT Run … FOR UPDATE`.
- `UPDATE Run SET status='FAILED', failedAt=NOW(), failureReason=<text>` + `INSERT UsageRecord (count=-1, kind='refund', refundsRecordId=<original>)`.
- `COMMIT`.

> **⚠ AMENDED 2026-05-03 (by C1 of the cloud-offload spec):** the original wording said *"internal — no public endpoint. Sidecar callback or orchestrator-detected timeout triggers it."* That framing was wrong on two axes — wrong for v1 (the desktop is the orchestrator; sidecar has no DB access), wrong for the cloud-offload future (Lambdas write RDS direct via psycopg2 per **D9**; no HTTP callbacks at any layer). The transactional pattern above is correct and stands; the **trigger mechanism** is replaced as follows:
>
> - **In the cloud-offload architecture** (master spec [`2026-05-03-cloud-offload-architecture.md`](../../superpowers/specs/2026-05-03-cloud-offload-architecture.md)): the `compute-layout` Lambda's top-level try/except runs the transactional FAILED-write directly via psycopg2 (per **D17**). No callback, no internal endpoint, no shared secret. Implemented in row **C12 — Lambda fail path**.
> - **As a backstop for crashed Lambdas** that don't reach their try/except: a stuck-RUNNING reconciler (per **D18**) sweeps `Run.status='RUNNING'` rows older than N minutes and flips them to FAILED + refund. Implemented in row **C13 — Stuck-RUNNING reconciler**.
> - **There is no "sidecar callback."** The sidecar dies entirely (per **D2**); cloud paths are canonical for fail reporting end-to-end.
>
> The halted plan at `docs/superpowers/plans/2026-05-02-b32-failed-runs-path.md` (deleted by C1) was a writing-plans output against this paragraph's incorrect framing. That plan was the trigger for the architectural reset captured in the master spec.

### B.7 Cancel UI presents a confirmation modal

User clicks Cancel button → modal: *"Cancel this generation? You'll lose any work in progress. Your calculation will be refunded."* Two buttons: `Cancel generation` (destructive accent, fires the API call) | `Keep generating` (dismiss modal).

Why confirm rather than auto-immediate: cancel is destructive (loses in-progress compute, even though calc is refunded); standard mental model is confirmation modal for destructive actions. Arun's interview answer.

The modal copy explicitly mentions the refund so the customer doesn't worry about losing their calc.

## Decision C — Interaction with B28 (visible cancelled runs)

This memo's Decision A + B is **the policy basis for B28's implementation**. The two rows are tightly coupled:

- B27 → "what does cancelled mean to the customer? what happens to the calc?"
- B28 → "how is the cancelled state surfaced in the UI?"

Locked from Decision A + B:
- `Run.status` enum = `RUNNING | DONE | CANCELLED | FAILED` (B28's proposed schema, ratified here)
- `deletedAt` semantics unchanged (B18: user soft-delete, hides from history, no refund)
- Schema migration ships in **one** Prisma migration covering both: `Run.status`, `Run.cancelledAt`, `Run.failedAt`, `Run.failureReason`, `UsageRecord.kind`, `UsageRecord.refundsRecordId`. Coordinate timing with B28.
- Wire shape (B17/B15/B12 emit `status` on RunSummary + RunDetail) is the contract between this memo's mechanics and B28's frontend rendering.

B28 stays a separate row but its scope locks from this memo. No further "should we" questions remain for B28; only "how to render."

## Implementation rows to follow

The placeholder rows below should be **added to `docs/initiatives/post-parity-v2-backend-plan.md`** as part of closing B27. **Concrete implementation plans for these rows must be developed via the `superpowers:writing-plans` skill in subsequent sessions** (per the multi-surface complexity — these rows touch Postgres schema + mvp_api endpoint + sidecar contract + desktop frontend + cloud dashboard simultaneously).

| New row | Surface | Brief | Depends |
|---|---|---|---|
| **B29** | mvp_db schema | Single Prisma migration: `Run.status` enum + `Run.cancelledAt` / `Run.failedAt` / `Run.failureReason` + `UsageRecord.kind` ('charge' \| 'refund' \| future) + `UsageRecord.refundsRecordId` FK. Backfill: existing Runs → `status = DONE`; existing UsageRecords → `kind = 'charge'`, `refundsRecordId = NULL`. | — |
| **B30** | mvp_api | New `POST /v2/projects/:id/runs/:runId/cancel` endpoint per B.2. Idempotent. Returns updated RunWire. Joined ownership filter, V2 envelope, V2 error code mapping (CONFLICT for DONE, NOT_FOUND for missing/cross-user). | B29 |
| **B31** | sidecar / orchestrator | Sidecar's completion path adds the `SELECT … FOR UPDATE` cancel-marker check per B.3. Aborts on CANCELLED, attempts S3 cleanup (best-effort). | B29, B30 |
| **B32** | sidecar / orchestrator | Failed-runs internal path per B.6: orchestrator-detected failure flips `Run.status = FAILED` + writes refund row + records `failureReason`. | B29 |
| **B33** | desktop frontend | `useGenerateLayout` cleanup-on-cancel: swap `deleteRunV2` → new `cancelRunV2`. Add confirmation modal per B.7. RunsList renders `CANCELLED` + `FAILED` distinctly (B28's frontend work — coordinate). | B30, B28 |
| **B34** | mvp_web frontend | `/dashboard/usage` extension: `kind='charge'` filter + Run-join for status badge. Three badges (Completed / Cancelled / Failed). Refund rows hidden from customer view. | B29, B30 |

These rows in `docs/initiatives/post-parity-v2-backend-plan.md` capture intent only. Each will be planned in detail via `superpowers:writing-plans` before execution begins, in a Spike-2 (or B27-implementation) session.

## Risks / explicit dispositions

From the interview:

- **S3 blob orphans on cancel-during-upload race.** Disposition: ignore. S3 is cheap; cleanup/archival is a future concern. Best-effort delete inside B.3's sidecar abort path is sufficient for v1.
- **Schema migration to add new columns.** Disposition: fine, normal product development. Single migration per B.4 / Decision C.
- **Concurrent cancel from two clients.** Disposition: highly unlikely (desktop app, single-user). `SELECT … FOR UPDATE` serializes them anyway; second sees CANCELLED, no-ops.

## What is NOT decided in this memo (explicitly out of scope)

- **Implementation plans for B29-B34.** Use `superpowers:writing-plans` per row.
- **Granularity of "Failed" subtypes.** v1 customers see one badge. Internal admin tools may differentiate later.
- **Refund-credit to a different entitlement bucket.** v1 refund returns the calc to the same originating entitlement. Multi-tier interactions (e.g., user has Free + Basic + Pro entitlements active) — assume refund applies to whichever entitlement was charged. Edge cases (entitlement expired between charge and refund) covered by B29's schema design but not specified here; defer to writing-plans for B29.
- **Customer-visible refund history.** v1 hides refund rows from `/dashboard/usage`. If a "calc refunds" tab is ever added, that's a separate row.
- **Notification on Failed runs.** v1 surfaces Failed in calc history; no email/push notification. Out of scope.

## Sources / citations

- **B27 row** in `docs/initiatives/post-parity-v2-backend-plan.md`
- **V2-plan §49** in `docs/initiatives/post-parity-v2-backend-plan.md` — being amended in the same commit as this memo
- **Offload-memo §14** in `docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md` — being amended in the same commit
- **SMOKE-LOG.md S3-02** in `docs/post-parity/SMOKE-LOG.md` — origin trigger
- **B28 row** in `docs/initiatives/post-parity-v2-backend-plan.md` — coupled implementation
- **Interview transcript** (this conversation, 2026-05-02) — locked all decisions

Per Prasanta's CLAUDE.md §2 free-hand directive: this is a product-policy decision supported by standard SaaS billing patterns (Stripe charge/refund, AWS service refund semantics). No external-source citation required.
