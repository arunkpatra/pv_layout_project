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
- **Prepaid packs only at v1.** No subscriptions, no proration, no auto-renew. All purchases are one-time Stripe Checkout (`mode=payment`) for fixed-size calc packs. Pricing already configured in production via `packages/mvp_db/prisma/seed-products.ts`:
  - Free: $0 / 5 lifetime calcs / all features
  - Basic: $1.99 / 5 calcs / `plant_layout`, `obstruction_exclusion`
  - Pro: $4.99 / 10 calcs / + `cable_routing`, `cable_measurements`
  - Pro Plus: $14.99 / 50 calcs / + `energy_yield`, `generation_estimates`
- **Per-tier project quotas (concurrent).** Free=3, Basic=5, Pro=10, Pro Plus=15. Effective quota = max across active+non-exhausted entitlements. Users can delete projects to free slots — gaming the system this way is acceptable (exporting outputs and deleting to reset is a feature, not a bug). Over-quota projects become read-only when ceiling drops.
- **Identity:** shared SolarLayout user account (data-model open via `productId` on entitlements/transactions for future products), but only PVLayout consumes it now.
- **V1 is frozen.** No new features in V1 endpoints. V1 stays live for Prasanta's existing legacy install. Mark frozen in code comments + repo conventions. Marketing-site downloads paused in lockstep with V2 launch.
- **Wallet model: cheapest-tier-first that supports the requested feature.** Already implemented correctly in [`apps/mvp_api/src/modules/usage/usage.service.ts`](../../apps/mvp_api/src/modules/usage/usage.service.ts). Don't change this logic in V2 — just add idempotency around it.
- **Run = persisted artifact.** Each "Generate Layout" click on the desktop = one Run row + one calc-debit. Compare workflow is split-view of 2 runs in same project (no clone-to-second-project pattern). Run delete does not refund the calc.
- **Blob storage for KMZ + run results: AWS S3, existing infrastructure.** Account `378240665051`, region `ap-south-1`, IAM user `renewable-energy-app` with inline policy `renewable-energy-app-s3` already grants S3 read/write/delete/list across the legacy artifact + downloads buckets. V2 extends this footprint by adding new bucket(s) and amending the existing IAM policy with the new ARNs — no new IAM principal. The presigned-GET helper at `apps/mvp_api/src/lib/s3.ts` is the template for adding presigned-PUT. Vercel Blob and Cloudflare R2 are **not** under consideration. See `docs/AWS_RESOURCES.md`.
- **Auto-save** for project edits (debounced ~2s) — the `PATCH /v2/projects/:id` endpoint must support frequent small updates without ceremony. Client-side debounce is the v1 rate-limit defense (server-side rate limiting is deferred — see §7).
- **V1 `EntitlementSummary` response shape is frozen.** Consumed by the legacy desktop install, `apps/mvp_web` (customer dashboard), and `apps/mvp_admin`. New fields ship on V2 routes only — never mutate V1's shape. Source of truth: `EntitlementSummary` in `apps/mvp_api/src/modules/entitlements/entitlements.service.ts`.
- **License-key auth scheme is locked since mvp-spike6.** Format `sl_live_<random>`, sent as `Authorization: Bearer sl_live_...`, validated by `apps/mvp_api/src/middleware/license-key-auth.ts`. All V2 desktop-bound routes reuse this middleware unchanged. Do not introduce a new bearer scheme.
- **`apps/layout-engine` is dormant.** The Lambda + ECR + SQS pipeline is fully wired in production but carries no live traffic — a leftover from the abandoned cloud-port direction. The desktop app's compute happens in its bundled Python sidecar, not in Lambda. Decommissioning is post-V2 work; do not treat it as a V2 dependency.
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
| B1 | Add `projectQuota` to `Product`; seed Free=3 / Basic=5 / Pro=10 / Pro Plus=15 | T1 | `packages/mvp_db/prisma/schema.prisma`; `packages/mvp_db/prisma/seed-products.ts`. New migration. | — | Migration + seed run; Product rows show new field with correct values per slug; existing data unchanged. Test asserts seed values. | done |
| B2 | Add `idempotencyKey` to `UsageRecord` and `CheckoutSession` | T2 | `packages/mvp_db/prisma/schema.prisma`. Add nullable `idempotencyKey` column + unique constraint on `(userId, idempotencyKey)` for `UsageRecord`. Migration is non-breaking. | — | Migration applied; Prisma client regenerates; concurrent-request test (two simultaneous reportUsage calls with same idempotencyKey) returns the existing record's response, no double-debit. **Note:** the runtime concurrent-request test belongs to B9 (where the V2 idempotent route is implemented). B2 ships the schema-level deliverable + a unit test that asserts the migration SQL adds both columns and the unique index. | done |
| B3 | Add `Project` model | T1 | `packages/mvp_db/prisma/schema.prisma`. Fields: `id, userId, name, kmzBlobUrl, kmzSha256, edits (Json @default("{}")), createdAt, updatedAt, deletedAt`. Indexes: `userId, deletedAt`. **Register semantic-ID prefix `prj` in `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`** (sibling to existing `usr`, `ent`, `txn`, etc.). | — | Migration applied; Prisma client regenerates; new `Project` rows get `prj_<base62>` IDs; basic CRUD test against the model passes. | done |
| B4 | Add `Run` model | T1 | `packages/mvp_db/prisma/schema.prisma`. Fields: `id, projectId, name, params (Json), inputsSnapshot (Json), layoutResultBlobUrl, energyResultBlobUrl, exportsBlobUrls (Json @default("[]")), billedFeatureKey, usageRecordId (FK → UsageRecord), createdAt, deletedAt`. Indexes: `projectId, deletedAt`. **Register semantic-ID prefix `run` in `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`.** | B3, B2 | Migration applied; relation to Project + UsageRecord working; new `Run` rows get `run_<base62>` IDs; cascade soft-delete from Project tested. | done |
| **Blob storage** | | | | | | |
| B5 | S3 buckets for V2 projects + run results; extend IAM; presigned-PUT helper | T3 (spike) | Bucket family: `solarlayout-{local,staging,prod}-projects` in `ap-south-1`, account `378240665051`. One bucket per env, KMZ + run results separated by key prefix (`projects/<userId>/<projectId>/{kmz,runs/<runId>/...}`). Extend `docs/iam-policy-re-app-s3.json` to grant the existing `renewable-energy-app` IAM user `s3:GetObject`/`PutObject`/`DeleteObject`/`ListBucket` on the new ARNs (no new IAM principal — reuse existing creds wired through Vercel + `.env`). Add a `getPresignedUploadUrl` helper alongside `getPresignedDownloadUrl` in `apps/mvp_api/src/lib/s3.ts` (the AWS SDK + presigner are already deps). Add `MVP_S3_PROJECTS_BUCKET` to `apps/mvp_api/src/env.ts`. Lifecycle: abort incomplete multipart uploads after 7d (orphan-cleanup of soft-deleted projects is deferred per §7). No CORS (Tauri Rust shell makes native HTTP requests). Decision memo at `docs/initiatives/findings/2026-04-30-001-v2-s3-buckets.md`. **Progress 2026-04-30:** all 3 buckets created + configured (public-access blocked, lifecycle applied); IAM policy applied with all 3 ARNs; local round-trip green; prod round-trip green using prod IAM identity; `MVP_S3_PROJECTS_BUCKET` wired in local `.env`. Vercel env wiring + CI/CD pass + production runtime sign-off **deferred to V2 launch deploy** per the local-first strategy (see §9 Decisions log 2026-04-30). | — | New bucket(s) exist in local + staging + prod ✓; IAM policy updated and applied ✓; presigned-PUT round-trip succeeds against the prod bucket ✓; `MVP_S3_PROJECTS_BUCKET` env var wired into local ✓ (Vercel staging + prod deferred to launch deploy). Decision memo committed ✓. | done |
| B6 | Pre-signed URL endpoint for KMZ upload | T2 | `apps/mvp_api/src/modules/blobs/`. New module: `blobs.routes.ts`, `blobs.service.ts`. `POST /v2/blobs/kmz-upload-url` returns `{uploadUrl, blobUrl, expiresAt}`. MIME = KMZ; size cap 50MB enforced both at the route (Zod) and at S3 (signed `ContentLength`). License-key auth. Key layout: `projects/<userId>/kmz/<kmzSha256>.kmz` (content-addressed at user level — no projectId because at upload time the project doesn't exist yet). | B5 | Endpoint authed; desktop can PUT to returned URL; blob accessible via `blobUrl` after upload; size cap enforced. Integration test against real bucket. | done |
| B7 | Pre-signed URL endpoint for run-result upload | T2 | Same module as B6. `POST /v2/blobs/run-result-upload-url` with discriminated body `{type: "layout"\|"energy"\|"dxf"\|"pdf"\|"kmz", projectId, runId, size}`. Per-type spec: layout/energy → `application/json` (25MB / 10MB) at `runs/<runId>/{layout,energy}.json`; dxf → `application/dxf` (100MB) at `runs/<runId>/exports/run.dxf`; pdf → `application/pdf` (50MB) at `runs/<runId>/exports/run.pdf`; kmz → `application/vnd.google-earth.kmz` (50MB) at `runs/<runId>/exports/run.kmz`. Validates ownership: Run must exist, not be soft-deleted, and belong to a non-deleted Project owned by the caller (404 otherwise). | B6 | Endpoint authed; desktop uploads layout JSON + DXF/PDF/KMZ blobs; URLs returned; integration test. | done |
| **V2 entitlements + usage** | | | | | | |
| B8 | `GET /v2/entitlements` — extends V1 with quota + remaining | T2 | New route within `apps/mvp_api/src/modules/entitlements/` mounted under `/v2/entitlements`. Returns the existing `EntitlementSummary` shape (per `apps/mvp_api/src/modules/entitlements/entitlements.service.ts`) PLUS `projectQuota: number` (max across active+non-exhausted entitlements; 0 if none qualify) + `projectsActive: number` (count of `Project` rows with `deletedAt: null`) + `projectsRemaining: number` (clamped at 0). **The V1 `GET /entitlements` response shape is bit-stable** — new fields ship on the V2 route only; never mutate V1 (legacy install + mvp_web + mvp_admin all consume the V1 shape). V2 service `computeEntitlementSummaryV2` re-uses `computeEntitlementSummary` for the V1 sub-shape and adds the V2 fields on top. | B1, B3 | V2 returns correct quota for: free-only user (3), free+basic (5), free+pro (10), exhausted user (lowest active tier), deactivated-entitlement user. V1 endpoint integration test still passes unchanged. Integration test against fixtures. | done |
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
| B19 | Extend `createEntitlementAndTransaction` — propagate `projectQuota` to Entitlement | T2 | **`Entitlement.transactionId` is NOT NULL since 2026-04-28** (Transaction ledger spike). The single shared helper at `apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts` is the only path that creates an `Entitlement` — Stripe webhook (`apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.ts`), admin manual purchase, and FREE_AUTO first-auth (`apps/mvp_api/src/middleware/clerk-auth.ts`) all flow through it. **Extend this helper; do not add a parallel path.** Add `projectQuota` as a column on `Entitlement` populated from `Product.projectQuota` at creation time (read-perf in B8) rather than computing via JOIN on every read. Touches the helper, `apps/mvp_api/src/modules/billing/provision.ts`, the webhook handler, and the Clerk-auth first-auth path. | B1 | Stripe purchase + admin manual purchase + FREE_AUTO first-auth all populate `Entitlement.projectQuota` correctly; B8 reflects the new ceiling immediately. Integration test against a Stripe test webhook payload + a manual-purchase test + a fresh-Clerk-auth test. | todo |
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
- **Annual subscriptions.** Prepaid packs only at v1. Add if customer demand surfaces post-launch.
- **Razorpay swap-out.** Stripe at v1; thin abstraction kept open for future swap.
- **Pagination on `GET /v2/projects` and `GET /v2/runs`.** Cap at 100 for v1; pagination later if a power user hits the cap.
- **Project export/import (`.slproject` file format).** Defer until customer asks.
- **N-way run comparison (parameter sweep).** v1 caps compare at 2 runs.
- **Auth: anything beyond perpetual `sl_live_*` license keys.** No password reset, no MFA, no email verification beyond Clerk's. Clerk handles first-login.
- **Orphan blob cleanup job.** Soft-deleted projects/runs leak blob assets. Add a periodic cleanup job post-launch.
- **CORS update for Tauri origin.** Not needed — Tauri Rust shell makes calls natively (no browser origin). Keep `MVP_CORS_ORIGINS` allowlist webview-only.
- **Server-side rate limiting on V2 endpoints.** No abuse vector at current volume. Idempotency on `POST /v2/usage/report` (B9) is the v1 safety net for retries; client-side debounce on `PATCH /v2/projects/:id` (B13) is the v1 defense for auto-save flooding. Revisit if production telemetry shows it's needed.
- **`apps/layout-engine` + cloud-port Lambda decommission.** Lambda + ECR + SQS are wired but dormant in prod. Retirement (along with `apps/web` and `apps/api` Vercel projects) is a post-V2 cleanup, not in this plan's scope.
- **Admin-side V2 surfaces in `apps/mvp_admin`** (e.g. customer project listing, run inspector). Useful for support post-launch; deferred until customer demand surfaces.

---

## 8. See also

- [`docs/architecture.md`](../architecture.md) — repo architecture (partially stale on app naming; mvp_* is canonical).
- [`docs/claude-dev-principles.md`](../claude-dev-principles.md) — TDD + spike-first + self-review.
- [`docs/collaborative-testing-protocol.md`](../collaborative-testing-protocol.md) — one-question-at-a-time + 5-step DoD.
- [`docs/initiatives/pv-layout-cloud.md`](./pv-layout-cloud.md) — **superseded** old web-port direction.
- [`docs/initiatives/pv-layout-spike-plan.md`](./pv-layout-spike-plan.md) — **superseded** old web-port spike plan.
- Desktop counterpart: [pv_layout_project/docs/post-parity/PLAN.md](file:///Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/PLAN.md).
- Discovery audits (in pv_layout_project repo) — ground truth for V2:
  - `docs/post-parity/discovery/2026-04-29-001-legacy-app-capability-audit.md`
  - `docs/post-parity/discovery/2026-04-29-002-backend-api-contract-audit.md` (superseded for backend-state by 004 below)
  - `docs/post-parity/discovery/2026-04-29-003-renewable-energy-infra-audit.md` — AWS account/buckets/IAM, deploy targets, env vars, CI
  - `docs/post-parity/discovery/2026-04-29-004-renewable-energy-codebase-audit.md` — endpoint inventory, Prisma schema, auth flows, Stripe billing
  - `docs/post-parity/discovery/2026-04-29-005-renewable-energy-planning-audit.md` — planning-history audit; surfaces conflicts that drove the v1.1 revision

---

## 9. Decisions log

Decisions made during execution that affect future rows go here. Each entry: date + row (or section) that surfaced it + decision + rationale.

- **2026-04-29 / §2 / B5** — Blob storage is **AWS S3, existing infra** (account `378240665051`, `ap-south-1`, IAM user `renewable-energy-app`). Not Vercel Blob, not R2. *Rationale:* the SDK + creds + presigned-URL helper are already in production; introducing a parallel provider would broaden blast radius and split observability for no operational gain. Discovery audit `2026-04-29-003-renewable-energy-infra-audit.md`.
- **2026-04-29 / §2 / B19** — Entitlement creation flows exclusively through the post-2026-04-28 helper `createEntitlementAndTransaction`; `Entitlement.transactionId` is NOT NULL. V2 extends this helper to populate the new `projectQuota` column. *Rationale:* a parallel path would silently drop the Transaction ledger row that all admin/customer surfaces now expect.
- **2026-04-29 / §2** — Terminology: the commercial model is **prepaid calc packs**, not PAYG. *Rationale:* matches `Product` semantics in seed data + PRD; PAYG conventionally implies metered usage with end-of-period billing, which is not what we ship.
- **2026-04-29 / §2 / B8** — V1 `GET /entitlements` `EntitlementSummary` shape is **frozen**. New V2 fields ship on `/v2/entitlements` only. *Rationale:* the V1 shape is consumed by the legacy desktop install (Prasanta's machine), `apps/mvp_web`, and `apps/mvp_admin` simultaneously; mutating it would break the legacy install before V2 is end-to-end ready.
- **2026-04-29 / §2** — License-key auth scheme `sl_live_<random>` is **locked since mvp-spike6**. V2 desktop-bound routes reuse `apps/mvp_api/src/middleware/license-key-auth.ts` unchanged.
- **2026-04-29 / §2 / B3 / B4** — New Prisma models register their semantic-ID prefix in `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`. `Project: "prj"`, `Run: "run"`. *Rationale:* repo convention; missing the registration produces ID generation errors at runtime.
- **2026-04-29 / §2** — `apps/layout-engine` Lambda + ECR + SQS pipeline is **dormant** — wired in prod but carries no live traffic. The desktop's compute is local (Python sidecar). Decommissioning is post-V2 cleanup; not a V2 dependency.
- **2026-04-29 / §7** — Per-tier project quotas are **locked at Free=3 / Basic=5 / Pro=10 / Pro Plus=15**, **concurrent (not lifetime)**, with **over-quota projects becoming read-only** when the ceiling drops. Users freeing slots by deleting projects is intentional, not a bug. *Rationale:* validated in 2026-04-29 brainstorm with Prasanta; previously listed as open product question.
- **2026-04-29 / §7** — Server-side rate limiting on V2 endpoints is **deferred**. Idempotency (B9) and client-side debounce (B13) are the v1 safety nets.
- **2026-04-30 / B5 / process** — **Local-first execution strategy.** All V2 rows (B5–B19) build and verify against local infra (`localhost:3003` mvp_api + local Postgres + `solarlayout-local-projects` S3 bucket). The desktop app integrates against the local mvp_api during this phase. Vercel env-var updates and the staging/prod runtime cutover happen as a **single batched deploy** at V2 launch readiness, not per-row. *Rationale:* a per-row Vercel deploy chain would multiply touchpoints with the production system and surface cross-row regressions late; one batched deploy after the desktop ↔ backend contract is proven locally is faster, lower-risk, and reversible.
- **2026-04-30 / B5 / S3** — All three V2 projects buckets (`solarlayout-{local,staging,prod}-projects`) provisioned identically in `ap-south-1`: public access blocked, abort-incomplete-multipart-upload lifecycle (7d), no versioning, no CORS, SSE-S3 default. IAM policy `renewable-energy-app-s3` extended additively (V2ProjectsReadWrite + V2ProjectsList statements) to cover all 3 ARNs in one shot. Round-trip verified end-to-end against the prod bucket using the production IAM identity. *Rationale:* identical configs across envs eliminate "works locally / breaks in prod" surprises; provisioning all three at once preserves bucket-name claims.

---

## 10. Changelog

- **2026-04-29 v1.0** — Initial scoping. Consolidates decisions from 2026-04-29 brainstorm session in `pv_layout_project` repo. Branched on `post-parity-v2-backend`.
- **2026-04-29 v1.1** — Revised per discovery audits (`2026-04-29-003-renewable-energy-infra-audit.md`, `2026-04-29-004-renewable-energy-codebase-audit.md`, `2026-04-29-005-renewable-energy-planning-audit.md`). Key corrections: B5 switched from Vercel Blob to AWS S3 (existing infra); B19 routed through `createEntitlementAndTransaction` helper rather than a parallel path; "PAYG" replaced with "prepaid packs" repo-wide; explicit notes added for V1 shape stability, license-key auth lock, semantic-ID prefix registration, and `apps/layout-engine` dormancy; rate-limiting / Lambda decommission / admin-side surfaces moved to deferred backlog; locked product decisions populated in §9 Decisions log.
