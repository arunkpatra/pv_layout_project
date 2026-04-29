# Discovery: renewable_energy planning-history audit

**Date:** 2026-04-29
**Author:** Claude (cross-repo audit, on behalf of pv_layout_project's V2 backend initiative)
**Subject repo:** `/Users/arunkpatra/codebase/renewable_energy` (branch `post-parity-v2-backend` at HEAD `849c85b`)
**Trigger:** A new initiative file `docs/initiatives/post-parity-v2-backend-plan.md` was just landed; the two superseded predecessors (`pv-layout-cloud.md`, `pv-layout-spike-plan.md`) were marked superseded in the same commit. We need full visibility into the existing planning history before any V2 row executes.

This memo audits **every** planning artifact in the renewable_energy repo as of today and reports overlaps, conflicts, and gaps with the new V2 plan.

---

## 1. Inventory

### 1.1 docs/initiatives/

| File | Type | Status | One-line summary |
|---|---|---|---|
| `mvp-spike-plan.md` | Spike-driven plan (active) | **Active** (Spikes 1–7.2 complete; 7.3, 8, 9, 10, 11 outstanding) | Public website + dashboard + Stripe + entitlements + Python integration. Drove the entire MVP shipped to api.solarlayout.in. |
| `pv-layout-cloud.md` | Foundational doc | **Superseded** 2026-04-29 (banner present) | Old "fully cloud-native web port" direction. PVLayout was meant to be a web app; replaced by the Tauri-desktop direction. |
| `pv-layout-spike-plan.md` | Spike plan companion | **Superseded** 2026-04-29 (banner present) | 11 spikes (1, 2a–c, 3a–g, 4a–e, 5a–c, 6, 7, 8, 9, 10, 11) for the cloud port. Spikes 1 → 5c are complete; 6 → 11 were `planned` and now retired. |
| `spike-3g-ac-cable-routing-optimization.md` | Spike findings memo | **Resolved** 2026-04-20 (deployed to prod) | Killed AC-cable Manhattan routing combinatorial explosion (5.7M `_path_ok` calls → 137K). 23× faster Lambda. Layout outputs unchanged except +0.95% AC cable length. |
| `spike-3g-lambda-perf-investigation.md` | Spike investigation memo | **Resolved** 2026-04-20 | Root-causes the same Lambda slowness. Hypotheses scored; H2 (algorithmic explosion) confirmed primary. Companion to the optimization memo above. |
| `post-parity-v2-backend-plan.md` | Foundational plan | **Active (just landed)** | The new V2 backend initiative. Subject of this audit. |

### 1.2 docs/mvp/

| File | Type | Status | One-line summary |
|---|---|---|---|
| `PRD.md` | PRD | **Mostly outdated**; still authoritative for product framing | Phase-1 MVP PRD (2026-04). Defines three SKUs, "5/10/50 calculations", USD pricing. Phase-2 features all delivered — but PRD never updated. |
| `STRIPE_SETUP.md` | Runbook | **Active** | Operator runbook for local + prod Stripe setup. Source of truth for `STRIPE_PRICE_BASIC/PRO/PRO_PLUS` env vars and webhook URL `api.solarlayout.in/webhooks/stripe`. |
| `TRANSACTIONS_SPIKE_POST_MIGRATION.md` | Runbook | **Active (recent)** 2026-04-28 | Post-migration ritual after the unified `Transaction` ledger spike: each operator must (1) sign in to mvp_web, (2) sign in to mvp_admin, (3) re-enter license key in desktop. |

### 1.3 docs/superpowers/plans/ + docs/superpowers/specs/

These are spike-execution artifacts (one pair per spike). All spikes mapped 1:1 to rows in `mvp-spike-plan.md` or `pv-layout-spike-plan.md`. Status mirrors those parent files.

| Plan/spec date | Subject | Status |
|---|---|---|
| 2026-04-19 | Spike 2 layout engine (cloud-port spikes) | complete (cloud-port retired but spike outputs live as `apps/layout-engine`) |
| 2026-04-19 | Spike 3 lambda+SQS | complete (in production but its consumer is a retired plan) |
| 2026-04-20 | Spike 4 series — project + version UI | complete |
| 2026-04-20 | Spike 5a/b/c — stats / SVG / zoom-pan | complete |
| 2026-04-20 | Spike 6 — artifact downloads | **planned but not built** (cloud-port retired before reaching it) |
| 2026-04-21 | mvp-spike1 website scaffold | complete |
| 2026-04-22 | mvp-spike2 db+api+download | complete |
| 2026-04-22 | mvp-spike3 contact form | complete |
| 2026-04-22 | mvp-spike4 cleanup+dashboard | complete |
| 2026-04-22 | spike4.1 merge dashboard into mvp_web | complete |
| 2026-04-22 | spike5 stripe integration | complete |
| 2026-04-22 | spike6 entitlement API | complete |
| 2026-04-22 | spike7 python integration | complete |
| 2026-04-22 | spike7.1 free plan auto-provisioning | complete |
| 2026-04-22 | spike7.2 account/license info modal | complete |
| 2026-04-25 | mvp_admin (initial) | complete |
| 2026-04-25 | mvp-admin-customers spike A | complete |
| 2026-04-26 | mvp-admin-products spike B | complete |
| 2026-04-26 | mvp-admin-dashboard spike C | complete |
| 2026-04-26 | mvp-web-customer-dashboard-redesign | complete |
| 2026-04-26 | mvp-web-redesign | complete |
| 2026-04-28 | mvp-manual-purchases (Transaction ledger) | **just-completed** (PR #24 merged 2026-04-29 → commit `93e9769`) |

### 1.4 Root-level docs

| File | Type | Status | One-line |
|---|---|---|---|
| `CLAUDE.md` | Repo session bootstrap | **Mostly active** but partially stale | Lists `apps/web`, `apps/api`, `packages/db` (defunct cloud-port artifacts) — still in the architecture diagram. V2 plan §3 acknowledges this. |
| `README.md` | Repo readme | small | Just a pointer to CLAUDE.md / docs. |
| `RELEASE.md` | Runbook | **Active** | Tag-driven release flow. Lists deployment targets: `apps/web`, `apps/mvp_web`, `apps/api`, `apps/mvp_api`, `apps/mvp_admin`, `apps/layout-engine` Lambda, desktop zip via S3. |
| `DEPLOYMENTS.md` | Runbook | Active (not read for this audit; outside scope of V2 conflicts) | Vercel project mapping, env vars. |
| `TRANSFER_GIT_REPO.md` | Runbook | Active | Repo transfer to SolarLayout org. |

### 1.5 docs/ top-level reference docs

| File | Type | Status | One-line |
|---|---|---|---|
| `architecture.md` | Architecture record | **Stale** | Describes the original cloud-port architecture (`apps/web` + `apps/api` + `packages/db`). Does not mention `apps/mvp_*` or the desktop direction. V2 plan §3 calls this out explicitly. |
| `claude-dev-principles.md` | Process doc | **Active, V2 plan § 3 inherits from this** | Spike-first, TDD-mandatory, self-review, clean-environment gate. |
| `collaborative-testing-protocol.md` | Process doc | **Active, V2 plan §4 inherits from this** | One-question-at-a-time, 5-step DoD for spikes. |
| `feature-catalog.md` | Product matrix | **Stale** (mismatched product line) | Describes "Free / Professional / Enterprise" with 71 features (BoM, BoQ, SLD, IS-cable schedules, ALMM, simulations). MVP shipped Basic / Pro / Pro Plus instead. |
| `use-cases.md` | Product framing | **Reference (still relevant)** | Personas (Design Engineer / BD / Consultant) and India primary market. Not in conflict with V2; informs UI/UX. |
| `brand-voice.md` | Style guide | Active | Voice rules. |
| `ux-design.md` | Design conventions | Active | shadcn primitives, Lucide icons, Geist font. |
| `AWS_RESOURCES.md` | Infra doc | **Active and authoritative** for S3/Lambda/SQS/ECR | Single AWS account `378240665051`, `ap-south-1`, three artifact buckets + three downloads buckets, IAM user `renewable-energy-app`, `renewable-energy-app-s3` policy. |
| `iam-policy-*.json` | IAM artifacts | Active | Used by `AWS_RESOURCES.md`. |

---

## 2. Active in-flight work

Per repo-wide signal (status fields in plans, recent commits, branch name):

- **Just-merged**: `mvp-manual-purchases` (PR #24 merged 2026-04-29). Adds the unified `Transaction` ledger and the admin manual-purchase flow. Its post-migration ritual (`docs/mvp/TRANSACTIONS_SPIKE_POST_MIGRATION.md`) is *currently in effect* — operators have to re-link license keys after the wipe. **DB was truncated on 2026-04-28**, so production has only fresh transactional data from this past week.
- **Active branch**: `post-parity-v2-backend` (the V2 plan itself; commit `849c85b` is the only commit on top of the just-merged ledger work).
- **`mvp-spike-plan.md` rows still `planned`**: 7.3 (mvp_web usability improvements — scope deferred), 8 (SEO), 9 (GA4), 10 (legal review), 11 (admin UI — actually delivered as the mvp_admin app, so 11 is effectively done but still says `planned` in this doc).
- **`pv-layout-spike-plan.md` rows formerly `planned`** (Spike 6, 7, 8, 9, 10, 11) are now retired by the supersede banner. None active.

**Overlap with V2 scope:** the just-merged `Transaction` ledger work is the most consequential — V2 row B19 (Stripe webhook update) inherits a far cleaner ledger than the V1 plan author may have assumed. Specifically, the new `provisionEntitlement` shared helper at `apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts` already writes a `Transaction` row alongside every `Entitlement`, and the seed `clerkAuth` first-auth path also writes a `FREE_AUTO` transaction. V2's webhook update (B19) needs to extend `provisionEntitlement` to also propagate the new `projectQuota` field — building on, not replacing, this helper.

---

## 3. Recent completions (last ~14 days)

The repo has been moving very fast. In dependency-relevant order:

- **2026-04-25 → 2026-04-26**: `apps/mvp_admin` shipped (Customers, Products, Dashboard, sidebar nav, RBAC via `requireRole("ADMIN" | "OPS")`). Clerk roles via `publicMetadata.roles`. Primordial admin set manually in Clerk. Production URL `admin.solarlayout.in` (per design spec §2).
- **2026-04-26**: `apps/mvp_web` redesign (full visual overhaul) + customer dashboard IA redesign. Three sidebar items: `Dashboard`, `Plans`, `Usage`. License page deleted, `/dashboard/plan` renamed to `/dashboard/plans`. Stripe `success_url` updated.
- **2026-04-26**: Customer dashboard IA changes added a real Clerk-authenticated `GET /billing/usage` endpoint (V1 had no such endpoint).
- **2026-04-28 → 2026-04-29**: `mvp-manual-purchases` (PR #24) — unified Transaction ledger, admin Transactions section, manual-purchase form (`POST /admin/transactions`), kill-switch hardening at `POST /usage/report` (added `deactivatedAt: null` guard). Migration TRUNCATEd `users`, `entitlements`, `license_keys`, `checkout_sessions`, `usage_records`. Products preserved.

**Relevance to V2:**
- The kill-switch fix at `usage.service.ts` is now baseline behavior — V2's `POST /v2/usage/report` (B9) inherits this guard. Good.
- `Transaction` ledger means every Entitlement now has `transactionId NOT NULL`. V2 isn't blocked, but **B19 must add the new `projectQuota` propagation through this helper, not as a new code path.**
- The `mvp_admin` Customer detail page already has a Transactions section. V2 work that adds new per-customer surfaces (e.g. an admin view of a customer's projects + runs) should mirror this pattern.

---

## 4. Spikes catalog

### 4.1 Spikes that completed, decisions sticky

| Spike | Decision sticky for V2? | Decision |
|---|---|---|
| mvp-spike1 (website scaffold) | yes | All marketing pages live; "Download" CTA wired to `solarlayout-prod-downloads/downloads/pv_layout.zip`. V2 row B20 (pause downloads) will modify *this* CTA. |
| mvp-spike2 (mvp_db + mvp_api) | yes | Two separate Postgres DBs (`renewable_energy` + `mvp_db`) in docker-compose. Two API surfaces. V2 must NOT cross the boundary into the cloud-port DB. |
| mvp-spike4.1 (merge dashboard) | yes | Dashboard lives at `solarlayout.in/dashboard` (not `dashboard.solarlayout.in`). Single-app pattern. V2's marketing-side changes (B20) target `apps/mvp_web`. |
| mvp-spike5 (Stripe) | yes | One-time `mode=payment` checkouts only. `STRIPE_WEBHOOK_SECRET` + `STRIPE_SECRET_KEY` env vars. Webhook endpoint `https://api.solarlayout.in/webhooks/stripe`. V2 row B19 modifies this code path. |
| mvp-spike6 (entitlement API) | yes | License key format `sl_live_<random>`. Bearer auth on `GET /entitlements`, `POST /usage/report`, `GET /usage/history`. **V2 routes must use the same scheme.** |
| mvp-spike7 (Python integration) | yes | Reference impl in `PVlayout_Advance/add-auth` branch. `keyring` for OS credential store. The integration is what the *legacy* desktop install uses today and what V1 must continue to support per V2 plan §2. |
| mvp-spike7.1 (Free plan auto-provisioning) | yes | First Clerk auth provisions Free plan (5 calcs, all features) + `LicenseKey`. **Now also writes `Transaction(source=FREE_AUTO)`** post-Transaction-ledger. V2 row B11 (project create) will inherit a Free user's quota = 3. |
| mvp-spike7.2 (Account/license modal) | yes | `GET /entitlements` extended response shape: `{ user, plans, licensed, availableFeatures, totalCalculations, usedCalculations, remainingCalculations }`. **V2 row B8 must be a strict superset of this shape.** |
| mvp-admin (admin app) | yes | New Vercel project at `admin.solarlayout.in`. Clerk roles `ADMIN`/`OPS`. RBAC middleware in `mvp_api`. |
| mvp-manual-purchases (Transaction ledger) | yes | New `Transaction` table; FK on `Entitlement.transactionId NOT NULL`; `CheckoutSession` shrunk; semantic ID prefix `txn`. **V2 row B19 must extend the new helper, not bypass it.** |

### 4.2 Spikes that retired without execution (because the cloud-port direction was killed)

| Spike | Status | Note |
|---|---|---|
| Spike 6 (KMZ download) | retired | Cloud-port artifact-download UI; not relevant to V2. |
| Spike 7 (Energy job) | retired | Was meant to add PVGIS / NASA POWER + 25-year energy model in Lambda. The desktop app (post-parity) does this in-process; no Lambda equivalent in V2. |
| Spike 8 (PDF download), 9 (DXF), 10 (error handling), 11 (E2E smoke) | retired | All cloud-port-only. |

### 4.3 Spike 3g (lambda perf optimization)

Resolved end-to-end. The optimization is in production at `apps/layout-engine/src/core/string_inverter_manager.py`. **Caveat:** that file lives in the cloud-port codebase (`apps/layout-engine`), which the V2 plan §3 says is "defunct — ignore". Yet the Lambda still serves cloud-port traffic. **There's a conflict:** if `apps/layout-engine` is "defunct", who owns the Lambda code? Answer: the desktop app no longer needs Lambda, so this is moot — but it implies the Lambda + `apps/layout-engine` should be decommissioned at some point post-V2. **Not a V2 blocker, but should be in the deferred backlog.**

---

## 5. Decisions log — locked decisions V2 must respect

These are the ground truth across artifacts as of 2026-04-29:

1. **Two databases, two Prisma schemas** (mvp-spike2 D14). `packages/mvp_db` is independent of `packages/db`. V2's `Project` and `Run` models live in **`packages/mvp_db`**, not `packages/db`. The V2 plan says "schema.prisma" — assume `mvp_db`'s.
2. **License-key auth = `sl_live_<random>` bearer** (mvp-spike5 D13, mvp-spike6). All desktop-bound V2 routes (`POST /v2/blobs/...`, `POST /v2/usage/report`, `GET /v2/projects`, `POST /v2/projects/:id/runs`, etc.) **must** use this scheme. **CONFIRM: the V2 plan does not say this anywhere. It says "license-key auth" implicitly in B6, but never specifies the format.**
3. **Stripe one-time `mode=payment` only** (mvp-spike5 D24). V2 plan §2 already locks this. ✓
4. **`Entitlement.transactionId` is NOT NULL** (mvp-manual-purchases). Every new entitlement V2 creates *must* be created via the existing `createEntitlementAndTransaction` helper. **V2 plan B19 doesn't acknowledge this.**
5. **Clerk owns identity, mvp_db owns extended profile** (mvp-spike4 + mvp-spike7.1). First-auth provisions: User row + Free Entitlement + LicenseKey + FREE_AUTO Transaction in a single DB transaction. V2 must not bypass this on first-auth.
6. **Admin RBAC: `ADMIN` and `OPS` via Clerk `publicMetadata.roles`** (mvp_admin design spec §3). Any V2 admin surface (e.g. an internal "view all projects" page someday) must reuse `requireRole()`.
7. **AWS S3 for blob storage already in production**, single account `378240665051`, `ap-south-1`, IAM user `renewable-energy-app` (`AWS_RESOURCES.md`). Existing buckets: `renewable-energy-{local,staging,prod}-artifacts` — already used for layout-engine artifacts in cloud-port. **The infra V2's B5 needs is already provisioned.** V2 must not introduce a parallel provider unless there's a strong reason.
8. **License-key keychain entry name is `solarlayout`** (TRANSACTIONS_SPIKE_POST_MIGRATION ritual). Desktop key handling is platform-native via `keyring`.
9. **Vercel deploys mvp_api on push to `main`** (`RELEASE.md`). V2 routes ship to production the moment the branch lands on main; no separate release ceremony.
10. **CORS allowlist `MVP_CORS_ORIGINS` is webview-only** (`apps/mvp_api/src/app.ts`). Defaults: `http://localhost:3002`, `http://localhost:3004`. **V2 plan §7 already calls this out (Tauri shell makes native HTTP, no CORS needed).** ✓
11. **Stripe webhook URL is `https://api.solarlayout.in/webhooks/stripe`** and listens for `checkout.session.completed` (STRIPE_SETUP §6.3). V2 row B19 modifies the handler at `apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.ts`.
12. **Existing `GET /entitlements` response shape** (mvp-spike7.2 D28): `{ success, data: { user, plans, licensed, availableFeatures, totalCalculations, usedCalculations, remainingCalculations } }`. **V2 row B8 must be a superset, not a parallel.**

---

## 6. Conflicts with the V2 plan (be exhaustive)

### 6.1 Blob provider — V2 says TBD, repo says AWS S3 (decided)

V2 row B5 says:
> Recommend Vercel Blob (Vercel-hosted mvp_api → simplest setup); alternative R2.

But `docs/AWS_RESOURCES.md` documents **three S3 buckets already provisioned in `ap-south-1`** with IAM user `renewable-energy-app` granted `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on all of them. The cloud-port (now retired) writes layout/svg/dxf artifacts to these buckets. The IAM policy is at `docs/iam-policy-re-app-s3.json`. The Vercel-hosted `mvp_api` already has `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars in production (per `RELEASE.md` and `AWS_RESOURCES.md` "Production Setup"). **There is no operational reason to introduce Vercel Blob.** The user's memory note `feedback_external_contracts.md` (in the user-memory) is exactly this kind of trap: V2 was about to silently bind to a different blob provider than what the rest of the system uses.

**Verdict:** **Major.** B5 should be rewritten to recommend AWS S3 with the existing buckets, not Vercel Blob.

### 6.2 V2 doesn't acknowledge the `Transaction` ledger that just landed

V2 row B19 says:
> Either add column to Entitlement or compute on read via Product join (recommend column for read-perf).

This treats the entitlement-grant flow as if it were V1-shaped (just a `CheckoutSession` + `Entitlement`). As of 2026-04-28 it is not — there is now a unified `Transaction` table, every new Entitlement is created via `apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts`, and `Entitlement.transactionId` is `NOT NULL`. The V2 plan has *no* reference to `Transaction`, `provisionStripePurchase`, or the `createEntitlementAndTransaction` helper — yet the entire purchase-to-entitlement flow goes through that helper now.

**Verdict:** **Major.** B19 must extend `createEntitlementAndTransaction` (or add `projectQuota` to `Product` + read it on join), not modify a V1-shaped `provisionEntitlement`.

### 6.3 V2 plan B8 doesn't say it's a superset of the existing `GET /entitlements`

V2 row B8 says:
> Returns existing `EntitlementSummary` PLUS `projectQuota: number` ... + `projectsActive: number` + `projectsRemaining: number`.

Good — but **the existing `EntitlementSummary` response shape** is already documented in `apps/mvp_api/src/modules/entitlements/entitlements.service.ts` and consumed by:
- The desktop app's account info dialog (mvp-spike7.2)
- The mvp_web customer Plans page
- The mvp_web Dashboard home

**Implication:** V2 must keep V1's `GET /entitlements` shape **bit-stable** for legacy install + Free-user paths during the transition. The plan says "V1 frozen" — so the new fields go on `/v2/entitlements` *only*, and V1 is unchanged. That's fine, just worth noting explicitly.

**Verdict:** **Minor.** Worth a one-liner in B8: "V1 `GET /entitlements` shape is frozen as documented in `entitlements.service.ts`; V2 adds new fields on the V2 route only, never on V1."

### 6.4 V2 plan calls `apps/api`, `apps/web`, `packages/db` "defunct" but they're still referenced in CLAUDE.md and architecture.md

V2 plan §3:
> `apps/web`, `apps/api`, `apps/layout-engine`, `packages/db` are defunct — ignore them.

Yet:
- `apps/layout-engine` is **not defunct** — it's the production Lambda still serving cloud-port traffic (Spike 3g optimization is in production). It will become defunct once cloud-port traffic is fully retired, but **today** it's load-bearing.
- `RELEASE.md` lists `apps/web`, `apps/api`, `apps/layout-engine` as auto-deployed Vercel projects.
- `docs/architecture.md` is entirely about the cloud-port stack — never mentions the mvp_* apps.

**Verdict:** **Medium.** B21 ("Mark V1 endpoints frozen") needs a companion plan for retiring `apps/layout-engine` + the cloud-port Lambda + the `apps/web` / `apps/api` Vercel projects. V2 says "Marketing-site downloads paused in lockstep with V2 launch" but doesn't say what happens to the cloud-port traffic. **Recommend adding a "V1 retirement" subsection or a deferred row.**

### 6.5 V2 doesn't mention license-key auth scheme for V2 endpoints

V2 rows B6, B7, B9, B10–B18 all say "license-key auth" or imply it, but never name the bearer-token format `sl_live_<random>`. **All V2 endpoints must use the same `Authorization: Bearer sl_live_...` scheme** as V1 (mvp-spike6 D13 lock). The middleware already exists at `apps/mvp_api/src/middleware/` (look for the API-key-auth middleware referenced in mvp-spike6).

**Verdict:** **Minor.** One sentence in §3 (Repo conventions) or §4 (Tier policy) saying "V2 endpoints reuse the existing license-key bearer auth middleware."

### 6.6 Auto-save target: V2 plan B13 says "frequent small writes" but doesn't acknowledge the rate limit gap

V2 row B13 (`PATCH /v2/projects/:id`):
> Optimised for frequent small writes (auto-save).

There is **no rate limiting in `mvp_api` today.** All V1 routes are unlimited. If the desktop app debounces auto-save at ~2s but a misbehaving build sends a write per keystroke, the existing infra has no defense. V1 didn't need it because the only writes were `POST /usage/report` (gated by entitlement quota) and admin endpoints. V2 introduces *user-driven* high-frequency writes for the first time.

**Verdict:** **Minor-medium.** Recommend adding an "Out of scope" item: "Rate limiting on V2 endpoints — defer until production traffic shows it's needed; client-side debounce is the v1 defense."

### 6.7 Telemetry endpoint (B22) is `deferred` but the Free-tier path needs it now

V2 row B22 is deferred. But the customer Dashboard already shows "Recent Activity" pulled from `UsageRecord` (mvp-spike6 + mvp-web-customer-dashboard-redesign). When the desktop app starts misbehaving (Free user runs into 402, sees errors), there is **no** telemetry path back. V1's only signal is `POST /usage/report` debits. **Not a V2 blocker, but the Free-user funnel relies on `UsageRecord` as its only data source.**

**Verdict:** **Minor.** Plan acknowledges this. Defer, but flag in the plan that if the Free-conversion analytics need to be tightened pre-launch, B22 graduates from deferred to in-scope.

### 6.8 V2 plan misses `apps/mvp_admin` updates

V2 plan rows touch `apps/mvp_web` (B20) and `apps/mvp_api` (most rows). It does not touch `apps/mvp_admin`. But:
- The admin "Customers" page already shows entitlements per customer.
- A logical V2 admin surface would be "view a customer's projects" — particularly useful for support after launch.
- The admin sidebar already has Customers / Plans / Transactions.

**Verdict:** **Minor (out-of-scope reasonable).** V2 plan can defer admin-side projects/runs surfaces; nothing blocks. Worth a one-liner: "Admin-side V2 surfaces (e.g. customer project listing) are deferred to post-launch."

### 6.9 Conflict on language: "PAYG-only at v1" vs PRD's "5/10/50 calculations per purchase"

V2 plan §2: "PAYG-only at v1. No subscriptions." But the existing seed data (`packages/mvp_db/prisma/seed-products.ts`) and the PRD all describe the model as "one-time purchases of fixed-size calc packs". This isn't *technically* PAYG (pay-as-you-go) — it's pre-paid packs. The terminology is inconsistent.

**Verdict:** **Trivial.** Just naming. PAYG = pay-as-you-go conventionally implies metered usage with billing at end-of-period. The model is actually "prepaid calc packs". Worth fixing the terminology in V2 plan §2.

---

## 7. Gaps in the V2 plan

These are things mentioned in existing artifacts that V2 doesn't account for:

- **Rate limiting on V2 endpoints** — see §6.6.
- **License-key auth scheme name** — see §6.5.
- **Existing `EntitlementSummary` shape stability** — see §6.3.
- **Cloud-port Lambda + `apps/layout-engine` retirement** — see §6.4. Should be in deferred backlog.
- **Admin-side V2 surfaces** — see §6.8.
- **`semantic-id` prefix registry**: `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts` is the source of truth for `id` column prefixes. New models in V2 (`Project` → `prj`, `Run` → `run`) **must** be registered there. V2 plan B3/B4 doesn't mention this.
- **Migration ritual**: the V2 schema additions (B1, B2, B3, B4) are non-destructive, but past migrations have used `TRUNCATE` aggressively (Transaction-ledger spike). V2 must explicitly state that **no truncation is needed** because all additions are non-destructive — protects against an over-zealous future Claude Code session adding TRUNCATE "for hygiene".
- **`MVP_DATABASE_URL` env var name**: V2 plan uses generic "DB" language. The actual env var is `MVP_DATABASE_URL` (per `STRIPE_SETUP.md` §6.4 and `RELEASE.md`). Worth pinning.
- **Existing `GET /billing/usage` and Clerk-authenticated dashboard endpoints**: the customer-dashboard redesign (2026-04-26) added Clerk-authenticated billing endpoints under `/billing/*` that the desktop app doesn't see. These coexist with `/v2/*` and don't conflict — but V2's "frozen V1 endpoint" sweep (B21) needs to NOT freeze these (they're consumed by mvp_web, which is actively being iterated on).
- **`Transaction` ledger** writes — see §6.2.

---

## 8. Recommendations

In priority order:

1. **B5: Replace blob-provider TBD with "AWS S3, existing buckets"**. Rewrite the row's notes to point at `docs/AWS_RESOURCES.md` and the `renewable-energy-app` IAM user. The decision is already made repo-wide; V2 should not relitigate. Keep the T3 spike status (decision memo) but the memo's content is "we are reusing existing prod S3 infra". Save the migration to Vercel Blob / R2 for a later, separate decision if cost or perf force it.

2. **B19: Rewrite to extend `createEntitlementAndTransaction`**. Read `apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts` and `apps/mvp_api/src/modules/billing/provision.ts` before touching this row. The new `projectQuota` either (a) becomes a column on `Entitlement` populated by the helper, or (b) stays on `Product` and is JOINed in. Pick (a) for read-perf as the plan suggests, but route the write through the existing helper.

3. **§3 conventions: Add license-key auth statement**. One sentence: "All V2 routes that the desktop app calls reuse the existing `Authorization: Bearer sl_live_<...>` license-key auth middleware."

4. **B8: Pin V1 response shape**. One sentence: "V1 `GET /entitlements` response shape is frozen at the form documented in `apps/mvp_api/src/modules/entitlements/entitlements.service.ts` (`EntitlementSummary` interface). V2 fields go on V2 route only."

5. **B3, B4: Add semantic-ID prefix registration**. Note that `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts` must gain `Project: "prj"` and `Run: "run"` (or pick prefixes Prasanta likes).

6. **§7 Out of scope: Add `apps/layout-engine` decommission**. One bullet: "Cloud-port Lambda + `apps/layout-engine` workspace + `apps/web` + `apps/api` Vercel projects: post-V2 retirement; no work in this plan."

7. **§7 Out of scope: Add rate limiting**. One bullet: "Rate limiting on V2 endpoints — defer; rely on client-side debounce until production telemetry indicates need."

8. **§7 Out of scope: Add `mvp_admin` V2 surfaces**. One bullet: "Admin-side projects/runs listing in `apps/mvp_admin` — deferred to post-launch."

9. **Terminology fix**: "PAYG" → "prepaid calc packs" in §2. Trivial but accuracy compounds.

10. **B13 (auto-save)**: Note explicitly that **client-side debounce is the rate-limit defense at v1**, since server has none.

11. **Cross-link to `TRANSACTIONS_SPIKE_POST_MIGRATION.md`**: This runbook governs the operator state right now. V2's first deploy should not require a re-run of the ritual (V2 schema additions are non-destructive). State that as an acceptance criterion: "B1+B2+B3+B4 migration applied with zero data loss; existing operators do not need to re-run the post-migration ritual."

12. **If a numeric parity test or existing-data assertion is added to V2 rows**: anchor it on the actual seed values in `packages/mvp_db/prisma/seed-products.ts` (calculations: 5 / 5 / 10 / 50; priceAmount in cents: 0 / 199 / 499 / 1499). The V2 plan §2 has the right numbers, but a row that asserts seed correctness needs to read them from the seed file at test time, not hardcode them.

---

## 9. Files referenced (absolute paths)

- `/Users/arunkpatra/codebase/renewable_energy/CLAUDE.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/architecture.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/claude-dev-principles.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/collaborative-testing-protocol.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/feature-catalog.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/use-cases.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/AWS_RESOURCES.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/iam-policy-re-app-s3.json`
- `/Users/arunkpatra/codebase/renewable_energy/docs/initiatives/mvp-spike-plan.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/initiatives/pv-layout-cloud.md` (superseded)
- `/Users/arunkpatra/codebase/renewable_energy/docs/initiatives/pv-layout-spike-plan.md` (superseded)
- `/Users/arunkpatra/codebase/renewable_energy/docs/initiatives/spike-3g-ac-cable-routing-optimization.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/initiatives/spike-3g-lambda-perf-investigation.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/initiatives/post-parity-v2-backend-plan.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/mvp/PRD.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/mvp/STRIPE_SETUP.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/mvp/TRANSACTIONS_SPIKE_POST_MIGRATION.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/superpowers/specs/2026-04-25-mvp-admin-design.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/superpowers/specs/2026-04-26-mvp-web-customer-dashboard-redesign.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/superpowers/specs/2026-04-26-mvp-web-redesign-design.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/superpowers/specs/2026-04-28-mvp-manual-purchases-design.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/superpowers/plans/2026-04-25-mvp-admin.md`
- `/Users/arunkpatra/codebase/renewable_energy/docs/superpowers/plans/2026-04-28-mvp-manual-purchases.md`
- `/Users/arunkpatra/codebase/renewable_energy/RELEASE.md`
- `/Users/arunkpatra/codebase/renewable_energy/packages/mvp_db/prisma/schema.prisma`
- `/Users/arunkpatra/codebase/renewable_energy/packages/mvp_db/prisma/seed-products.ts`
- `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/app.ts`
- `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/usage/usage.service.ts`
- `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/entitlements/entitlements.service.ts`
- `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts`
- `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/billing/provision.ts`
