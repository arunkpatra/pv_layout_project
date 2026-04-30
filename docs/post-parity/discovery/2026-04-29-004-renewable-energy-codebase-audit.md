# `renewable_energy` Live Codebase Audit — V2 Backend Scoping Input

Date: 2026-04-29
Author: discovery audit (read-only)
Target repo: `/Users/arunkpatra/codebase/renewable_energy`
Companion docs:
- `docs/post-parity/discovery/2026-04-29-002-backend-api-contract-audit.md` — contract-only view
- This file — full inventory (code + schema + auth + Stripe + admin + web + packages)

This is a research artifact. No code in `renewable_energy/` was modified.

The repo's own root `CLAUDE.md` and `docs/architecture.md` describe the **defunct** `apps/{web,api,layout-engine}` and `packages/db` stack — ignore them. The live deployed surface is the `apps/mvp_*` workspaces and `packages/mvp_db`. Everywhere below, "live" means present in the runtime path of the Vercel-deployed `mvp_api` / `mvp_web` / `mvp_admin`.

---

## 1. File / module inventory

### 1.1 `apps/mvp_api` — Hono on Bun (deployed Vercel Serverless)

Top-level layout under `apps/mvp_api/`:

```
api/index.js              Vercel Node.js shim wrapping Hono via @hono/node-server
src/index.ts              Bun entrypoint (port 3003)
src/app.ts                Hono app: middleware chain, route mounting, /health/{live,ready}
src/env.ts                Zod-validated env (MVP_DATABASE_URL, CLERK_SECRET_KEY, STRIPE_*, AWS_*, MVP_S3_DOWNLOADS_BUCKET, MVP_CORS_ORIGINS)
src/lib/db.ts             Re-exports `prisma as db` from @renewable-energy/mvp-db
src/lib/stripe.ts         Stripe client factory (throws if STRIPE_SECRET_KEY unset)
src/lib/s3.ts             Lazy S3 client; getPresignedDownloadUrl(); returns null if not configured
src/lib/response.ts       ApiResponse<T> = success-discriminated union; ok() / err() helpers
src/lib/errors.ts         AppError, NotFoundError, ValidationError, ConflictError
src/views/root.html.ts    HTML view for GET / health splash
src/middleware/clerk-auth.ts        Clerk JWT verifier + JIT user provisioning + auto-Free-tier grant
src/middleware/license-key-auth.ts  Bearer "sl_live_*" → LicenseKey + User
src/middleware/rbac.ts              requireRole("ADMIN"|"OPS"|...)
src/middleware/error-handler.ts     Hono ErrorHandler; defines MvpHonoEnv.Variables type (user, licenseKey)
src/middleware/logger.ts            Per-request JSON log line; attaches X-Request-Id
src/tests/preload.ts                bun test preload — env defaults + global fetch mocks
```

Modules under `src/modules/`:

| Module | Files | One-line purpose |
|---|---|---|
| `contact/` | `contact.routes.ts`, `contact.service.ts`, `contact.test.ts` | POST /contact — public marketing form; persists to `contact_submissions` |
| `downloads/` | `downloads.routes.ts`, `downloads.service.ts`, `downloads.test.ts` | POST /download-register — public; logs to `download_registrations` and returns presigned S3 URL for `pv_layout.zip` |
| `dashboard/` | `dashboard.routes.ts`, `dashboard.routes.test.ts` | GET /dashboard/download — Clerk-auth gated presigned URL (logged-in users) |
| `products/` | `products.routes.ts`, `products.routes.test.ts` | GET /products — public catalog (paid plans only; isFree excluded) |
| `billing/` | `billing.routes.ts`, `provision.ts`, `create-entitlement-and-transaction.ts`, `billing.routes.test.ts`, `billing.provision.test.ts` | Clerk-auth: checkout / verify-session / entitlements / usage. `provision.ts` is idempotent post-Stripe entitlement grant. `create-entitlement-and-transaction.ts` is the shared atomic write used by Stripe + manual paths. |
| `webhooks/` | `stripe.webhook.routes.ts`, `stripe.webhook.test.ts` | POST /webhooks/stripe — verifies signature, handles `checkout.session.completed` only, calls `provisionEntitlement` |
| `entitlements/` | `entitlements.routes.ts`, `entitlements.service.ts`, `entitlements.test.ts` | License-key-auth: GET /entitlements (desktop summary), GET /usage/history |
| `usage/` | `usage.routes.ts`, `usage.service.ts`, `usage.test.ts` | License-key-auth: POST /usage/report — atomic decrement of cheapest pool that has the requested feature |
| `transactions/` | `transactions.routes.ts`, `transactions.service.ts`, `types.ts`, `*.test.ts` | Admin-auth: list/get/create manual transactions (admin source MANUAL) |
| `admin/` | `admin.routes.ts` `admin.service.ts`, `customer.routes.ts` `customer.service.ts`, `product.routes.ts` `product.service.ts`, `dashboard.routes.ts` `dashboard.service.ts`, `sales-utils.ts`, `*.test.ts` | All `/admin/*` surfaces — user mgmt, customer ledger, product analytics, KPI dashboard. Granularity helpers in `sales-utils.ts` |

Tests: 23 `*.test.ts` files in `apps/mvp_api/src`. Coverage: every route module has a `routes.test.ts`, every service module has a `service.test.ts`. Middleware (clerk-auth, license-key-auth, rbac) has dedicated tests. Full-stack-style tests; they run with `bun test` and use `tests/preload.ts` to mock Clerk + Stripe.

### 1.2 `apps/mvp_admin` — Next.js 16 internal admin (port 3004)

```
proxy.ts                        Clerk middleware — protects everything except /sign-in
app/layout.tsx                  Root layout with ClerkProvider + ThemeProvider + QueryProvider
app/page.tsx                    "/" — redirects to /dashboard
app/sign-in/[[...sign-in]]/page.tsx
app/(admin)/layout.tsx          RBAC gate: rejects unless roles include ADMIN or OPS; renders sidebar
app/(admin)/dashboard/page.tsx  KPI overview (consumes /admin/dashboard/{summary,trends})
app/(admin)/customers/page.tsx  Customer list (paginated)
app/(admin)/customers/[id]/page.tsx  Customer detail + entitlement edit
app/(admin)/plans/page.tsx      Product list
app/(admin)/plans/[slug]/page.tsx    Product detail + sales chart
app/(admin)/transactions/page.tsx    Transaction ledger (filterable)
app/(admin)/transactions/new/page.tsx  Create manual MANUAL transaction
app/(admin)/transactions/[id]/page.tsx  Transaction detail
app/(admin)/users/page.tsx      Internal-user list (ADMIN only)
app/(admin)/users/new/page.tsx  Create staff user (creates Clerk user + DB row)
app/(admin)/users/[id]/page.tsx Edit roles + status
app/(admin)/system/page.tsx     Stripe price config (ADMIN only)
components/admin-sidebar.tsx    Sidebar navigation (BASE_NAV + ADMIN_NAV — Users + System hidden for OPS)
components/query-provider.tsx
components/theme-provider.tsx
lib/api.ts                      Plain fetch helper; declares ALL admin DTO types as TS literals (no shared package)
lib/hooks/use-admin-{users,products,customers,user,dashboard,transactions,user-search}.ts
lib/hooks/mutations/use-create-admin-user.ts, use-update-user-status.ts, use-update-user-roles.ts
```

Note: `mvp_admin/lib/api.ts` is **not** the `@renewable-energy/api-client` package. It's a hand-rolled fetch wrapper with locally-duplicated DTO types. Same pattern as `mvp_web/components/hooks/use-billing.ts` — direct fetch, locally-declared types. **There is no shared TS client between mvp_web/mvp_admin and mvp_api.**

Tests: 6 `*.test.tsx` (admin-sidebar, layout, dashboard, users list, users/new, users/[id]).

### 1.3 `apps/mvp_web` — Next.js 16 marketing + dashboard (port 3002)

```
proxy.ts                              Clerk middleware: dashboard routes require auth; auth routes redirect when signed in
app/layout.tsx                        ClerkProvider + ThemeProvider + QueryProvider
app/(marketing)/layout.tsx, page.tsx  Public landing page
app/(marketing)/{about,contact,faq,how-it-works,pricing,privacy,products,terms}/page.tsx  Marketing routes
app/(main)/layout.tsx                 Authed shell (Clerk-protected)
app/(main)/dashboard/page.tsx         License key + remaining/used calc cards + recent activity
app/(main)/dashboard/plans/page.tsx   Plan grid + Stripe checkout button + purchase history
app/(main)/dashboard/usage/page.tsx, usage-inner.tsx  Paginated usage history
app/sign-{in,up}/[[...sign-{in,up}]]/page.tsx        Clerk auth pages
components/header.tsx, footer.tsx, hero-section.tsx, ...  ~30 marketing/dashboard React components
components/dashboard-sidebar.tsx
components/contact-form.tsx, download-modal.tsx       Talk to /contact and /download-register
components/hooks/use-billing.ts       useEntitlements() + useUserUsage(); plain fetch + Bearer Clerk token
components/query-provider.tsx, theme-provider.tsx
```

Tests: 16 `*.test.tsx` — marketing pages (page tests for marketing landing, contact, products, faq, terms, privacy, about, how-it-works, pricing), dashboard tests (page, usage, contact-form, download-modal, dashboard-sidebar, footer, header).

### 1.4 `packages/mvp_db` — Prisma 7 client (single source of DB truth)

```
prisma/schema.prisma                 9 models (see §2)
prisma/seed-products.ts              Seeds the 4 products + their feature_keys; idempotent upsert
prisma/migrations/                   9 migrations, 2026-04-21 → 2026-04-27 (see §2)
src/index.ts                         Exports `appPrisma` (= prisma; strict + semantic) and `adminPrisma` (semantic only). Adapter: PrismaPg.
src/extensions/index.ts              Re-export
src/extensions/strict-id/strict-id.extension.ts  Prevents manual id injection on create/createMany/upsert; logs warning + strips
src/extensions/semantic-id/id-generator.ts        generateSemanticId(prefix) → 40-char `prefix_random` (Base62)
src/extensions/semantic-id/id-prefixes.ts          Registry: drg, csb, usr, lk, prod, pf, ent, cs, ur, txn
src/extensions/semantic-id/semantic-id.extension.ts  Prisma extension that injects ID at create
src/extensions/semantic-id/id-generator.test.ts
src/generated/prisma/                Generated client (committed)
```

Tests: 1 `id-generator.test.ts`. All other tests assume Prisma works (this is normal for Prisma).

### 1.5 Other packages

| Package | Live? | Notes |
|---|---|---|
| `packages/api-client` | **defunct for mvp_***; imported only by `apps/web` (defunct) | TS client w/ projects + identity for the old API. Not used by any mvp_* app. Code-fossil. |
| `packages/shared` | **defunct for mvp_***; imported by `apps/web` + `apps/api` (both defunct) | Types: User, Project, ProjectSummary, VersionDetail, LayoutInputSnapshot, ApiResponse, PaginatedResponse. All forward-looking project/version domain. **None of these models exist in the live Prisma schema.** |
| `packages/ui` | **active** — used by both `mvp_web` and `mvp_admin` | shadcn primitives package. ~50 component files (see §8). |
| `packages/eslint-config`, `packages/typescript-config` | active toolchain | Shared configs. |

---

## 2. Prisma schema audit

Source: `/Users/arunkpatra/codebase/renewable_energy/packages/mvp_db/prisma/schema.prisma`. PostgreSQL.

All `id` fields are `String @id @default("")` — the empty default is a deliberate sentinel: the strict-id extension strips manual ids and the semantic-id extension fills in `prefix_<32 chars Base62>` at create time. Every row in every table has the same 40-character ID format.

### 2.1 Models

| Model | Table | Fields | Indexes / uniques | Notes |
|---|---|---|---|---|
| `DownloadRegistration` | `download_registrations` | `id, name, email, mobile?, product, ipAddress, createdAt` | none | Append-only marketing log; not joined elsewhere. |
| `ContactSubmission` | `contact_submissions` | `id, name, email, subject, message, ipAddress, createdAt` | none | Append-only marketing log; not joined elsewhere. |
| `User` | `users` | `id, clerkId (uniq), email (uniq), name?, roles String[] default [], status default "ACTIVE", stripeCustomerId? (uniq), createdAt`. Relations: licenseKeys, entitlements, checkoutSessions, usageRecords, transactions (alias TransactionUser), transactionsRecorded (alias TransactionCreatedBy). | unique clerkId, unique email, unique stripeCustomerId | Single-table identity for both end users and staff. `roles` is a string array — empty for end users, `["ADMIN"]` or `["OPS"]` for staff. `status: "ACTIVE" | "INACTIVE"` enforced at clerk-auth middleware. **No org / tenant model — flat user table.** |
| `LicenseKey` | `license_keys` | `id, key (uniq), userId, createdAt, revokedAt?` | unique key | Format `sl_live_<base64url(24 random bytes)>`. Created at first JIT user (free) or first Stripe purchase. **One per user** in current code (`existingKey` check). Revocation is `revokedAt` timestamp (no rotation flow exposed). |
| `Product` | `products` | `id, slug (uniq), name, description, priceAmount Int (USD cents), priceCurrency default "usd", calculations Int, stripePriceId (uniq), displayOrder default 0, active default true, isFree default false, createdAt`. Relations: features, entitlements, usageRecords, transactions. | unique slug, unique stripePriceId | Currency stored as string but default `"usd"` and seed treats prices as USD; product display formats with `en-IN` locale (mismatch — see §3 risks). |
| `ProductFeature` | `product_features` | `id, productId, featureKey, label`. Unique on (productId, featureKey). | composite unique | Feature gating registry. Live keys (from seed): `plant_layout`, `obstruction_exclusion`, `cable_routing`, `cable_measurements`, `energy_yield`, `generation_estimates`. **Different name set than `pv_layout_project/CLAUDE.md` §5 references** — verify against this table when binding to feature keys. |
| `Entitlement` | `entitlements` | `id, userId, productId, transactionId, totalCalculations, usedCalculations default 0, purchasedAt, deactivatedAt?`. | (no explicit indexes; FK indexes implicit) | Quota wallet. State derived: ACTIVE / EXHAUSTED (used >= total) / DEACTIVATED (deactivatedAt set). **transactionId is required** since the 2026-04-27 unification — every entitlement has exactly one parent transaction. |
| `CheckoutSession` | `checkout_sessions` | `id, userId, productSlug, stripeCheckoutSessionId (uniq), stripeCheckoutSessionUrl, status?, processedAt?, createdAt`. Relation: transaction (1:1, nullable). | unique stripeCheckoutSessionId | `processedAt` is the idempotency gate for Stripe webhook + verify-session safety net. Pre-fulfillment row; the Transaction row is created only after Stripe completes. |
| `UsageRecord` | `usage_records` | `id, userId, licenseKeyId, productId, featureKey, metadata JSON?, createdAt`. | (no explicit indexes) | Append-only log of every successful `/usage/report` call. Decrements happen on `Entitlement`, not here. |
| `Transaction` | `transactions` | `id, userId, productId, source ("STRIPE"\|"MANUAL"\|"FREE_AUTO"), status default "COMPLETED", amount Int (cents), currency default "usd", purchasedAt, createdAt, paymentMethod? ("CASH"\|"BANK_TRANSFER"\|"UPI"\|"CHEQUE"\|"OTHER"), externalReference?, notes?, createdByUserId? (admin who recorded MANUAL), checkoutSessionId? (uniq, set for STRIPE)`. Relations: user, product, createdByUser, checkoutSession, entitlements. | indexes: `(userId, purchasedAt desc)`, `(source)`, `(purchasedAt)`; unique `checkoutSessionId` | Unified ledger — replaced an older split where Stripe and manual revenue lived separately. `FREE_AUTO` source is the auto-grant on first signup (amount=0). |

### 2.2 Soft delete / audit

- **No soft-delete** anywhere. Everything is hard-deleted (and hard-deletes are not exposed in the API; FK constraints are RESTRICT on most relations, SET NULL on `transactions.createdByUserId` and `transactions.checkoutSessionId`).
- `Entitlement.deactivatedAt` is a kill switch, not a delete. Used by admin to disable a customer's quota without removing the row.
- `LicenseKey.revokedAt` is a kill switch, similarly.
- No `updatedAt` on any model. `createdAt` and `purchasedAt` are present on relevant tables. No history / audit table.
- No tenant / org — flat `User` table. No multi-tenancy hooks anywhere.

### 2.3 Migrations chronological

| Migration dir | Date | Effect |
|---|---|---|
| `20260421203935_init` | 2026-04-21 | Creates `download_registrations` only. First app domain table. |
| `20260421222523_add_contact_submissions` | 2026-04-21 | Creates `contact_submissions`. |
| `20260421234800_add_user_license_entitlement` | 2026-04-21 | Creates `users`, `license_keys` (with a now-removed `product` column), `entitlements` (with old `product` text column). Foundation of identity + quota. |
| `20260422000000_add_products_checkout_stripe` | 2026-04-22 | Adds `users.stripeCustomerId` + unique idx. Drops legacy `license_keys.product` (a license key isn't tied to a single product anymore — the entitlements are). Replaces `entitlements.product` text with FK `entitlements.productId`. Creates `products`, `product_features`, `checkout_sessions`. |
| `20260422071057_add_usage_records` | 2026-04-22 | Drops the temporary default on `entitlements.productId`; creates `usage_records` with FKs to user, license_key, product. |
| `20260422102437_add_is_free_to_product` | 2026-04-22 | Adds `products.isFree` boolean default false. The free tier is a real Product row (`pv-layout-free`) with `isFree=true`, not a separate flow. |
| `20260425090300_add_roles_status_to_user` | 2026-04-25 | Adds `users.roles String[]` and `users.status` default `"ACTIVE"`. Enables the `mvp_admin` RBAC. |
| `20260425182734_add_purchase_amount_entitlement_deactivation` | 2026-04-25 | Adds `checkout_sessions.amountTotal` + `currency` (later removed in unification), and `entitlements.deactivatedAt`. |
| `20260427120000_unify_transactions` | 2026-04-27 | **Destructive.** `TRUNCATE` on usage_records, entitlements, license_keys, checkout_sessions, users (RESTART IDENTITY CASCADE). Drops `checkout_sessions.amountTotal` + `currency` (moved to transactions). Creates `transactions` with three indexes + unique on `checkoutSessionId`. Adds `entitlements.transactionId NOT NULL` with FK. Comment in SQL: "test data only; permitted by spec". |

The truncate in the latest migration is the loudest signal that **this is a young, pre-revenue dataset**: the rewrite was done in-place on what is effectively staging data. Re-running migrations on production would not reproduce that step (Prisma marks completed migrations as applied), so this is informative for understanding velocity, not a forward risk.

---

## 3. API surface — every HTTP endpoint exposed by `apps/mvp_api`

All responses follow `{ success: true, data: T }` or `{ success: false, error: { code, message, details? } }` (`apps/mvp_api/src/lib/response.ts:14`). Error path goes through `errorHandler` in `apps/mvp_api/src/middleware/error-handler.ts:36`.

CORS allowed methods: GET, POST, PATCH, OPTIONS only — **no DELETE, no PUT** anywhere in the API.

### 3.1 Health + root

| Method | Path | Auth | Body | Response | Side effects | Handler |
|---|---|---|---|---|---|---|
| GET | `/` | public | — | HTML splash with DB ping result | reads `SELECT 1` | `app.ts:59` |
| GET | `/health/live` | public | — | `{success, data: {status, service, timestamp}}` | none | `app.ts:77` |
| GET | `/health/ready` | public | — | `{success, data: {status, checks}}`; 503 if DB ping fails | reads `SELECT 1` | `app.ts:88` |

### 3.2 Marketing (public — no auth header)

| Method | Path | Body (Zod) | Response | Side effects | Handler / service |
|---|---|---|---|---|---|
| POST | `/download-register` | `{name, email (email), mobile?, product: enum["PV Layout"\|"PV Layout Basic"\|"PV Layout Pro"\|"PV Layout Pro Plus"]}` | `{downloadUrl}` (1-hour presigned S3 URL) | inserts `download_registrations` row; reads x-forwarded-for | `downloads/downloads.routes.ts:13` → `downloads.service.ts:30` |
| POST | `/contact` | `{name, email, subject, message}` | `{message: "Thank you …"}` | inserts `contact_submissions` row; reads x-forwarded-for | `contact/contact.routes.ts:10` → `contact.service.ts:17` |
| GET | `/products` | — | `{products: [{slug, name, description, priceAmount, priceCurrency, calculations, features:[{featureKey,label}]}]}` (active && !isFree) | none | `products/products.routes.ts:8` |

### 3.3 End-user dashboard (Clerk JWT bearer)

All require `Authorization: Bearer <clerk_jwt>`. Verified via `clerkAuth` middleware at `apps/mvp_api/src/middleware/clerk-auth.ts:8`. Middleware also JIT-creates the User row + auto-grants the Free tier (transaction + entitlement + license key) on first request.

| Method | Path | Body | Response | Side effects | Handler |
|---|---|---|---|---|---|
| GET | `/dashboard/download` | — | `{url}` 1-min presigned S3 URL for `pv_layout.zip` | none | `dashboard/dashboard.routes.ts:16` |
| POST | `/billing/checkout` | `{product: slug}` | `{url}` Stripe Checkout URL | creates Stripe customer if missing; creates Stripe Checkout session; inserts `checkout_sessions` row | `billing/billing.routes.ts:48` |
| POST | `/billing/verify-session` | `{sessionId}` | `{verified, updated?}` | safety-net path: re-fetches Stripe session; if complete and not yet processed, calls `provisionEntitlement` | `billing.routes.ts:98` |
| GET | `/billing/entitlements` | — | `{entitlements:[{id,product,productName,total/used/remainingCalculations,purchasedAt,deactivatedAt,state}], licenseKey}` (excludes deactivated; keeps exhausted as history) | none | `billing.routes.ts:134` |
| GET | `/billing/usage?page=&pageSize=` | — | `{data:[{featureKey,productName,createdAt}], pagination}` | none; pageSize clamped 1–100 | `billing.routes.ts:187` |

### 3.4 Desktop client (license-key bearer)

All require `Authorization: Bearer sl_live_*`. Verified via `licenseKeyAuth` at `apps/mvp_api/src/middleware/license-key-auth.ts:5`. Rejects revoked keys.

| Method | Path | Body | Response | Side effects | Handler |
|---|---|---|---|---|---|
| GET | `/entitlements` | — | `{user:{name,email}, plans:[{planName, features:[label], total/used/remainingCalculations}], licensed: bool, availableFeatures: featureKey[], total/used/remainingCalculations}` | none; collapses across all active+non-exhausted entitlements | `entitlements/entitlements.routes.ts:13` → `entitlements.service.ts:23` |
| GET | `/usage/history` | — | `{records:[{featureKey,productName,createdAt}]}` (last 100) | none | `entitlements.routes.ts:19` |
| POST | `/usage/report` | `{feature: featureKey}` | `{recorded, remainingCalculations}` | atomically decrements cheapest pool with that feature in a `db.$transaction`; inserts `usage_records` row. 402 if no pool, 409 if concurrent race lost. | `usage/usage.routes.ts:17` → `usage.service.ts:4` |

### 3.5 Admin — Clerk JWT + `requireRole("ADMIN", "OPS")` (or ADMIN-only where noted)

All `/admin/*` routes require Clerk JWT and a role check. The route files chain `clerkAuth` then `requireRole(...)`. Several modules each register their own `app.use("/admin/*", ...)` middleware with overlapping role sets — Hono runs them all in registration order (see §3.6).

#### Admin users (staff management) — ADMIN role except `/admin/users/search` (ADMIN+OPS)

| Method | Path | Body | Response | Side effects | Handler |
|---|---|---|---|---|---|
| GET | `/admin/users/search?email=` | — | `{users:[{id,email,name}]}` | reads users WHERE email ILIKE | `admin/admin.routes.ts:36` |
| GET | `/admin/users?page=&pageSize=` | — | `{data:[UserListItem], pagination}` | reads users + count | `admin.routes.ts:50` |
| GET | `/admin/users/:id` | — | `UserListItem` | reads users by id | `admin.routes.ts:63` |
| POST | `/admin/users` | `{name, email (email), roles:["ADMIN"\|"OPS"][]}` | `UserListItem` (201) | creates Clerk user via `@clerk/backend`; upserts DB row; **best-effort cleanup** of Clerk user on DB failure | `admin.routes.ts:69` → `admin.service.ts:84` |
| PATCH | `/admin/users/:id/roles` | `{role: "ADMIN"\|"OPS", action: "add"\|"remove"}` | `{userId, role, action}` | updates Clerk publicMetadata.roles AND DB users.roles | `admin.routes.ts:76` |
| PATCH | `/admin/users/:id/status` | `{status: "ACTIVE"\|"INACTIVE"}` | `{userId, status}` | DB only; Clerk user is not signed out (out of band) | `admin.routes.ts:84` |

#### Admin customers (end-user records) — ADMIN+OPS

| Method | Path | Body | Response | Side effects | Handler |
|---|---|---|---|---|---|
| GET | `/admin/customers?page=&pageSize=` | — | `{data:[CustomerListItem (totalSpendUsd, activeEntitlementCount, totalCalculations)], pagination}` | aggregates across users + transactions + entitlements + usage_records (5 parallel queries) | `customer.routes.ts:28` → `customer.service.ts:59` |
| GET | `/admin/customers/:id?filter=active\|all` | — | `CustomerDetail` with entitlements list (filter "active" excludes EXHAUSTED + DEACTIVATED post-DB) | reads user + transaction sum | `customer.routes.ts:45` |
| GET | `/admin/customers/:id/transactions?limit=` | — | `{transactions: [...]}` (most recent N for that user) | none | `customer.routes.ts:38` |
| PATCH | `/admin/entitlements/:id/status` | `{status: "ACTIVE"\|"INACTIVE"}` | `{id, deactivatedAt}` | flips `entitlements.deactivatedAt` (kill switch) | `customer.routes.ts:53` |
| PATCH | `/admin/entitlements/:id/used` | `{usedCalculations: int >= 0}` | `{id, usedCalculations, totalCalculations}` | overrides `usedCalculations`; rejects values > total or < 0 | `customer.routes.ts:66` |

#### Admin products / sales — ADMIN+OPS, with two ADMIN-only

| Method | Path | Body | Response | Side effects | Handler |
|---|---|---|---|---|---|
| GET | `/admin/products?page=&pageSize=` | — | `{data:[ProductListItem (totalRevenueUsd, revenueStripe, revenueManual, purchaseCount, purchasesStripe/Manual, activeEntitlementCount)], pagination}` | aggregates products + transactions + entitlements | `product.routes.ts:21` → `product.service.ts:51` |
| GET | `/admin/products/summary` | — | `{totalRevenueUsd, revenueStripe, revenueManual, totalPurchases, purchasesStripe/Manual, activeEntitlements}` | three aggregate queries | `product.routes.ts:33` |
| GET | `/admin/products/stripe-prices` | **ADMIN-only** (route-level requireRole("ADMIN")) | — | `[{slug, name, stripePriceId, isFree}]` | `product.routes.ts:39` |
| GET | `/admin/products/:slug/sales?granularity=daily\|weekly\|monthly` | — | `{granularity, data:[{period, revenueUsd, revenueStripe, revenueManual, purchaseCount, purchasesStripe/Manual}]}` | bucketing via `sales-utils.ts` (last 30d / 12w / 12mo) | `product.routes.ts:50` |
| GET | `/admin/products/:slug` | — | `ProductListItem` | reads product + its transactions | `product.routes.ts:59` |
| PATCH | `/admin/products/:slug/stripe-price` | **ADMIN-only**. `{stripePriceId}` | `{slug, stripePriceId}` | for non-free: validates the price exists & is active in Stripe before writing; updates `products.stripePriceId` | `product.routes.ts:71` → `product.service.ts:272` |

#### Admin dashboard — ADMIN+OPS

| Method | Path | Response | Handler |
|---|---|---|---|
| GET | `/admin/dashboard/summary` | `{totalRevenue, totalRevenueStripe/Manual, totalPurchases, totalPurchasesStripe/Manual, totalCustomers, totalCalculations}` | `admin/dashboard.routes.ts:12` → `dashboard.service.ts:32` |
| GET | `/admin/dashboard/trends?granularity=daily\|weekly\|monthly` | `[{period, revenue, revenueStripe/Manual, purchases, purchasesStripe/Manual, customers, calculations}]` | `dashboard.routes.ts:17` |

#### Admin transactions — ADMIN+OPS

| Method | Path | Body | Response | Side effects | Handler |
|---|---|---|---|---|---|
| POST | `/admin/transactions` | `{userId, productSlug, paymentMethod: PAYMENT_METHODS, externalReference?, notes?, purchasedAt? (ISO)}` | `{transactionId, entitlementId}` | wraps `createEntitlementAndTransaction` with `source="MANUAL"`; rejects `isFree` products with `FREE_PRODUCT_NOT_PURCHASABLE`; rejects inactive products | `transactions/transactions.routes.ts:27` → `transactions.service.ts:21` |
| GET | `/admin/transactions?source=&email=&productSlug=&from=&to=&page=&pageSize=` | — | `{transactions: TransactionListItem[], pagination}` | reads transactions joined to user/product/createdByUser | `transactions.routes.ts:49` |
| GET | `/admin/transactions/:id` | — | `TransactionListItem` | reads transactions joined to user/product/createdByUser | `transactions.routes.ts:60` |

### 3.6 Webhooks

| Method | Path | Auth | Body | Response | Side effects | Handler |
|---|---|---|---|---|---|---|
| POST | `/webhooks/stripe` | Stripe HMAC via `stripe-signature` header | raw body (Stripe event) | `{received: true}` 200 / 400 on bad sig / 500 on provisioning failure | for `checkout.session.completed`: idempotently provisions entitlement + transaction + (if missing) license key; updates `checkout_sessions.processedAt`. **All other event types are silently 200'd.** | `webhooks/stripe.webhook.routes.ts:9` → `billing/provision.ts:11` |

**Endpoint count**

- Public: 6 (`/`, `/health/live`, `/health/ready`, `POST /download-register`, `POST /contact`, `GET /products`)
- Webhooks: 1 (`POST /webhooks/stripe`)
- Clerk-JWT (end user): 5 (`GET /dashboard/download`, `POST /billing/checkout`, `POST /billing/verify-session`, `GET /billing/entitlements`, `GET /billing/usage`)
- Clerk-JWT + ADMIN/OPS: 16 (`/admin/users/search`, `/admin/customers*` × 5, `/admin/products*` × 5 OPS-readable, `/admin/dashboard/*` × 2, `/admin/transactions*` × 3)
- Clerk-JWT + ADMIN only: 5 (`GET /admin/users`, `GET /admin/users/:id`, `POST /admin/users`, `PATCH /admin/users/:id/roles`, `PATCH /admin/users/:id/status`) plus 2 in product (`GET /admin/products/stripe-prices`, `PATCH /admin/products/:slug/stripe-price`) = 7
- License-key bearer (desktop): 3 (`GET /entitlements`, `GET /usage/history`, `POST /usage/report`)

**Total: 38 distinct endpoints.** (Counting `GET /` as a single endpoint; not counting `OPTIONS` preflights.)

### 3.7 Subtlety: overlapping `/admin/*` middleware

`adminRoutes` (admin.routes.ts:48), `customerRoutes` (customer.routes.ts:26), `productRoutes` (product.routes.ts:19), `dashboardAdminRoutes` (dashboard.routes.ts:10), `transactionsRoutes` (transactions.routes.ts:16) **each** call `app.use("/admin/*", clerkAuth, requireRole(...))` with different role tuples. Hono mounts them all on the root app at `app.ts:53-57`, so for a request like `GET /admin/users`, **all five `/admin/*` middlewares run in registration order** before reaching the handler. The strictest middleware decides — `adminRoutes`' `requireRole("ADMIN")` rejects an OPS request for a user-management URL even though the customer/product routers would have allowed it.

This works correctly today because the routes within each Hono sub-app fail through to the next sub-app, but it means:
- Auth runs ~5 times per `/admin/*` request (extra DB hits for user lookup).
- Adding a new `/admin/*` route group must also call `app.use("/admin/*", …)` to be safe.
- If V2 adds a route group with a different role gate, ordering against `adminRoutes` (ADMIN-only) matters.

This is a known minor concern, not a bug. Flag for V2 design (consider a single root-level admin auth chain).

---

## 4. Authentication architecture

### 4.1 Two auth modes

| Mode | Used by | Verifier | Bearer prefix |
|---|---|---|---|
| Clerk JWT | `mvp_web` (`/dashboard/*`, `/billing/*`), `mvp_admin` (`/admin/*`) | `verifyToken()` from `@clerk/backend` | regular Clerk session token (no prefix), passed by Clerk's `useAuth().getToken()` |
| License key | desktop legacy app (and the future Tauri app) | DB lookup on `license_keys.key WHERE revokedAt IS NULL` | `sl_live_*` |

### 4.2 Clerk flow

`apps/mvp_api/src/middleware/clerk-auth.ts:8`:

1. Read `Authorization: Bearer <token>`. If missing → 401 UNAUTHORIZED.
2. `verifyToken(token, { secretKey: env.CLERK_SECRET_KEY })`. If this throws → 401.
3. Take `clerkId = payload.sub`. Find `User` by clerkId.
4. **JIT provisioning** if user doesn't exist:
   - Pull profile from Clerk via `createClerkClient().users.getUser(clerkId)`.
   - Resolve email from `primaryEmailAddressId` or fall back to `emailAddresses[0]`.
   - Read `publicMetadata.roles` (string array) — used to seed staff users.
   - Insert `User` row. On P2002 (unique violation race) — fetch existing winner, skip provisioning. Lines 67-88.
5. **Free tier auto-grant** (only the JIT-create winner):
   - Find `Product` where `isFree=true` (`pv-layout-free`, 5 calcs).
   - Generate `sl_live_*` license key.
   - In a single `db.$transaction`: insert `Transaction` (source=`FREE_AUTO`, amount=0), insert `Entitlement`, insert `LicenseKey`. Lines 92-138.
   - Wrapped in try/catch — provisioning failure does **not** fail auth; logs warning.
6. Reject `user.status !== "ACTIVE"` with 401 UNAUTHORIZED. Line 143.
7. Set `c.var.user = {id, clerkId, email, name, stripeCustomerId, roles, status}`. Lines 147-155.

Frontend: `mvp_web` and `mvp_admin` both use `@clerk/nextjs` `useAuth()` to call `getToken()` and pass `Authorization: Bearer <token>`. Examples: `mvp_web/components/hooks/use-billing.ts:51`, `mvp_admin/lib/hooks/*` follow the same pattern.

### 4.3 License-key flow

`apps/mvp_api/src/middleware/license-key-auth.ts:5`:

1. Read `Authorization: Bearer <token>`.
2. Reject if not starting with `sl_live_` → 401.
3. Look up `LicenseKey` where `key = token AND revokedAt IS NULL`, including `user`.
4. If not found → 401 "Invalid or revoked license key".
5. Set `c.var.user` and `c.var.licenseKey`.

**Minting paths:**
- Free tier auto-grant during Clerk JIT provisioning (`clerk-auth.ts:98`).
- First successful Stripe purchase via `createEntitlementAndTransaction` (`apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts:59` — only mints if user has no existing key).
- The same path runs for manual transactions.

**Rotation / revocation:**
- No rotation API exposed. There is `revokedAt` on the column but nothing in the API or admin app sets it. To revoke today, an operator runs SQL by hand. **Flag for V2.**
- One license key per user (the `existingKey` check in `create-entitlement-and-transaction.ts`). Cannot have two keys per user — a multi-device story would need V2 work.

### 4.4 Frontend auth boundaries

- `mvp_web/proxy.ts` (Clerk middleware): `/dashboard/*` requires sign-in (redirects to `/sign-in?redirect_url=...`); authed visits to `/sign-in` or `/sign-up` redirect to `/dashboard`.
- `mvp_admin/proxy.ts`: every page except `/sign-in(.*)` requires sign-in. RBAC happens server-side in `app/(admin)/layout.tsx:17-36` reading `sessionClaims.metadata.roles`.

---

## 5. Stripe + billing flow

### 5.1 Touch points

- `apps/mvp_api/src/lib/stripe.ts` — Stripe client factory (uses `STRIPE_SECRET_KEY`).
- `apps/mvp_api/src/modules/billing/billing.routes.ts:48` — checkout creation.
- `apps/mvp_api/src/modules/billing/billing.routes.ts:98` — verify-session safety net.
- `apps/mvp_api/src/modules/billing/provision.ts` — idempotent entitlement grant.
- `apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts` — shared atomic write.
- `apps/mvp_api/src/modules/webhooks/stripe.webhook.routes.ts` — webhook listener.
- `apps/mvp_api/src/modules/admin/product.service.ts:272` — `updateStripePriceId` validates the price still exists in Stripe before saving.

### 5.2 Successful purchase flow (Stripe path)

1. **Browser → API:** `POST /billing/checkout` with `{product: slug}` and Clerk Bearer.
2. **API → Stripe:** `ensureStripeCustomer` creates `stripe.customers` if missing; persists `stripeCustomerId` on `User`.
3. **API → Stripe:** `stripe.checkout.sessions.create` with `mode: "payment"`, `customer`, `line_items: [{price: product.stripePriceId, quantity: 1}]`, `metadata: {userId, product: slug}`, `billing_address_collection: "required"`, `phone_number_collection: enabled`, `success_url` and `cancel_url` rooted at the first CORS origin (e.g. `https://renewable-energy-web.vercel.app/dashboard/plans?session_id=...`).
4. **API → DB:** insert `checkout_sessions` (`processedAt: null`).
5. **API → Browser:** return `{url}`. Browser does `window.location.href = url`.
6. **Browser → Stripe Checkout:** user pays.
7. **Stripe → API webhook:** `POST /webhooks/stripe` with `checkout.session.completed`. Signature verified via `STRIPE_WEBHOOK_SECRET`. `provisionEntitlement(session.id, {amountTotal, currency})` is invoked. (`stripe.webhook.routes.ts:31`).
8. **`provisionEntitlement`:** finds `checkout_sessions` row by stripe session id; if `processedAt` already set → no-op (idempotent); finds `Product` by `productSlug`; inside `db.$transaction` calls `createEntitlementAndTransaction` (writes `Transaction` source=STRIPE + `Entitlement` + LicenseKey if missing) and sets `processedAt = now()`.
9. **Browser back at success_url:** `mvp_web/app/(main)/dashboard/plans/page.tsx:101` extracts `session_id` from query, calls `POST /billing/verify-session` (the safety net) with Clerk Bearer.
10. **`POST /billing/verify-session`:** if `processedAt` already set → returns `{verified: true, updated: false}`. Otherwise re-fetches the Stripe session; if `complete`, runs `provisionEntitlement` itself (without amountTotal/currency override — falls back to `product.priceAmount`). This is the recovery path for missed/delayed webhooks.

### 5.3 Manual transaction flow

`POST /admin/transactions` (admin app):
1. Validates user + product (active, not isFree) exist.
2. Calls `createEntitlementAndTransaction` with `source: "MANUAL"`, `paymentMethod`, `externalReference`, `notes`, `createdByUserId` (the admin), `checkoutSessionId: null`, `amount: product.priceAmount` (snapshot at purchase time — not adjustable per transaction).
3. Returns `{transactionId, entitlementId}`.

### 5.4 Free tier auto-grant

Triggered the first time a Clerk-authenticated request arrives for a user who isn't yet in `users`. `clerkAuth` middleware writes Transaction (source=`FREE_AUTO`, amount=0, notes="Auto-granted free tier on signup"), Entitlement, and LicenseKey in one transaction. See §4.2.

### 5.5 Edge cases — handled vs not

| Case | Status | Notes |
|---|---|---|
| Webhook before browser returns to success_url | handled | webhook is the primary path |
| Browser returns to success_url before webhook (delay) | handled | `verify-session` is the safety net (`billing.routes.ts:128`) |
| Duplicate webhook delivery | handled | `processedAt` idempotency gate in `checkout_sessions` |
| Duplicate `verify-session` call | handled | same gate |
| Stripe webhook for non-`checkout.session.completed` events | **silently 200'd** | `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `customer.subscription.*`, etc. — none handled |
| Refund | **NOT handled** | no Stripe webhook handler reverses an Entitlement; admin would have to PATCH `/admin/entitlements/:id/status` to deactivate manually |
| Dispute (`charge.dispute.created`) | **NOT handled** | same |
| Failed payment after sessions created | not relevant | session never reaches `complete`; `verify-session` correctly returns `{verified: false}` and updates session.status |
| Provisioning DB failure inside webhook | **caught and 500'd** | Stripe will retry per its retry policy; `processedAt` never set so retry will re-attempt. Idempotency guarantees no double-provision. |
| Product price changed between checkout creation and webhook | "wrong" amount stored | Webhook uses `session.amount_total` (Stripe's snapshot). `provisionEntitlement` falls back to `product.priceAmount` if undefined. Calculations are derived from `product.calculations` (current value at provisioning time, not session time). |
| User exhausts entitlement during a long-running calculation | partial handle | `usage.service.ts` does atomic decrement with row predicate (`usedCalculations < totalCalculations AND deactivatedAt IS NULL`); rejects with 409 CONFLICT on race. **No transactional rollback** if the desktop calculation later fails — calc is "consumed" the moment it's reported. |
| User INACTIVE | end-user dashboard can't load | clerk-auth rejects on status. Desktop license key continues to work because `licenseKeyAuth` doesn't read `user.status`. **Flag: license key keeps working after user deactivation.** |

**Key V2-relevant gaps:** no refund/dispute reversal, no usage rollback, license-key auth ignores user status. None of these are existential for the current low-volume product, but each is V2 fodder.

---

## 6. `apps/mvp_admin` admin surface

### 6.1 Pages

| Route | Component | Calls |
|---|---|---|
| `/dashboard` | `app/(admin)/dashboard/page.tsx` + `_components/dashboard-client.tsx` (with 4 chart subcomponents: revenue, purchase, customer, calculation) | `GET /admin/dashboard/summary`, `GET /admin/dashboard/trends?granularity=` |
| `/customers` | `customers/page.tsx` + `customers-page-client.tsx` | `GET /admin/customers?page&pageSize` |
| `/customers/[id]` | `customers/[id]/page.tsx` + `customer-detail-client.tsx` | `GET /admin/customers/:id?filter=`, `GET /admin/customers/:id/transactions?limit=`, `PATCH /admin/entitlements/:id/status`, `PATCH /admin/entitlements/:id/used` |
| `/plans` | `plans/page.tsx` + `products-page-client.tsx` | `GET /admin/products`, `GET /admin/products/summary` |
| `/plans/[slug]` | `plans/[slug]/page.tsx` + `product-detail-client.tsx` + `sales-chart.tsx` | `GET /admin/products/:slug`, `GET /admin/products/:slug/sales?granularity=` |
| `/transactions` | `transactions/page.tsx` + `transactions-page-client.tsx` | `GET /admin/transactions?...filters` |
| `/transactions/new` | `transactions/new/page.tsx` + `new-transaction-form.tsx` | `GET /admin/users/search?email=`, `POST /admin/transactions` |
| `/transactions/[id]` | `transactions/[id]/page.tsx` + `transaction-detail-client.tsx` | `GET /admin/transactions/:id` |
| `/users` (ADMIN only) | `users/page.tsx` + `users-page-client.tsx` | `GET /admin/users?page&pageSize` |
| `/users/new` (ADMIN only) | `users/new/page.tsx` + `new-user-form.tsx` | `POST /admin/users` |
| `/users/[id]` (ADMIN only) | `users/[id]/page.tsx` + `edit-user-client.tsx` | `GET /admin/users/:id`, `PATCH /admin/users/:id/roles`, `PATCH /admin/users/:id/status` |
| `/system` (ADMIN only) | `system/page.tsx` + `stripe-prices-client.tsx` | `GET /admin/products/stripe-prices`, `PATCH /admin/products/:slug/stripe-price` |

### 6.2 Mechanics

- Sidebar (`components/admin-sidebar.tsx`) reads `role` (ADMIN or OPS) from `app/(admin)/layout.tsx`. OPS sees: Dashboard, Customers, Transactions, Plans. ADMIN additionally sees: Users, System.
- All API calls are plain `fetch` against `NEXT_PUBLIC_MVP_API_URL` (default `http://localhost:3003`) with `Authorization: Bearer <clerk JWT>`. DTOs live in `lib/api.ts` (locally redeclared).
- TanStack Query orchestrates each page's fetches. No SSR data fetching for admin pages — all client-side.
- Admin **cannot** revoke a license key, refund a transaction, or change a Transaction's amount/status. The only mutating endpoints exposed are: create staff user, change user roles, change user status, deactivate/reactivate entitlement, override entitlement.usedCalculations, create manual transaction, update product Stripe price ID. **No DELETE endpoints exist anywhere.**

---

## 7. `apps/mvp_web` user surface

### 7.1 Marketing pages (public, group `(marketing)`)

`/`, `/about`, `/contact`, `/faq`, `/how-it-works`, `/pricing`, `/privacy`, `/products`, `/terms` — static content + `<ContactForm/>` + `<DownloadModal/>`.
- `<ContactForm>` posts to `POST /contact`.
- `<DownloadModal>` posts to `POST /download-register` then redirects to the returned presigned URL.

### 7.2 Authed dashboard (group `(main)`, Clerk-protected)

| Route | Calls |
|---|---|
| `/dashboard` | `useEntitlements` (`GET /billing/entitlements`), `useUserUsage(1, 5)` (`GET /billing/usage?page=1&pageSize=5`), `GET /dashboard/download` (on click) |
| `/dashboard/plans` | `GET /products`, `useEntitlements`, `POST /billing/checkout`, `POST /billing/verify-session` |
| `/dashboard/usage` | `useUserUsage(page, pageSize)` (paginated table) |

The dashboard page is the only place the desktop license key is exposed to the user (with show/copy actions). It's the "license card" — the sole UI for getting the key onto a customer's machine.

---

## 8. `packages/api-client`, `packages/shared`, `packages/ui`

### 8.1 `packages/ui` — **active**

- Pure shadcn/ui primitive package, exports ~50 component files under `src/components/` (accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, button-group, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, direction, drawer, dropdown-menu, empty, field, hover-card, input, input-group, input-otp, item, kbd, label, menubar, native-select, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip).
- `src/lib/utils.ts` — the standard shadcn `cn()` helper.
- `src/hooks/use-mobile.ts` — viewport hook.
- `src/styles/globals.css` — base Tailwind v4 styles + tokens.
- Consumers: both `mvp_web` and `mvp_admin` (`@renewable-energy/ui` workspace dep). `mvp_api` does not depend on it. Standard usage: `import { Card } from "@renewable-energy/ui/components/card"`.

### 8.2 `packages/api-client` — **defunct for mvp_***

- `src/client.ts` — `createApiClient(baseUrl, getToken)` returns `{request, upload}` with `Authorization: Bearer` injection and a typed `ApiResponse` parser.
- `src/identity.ts` — `createWebClient` exposes `getMe(): /auth/me`.
- `src/projects.ts` — `createProjectsClient` exposes `listProjects`, `getProject`, `createProject`, `deleteProject`, `listVersions`, `createVersion`, `getVersion`. None of these endpoints exist in mvp_api.
- Consumers: only `apps/web` (defunct) and `apps/api` (defunct). `mvp_web` and `mvp_admin` do **not** depend on it. **Code-fossil.** Useful as design inspiration for V2 (the `request/upload` pattern is solid) but the URL shapes are wrong and the auth pattern needs to support license-key bearer too.

### 8.3 `packages/shared` — **defunct for mvp_***

- `src/types/api.ts` — `ApiResponse<T>` and `PaginatedResponse<T>`. The `ApiResponse` shape is identical to the one redeclared in `mvp_api/src/lib/response.ts:1` — the live API doesn't import it.
- `src/types/user.ts` — `User` shape with `clerkId, email, name, avatarUrl, status: "ACTIVE"|"INACTIVE", createdAt, updatedAt`. **Note `updatedAt`** which doesn't exist in the live `User` model.
- `src/types/project.ts` — `Project`, `VersionDetail`, `LayoutJobSummary`, `EnergyJobSummary`, `LayoutInputSnapshot` (29 layout/energy fields), `CreateProjectInput`. **None of these models or fields exist in mvp_db's live schema.** Forward-looking from the old `apps/api` design — the project/version/job pipeline that the layout-engine app was supposed to expose.
- Consumers: `apps/web` and `apps/api` (both defunct), and used by `packages/api-client` itself. Not imported anywhere in the live `mvp_*` tree.

**Implication for V2:** these packages have prior-art for project/version domain modelling. If V2 introduces "projects" / "versions" (saved layouts on the server), `packages/shared` already has a coherent type set worth reading. But the mvp_db schema currently has zero tables for that domain — V2 would build it.

---

## V2 reuse / extension table

| Subsystem | V2 verdict | Reasoning |
|---|---|---|
| `prisma` schema (User, LicenseKey, Product, ProductFeature, Entitlement, CheckoutSession, UsageRecord, Transaction) | **reuse wholesale** | Solid for the current model. Add tables; don't change these. |
| `clerk-auth` middleware (JIT user create + Free auto-grant) | **reuse with extension hooks** | Logic is correct. V2 may want to surface "first-login" and emit telemetry — currently fire-and-forget. |
| `license-key-auth` middleware | **reuse with one tweak** | Works. V2 should add `user.status === "ACTIVE"` check to match Clerk path; today an INACTIVE user's license key still works. |
| `usage.service.ts` (atomic decrement, cheapest-first selection by feature) | **reuse wholesale for `/v2/usage/report`** | Algorithm is correct and tested. Wire it from a `/v2/...` route directly. The 402/409 contract is sound. |
| `entitlements.service.ts` (`computeEntitlementSummary`) | **reuse wholesale for `/v2/entitlements`** | Output shape works for the desktop client; just rename `licensed` if V2 wants more granular states. |
| `provisionEntitlement` + `createEntitlementAndTransaction` | **reuse wholesale** | Idempotent + atomic + correctly shared between Stripe and admin paths. |
| Stripe checkout + verify-session + webhook | **reuse, then extend** | Add handlers for `charge.refunded`, `charge.dispute.created`, and decide refund/dispute → `Entitlement.deactivatedAt` policy. |
| `packages/api-client` | **fork or rebuild** | Wrong URL shapes. The auth pattern (token getter) is good. Need both Clerk-token getter and license-key-getter variants. |
| `packages/shared` types | **don't import, but read** | Wrong field names. Useful design influence for if/when V2 adds projects/versions. |
| `mvp_admin/lib/api.ts` DTO types | **fold into `packages/shared`** | Today they're duplicated in mvp_admin. V2 should give the API a real OpenAPI or shared TS contract package. |
| Vercel Serverless deploy shim (`apps/mvp_api/api/index.js`) | **reuse** | Quirks documented (NODEJS_HELPERS=0). |
| `semanticIdExtension` + `strictIdExtension` | **reuse wholesale** | 40-char prefixed IDs across all tables — nice property. |

---

## Top 3 codebase-level risks for V2

1. **No shared API contract between server and clients.** `mvp_api` is the only place that knows the wire shape; `mvp_web/components/hooks/use-billing.ts`, `mvp_admin/lib/api.ts`, and the future Tauri client each redeclare DTOs by hand. A schema change to a single field requires four manually-coordinated edits. V2 must produce a shared types package (or generated OpenAPI client) before adding any new endpoint.

2. **License-key bearer auth has no rotation, no per-device key, no status check.** The middleware does `user.status` not. The mint path is "one key per user, ever". The only revoke path is hand-written SQL on `revokedAt`. As soon as V2 ships to a paying customer base, "I want to invalidate the key on my laptop without breaking the office desktop" becomes a real ask, and the schema (LicenseKey 1:N User) supports it but no API does.

3. **Refund / dispute / failed-after-success edge cases are silently ignored.** The webhook listens to `checkout.session.completed` and nothing else. A Stripe refund or chargeback today produces no DB change; an Entitlement keeps consuming calculations until manually deactivated. For a low-volume product this is fine. For a V2 with real revenue volume, it's an abuse vector and an accounting nightmare. Build the handlers (or document the manual-ops policy explicitly) before opening the funnel wider.
