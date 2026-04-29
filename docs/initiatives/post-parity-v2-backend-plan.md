# Initiative: Post-Parity V2 Backend — Desktop App Support

**Status:** In Progress
**Created:** 2026-04-29
**Foundational document:** This file is the authoritative source for all V2 backend work. All architecture, schema, and API decisions must trace back to it.
**Counterpart (desktop):** [pv_layout_project/docs/post-parity/PLAN.md](file:///Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/PLAN.md) — the desktop-side post-parity plan that consumes this V2 surface.
**Supersedes:** [pv-layout-cloud.md](./pv-layout-cloud.md) and [pv-layout-spike-plan.md](./pv-layout-spike-plan.md) — the old "fully cloud-native web port" direction. PVLayout is now a Tauri desktop app; this initiative is the backend-side work to support it.

---

## Living Document Policy

This document and the codebase must never go out of sync.

**Update this document when:**
- A row is added, started, completed, or blocked (update Status column)
- A schema or API decision changes
- A scope decision is made (something moved in or out of scope)
- A locked decision in the Context section needs revision (rare; should be a deliberate event)

**Rule:** Atomic commit per row, just like the parity sweep convention. The plan is updated in the same commit that closes the row.

---

## 1. Purpose and Context

PVLayout is being shipped as a **Tauri desktop application** (Windows / macOS / Linux), not a cloud-native web app. The desktop app's data, billing, and entitlements all live in this backend (mvp_api + mvp_db + mvp_web for the marketing/dashboard surface). The desktop's Rust shell is the API caller (no CORS issue; native HTTP client).

This initiative ships **V2 of the SolarLayout backend** to support the new desktop app: project + run primitives, blob storage for KMZ + run results, idempotent usage reporting, per-tier project quotas. **V1 is frozen** — kept alive only for the existing legacy install (Prasanta's machine) until the desktop app is end-to-end ready, at which point V1 is retired.

**Source of truth for the desktop side:** [pv_layout_project repo](file:///Users/arunkpatra/codebase/pv_layout_project) — particularly `docs/post-parity/PLAN.md` (desktop rows that consume this V2 surface) and the audit at `docs/post-parity/discovery/2026-04-29-002-backend-api-contract-audit.md` (current V1 state).

---

## 2. Locked decisions (do not relitigate)

These came out of a 2026-04-29 brainstorm with Prasanta. They are foundational; the tier ladder, schema additions, and API shape all flow from them.

- **PVLayout is commercially standalone.** No bundles, no multi-product shell, no namespaced feature keys. Future products (BankableCalc, etc.) get their own desktop binaries + their own commercial machinery. Backend is shared infrastructure but compartmentalised via `productId` on entitlements.
- **PAYG-only at v1.** No subscriptions, no proration, no auto-renew. All purchases are one-time Stripe Checkout (`mode=payment`). Pricing already configured in production via `packages/mvp_db/prisma/seed-products.ts`:
  - Free: $0 / 5 lifetime calcs / all features
  - Basic: $1.99 / 5 calcs / `plant_layout`, `obstruction_exclusion`
  - Pro: $4.99 / 10 calcs / + `cable_routing`, `cable_measurements`
  - Pro Plus: $14.99 / 50 calcs / + `energy_yield`, `generation_estimates`
- **Per-tier project quotas (concurrent).** Free=3, Basic=5, Pro=10, Pro Plus=15. Effective quota = max across active+non-exhausted entitlements. Users can delete projects to free slots — gaming the system this way is acceptable (exporting outputs and deleting to reset is a feature, not a bug). Over-quota projects become read-only when ceiling drops.
- **Identity:** shared SolarLayout user account (data-model open via `productId` on entitlements/transactions for future products), but only PVLayout consumes it now.
- **V1 is frozen.** No new features in V1 endpoints. V1 stays live for Prasanta's existing legacy install. Mark frozen in code comments + repo conventions. Marketing-site downloads paused in lockstep with V2 launch.
- **Wallet model: cheapest-tier-first that supports the requested feature.** Already implemented correctly in [`apps/mvp_api/src/modules/usage/usage.service.ts`](../../apps/mvp_api/src/modules/usage/usage.service.ts). Don't change this logic in V2 — just add idempotency around it.
- **Run = persisted artifact.** Each "Generate Layout" click on the desktop = one Run row + one calc-debit. Compare workflow is split-view of 2 runs in same project (no clone-to-second-project pattern). Run delete does not refund the calc.
- **Blob storage for KMZ + run results.** Provider TBD between Vercel Blob (matches existing Vercel-hosted mvp_api) and Cloudflare R2. Decision in B5.
- **Auto-save** for project edits (debounced ~2s) — the `PATCH /v2/projects/:id` endpoint must support frequent small updates without ceremony.
- **Legacy retirement criterion:** "new app + backend working end-to-end." Not 100% line-by-line parity on every legacy decision.

---

## 3. Repo conventions (mandatory — see CLAUDE.md)

This plan inherits the repo's existing rigor. Each row obeys:

- **TDD-first.** Write a failing test before any production code. No exceptions per [`docs/claude-dev-principles.md`](../claude-dev-principles.md).
- **Pre-commit gate.** From repo root, every commit must pass:
  ```bash
  bun run lint && bun run typecheck && bun run test && bun run build
  ```
  When a row touches build infrastructure (package wiring, turbo pipeline, tsconfig paths, build config), use the **clean-environment gate** instead:
  ```bash
  rm -rf packages/*/dist apps/*/dist apps/*/.next && \
    bun run lint && bun run typecheck && bun run test && bun run build
  ```
- **Live apps are `apps/mvp_*` and `packages/mvp_*`.** `apps/web`, `apps/api`, `apps/layout-engine`, `packages/db` are defunct — ignore them. Both `CLAUDE.md` and `docs/architecture.md` are partially stale on this; this plan uses live names exclusively.
- **Self-review for significant rows.** Any row touching 5+ files, introducing new infrastructure, or establishing a new pattern requires `superpowers:code-reviewer` self-review before declaring done.
- **One question at a time during testing.** When a row reaches runtime verification, ask one verification step at a time per [`docs/collaborative-testing-protocol.md`](../collaborative-testing-protocol.md). Never dump a checklist.
- **Atomic commit per row.** Conventional-commits style: `feat: <feature>`, `feat(scope): <feature>` for module-specific work, `fix:` for bug fixes. Intra-row checkpoints use `wip:` and get squashed at row close.
- **Branch hygiene.** This plan executes on branch `post-parity-v2-backend`. PR to main when the plan completes (or per-domain PRs if reviewers prefer smaller diffs).

---

## 4. Tier policy

Each row carries a tier defining what ceremony applies. **Every tier requires TDD + the pre-commit gate.** Tiers add additional ceremony on top.

- **T1 — TDD + gates.** Write failing test → make it pass → run pre-commit gate → commit. The diff and green tests are the audit trail. Most schema additions and CRUD endpoints fit here.
- **T2 — T1 + integration test.** Plus a multi-component test exercising the row across boundaries (handler ↔ service ↔ db, or stripe-webhook ↔ handler ↔ db). Required for any row whose value depends on cross-component behavior.
- **T3 — T1 + decision memo.** Plus a short memo at `docs/initiatives/findings/YYYY-MM-DD-NNN-<slug>.md` capturing architectural decisions (provider choice, schema tradeoff, etc.). For rows that establish patterns or have non-obvious tradeoffs worth recording.

**Spike-first applies separately.** Per `claude-dev-principles.md`, when a row introduces a new pattern (blob storage, idempotency middleware, V2 routing scaffold, Stripe webhook update), do the minimum scaffolding first, verify in a real running environment, then scale to the rest. Mark such rows with **(spike)** in the table; they get the full 5-step Definition of Done from `collaborative-testing-protocol.md`:

1. Automated gates pass (`bun run lint && bun run typecheck && bun run test && bun run build` from repo root)
2. Human local verification — human runs each acceptance step in a real local env
3. CI/CD passes
4. Production verification (after merge)
5. Explicit human sign-off

Non-spike rows skip steps 3–5 at row-close (they happen at PR merge for the whole branch).

---

## 5. Backlog

Domain-grouped; within a group, dependency-ordered. Pick top `todo` row whose `Depends` are all `done`.

`Depends` references `B<n>` rows in this plan or `D<n>` rows in the desktop plan ([pv_layout_project/docs/post-parity/PLAN.md](file:///Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/PLAN.md)).

| # | Feature | Tier | Files / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| **Schema** | | | | | | |
| B1 | Add `projectQuota` to `Product`; seed Free=3 / Basic=5 / Pro=10 / Pro Plus=15 | T1 | `packages/mvp_db/prisma/schema.prisma`; `packages/mvp_db/prisma/seed-products.ts`. New migration. | — | Migration + seed run; Product rows show new field with correct values per slug; existing data unchanged. Test asserts seed values. | todo |
| B2 | Add `idempotencyKey` to `UsageRecord` and `CheckoutSession` | T2 | `packages/mvp_db/prisma/schema.prisma`. Add nullable `idempotencyKey` column + unique constraint on `(userId, idempotencyKey)` for `UsageRecord`. Migration is non-breaking. | — | Migration applied; Prisma client regenerates; concurrent-request test (two simultaneous reportUsage calls with same idempotencyKey) returns the existing record's response, no double-debit. | todo |
| B3 | Add `Project` model | T1 | `packages/mvp_db/prisma/schema.prisma`. Fields: `id, userId, name, kmzBlobUrl, kmzSha256, edits (Json @default("{}")), createdAt, updatedAt, deletedAt`. Indexes: `userId, deletedAt`. | — | Migration applied; Prisma client regenerates; basic CRUD test against the model passes. | todo |
| B4 | Add `Run` model | T1 | `packages/mvp_db/prisma/schema.prisma`. Fields: `id, projectId, name, params (Json), inputsSnapshot (Json), layoutResultBlobUrl, energyResultBlobUrl, exportsBlobUrls (Json @default("[]")), billedFeatureKey, usageRecordId (FK → UsageRecord), createdAt, deletedAt`. Indexes: `projectId, deletedAt`. | B3, B2 | Migration applied; relation to Project + UsageRecord working; cascade soft-delete from Project tested. | todo |
| **Blob storage** | | | | | | |
| B5 | Pick blob provider; bucket setup; auth | T3 (spike) | Decision memo at `docs/initiatives/findings/2026-04-NN-001-blob-provider.md`. Recommend Vercel Blob (Vercel-hosted mvp_api → simplest setup); alternative R2. Memo captures decision + setup steps + env vars (`BLOB_READ_WRITE_TOKEN` etc.). | — | Bucket exists in dev + prod; service-account creds in env files; one round-trip upload+read smoke test passes. Decision memo committed. | todo |
| B6 | Pre-signed URL endpoint for KMZ upload | T2 | `apps/mvp_api/src/modules/blobs/`. New module: `blobs.routes.ts`, `blobs.service.ts`. `POST /v2/blobs/kmz-upload-url` returns `{uploadUrl, blobUrl, expiresAt}`. MIME = KMZ; size cap 50MB. License-key auth. | B5 | Endpoint authed; desktop can PUT to returned URL; blob accessible via `blobUrl` after upload; size cap enforced. Integration test against real bucket. | todo |
| B7 | Pre-signed URL endpoint for run-result upload | T2 | Same module as B6. `POST /v2/blobs/run-result-upload-url` with `{type: "layout"\|"energy"\|"dxf"\|"pdf"\|"kmz"}` discriminator; size caps appropriate per type. | B6 | Endpoint authed; desktop uploads layout JSON + DXF/PDF/KMZ blobs; URLs returned; integration test. | todo |
| **V2 entitlements + usage** | | | | | | |
| B8 | `GET /v2/entitlements` — extends V1 with quota + remaining | T2 | New module or new route within `apps/mvp_api/src/modules/entitlements/`. Adds `/v2/entitlements`. Returns existing `EntitlementSummary` PLUS `projectQuota: number` (max across active entitlements) + `projectsActive: number` + `projectsRemaining: number`. | B1, B3 | Returns correct quota for: free-only user (3), free+basic (5), free+pro (10), exhausted user (lowest active tier), deactivated-entitlement user. Integration test against fixtures. | todo |
| B9 | `POST /v2/usage/report` — idempotent + returns refreshed entitlements | T2 (spike) | `apps/mvp_api/src/modules/usage/`. New `/v2/usage/report` route that wraps existing `reportUsage` with `idempotencyKey` lookup-or-create. Response body extends V1: includes refreshed `availableFeatures` + `remainingCalculations` (saves desktop a round-trip after every generate). | B2, B8 | Duplicate request with same idempotencyKey returns same response, no double-debit (integration test simulates retry). Response includes refreshed entitlements. Spike: human verifies in local + prod after deploy. | todo |
| **V2 projects** | | | | | | |
| B10 | `GET /v2/projects` — list user's projects | T2 | New module `apps/mvp_api/src/modules/projects/`. `projects.routes.ts`, `projects.service.ts`. Returns `[{id, name, kmzBlobUrl, kmzSha256, createdAt, updatedAt, runsCount, lastRunAt}]`. Excludes soft-deleted. Sorted by `updatedAt DESC`. Cap at 100 (no pagination at v1). | B3, B4 | Returns only caller's projects. Soft-deleted hidden. Integration test. | todo |
| B11 | `POST /v2/projects` — create project + quota check | T2 | Same module. Body: `{name, kmzBlobUrl, kmzSha256, edits?}`. Compute current quota (B8 helper) + project count → 402 if over quota; else insert. Returns full Project row. | B10 | Quota enforced; over-quota returns 402 with explicit message; under-quota inserts and returns. Integration test for both paths. | todo |
| B12 | `GET /v2/projects/:id` — get project with embedded runs summary | T2 | Same module. Returns Project row + `runs[]` (id, name, params summary, createdAt). Full run details via separate endpoint (B17). 404 on not-yours / soft-deleted. | B10 | Returns own project; 404 on others' / soft-deleted; runs list embedded. Integration test. | todo |
| B13 | `PATCH /v2/projects/:id` — update project (auto-save target) | T2 | Same module. Body: subset of `{name, edits}`. Cannot patch `kmzBlobUrl` or `kmzSha256` (immutable post-create). 403 on not-yours. Optimised for frequent small writes (auto-save). | B10 | Updates name + edits; rejects kmzBlobUrl/kmzSha256 changes; returns updated row; integration test including rapid-fire small edits. | todo |
| B14 | `DELETE /v2/projects/:id` — soft delete + cascade | T1 | Same module. Sets `deletedAt`. Cascade soft-delete to Runs (B4). Frees a quota slot. **Does not delete blob assets** (orphaned blobs are a separate cleanup job — defer). | B10, B4 | Project disappears from `GET /v2/projects`; quota available again; runs hidden; blobs persist (verify orphan-cleanup is in deferred backlog). | todo |
| **V2 runs** | | | | | | |
| B15 | `GET /v2/projects/:id/runs` — list runs in project | T1 | New module `apps/mvp_api/src/modules/runs/` (or under projects/). Returns `[{id, name, params, billedFeatureKey, createdAt}]`. Excludes soft-deleted. | B12 | Returns runs for own project; 404 on not-yours; soft-deleted hidden. | todo |
| B16 | `POST /v2/projects/:id/runs` — create run + atomic debit | T2 (spike) | Same module. Body: `{name, params, billedFeatureKey, idempotencyKey}`. Atomically: validate ownership → debit calc via `reportUsage` (B9 reuse) → insert Run row with `usageRecordId` link → return Run + pre-signed result-upload URL. If debit fails (402), no Run row created. Idempotent retry returns existing Run. | B15, B9, B7 | Success path debits 1 calc + creates Run + returns pre-signed URL. 402 path leaves DB clean (no orphan Run). Idempotent retry returns existing Run, no double-debit. Spike-verify in local + prod. | todo |
| B17 | `GET /v2/projects/:id/runs/:runId` — full run details | T1 | Same module. Returns full Run row including blob URLs (which are pre-signed-readable for the caller; signing happens on read). | B15 | Returns own run; 404 on not-yours / soft-deleted; blob URLs present and signed. Integration test. | todo |
| B18 | `DELETE /v2/projects/:id/runs/:runId` — soft delete (no refund) | T1 | Same module. Sets `deletedAt` on Run. Does NOT refund the calc debit. | B15 | Run hidden from list; calc count unchanged (verified via /entitlements before/after). Integration test. | todo |
| **Stripe + webhooks** | | | | | | |
| B19 | Stripe webhook update — propagate `projectQuota` to Entitlement | T2 | `apps/mvp_api/src/modules/webhooks/` and/or `apps/mvp_api/src/modules/billing/`. Existing entitlement-grant flow on `checkout.session.completed` does not capture per-product `projectQuota`. Either add column to Entitlement or compute on read via Product join (recommend column for read-perf). | B1 | New purchase → entitlement reflects projectQuota; B8 reflects new ceiling immediately. Integration test against a Stripe test webhook payload. | todo |
| **V1 deprecation** | | | | | | |
| B20 | Pause downloads on `solarlayout.in` (mvp_web) | T1 | `apps/mvp_web/`. Replace download CTA with "Coming soon — desktop app launching shortly" placeholder. Does not affect API; legacy install keeps working against V1 endpoints. | — | Marketing site shows updated CTA; download links 404 or redirect. Manual visual verification. | todo |
| B21 | Mark V1 endpoints "frozen" | T1 | All V1 route files in `apps/mvp_api/src/modules/`. Add file-header comment: `// FROZEN — no new features. Maintained for legacy install only.` Document convention in repo CLAUDE.md or this plan. | — | All V1 route files have frozen markers; convention documented; reviewers know not to add features there. | todo |
| **Telemetry** *(deferred)* | | | | | | |
| B22 | `POST /v2/telemetry/event` — app-level events | T2 | Audit risk #2. Stores `{userId?, sessionId, eventType, eventName, payload (Json), userAgent, createdAt}`. Receives session start/end, errors, feature usage beyond debits. | B8 | Endpoint accepts events; rate-limited; events queryable by admin. | **deferred** — add when desktop has events worth reporting; not v1. |

---

## 6. Process per row

1. Pick the top `todo` row whose `Depends` are all `done`.
2. Read the row's `Files / Notes` end-to-end. Read adjacent files in the same module for context.
3. **Write the failing test first** (TDD discipline per `claude-dev-principles.md`). Verify it fails for the right reason.
4. Implement the minimum code to make the test pass.
5. Apply the row's tier ceremony (T2 → integration test; T3 → decision memo).
6. **Run the pre-commit gate** from repo root (or clean-environment gate if build infra changed).
7. **Self-review with `superpowers:code-reviewer`** if the row is significant (5+ files, new infra, new pattern).
8. Atomic commit: `feat(<scope>): <feature name>`. Intra-row checkpoints use `wip:` and squash at close.
9. Flip `Status` to `done` in this file.
10. **For (spike) rows:** complete the 5-step Definition of Done (gates → human local → CI → prod → human sign-off) before declaring done.

---

## 7. Out of scope (deferred)

- **Telemetry endpoint (B22).** Defer until desktop has events worth reporting.
- **Multi-tenancy / project sharing.** Single-user projects only at v1.
- **Annual subscriptions.** PAYG-only at v1. Add if customer demand surfaces post-launch.
- **Razorpay swap-out.** Stripe at v1; thin abstraction kept open for future swap.
- **Pagination on `GET /v2/projects` and `GET /v2/runs`.** Cap at 100 for v1; pagination later if a power user hits the cap.
- **Project export/import (`.slproject` file format).** Defer until customer asks.
- **N-way run comparison (parameter sweep).** v1 caps compare at 2 runs.
- **Auth: anything beyond perpetual `sl_live_*` license keys.** No password reset, no MFA, no email verification beyond Clerk's. Clerk handles first-login.
- **Orphan blob cleanup job.** Soft-deleted projects/runs leak blob assets. Add a periodic cleanup job post-launch.
- **CORS update for Tauri origin.** Not needed — Tauri Rust shell makes calls natively (no browser origin). Keep `MVP_CORS_ORIGINS` allowlist webview-only.

---

## 8. See also

- [`docs/architecture.md`](../architecture.md) — repo architecture (partially stale on app naming; mvp_* is canonical).
- [`docs/claude-dev-principles.md`](../claude-dev-principles.md) — TDD + spike-first + self-review.
- [`docs/collaborative-testing-protocol.md`](../collaborative-testing-protocol.md) — one-question-at-a-time + 5-step DoD.
- [`docs/initiatives/pv-layout-cloud.md`](./pv-layout-cloud.md) — **superseded** old web-port direction.
- [`docs/initiatives/pv-layout-spike-plan.md`](./pv-layout-spike-plan.md) — **superseded** old web-port spike plan.
- Desktop counterpart: [pv_layout_project/docs/post-parity/PLAN.md](file:///Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/PLAN.md).
- Discovery audits (in pv_layout_project repo):
  - `docs/post-parity/discovery/2026-04-29-001-legacy-app-capability-audit.md`
  - `docs/post-parity/discovery/2026-04-29-002-backend-api-contract-audit.md`

---

## 9. Decisions log

Decisions made during execution that affect future rows go here. Each entry: date + row that surfaced it + decision + rationale.

*(empty at start; populated as rows execute)*

---

## 10. Changelog

- **2026-04-29 v1.0** — Initial scoping. Consolidates decisions from 2026-04-29 brainstorm session in `pv_layout_project` repo. Branched on `post-parity-v2-backend`.
