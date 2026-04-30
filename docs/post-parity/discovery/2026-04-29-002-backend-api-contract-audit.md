# Backend API Contract Audit — `renewable_energy/mvp_*`

Date: 2026-04-29
Author: discovery audit (read-only)
Target repo: `/Users/arunkpatra/codebase/renewable_energy`
Scope: contracts the new desktop app at `/Users/arunkpatra/codebase/pv_layout_project` will consume.

This is a research artifact for post-parity scoping. No code was modified in either repo.

---

## 1. Repo map — active vs defunct

`/Users/arunkpatra/codebase/renewable_energy/apps/`:

| Directory | Status | Purpose |
|---|---|---|
| `apps/mvp_web` | **active** | Next.js 16 marketing site + authed user dashboard (Vercel). Source of truth for what the customer-facing browser surface does. |
| `apps/mvp_api` | **active** | Hono-on-Bun API serving `api.solarlayout.in` / `renewable-energy-api.vercel.app`. Source of truth for entitlements + usage telemetry. |
| `apps/mvp_admin` | **active** (out of scope for desktop) | Internal admin UI; consumes `/admin/*` routes on mvp_api. Not consumed by the desktop app. |
| `apps/web` | **defunct** | Old marketing+app. Ignore. |
| `apps/api` | **defunct** | Old API. Ignore. |
| `apps/layout-engine` | **defunct** | Old layout engine. Ignore. |

`/Users/arunkpatra/codebase/renewable_energy/packages/`:

| Package | Status | Purpose |
|---|---|---|
| `packages/mvp_db` | **active** | Prisma schema + client used by `mvp_api`. Single source of truth for all persisted state. Exports both `prisma` (RLS-bound) and `adminPrisma`. |
| `packages/db` | **defunct** | Old Prisma package paired with `apps/api`. Ignore. |
| `packages/api-client`, `packages/shared`, `packages/ui` | **defunct for mvp_*** | Owned by the old `apps/web` / `apps/api` stack. `mvp_web` does not depend on `@renewable-energy/api-client` (its package.json shows `@clerk/nextjs`, `@tanstack/react-query`, no api-client) — it appears to call the API directly with a fetch wrapper or composes inline. The `@renewable-energy/ui` workspace IS used by `mvp_web`. |
| `packages/eslint-config`, `packages/typescript-config` | active toolchain | Shared linter/tsconfig. |

**Note:** the renewable_energy repo's own `CLAUDE.md` (at repo root) describes `apps/web` and `apps/api` as the architecture. That CLAUDE.md is **out of date** — it pre-dates the mvp split. The `apps/mvp_*` workspaces are the live, deployed surface (see `mvp_web/app/(main)/dashboard/*` and `mvp_api/src/app.ts` mounted routes). The pv_layout_project CLAUDE.md §7 is the correct guidance: only consume `mvp_*`.

---

## 2. Tech stack

### `apps/mvp_api`

- **Runtime:** Bun (build target `bun`, dev via `bun run --hot`)
- **Framework:** **Hono ^4.12.0** (`apps/mvp_api/src/app.ts:1`)
- **Auth libraries:** `@clerk/backend` ^1.0.0 for verifying Clerk-issued JWTs (web dashboard); custom license-key bearer auth for the desktop client.
- **Stripe:** `stripe` ^20.3.1.
- **Validation:** `zod` ^3.24.0 on every request body.
- **Database:** PostgreSQL via `@prisma/client` ^7.7.0 + `@prisma/adapter-pg`.
- **Storage:** `@aws-sdk/client-s3` for presigned download URLs.
- **Deployment target:** **Vercel Serverless** via a Node.js shim at `apps/mvp_api/api/index.js` (uses `getRequestListener` from `@hono/node-server`). `vercel.json` rewrites all paths to `/api/index`. Production URL per `.env.production`: `https://renewable-energy-api.vercel.app` (with custom domain `api.solarlayout.in` planned per Stripe webhook docs at `renewable_energy/docs/mvp/STRIPE_SETUP.md:169`).
  - Critical Vercel quirk documented in `api/index.js`: requires `NODEJS_HELPERS=0` env var, otherwise POST/PATCH bodies hang for 300s.

### `apps/mvp_web`

- **Framework:** **Next.js 16.2.4** App Router, React 19.
- **Auth:** `@clerk/nextjs` ^6.21.0 — Clerk for end-user identity.
- **Data fetching:** `@tanstack/react-query` ^5.76.1.
- **Styling:** Tailwind v4, shadcn primitives via `@renewable-energy/ui`.
- **Deployment target:** Vercel. Production URL per `.env.production` (`CORS_ORIGINS`): `https://renewable-energy-web.vercel.app`. Custom domain (per Stripe + transfer docs): `solarlayout.in` / `app.solarlayout.in`.

### `packages/mvp_db`

- **Prisma 7.7.0** (note: Prisma 7.x — newer than the 6.x-era community default, watch for syntax differences when reading Prisma docs).
- Generates client to `src/generated/prisma`, distributed via `dist/`.

---

## 3. Database schema (`packages/mvp_db/prisma/schema.prisma`)

PostgreSQL. Relevant models (full file is `/Users/arunkpatra/codebase/renewable_energy/packages/mvp_db/prisma/schema.prisma`):

### `User`
```
id               String   @id @default("")
clerkId          String   @unique          // Clerk subject
email            String   @unique
name             String?
roles            String[] @default([])     // "ADMIN" | "OPS" — empty for end users
status           String   @default("ACTIVE")
stripeCustomerId String?  @unique
createdAt        DateTime @default(now())
// Relations: licenseKeys[], entitlements[], checkoutSessions[], usageRecords[],
//            transactions[] (as buyer), transactionsRecorded[] (as ADMIN/OPS actor)
```
Single user can hold multiple `LicenseKey` rows over time.

### `LicenseKey`
```
id           String   @id
key          String   @unique             // Format: "sl_live_<24-byte-base64url>"
userId       String   → User
createdAt    DateTime
revokedAt    DateTime?                     // soft-delete
```
**Generation:** in `clerk-auth.ts` lines 96–127, on first Clerk login a key is minted as `sl_live_${crypto.randomBytes(24).toString("base64url")}`. Auto-provisioning runs **once per user** under a P2002-guarded transaction. The desktop app authenticates with this key.

### `Product`
```
id            String   @id
slug          String   @unique             // "pv-layout-free" | "pv-layout-basic" | "pv-layout-pro" | "pv-layout-pro-plus"
name          String                        // "Free" | "Basic" | "Pro" | "Pro Plus"
description   String
priceAmount   Int                           // USD cents
priceCurrency String   @default("usd")
calculations  Int                           // pool size when purchased
stripePriceId String   @unique
displayOrder  Int      @default(0)
active        Boolean  @default(true)
isFree        Boolean  @default(false)
features      ProductFeature[]
```

### `ProductFeature` — **the feature-key registry on the database side**
```
id         String  @id
productId  String  → Product
featureKey String                            // <-- CANONICAL FEATURE KEY (string)
label      String                            // human-readable, for display
@@unique([productId, featureKey])
```

### `Entitlement` — what a user has bought
```
id                String   @id
userId            String   → User
productId         String   → Product
transactionId     String   → Transaction
totalCalculations Int                        // pool size
usedCalculations  Int      @default(0)
purchasedAt       DateTime
deactivatedAt     DateTime?                  // ADMIN/OPS kill switch
```
A user can have multiple active entitlements simultaneously; `availableFeatures` is the union of all their non-deactivated, non-exhausted entitlements' features.

### `UsageRecord` — telemetry log
```
id           String   @id
userId       String   → User
licenseKeyId String   → LicenseKey
productId    String   → Product             // pool the call was charged to
featureKey   String                         // free-form string at this layer
metadata     Json?                          // currently never populated (not used)
createdAt    DateTime
```

### `Transaction` — purchase ledger
```
id, userId, productId, source ("STRIPE"|"MANUAL"|"FREE_AUTO"),
status ("COMPLETED"), amount (USD cents), currency, purchasedAt,
paymentMethod, externalReference, notes, createdByUserId, checkoutSessionId
```

### Other models (out of scope for desktop integration but present)
- `CheckoutSession` — Stripe checkout flow state.
- `DownloadRegistration` — marketing download form captures.
- `ContactSubmission` — marketing contact form captures.

---

## 4. Feature key registry — **the source of truth**

### Where it lives

**Authoritative file:** `/Users/arunkpatra/codebase/renewable_energy/packages/mvp_db/prisma/seed-products.ts`

This is a Prisma seed script run against the `mvp_db` database. The `ProductFeature` table — populated by this seed — is the runtime source of truth, but the seed is the only place where the keys are written as constants. There is **no TypeScript const-object registry of feature keys** in the backend repo. Feature keys are loose string literals in three places:

1. **The seed** (`seed-products.ts`) — strings.
2. **The DB column** `ProductFeature.featureKey` — text.
3. **The runtime usage validator** (`usage.service.ts:11-19`) — checks `productFeature.findFirst({ where: { featureKey } })`, i.e. accepts any key currently present in any product. No enum, no zod literal union.

### Currently defined keys (from seed-products.ts:23-74)

Exactly **6 distinct feature keys**:

| `featureKey` | `label` | First seeded in | Notes |
|---|---|---|---|
| `plant_layout` | "Plant Layout (MMS, Inverter, LA)" | Free, Basic, Pro, Pro Plus | Includes lightning arresters per ADR-0005 §5. |
| `obstruction_exclusion` | "Obstruction Exclusion" | Free, Basic, Pro, Pro Plus | |
| `cable_routing` | "AC & DC Cable Routing" | Free, Pro, Pro Plus | NOT in Basic. |
| `cable_measurements` | "Cable Quantity Measurements" | Free, Pro, Pro Plus | NOT in Basic. |
| `energy_yield` | "Energy Yield Analysis" | Free, Pro Plus | NOT in Basic, NOT in Pro. |
| `generation_estimates` | "Plant Generation Estimates" | Free, Pro Plus | NOT in Basic, NOT in Pro. |

Per-plan mapping from the seed:

| Plan | Slug | Calc pool | Price (USD ¢) | Feature keys |
|---|---|---|---|---|
| Free | `pv-layout-free` | 5 | 0 | all 6 (auto-granted on signup) |
| Basic | `pv-layout-basic` | 5 | 199 | `plant_layout`, `obstruction_exclusion` |
| Pro | `pv-layout-pro` | 10 | 499 | the above + `cable_routing`, `cable_measurements` |
| Pro Plus | `pv-layout-pro-plus` | 50 | 1499 | all 6 |

### Cross-reference with ADR-0005 (the new repo)

`/Users/arunkpatra/codebase/pv_layout_project/docs/adr/0005-feature-key-registry.md` declares the same 6 keys (lines 47-55) and points the registry at exactly this seed file (line 12). **The two are aligned today.** ADR-0005 §3 prescribes a contract test in `packages/entitlements-client` that asserts the frontend `FEATURE_KEYS` ⊆ seed keys.

**Drift check:** the prose at ADR-0005 line 19 lists keys the frontend was *previously* checking but which don't exist in the seed: `cables`, `energy`, `obstructions`, `icr_drag`, `dxf`. The ADR documents these as removed; treat any code that still references them as a bug.

### Free tier surprise

Free is gated identically to Pro Plus on features (all 6 keys), differing only in `calculations: 5`. This means a Free user can *try* every feature once — the revenue model is calc-quota-driven, not feature-tier-driven, for the free funnel. The desktop app must not assume "Basic features only" for `licensed: true` calls — it must read `availableFeatures` and not synthesize from plan name.

---

## 5. Entitlements API

### `GET /entitlements`

**File:** `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/entitlements/entitlements.routes.ts:13`
**Service:** `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/entitlements/entitlements.service.ts`
**Mounted at:** root (`app.route("/", entitlementsRoutes)` in `app.ts:51`). Full prod URL: `https://renewable-energy-api.vercel.app/entitlements` (or `https://api.solarlayout.in/entitlements` once DNS cuts over).

**Authorization:** `Authorization: Bearer sl_live_<...>` — license-key auth (NOT Clerk).
- Middleware at `apps/mvp_api/src/middleware/license-key-auth.ts`. Token must start with `sl_live_`. Looks up `LicenseKey` where `key = token AND revokedAt IS NULL`, throws `401 UNAUTHORIZED` on miss.

**Query params:** none.

**Response (200) — derived from the actual `EntitlementSummary` interface at `entitlements.service.ts:12-21`:**

```ts
{
  success: true,
  data: {
    user: {
      name: string | null,
      email: string,
    },
    plans: Array<{
      planName: string,                    // e.g. "Pro Plus" — Product.name
      features: string[],                  // human-readable LABELS, not keys; for display
      totalCalculations: number,
      usedCalculations: number,
      remainingCalculations: number,       // Math.max(0, total - used)
    }>,
    licensed: boolean,                     // true iff remainingCalculations > 0
    availableFeatures: string[],           // FEATURE KEYS (e.g. "plant_layout") — UNION across non-deactivated, non-exhausted entitlements
    totalCalculations: number,
    usedCalculations: number,
    remainingCalculations: number,
  }
}
```

Note the asymmetry that bit S10 in the new repo: `plans[].features` are **labels** ("Plant Layout (MMS, Inverter, LA)"), while `availableFeatures` are **keys** (`plant_layout`). Gate code must read `availableFeatures`.

**Error responses:**
- `401 UNAUTHORIZED` — missing/malformed/revoked key. Code: `UNAUTHORIZED`.
- `500 INTERNAL_ERROR` — DB unreachable, etc.

**Edge cases (verified against `entitlements.service.ts` and `entitlements.test.ts`):**
- All entitlements exhausted → `licensed: false`, `availableFeatures: []`, `plans: []` (exhausted entitlements are filtered out at line 41-43).
- All entitlements deactivated by ops → same as above.
- User has Basic + Pro stacked → both appear in `plans[]`; `availableFeatures` is the deduplicated union.
- Free tier just provisioned → 6 features, `remainingCalculations: 5`.
- User exists but never had any entitlement (shouldn't happen — Clerk login auto-grants Free) → `plans: []`, `availableFeatures: []`, `licensed: false`.

**Caching guidance for desktop:** see ADR-0001 in pv_layout_project. Online-required, no persisted cache, intra-session TanStack Query stale-time only. The API does not emit cache headers (verified: no `Cache-Control` set in the handler).

---

## 6. Usage / telemetry API

### `POST /usage/report`

**File:** `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/usage/usage.routes.ts:17`
**Service:** `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/usage/usage.service.ts`
**URL:** `POST https://renewable-energy-api.vercel.app/usage/report`

**Authorization:** `Authorization: Bearer sl_live_<...>` (license-key auth, same as entitlements).

**Request body (zod schema at `usage.routes.ts:13`):**
```ts
{
  feature: string  // must be a known featureKey (validated server-side against ProductFeature table)
}
```
**No `event`, no `ts`, no `meta`.** This is **not a generic telemetry endpoint** — it's a per-calculation quota debit.

**What it actually does (`usage.service.ts:1-85`):**
1. Validates `feature` exists in any `ProductFeature` row → 400 `VALIDATION_ERROR` if not.
2. Loads all of user's entitlements where `deactivatedAt IS NULL`, ordered by `product.displayOrder ASC` (cheapest-first).
3. Picks the **first** entitlement that (a) has `usedCalculations < totalCalculations` and (b) covers the requested feature.
4. If none → 402 `PAYMENT_REQUIRED` ("No remaining calculations — purchase more at solarlayout.in").
5. Atomically `UPDATE entitlements SET usedCalculations = usedCalculations + 1` with a guard against concurrent decrement; if the update affects 0 rows → 409 `CONFLICT`.
6. Inserts a `UsageRecord` row in the same transaction.

**Response (200):**
```ts
{
  success: true,
  data: {
    recorded: true,
    remainingCalculations: number  // computed from the in-memory entitlements snapshot
  }
}
```

**Error codes:**
| Status | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body invalid or `feature` not in any product. |
| 401 | `UNAUTHORIZED` | License key missing/invalid. |
| 402 | `PAYMENT_REQUIRED` | No matching entitlement with remaining quota. |
| 409 | `CONFLICT` | Concurrent decrement race lost. |
| 500 | `INTERNAL_ERROR` | Unhandled. |

**Pool selection — cheapest-first:** `displayOrder` is the proxy. Free=0, Basic=1, Pro=2, Pro Plus=3, so a user stacking Pro+Pro Plus will spend the Pro pool first (verified by `usage.test.ts:275-321`).

### `GET /usage/history`

Same module (`entitlements.routes.ts:19`). Returns the user's last 100 usage records:
```ts
{ success: true, data: {
  records: Array<{
    featureKey: string,
    productName: string,
    createdAt: string  // ISO
  }>
}}
```
License-key auth. No pagination params; capped at 100.

**What the desktop should call this for:** the in-app usage history view, if any. Note `mvp_web` has its own `/dashboard/usage` page that calls **the Clerk-authed `/billing/usage`** (paginated) — which is a different endpoint with the same data. The desktop will use `/usage/history`.

### What is NOT recorded by /usage/report

- No event taxonomy (no "feature opened" / "export clicked" / "session length").
- No client metadata (no `app_version`, `os`, `session_id`, `correlation_id`).
- No idempotency key. A retry duplicates the debit. If the desktop's `/usage/report` request times out the user just lost a calculation. **This is a contract gap.**
- The `UsageRecord.metadata Json?` column exists but is never populated — it's a hook for future use, no API to write it.

---

## 7. Auth model

**Two parallel auth surfaces sharing the same `User` table:**

### A. Clerk JWT (web dashboard)

- Used by: `mvp_web` (browser) → all `/billing/*`, `/dashboard/*`, `/admin/*` endpoints.
- Middleware: `apps/mvp_api/src/middleware/clerk-auth.ts`.
- Verification: `verifyToken(token, { secretKey: CLERK_SECRET_KEY })` — Clerk's standard JWT verification.
- First-login flow (lines 30-138): if `User` row missing for `clerkId`, Clerk SDK is queried for email + name + public metadata roles, a `User` is created, then in a transaction a `Free` `Product` lookup happens, a `Transaction(source: "FREE_AUTO")` is created, an `Entitlement` of 5 calcs is created, and a `LicenseKey` (`sl_live_...`) is minted. P2002 unique-constraint races on concurrent first-login are caught and the loser skips provisioning.
- The Clerk publishable key in `.env.production` is `pk_test_...` — meaning **production is currently running against Clerk's test environment**. (Possibly intentional for an MVP; flag as a finding.)

### B. License key bearer (desktop)

- Used by: desktop app (Tauri shell + React frontend) → `/entitlements`, `/usage/report`, `/usage/history`.
- Middleware: `apps/mvp_api/src/middleware/license-key-auth.ts`.
- Format: `Authorization: Bearer sl_live_<24-byte-base64url>`.
- Verification: O(1) DB lookup on `licenseKey.key` column with `revokedAt IS NULL` filter. **No JWT, no signing, no expiration — the key is the secret.** A leaked key is valid until ops revokes it.
- **No refresh flow.** Keys are perpetual until revoked.
- **No multi-device tracking.** A user can paste the same key on N machines. Quota is a single shared pool.

### How the desktop gets the key

1. End user signs up at `solarlayout.in` → Clerk auth → backend mints a `LicenseKey` row.
2. User views the key in the dashboard at `mvp_web /dashboard` (`GET /billing/entitlements` returns `{ entitlements, licenseKey }` — see `billing.routes.ts:149-184`).
3. User copy-pastes the key into the desktop app's first-run dialog.
4. Desktop persists the key in OS keyring (per the new repo's CLAUDE.md and ADR-0001).

The new repo's CLAUDE.md and architecture docs already describe this; no contract change needed.

### Offline behaviour

ADR-0001 (`/Users/arunkpatra/codebase/pv_layout_project/docs/adr/0001-online-required-entitlements.md`): **online required, every launch.** No grace cache, no stale tokens.

This aligns with the backend's contract — the API has no "this token is valid for N minutes/hours/days offline" feature. The license key just is or isn't valid at request time. Backend exposes nothing the desktop could use to verify offline.

---

## 8. Other endpoints (full mvp_api surface)

Public / no auth:
| Method | Path | Module file | Purpose |
|---|---|---|---|
| GET | `/` | `app.ts:59` | HTML status page |
| GET | `/health/live` | `app.ts:77` | Liveness probe |
| GET | `/health/ready` | `app.ts:88` | DB-checking readiness probe |
| GET | `/products` | `modules/products/products.routes.ts:8` | List active non-free products with features (label + key). Used by marketing pricing page. |
| POST | `/contact` | `modules/contact/contact.routes.ts:9` | Marketing contact form submit |
| POST | `/download-register` | `modules/downloads/downloads.routes.ts:11` | Marketing download form — registers email + returns presigned S3 URL |
| POST | `/webhooks/stripe` | `modules/webhooks/stripe.webhook.routes.ts` | Stripe webhook (signature verified). Provisions entitlement on `checkout.session.completed`. |

Clerk-authed (web dashboard):
| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/download` | Presigned S3 URL for the desktop installer |
| POST | `/billing/checkout` | Create Stripe Checkout session for `{ product: slug }` |
| POST | `/billing/verify-session` | Verify Stripe session post-redirect, idempotent provisioning trigger |
| GET | `/billing/entitlements` | Dashboard view of all entitlements + the user's license key |
| GET | `/billing/usage` | Paginated usage history for dashboard |

License-key-authed (desktop):
| Method | Path | Purpose |
|---|---|---|
| GET | `/entitlements` | THE entitlements call |
| POST | `/usage/report` | Quota debit |
| GET | `/usage/history` | Last-100 usage records |

Clerk + RBAC `ADMIN` / `OPS` (admin tooling — out of scope for desktop):
- `/admin/users/search` (ADMIN+OPS)
- `/admin/users`, `/admin/users/:id`, `/admin/users/:id/roles`, `/admin/users/:id/status` (ADMIN)
- `/admin/customers`, `/admin/customers/:id`, `/admin/customers/:id/transactions` (ADMIN+OPS)
- `/admin/entitlements/:id/status`, `/admin/entitlements/:id/used` (ADMIN+OPS)
- `/admin/products`, `/admin/products/summary`, `/admin/products/:slug`, `/admin/products/:slug/sales` (ADMIN+OPS)
- `/admin/products/stripe-prices` (ADMIN)
- `/admin/dashboard/summary`, `/admin/dashboard/trends` (ADMIN+OPS)
- `/admin/transactions`, `/admin/transactions/:id` (ADMIN+OPS)

---

## 9. mvp_web dashboard surface

The end-user dashboard at `mvp_web/app/(main)/dashboard/`:

- `/dashboard` (`page.tsx`) — landing page after Clerk sign-in. Shows account status and a download CTA (calls `GET /dashboard/download` for presigned installer URL). Likely surfaces the license key for copy-paste.
- `/dashboard/plans` (`plans/page.tsx`) — plan management. Lists active entitlements (calls `GET /billing/entitlements`), shows purchase CTAs that hit `POST /billing/checkout` (Stripe Checkout redirect), handles the `?session_id=...` redirect via `POST /billing/verify-session`.
- `/dashboard/usage` (`usage/page.tsx` + `usage-inner.tsx`) — paginated usage history view (calls `GET /billing/usage`).

Marketing pages (`mvp_web/app/(marketing)/*`): `about`, `contact`, `faq`, `how-it-works`, `pricing`, `privacy`, `products`, `terms`, plus the homepage. The pricing page consumes `GET /products`.

**What the desktop must NOT duplicate:**
- Subscription purchase flow — desktop should deep-link out to `solarlayout.in/dashboard/plans` for purchase. Stripe Checkout is browser-only.
- License key reveal/copy — already in `/dashboard`. Desktop doesn't need an API to fetch its own key (it already has it).
- Usage history pagination — desktop can use `/usage/history` (last-100, no pagination) for an in-app strip; deeper analysis stays in the web dashboard.
- Account email change — sits in Clerk's UserProfile widget on the web dashboard.

---

## 10. Open contract questions / risks

1. **`/products` returns features in a different shape than `/entitlements`.** `/products` returns `features: { featureKey, label }[]` (objects); `/entitlements` returns `plans[].features: string[]` (labels only) and a separate `availableFeatures: string[]` (keys only). The desktop must not confuse the two. This is documented above but worth explicit mention — the inconsistency surfaces every time someone reads the entitlements response shape from memory.

2. **No idempotency on `/usage/report`.** A network retry after a successful debit double-charges the user. The new desktop app needs a client-side de-dupe story — and a backend `Idempotency-Key` header would be a clean addition before launch. Today there is none.

3. **No client metadata on usage telemetry.** The endpoint is named "usage/report" but actually only tracks calc-quota debits. If post-parity the desktop wants real telemetry — feature opens, session length, error rates, app version, OS — there is **no endpoint for it**. `UsageRecord.metadata` is a stub column, never written. The schema would need extension (or a separate telemetry surface).

4. **License key has no expiration, no rotation, no per-device fingerprint.** A leaked key is valid forever (until human revoke). Multiple-device shared use is impossible to detect and impossible to prevent. Out of scope for desktop integration but worth flagging for the post-parity security review.

5. **Production is on Clerk test keys.** `.env.production` shows `pk_test_...` and `sk_test_...`. Probably an MVP-stage deliberate choice, but desktop launch likely needs a swap to `pk_live_...` first — which means either Clerk env migration or a coordinated user-data move. Flag for the launch checklist.

6. **No typed registry on the backend either.** ADR-0005 prescribes a typed registry on the *frontend* of pv_layout_project, but the *backend* still passes feature keys around as `string`. There is nothing to prevent a backend dev from typoing a key in `seed-products.ts` and shipping it to production silently — the seed runs, the row exists, and the contract test in pv_layout_project would *pass* (because the typo seed key would now be in the seed) while the desktop's `FEATURE_KEYS` wouldn't include it. Future hardening: a const-of-strings module in `mvp_db` that the seed imports, mirroring the registry shape.

7. **`/usage/history` has a hard cap of 100, no pagination.** Adequate for the desktop's in-session strip, inadequate for any "show me my last 30 days" view. If post-parity wants that, add pagination params or have desktop point at the web dashboard.

8. **mvp_db Prisma is on v7.7.** Most online docs/snippets assume v6. When working on schema changes downstream, verify against the v7 docs (notably the new client output dir convention used here at `src/generated/prisma`).

9. **CORS allowlist is env-driven.** `MVP_CORS_ORIGINS` in `apps/mvp_api/src/app.ts:28-30`. Tauri's webview ships requests from a non-HTTP origin (`tauri://localhost` or similar). The current allowlist has `http://localhost:3002, http://localhost:3004` defaults; production env has `https://renewable-energy-web.vercel.app`. **Tauri's origin will not be in this list.** Either Tauri must call from the Rust shell (no browser CORS), or the allowlist must be extended. The desktop architecture note in pv_layout_project says the sidecar talks to localhost — but the *entitlements* call goes to the public API, so this matters. Verify which side issues the call before launch.

10. **No `/auth/exchange` endpoint to swap a Clerk JWT for a license key.** If the desktop ever wants a "sign in with Clerk in-app" flow, there's no API for it today. The current contract requires the user to copy-paste from web. That's a reasonable v1 but worth knowing if "smoother onboarding" comes up post-parity.

---

## 11. Citations summary (for fast click-through)

- Schema: `/Users/arunkpatra/codebase/renewable_energy/packages/mvp_db/prisma/schema.prisma`
- Feature key seed: `/Users/arunkpatra/codebase/renewable_energy/packages/mvp_db/prisma/seed-products.ts`
- API entry: `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/app.ts`
- Entitlements route: `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/entitlements/entitlements.routes.ts`
- Entitlements service + types: `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/entitlements/entitlements.service.ts`
- Usage route: `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/usage/usage.routes.ts`
- Usage service: `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/modules/usage/usage.service.ts`
- License-key middleware: `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/middleware/license-key-auth.ts`
- Clerk middleware (license key minting): `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/middleware/clerk-auth.ts`
- Response envelope helpers: `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/lib/response.ts`
- Error envelope: `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/lib/errors.ts`, `/Users/arunkpatra/codebase/renewable_energy/apps/mvp_api/src/middleware/error-handler.ts`
- New repo ADR-0005 (frontend-side feature registry): `/Users/arunkpatra/codebase/pv_layout_project/docs/adr/0005-feature-key-registry.md`
- New repo ADR-0001 (online-required policy): `/Users/arunkpatra/codebase/pv_layout_project/docs/adr/0001-online-required-entitlements.md`
- Production env (URLs): `/Users/arunkpatra/codebase/renewable_energy/.env.production`
