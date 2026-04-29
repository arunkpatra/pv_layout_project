# renewable_energy — Post-Parity Backend Plan (V2)

**Repo:** `/Users/arunkpatra/codebase/renewable_energy` (separate repo from this one).
**Mission:** ship V2 of the SolarLayout backend to support the new desktop app — project + run primitives, blob storage, idempotent usage reporting, project quotas. V1 frozen; no backwards compatibility shim.
**Last updated:** 2026-04-29
**Status:** 0 / TBD done.

> **For the Claude Code session that picks this up:** this file lives in the *desktop* repo (`pv_layout_project`) because that's where the post-parity scoping happened. Copy it to `renewable_energy/docs/PLAN.md` (after archiving the existing PLAN.md if any to `docs/historical/`). The decisions below are locked — do not relitigate them in the backend session.

---

## Context (locked decisions)

- **PVLayout is a standalone product.** No bundles. No multi-product shell. Each future SolarLayout-published product (BankableCalc, etc.) gets its own desktop binary, its own marketing site, its own commercial machinery. Backend is shared infrastructure but commercially compartmentalised via `product_id`.
- **V1 is frozen.** No new features in V1 endpoints. V1 stays live for Prasanta's existing legacy install until end-of-port retirement criterion is met (= "new app + backend working end-to-end"). Pause downloads from solarlayout.in in lockstep with V2 launch.
- **PAYG-only at v1.** No subscriptions, no auto-renew, no proration. All purchases are one-time Stripe Checkout (`mode=payment`). Three packs already configured: Basic $1.99/5 calcs, Pro $4.99/10 calcs, Pro Plus $14.99/50 calcs. Free tier 5 lifetime calcs at all features.
- **Identity:** shared SolarLayout user account (data-model open via `product_id` on entitlements), but only PVLayout consumes it for now. BankableCalc's auth is its own future problem.
- **Cloud-first.** No internet → no app. No offline mode. Project state lives in Postgres + blob storage; KMZ cached locally only as input asset.
- **Desktop API caller is the Tauri Rust shell.** No CORS issue (native HTTP client). Existing `MVP_CORS_ORIGINS` allowlist (Vercel web origin only) does not need Tauri added.
- **Wallet model: cheapest-tier-first that supports the requested feature.** Already implemented in [usage.service.ts](https://github.com/.../usage.service.ts). Don't change this logic in V2 — just add idempotency around it.
- **Project quota: max across active+non-exhausted entitlements.** When a tier exhausts, ceiling drops. Over-quota projects become read-only until user deletes down or repurchases.
- **Run = persisted artifact.** Each "Generate Layout" click creates one Run row + debits one calc. Compare workflow is split-view of 2 runs in same project (no clone-to-second-project pattern).

---

## Tier policy

- **T1 — build + test.** Implement → run sidecar/backend tests → commit. Audit trail = green tests.
- **T2 — build + integration test.** T1 plus an end-to-end test exercising the row across desktop ↔ backend ↔ db (or webhook ↔ backend ↔ db). For things that span boundaries.
- **T3 — build + decision memo.** T1 plus a short memo at `docs/post-parity/findings/YYYY-MM-DD-NNN-<slug>.md` capturing architectural decisions. For rows that establish patterns, choose providers, or have non-obvious tradeoffs worth recording.

Atomic commit per row: `feat: <feature name>`. Intra-row checkpoints use `wip: <summary>`.

---

## Backlog

Domain-grouped; within a group, dependency-ordered. Pick top `todo` row, do it, flip Status.

| # | Feature | Tier | Source / Notes | Acceptance | Status |
|---|---|---|---|---|---|
| **Schema** | | | | | |
| B1 | Add `projectQuota` to `Product`; seed values per tier | T1 | `seed-products.ts` extension; numbers TBD per tier (placeholder: Free=1, Basic=3, Pro=10, ProPlus=unlimited until product decides) | Migration + seed run; Product rows show new field; existing data unchanged. | todo |
| B2 | Add `idempotencyKey` to `UsageRecord` and `CheckoutSession` | T2 | Audit risk #1 from `docs/post-parity/discovery/2026-04-29-002-backend-api-contract-audit.md`; unique-constraint on `(userId, idempotencyKey)` for usage; concurrent-request integration test. | Migration applied; duplicate `(userId, idempotencyKey)` returns existing record's response, doesn't double-debit. | todo |
| B3 | Add `Project` model | T1 | New table: `id, userId, name, kmzBlobUrl, kmzSha256, edits (JSONB), createdAt, updatedAt, deletedAt`. Soft-delete via `deletedAt`. | Migration applied; Prisma client regenerated; pytest/vitest of the Prisma layer green. | todo |
| B4 | Add `Run` model | T1 | New table: `id, projectId, name, params (JSONB), inputsSnapshot (JSONB), layoutResultBlobUrl, energyResultBlobUrl, exportsBlobUrls (JSONB array), billedFeatureKey, usageRecordId (FK), createdAt, deletedAt`. Soft-delete via `deletedAt`. | Migration applied; Prisma client regenerated; relation to Project + UsageRecord working. | todo |
| **Blob storage** | | | | | |
| B5 | Pick blob provider; bucket setup; auth | T3 | Vercel Blob recommended (matches existing Vercel-hosted mvp_api); alternative is Cloudflare R2. Decision memo captures why + setup steps + env vars. | Bucket exists in prod; service-account creds in env; one round-trip upload+read smoke test passes. | todo |
| B6 | Pre-signed URL endpoint for KMZ upload | T2 | `POST /v2/blobs/kmz-upload-url` returns `{uploadUrl, blobUrl, expiresAt}`. Upload limited to KMZ MIME / size cap (50MB). | Endpoint authed; desktop can PUT to returned URL; blob accessible via `blobUrl` after upload. | todo |
| B7 | Pre-signed URL endpoint for run-result upload | T2 | `POST /v2/blobs/run-result-upload-url` for layout result + energy result + exports. Same shape as B6 but with type discriminator. | Endpoint authed; desktop uploads layout JSON + DXF/PDF/KMZ blobs; URLs stored on Run row. | todo |
| **V2 entitlements + usage** | | | | | |
| B8 | `GET /v2/entitlements` — extends V1 with `projectQuota` + `projectsRemaining` | T2 | New endpoint at `/v2/entitlements`; returns existing `EntitlementSummary` shape PLUS `projectQuota: number` (max across active entitlements) + `projectsActive: number` (current count) + `projectsRemaining: number`. | Endpoint returns correct quota for: free-only user, multi-pack user, exhausted user, deactivated-entitlement user. Integration test against seeded user fixtures. | todo |
| B9 | `POST /v2/usage/report` — idempotent + returns updated entitlements | T2 | Wraps existing `reportUsage` with `idempotencyKey` check. Response body extended to include updated `availableFeatures` + `remainingCalculations` (saves desktop a round-trip after every generate). | Duplicate request with same idempotencyKey returns same response, no double-debit. Response includes refreshed entitlements. | todo |
| **V2 projects** | | | | | |
| B10 | `GET /v2/projects` — list user's projects | T2 | Returns `[{id, name, kmzBlobUrl, kmzSha256, createdAt, updatedAt, runsCount, lastRunAt}]`. Excludes soft-deleted. Sorted by `updatedAt DESC` (recents-first). | Returns only caller's projects. Pagination deferred (cap at 100 for v1). Integration test. | todo |
| B11 | `POST /v2/projects` — create project | T2 | Body: `{name, kmzBlobUrl, kmzSha256, edits?}`. Quota check before insert; 402 if over quota. Returns full Project row. | Quota enforced; over-quota returns 402; under-quota inserts and returns. Integration test for both paths. | todo |
| B12 | `GET /v2/projects/:id` — get project | T2 | Returns Project row + embedded `runs[]` (id, name, params summary, createdAt only — full run via separate endpoint). 404 on not-yours / soft-deleted. | Returns own project; 404 on others'; runs list embedded. | todo |
| B13 | `PATCH /v2/projects/:id` — update project | T2 | Body: subset of `{name, edits}`. Cannot patch `kmzBlobUrl` (immutable post-create — replace project instead). 403 on not-yours. | Updates name + edits; rejects kmzBlobUrl changes; integration test. | todo |
| B14 | `DELETE /v2/projects/:id` — soft delete | T1 | Sets `deletedAt`. Cascades soft-delete to Runs. Frees quota slot. | Project disappears from `GET /v2/projects`; quota available again; runs hidden. | todo |
| **V2 runs** | | | | | |
| B15 | `GET /v2/projects/:id/runs` — list runs in project | T1 | Returns `[{id, name, params, billedFeatureKey, createdAt}]`. Excludes soft-deleted. | Returns runs for own project; 404 on not-yours. | todo |
| B16 | `POST /v2/projects/:id/runs` — create run + debit | T2 | Body: `{name, params, billedFeatureKey, idempotencyKey}`. Atomically: validate project ownership → debit calc (reuse `reportUsage`) → insert Run row with `usageRecordId` link → return Run + pre-signed result-upload URL. If debit fails (402), no Run row created. | Integration test: success path debits 1 calc + creates Run; 402 path leaves DB clean; idempotent retry returns existing Run. | todo |
| B17 | `GET /v2/projects/:id/runs/:runId` — get run details | T1 | Returns full Run row including blob URLs (which are pre-signed-readable for the caller). | Returns own run; 404 on not-yours / soft-deleted. | todo |
| B18 | `DELETE /v2/projects/:id/runs/:runId` — soft delete run | T1 | Sets `deletedAt` on Run. Does NOT refund the calc debit (deleting an artifact ≠ undoing the work). | Run hidden from list; calc count unchanged. | todo |
| **Stripe + webhooks** | | | | | |
| B19 | Stripe checkout webhook update — set per-product `projectQuota` on resulting Entitlement | T2 | When a Product purchase grants an Entitlement, the entitlement should reflect the product's current `projectQuota`. (Currently entitlements only track calc counts.) Add `projectQuota` to Entitlement table or compute on read via Product join. | New purchase → entitlement reflects projectQuota; integration test against a Stripe test webhook payload. | todo |
| **V1 deprecation** | | | | | |
| B20 | Pause downloads on solarlayout.in (mvp_web change) | T1 | Marketing site PR: replace download CTA with "Coming soon" or "Contact sales" placeholder. Does not affect API; legacy install keeps working against V1 endpoints. | Marketing site shows updated CTA; download links 404 or redirect. | todo |
| B21 | Mark V1 endpoints "frozen" (documentation + linting) | T1 | Add header comment to V1 routes: "FROZEN — no new features. Maintained for legacy install only." Add eslint rule to flag changes (or just convention). | V1 route files have frozen markers; convention documented in repo CLAUDE.md or similar. | todo |
| **Telemetry** *(deferred)* | | | | | |
| B22 | `POST /v2/telemetry/event` — app-level events | T2 | Audit risk #2. Stores `{userId?, sessionId, eventType, eventName, payload (JSONB), userAgent, createdAt}`. Receives session start/end, errors, feature usage beyond debits. | Endpoint accepts events; rate-limited; events queryable by admin. | **deferred** — add when desktop has events worth reporting; not v1. |

---

## Process per row

1. Pick the top `todo` row.
2. Read its `Source / Notes` end-to-end. Read existing schema and adjacent endpoint code.
3. Apply the row's tier ceremony.
4. Flip `Status` to `done` in this file when `Acceptance` is met.
5. Atomic commit per row: `feat: <feature name>`. Intra-row checkpoints use `wip:`.

---

## Out of scope (deferred)

These were considered and explicitly deferred during the 2026-04-29 scoping:

- **Telemetry endpoint (B22).** Add when desktop has events worth reporting. Not v1.
- **Multi-tenancy / project sharing.** Single-user projects only at v1. Sharing/teams = v2 problem.
- **Annual subscriptions.** PAYG-only at v1. Add if customer demand surfaces.
- **Stripe Razorpay swap-out.** Stripe at v1; Razorpay-ready architecture (thin abstraction) but not actually wired.
- **Pagination on `GET /v2/projects` and `GET /v2/runs`.** Cap at 100 for v1; pagination later if a power user hits the cap.
- **Project export/import (`.slproject` file format).** Defer until customer asks.
- **N-way run comparison (parameter sweep).** v1 caps compare at 2 runs. N-way later.
- **Auth: anything beyond the existing perpetual `sl_live_*` license keys.** No password reset flow, no MFA, no email verification. Clerk handles first-login; legacy mechanism is fine for now.

---

## Open questions for product (Prasanta)

These need numbers before B1 can be fully closed:

1. **Project quota per tier.** Free = ? / Basic = ? / Pro = ? / Pro Plus = ?. Order-of-magnitude only.
2. **Concurrent vs lifetime.** Concurrent (delete one, free a slot) is the strong recommendation. Confirm.
3. **Over-quota behaviour after pack exhaust.** Read-only access to over-quota projects until repurchase or delete (recommendation). Confirm.

These don't block scoping. They're inputs to B1's seed values; placeholder values let B1 ship and renumber later.

---

## See also

- [`docs/post-parity/discovery/2026-04-29-001-legacy-app-capability-audit.md`](./discovery/2026-04-29-001-legacy-app-capability-audit.md) — capability inventory of legacy PyQt5 app.
- [`docs/post-parity/discovery/2026-04-29-002-backend-api-contract-audit.md`](./discovery/2026-04-29-002-backend-api-contract-audit.md) — current V1 backend contract + risks.
- This repo's [`docs/post-parity/PLAN.md`](./PLAN.md) — desktop-side post-parity plan that consumes this V2 surface.

---

## Changelog

- **2026-04-29 v1.0** — Initial scoping; consolidates decisions from 2026-04-29 brainstorm session in pv_layout_project repo.
