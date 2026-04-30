# Spike Design — Manual Purchases & Unified Transaction Ledger

- **Date:** 2026-04-28
- **Status:** Draft, awaiting human review
- **Authors:** Arun Patra (with Claude as design partner)
- **Companion runbook:** [`docs/mvp/TRANSACTIONS_SPIKE_POST_MIGRATION.md`](../../mvp/TRANSACTIONS_SPIKE_POST_MIGRATION.md)

## Context

The MVP today supports purchases via Stripe only. The intended Indian B2B audience often does not transact via credit cards; payment commonly happens via UPI, bank transfer, or cash, settled outside any payment processor. We need a way to record those payments in the system so that the customer experience (license keys, dashboards, calculation entitlements) is identical regardless of how the money moved.

Stripe support continues unchanged. The system should remain agnostic at the consumption layer — no code path that reads entitlements, license keys, or usage should care whether the underlying payment was a Stripe charge or a manually recorded receipt.

The audit of the current system also surfaced a structural gap: there is no canonical "money received" ledger. Revenue is read from `CheckoutSession.amountTotal`, which is Stripe-shaped and does not generalize. Adding manual purchases by extending `CheckoutSession` would entrench that mistake. Introducing a unified `Transaction` ledger as the system of record is the right shape and pays off the gap simultaneously.

## Goals

1. Admins can record a manual purchase against an existing customer (search by email) for any non-free product, capturing payment method and reference.
2. Manually-recorded purchases produce a regular `Entitlement` indistinguishable from a Stripe-sourced one for the customer and the desktop app.
3. A new sidebar entry `Transactions` in mvp_admin lists all financial transactions (Stripe + manual) with filters and pagination.
4. The admin dashboard, customer detail, and per-plan reporting all read from the unified ledger and surface a Stripe-vs-Manual split where useful.
5. Existing kill-switch (deactivating an entitlement from `/customers/:id`) keeps working unchanged for both sources, and the previously-undetected enforcement gap at `POST /usage/report` is closed.

## Non-goals

- Reversal / void of transactions. The existing entitlement-deactivation kill switch is the operational lever; explicit transaction void is deferred.
- Stripe refund / dispute handling. Pre-existing webhook gap; out of scope for this spike.
- Multi-currency support. All ledger amounts are USD cents, mirroring the product's listed price. Actual cash collected in INR is acknowledged but not modeled (admin records the listed USD-equivalent of the product purchased).
- Customer pre-provisioning / invitation. Admin can only record manual purchases against customers who have already signed up.
- Email receipts or notifications for manual purchases. The customer's web dashboard refreshes are the surface.
- Backwards-compatible data migration. Production today contains only internal test data from the founders. The migration wipes transactional data.

## Decisions captured during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Q1 — Data model | New unified `Transaction` table; `CheckoutSession` shrinks to Stripe metadata; `Entitlement.transactionId` is the FK | One ledger, one revenue source; pays off the structural gap |
| Q2 — Currency for manual | USD only, mirrored from product price | Avoids FX work; MVP scale; we trust admin collected the right external amount |
| Q3 — Manual payment metadata | Structured: `paymentMethod` enum + `externalReference` + `notes` | Cheap insurance for future reconciliation/audit |
| Q4 — Reversal in scope | None; rely on existing entitlement kill switch | YAGNI; existing flow is sufficient operationally |
| Q5 — Customer pre-existence | Customer must already exist in DB | Signup is fast and frictionless; we want them as a User regardless |
| Q6 — Audit trail | `Transaction.createdByUserId` FK to admin User | One column; near-zero cost |
| Q7 — Free auto-grant representation | New `source = "FREE_AUTO"` value | Self-documenting reporting filters; can't be confused with $0 manual comp |
| Q8 — Reporting date field | `purchasedAt` (business reality) | Backdating shifts the bucket; correct behavior; audit via `createdAt` |
| Q9 — "Total Customers" metric | `COUNT(*) FROM users` (unchanged semantics) | Decoupled from ledger; trivially extensible later |
| Q10 — Dashboard source split | Subtitle on Revenue and Purchases cards: *"Stripe $X · Manual $Y"* | Smallest signal that answers "is manual being used?" |
| Q11 — Per-plan source split | Same subtitle treatment on `/plans/[slug]` | Consistency with Q10 |
| Q12 — Customer detail Transactions section | Top-10 list above existing Plans/Entitlements table | Plans = operational kill switch; Transactions = ledger history |
| Bonus | Fix `usage.service.ts` to enforce `deactivatedAt: null` at API source | Required to make Q4's "kill switch is enough" reasoning hold |

## Section 1 — Data model

### New table: `Transaction`

Canonical purchase ledger. Every Entitlement is created from exactly one Transaction.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | Semantic ID, prefix `txn` |
| `userId` | text FK → `users.id` | The customer |
| `productId` | text FK → `products.id` | Product purchased |
| `source` | text | `STRIPE` \| `MANUAL` \| `FREE_AUTO` |
| `status` | text | `COMPLETED` (single value today; reserved) |
| `amount` | int | USD cents, snapshotted from `product.priceAmount` at create time |
| `currency` | text | Default `usd` |
| `purchasedAt` | timestamp | When money was collected (Stripe completion time, or admin-entered for MANUAL, or signup time for FREE_AUTO) |
| `createdAt` | timestamp | Row insertion time |
| `paymentMethod` | text? | MANUAL only: `CASH` \| `BANK_TRANSFER` \| `UPI` \| `CHEQUE` \| `OTHER` |
| `externalReference` | text? | MANUAL only |
| `notes` | text? | MANUAL only |
| `createdByUserId` | text? FK → `users.id` | MANUAL only: admin who recorded it |
| `checkoutSessionId` | text? FK → `checkout_sessions.id` UNIQUE | STRIPE only |

**Indexes:** `(userId, purchasedAt DESC)`, `(source)`, `(purchasedAt)`. `checkoutSessionId` is unique to enforce webhook idempotency.

### Schema changes to existing tables

- `Entitlement.transactionId` — new `text` FK → `transactions.id`. **NOT NULL** (no backfill needed since the migration TRUNCATEs `entitlements`).
- `CheckoutSession` — remove `amountTotal` and `currency` columns; both move to `Transaction`. The remaining columns (`stripeCheckoutSessionId`, `stripeCheckoutSessionUrl`, `status`, `processedAt`) keep `CheckoutSession` as a thin Stripe-side metadata table.
- `User`, `Product`, `ProductFeature`, `LicenseKey`, `UsageRecord`, `DownloadRegistration`, `ContactSubmission` — unchanged.
- Semantic ID prefix registry gains `Transaction → "txn"`.

### Free auto-grant representation

The existing `clerkAuth` first-auth path (which today auto-creates a Free `Entitlement` + `LicenseKey`) is extended to also create a `Transaction(source=FREE_AUTO, amount=0, paymentMethod=null, createdByUserId=null)` inside the same DB transaction. This preserves the invariant *"every Entitlement has a Transaction"*.

## Section 2 — API surface

### New admin endpoints (clerk-auth + roles ADMIN or OPS)

| Method | Path | Purpose |
|---|---|---|
| `GET /admin/users/search?email=` | Email-prefix search for the manual-purchase customer picker. Returns up to 20 `{ id, email, name }`. |
| `POST /admin/transactions` | Create a manual transaction. Body: `{ userId, productSlug, paymentMethod, externalReference?, notes?, purchasedAt? }`. |
| `GET /admin/transactions` | Paginated unified list with filters: `source`, `email`, `productSlug`, `from`, `to`, `page`, `pageSize`. |
| `GET /admin/transactions/:id` | Single transaction detail. |
| `GET /admin/customers/:id/transactions` | Per-customer transactions (or fold into existing `/admin/customers/:id`). |

### Validation on `POST /admin/transactions`

- `userId` exists; else 404.
- `productSlug` exists and is active; else 400.
- `product.isFree === true` → 400 with explicit error code (free tier is auto-granted at signup, never manually sold).
- `paymentMethod` must be one of the enum values; Zod 400 otherwise.
- `purchasedAt` defaults to `now()`; admin can backdate.
- No idempotency key for v1; client-side debounce on the form is sufficient at this scale.

### Modified existing endpoints (surgical, internal-only)

| Endpoint | Change |
|---|---|
| `POST /webhooks/stripe` (`checkout.session.completed` branch) | `provisionEntitlement` also writes `Transaction(source=STRIPE)` linked to the new Entitlement, in the same DB transaction |
| `POST /billing/verify-session` | Same — uses the same `provisionEntitlement` helper |
| `clerkAuth` middleware (first-auth path) | Adds `Transaction(source=FREE_AUTO, amount=0)` write to the existing free-grant DB transaction |
| `POST /usage/report` (`usage.service.ts`) | **Kill-switch fix:** add `deactivatedAt: null` to candidate `findMany` AND to the atomic raw-SQL `UPDATE ... WHERE` clause |
| `/admin/customers`, `/admin/customers/:id`, `/admin/dashboard/*`, `/admin/products/*` | Aggregations swap from `CheckoutSession.amountTotal` to `Transaction.amount` filtered by `source IN ('STRIPE', 'MANUAL')`; group by `purchasedAt` |

### Endpoints unchanged (verified)

`GET /billing/entitlements`, `GET /billing/usage`, `GET /entitlements` (license-key-auth), `POST /usage/report` request/response shape, `POST /billing/checkout`, `GET /products`. The user dashboard and desktop app see no behavior change beyond the kill-switch fix's effect on a previously-broken case.

### Internal services

- `provisionStripePurchase(stripeCheckoutSessionId, { amountTotal, currency })` — wraps existing logic, now also writes Transaction.
- `provisionManualPurchase({ userId, productId, paymentMethod, externalReference?, notes?, purchasedAt?, createdByUserId })` — new; same DB transaction shape.
- Both call a shared `createEntitlementAndTransaction(tx, params)` helper to avoid drift.

## Section 3 — Admin UI (mvp_admin)

### Sidebar

Add `Transactions` between `Customers` and `Plans`. Visible to ADMIN and OPS.

### `/transactions` — unified list

Columns: Date (`purchasedAt` desc), Customer (email + name, link), Product (slug, link), Amount (USD), Source badge, Payment method (manual rows only), External reference (manual rows; truncated + tooltip), Recorded by (manual rows only).

Filters in URL state: `source`, `email`, `productSlug`, `from`, `to`, `page`, `pageSize=20`.

Top-right primary CTA: **Record Manual Purchase** → `/transactions/new`.

### `/transactions/new` — manual purchase form

Stepwise on a single page:

1. **Customer** — combobox with debounced (300ms) email search → `GET /admin/users/search`. Empty state for unknown emails: *"No customer with that email. Customer must sign up at solarlayout.in/sign-up before you can record a purchase."*
2. **Plan** — dropdown of active, non-free products. Price displayed.
3. **Payment method** — segmented control / radio: `CASH` · `BANK_TRANSFER` · `UPI` · `CHEQUE` · `OTHER`.
4. **External reference** — single-line text. Optional.
5. **Notes** — textarea. Optional.
6. **Purchased at** — date picker. Defaults to today; editable for backdating.

Submit opens a confirmation modal (no reversal in scope, so explicit confirmation matters):

> *Recording manual purchase: **Alice** (`alice@example.com`) buys **Pro Plus** for **$14.99** via **UPI** (ref: `8472-...`). The 50-calculation entitlement will activate immediately. Confirm?*

On confirm: `POST /admin/transactions` → toast + navigate to `/transactions/:id`. On error: surface API error code; preserve form state.

### `/transactions/:id` — read-only detail

- Header: source badge, amount, `purchasedAt`, status.
- Customer block (link to `/customers/:id`).
- Product block (link to `/plans/:slug`).
- Manual fields if MANUAL: payment method, external reference, notes, recorded by.
- Stripe fields if STRIPE: `checkoutSessionId`, Stripe-side status, `processedAt`.
- Linked entitlement: current state, used/total, link to `/customers/:id` for the kill switch.

No edit/void controls (Q4: reversal out of scope).

### Modified `/customers/:id`

Add a **Transactions** section above the existing **Plans** table. Top 10 + *"View all"* link to `/transactions?email=...`. Existing Plans/Entitlements table stays unchanged — that's the kill-switch surface.

### Hooks (TanStack Query)

- `useAdminTransactions(filters, page, pageSize)`
- `useAdminTransaction(id)`
- `useAdminUserSearch(emailQuery)` (debounced, enabled only when `length >= 2`)
- `useCreateManualTransaction()` — `useMutation`; on success invalidates `["admin-transactions"]` and the customer's queries.

### shadcn components

All required components (`Combobox`/`Command`, `Select`, `RadioGroup`, `Input`, `Textarea`, `DatePicker`, `Dialog`, `Badge`, `Table`) already exist in `packages/ui`.

## Section 4 — Admin Dashboard impact

### `GET /admin/dashboard/summary`

| Metric | Source |
|---|---|
| Total Revenue | `SUM(Transaction.amount) WHERE source IN ('STRIPE', 'MANUAL')` |
| Total Customers | `COUNT(*) FROM users` (unchanged semantics — Q9) |
| Total Purchases | `COUNT(*) FROM Transaction WHERE source IN ('STRIPE', 'MANUAL')` |
| Total Calculations | unchanged — `UsageRecord` |

Source split surfaced as subtitle on Revenue and Purchases cards: *"Stripe $X · Manual $Y"* (Q10).

### `GET /admin/dashboard/trends`

Group by `purchasedAt` (Q8). Response includes per-source breakdown alongside totals (totals kept for chart compatibility):

```
{ period, revenue, revenueStripe, revenueManual, purchases, purchasesStripe, purchasesManual, customers, calculations }
```

Chart visualization remains a single line consuming `revenue` for now (Q10 chose subtitle-only; chart can be upgraded to stacked bars later by switching to the `revenueStripe` / `revenueManual` series without an API change).

### Other reporting endpoints

`/admin/products/summary`, `/admin/products/:slug`, `/admin/products/:slug/sales`, `/admin/customers`, `/admin/customers/:id` all swap aggregations from `CheckoutSession` to `Transaction` filtered by `source IN ('STRIPE', 'MANUAL')`. Per-plan page gets the Q11 subtitle treatment. Per-customer total spend stays a single number (no subtitle per Q12).

## Section 5 — mvp_web and desktop app: no behavior change

Verified surfaces (full enumeration in the brainstorming session):

- mvp_web `/dashboard` license-key card, stat cards, Purchase History, `/dashboard/usage`, Stripe purchase journey — all unchanged. Source is **not** revealed to end users; all purchases appear identically.
- Desktop app `GET /entitlements` and license-key handling — unchanged. `POST /usage/report` request/response shape unchanged; the kill-switch fix triggers an existing 402 path that the app already handles.

## Section 6 — Migration strategy

Single Prisma migration that wipes transactional data and applies schema changes. Permitted by explicit user decision (zero real customers; only the founders' test data exists in production).

```sql
-- Wipe
TRUNCATE TABLE usage_records, entitlements, license_keys, checkout_sessions, users CASCADE;

-- New canonical ledger
CREATE TABLE transactions (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id),
  product_id            TEXT NOT NULL REFERENCES products(id),
  source                TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'COMPLETED',
  amount                INTEGER NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'usd',
  purchased_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  payment_method        TEXT,
  external_reference    TEXT,
  notes                 TEXT,
  created_by_user_id    TEXT REFERENCES users(id),
  checkout_session_id   TEXT UNIQUE REFERENCES checkout_sessions(id)
);
CREATE INDEX idx_transactions_user_purchased ON transactions(user_id, purchased_at DESC);
CREATE INDEX idx_transactions_source         ON transactions(source);
CREATE INDEX idx_transactions_purchased_at   ON transactions(purchased_at);

ALTER TABLE entitlements      ADD COLUMN transaction_id TEXT NOT NULL REFERENCES transactions(id);
ALTER TABLE checkout_sessions DROP COLUMN amount_total;
ALTER TABLE checkout_sessions DROP COLUMN currency;
```

`products`, `product_features`, `download_registrations`, `contact_submissions` are not touched. Stripe-side test customer IDs remain in Stripe (orphaned), acceptable for test data.

### Recreation flow after wipe

The existing first-auth path in `clerkAuth` middleware fully recreates state on the next authenticated request from each operator: `User` + `Transaction(FREE_AUTO)` + free `Entitlement` + `LicenseKey`, all in one DB transaction. No script needed. See [`docs/mvp/TRANSACTIONS_SPIKE_POST_MIGRATION.md`](../../mvp/TRANSACTIONS_SPIKE_POST_MIGRATION.md) for the operator runbook.

### Rollback

Destructive migration; data wipe cannot be reversed. Schema can be reversed via a counter-migration. Acceptable given there is no real data and only the founders are using the system.

## Section 7 — Testing strategy

Aligns with the project's TDD-mandatory CLAUDE.md and the 5-gate spike DoD (`docs/collaborative-testing-protocol.md`).

### Layer 1 — Backend tests (`bun:test`, mocked Prisma)

**New test files:**
- `transactions.service.test.ts` — manual purchase happy path, free-product rejection, validation errors, audit field, amount snapshotting.
- `transactions.routes.test.ts` — admin endpoints with role gating.
- `usage.service.test.ts` (new or extended) — kill-switch fix: deactivated-only → 402, stacked active+deactivated → active consumed, race during atomic UPDATE.
- `clerk-auth.test.ts` (new or extended) — first-auth path now writes `Transaction(FREE_AUTO)`; second auth does not duplicate.

**Existing test files updated:**
- `billing.routes.test.ts`, `stripe.webhook.test.ts`, `billing.provision.test.ts` — `provisionEntitlement` now also writes a Transaction.
- Admin reporting tests — aggregations swap source.

### Layer 2 — Frontend tests (`vitest` in mvp_admin)

- `TransactionsPageClient` — render, pagination, filters, empty state.
- `NewTransactionForm` — debounced search, non-free product list, confirmation modal, submission, error handling.
- `CustomerDetailClient` — Transactions section.

mvp_web has no behavior change → no new tests.

### Layer 3 — TDD ordering

1. Schema + migration → Prisma client regenerated.
2. Test-first kill-switch fix in `usage.service.ts` → implement → green.
3. Test-first first-auth Transaction creation → implement → green.
4. Test-first provision Transaction writes → implement → green.
5. Test-first manual purchase service + routes → implement → green.
6. Test-first admin reporting aggregation switch → implement → green.
7. Test-first admin component tests → implement → green.

Pre-commit gate (`bun run lint && bun run typecheck && bun run test && bun run build`) passes from repo root after each step.

### Layer 4 — Human local verification (acceptance walkthrough)

One step at a time, await confirmation between steps:

1. Apply migration locally → DB wiped.
2. Sign in to mvp_web → free Transaction(FREE_AUTO) + entitlement + license key auto-created. License key visible.
3. Sign in to mvp_admin → `Transactions` nav visible. Dashboard shows 1+ customers, $0 revenue.
4. Stripe purchase happy path: Pro Plus via test card → entitlement on user dashboard → `/admin/transactions` row with `source=STRIPE`.
5. Manual purchase happy path: second test customer signs up; admin records UPI Pro purchase with reference + notes → user sees Pro plan immediately → `/admin/transactions` shows MANUAL row → `/customers/:id` Transactions section populated.
6. Manual purchase rejection: free product rejected by API.
7. Dashboard reflects Stripe + manual revenue with subtitle split. Per-plan page same.
8. Kill switch: deactivate an entitlement on `/customers/:id` → desktop's next `/usage/report` returns 402 (was: silent consumption pre-fix).
9. License key: copy from web → paste in desktop → run a layout → entitlement decrements → dashboard Total Calculations increments.

### Layer 5 — CI

Existing `ci.yml` covers lint/typecheck/test/build. No CI changes.

### Layer 6 — Production verification

After merge to `mvp` and platform-deploy: repeat steps 2–9 against production URLs. Use the post-migration ritual doc as the operator-facing checklist.

## Acceptance criteria (Definition of Done)

Spike is **NOT done** until all five gates pass in order (per `docs/collaborative-testing-protocol.md`):

1. Automated gates (`bun run lint && bun run typecheck && bun run test && bun run build`) all pass from repo root.
2. Human local verification — every acceptance step (Section 7 Layer 4), one at a time, confirmed by a human operator.
3. CI/CD passes on the branch.
4. Production verification — every acceptance step repeated against production URLs after platform-deploy.
5. Explicit human sign-off.

## Risks & open items

- **Race in clerkAuth middleware first-auth path.** Pre-existing concern (parallel API calls from a fresh login could each enter the first-auth branch). The spike adds a Transaction write inside that DB transaction; if the existing code is not idempotent under race, this would amplify the problem. **Action during implementation:** verify the middleware's first-auth detection is wrapped in an idempotency guard (e.g., `findUnique` then conditional create inside the DB transaction), and if not, harden it as part of this spike.
- **Backdated transaction shifts in reporting.** Q8 chose `purchasedAt` over `createdAt`. Acceptable per business reality, but anyone reading the dashboard should know "yesterday's revenue can change." Documented in this spec; surface as a tooltip on the dashboard if it ever causes confusion.
- **Stripe-side orphaned customers.** TRUNCATE removes `User.stripeCustomerId`. Old test Stripe customers stay in Stripe with no DB pointer. Acceptable; not worth cleanup tooling.
- **Free auto-grant idempotency under the new model.** The first-auth path now creates four rows (`User`, `Transaction`, `Entitlement`, `LicenseKey`). All inside one DB transaction. Tests must verify second auth does not duplicate any of them.

## Out of scope (explicit, to prevent scope creep)

- Reversal / void of transactions.
- Stripe refund or dispute webhook handling (`charge.refunded`, `charge.dispute.created`, etc.).
- Multi-currency at the data layer.
- Customer pre-provisioning / invitation flow.
- Email notifications to customers for manual purchases.
- Concurrent admin manual purchase guards (stacking allowed; same as Stripe today).
- Advanced reporting (MRR, churn, LTV, cohort analysis).
- A new `AdminAuditLog` table for all admin actions (the per-Transaction `createdByUserId` is sufficient at this stage).
