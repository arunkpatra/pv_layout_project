# mvp_admin Spike A — Customers, Purchases Recording, Entitlement Deactivation

**Date:** 2026-04-25
**Status:** Approved
**Scope:** `packages/mvp_db`, `apps/mvp_api`, `apps/mvp_admin`

---

## 1. Goal

Add a Customers section to the admin portal. Admins and ops users can browse all platform users, see their total purchase spend, and manage their entitlements (deactivate / reactivate). Purchase amounts are captured from Stripe webhook events. The consumer entitlement API is updated to exclude deactivated and fully consumed entitlements.

This is Spike A of two. Spike B (Products pages with sales reporting) follows after this is shipped.

---

## 2. Architecture

All data flows through the existing pattern:

```
apps/mvp_admin → HTTP → apps/mvp_api → packages/mvp_db → PostgreSQL
```

No new external dependencies. The Stripe webhook already fires `checkout.session.completed` — this spike writes `amountTotal` and `currency` from that event into the existing `CheckoutSession` row.

---

## 3. Database changes (`packages/mvp_db`)

### Schema additions

```prisma
model CheckoutSession {
  // existing fields unchanged
  amountTotal  Int?    // Stripe units (cents). Null until webhook fires.
  currency     String? // Always "usd" today. Stored as received from Stripe.
}

model Entitlement {
  // existing fields unchanged
  deactivatedAt  DateTime? // null = active. Set = deactivated. Reversible.
}
```

### Migration name
`add_purchase_amount_entitlement_deactivation`

### Backward compatibility
Both fields are nullable. Existing rows are unaffected. No data migration required.

---

## 4. API changes (`apps/mvp_api`)

### 4a. Stripe webhook — capture purchase amount

In `apps/mvp_api/src/modules/billing/provision.ts`, after marking `processedAt`, also write `amountTotal` and `currency` from the Stripe checkout session object.

`provisionEntitlement` is called from two places:
- `POST /billing/verify-session` — does not have the Stripe event; `amountTotal` will be written as null here (the verify-session flow is a safety net, not the primary path)
- `POST /webhooks/stripe` (checkout.session.completed) — has the full Stripe event

To avoid coupling `provisionEntitlement` to Stripe-specific types, extend its signature:

```typescript
export async function provisionEntitlement(
  stripeCheckoutSessionId: string,
  purchase?: { amountTotal: number | null; currency: string | null }
): Promise<{ provisioned: boolean }>
```

The webhook handler passes `{ amountTotal: session.amount_total, currency: session.currency }`. The verify-session path passes nothing (or explicitly `undefined`), leaving `amountTotal` null.

Write `amountTotal` and `currency` inside the same `$transaction` that creates the entitlement and marks `processedAt`.

### 4b. Consumer endpoint — filter entitlements

`GET /billing/entitlements` currently returns all entitlements for the authenticated user.

Change: exclude entitlements that are deactivated or fully consumed.

```typescript
// In billing.routes.ts — GET /billing/entitlements
const entitlements = await db.entitlement.findMany({
  where: { userId: user.id, deactivatedAt: null },
  // ... existing include and orderBy
})
// Post-filter: exclude fully consumed
const active = entitlements.filter(
  (e) => e.usedCalculations < e.totalCalculations
)
```

This is a breaking change in behaviour (previously returned exhausted entitlements). It is intentional — the consumer app (PVLayout_Advance) should not receive or act on entitlements the user cannot use.

### 4c. New admin routes

All new routes live in `apps/mvp_api/src/modules/admin/`. All require `authMiddleware + requireRole("ADMIN", "OPS")`.

#### `GET /admin/customers`

Paginated customer list with spend summary.

Query params: `page` (default 1), `pageSize` (default 20).

Response per item:
```typescript
{
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string        // ISO
  totalSpendUsd: number    // SUM(amountTotal) / 100, null-safe
  activeEntitlementCount: number  // deactivatedAt IS NULL
}
```

Implementation: `db.user.findMany` with `include: { checkoutSessions: true, entitlements: true }`, compute aggregates in JS. No raw SQL.

#### `GET /admin/customers/:id`

Customer detail with entitlements.

Query param: `?filter=active|all` (default `active`).

- `active`: `deactivatedAt IS NULL`
- `all`: no filter on `deactivatedAt`

Response:
```typescript
{
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string
  totalSpendUsd: number
  entitlements: {
    id: string
    productId: string
    productName: string
    productSlug: string
    totalCalculations: number
    usedCalculations: number
    remainingCalculations: number
    purchasedAt: string
    deactivatedAt: string | null
    state: "ACTIVE" | "EXHAUSTED" | "DEACTIVATED"
  }[]
}
```

`state` derivation:
- `deactivatedAt !== null` → `"DEACTIVATED"`
- `usedCalculations >= totalCalculations` → `"EXHAUSTED"`
- otherwise → `"ACTIVE"`

#### `PATCH /admin/entitlements/:id/status`

Activate or deactivate an entitlement.

Body: `{ status: "ACTIVE" | "INACTIVE" }`

- `"INACTIVE"` → sets `deactivatedAt = now()`
- `"ACTIVE"` → sets `deactivatedAt = null`

Returns updated entitlement. Throws 404 if entitlement not found.

---

## 5. `mvp_admin` UI

### 5a. Sidebar update

Add **Customers** between Dashboard and Users. Accessible to ADMIN and OPS.

```
Dashboard   (ADMIN + OPS)
Customers   (ADMIN + OPS)   ← new
Users       (ADMIN only)
```

### 5b. Route tree additions

```
apps/mvp_admin/app/(admin)/
  customers/
    page.tsx              ← Customers list (paginated table)
    [id]/
      page.tsx            ← Customer detail (header + entitlements table)
```

### 5c. Customers list page

**File:** `app/(admin)/customers/page.tsx`

Server component. Fetches `GET /admin/customers?page=N&pageSize=20`.

Table columns:
| Column | Notes |
|---|---|
| Name | Falls back to email if null |
| Email | |
| Joined | `createdAt` formatted as date |
| Total Spend | `$X.XX` USD |
| Active Entitlements | Count |
| Status | `ACTIVE` / `INACTIVE` badge |

Row is clickable → `/customers/:id`.

### 5d. Customer detail page

**File:** `app/(admin)/customers/[id]/page.tsx`

Server component. Fetches `GET /admin/customers/:id?filter=active|all`.

Layout:
- **Header card:** Name, email, joined date, status badge, total spend
- **Entitlements section:**
  - Toggle (client component): **Active** (default) / **All** — triggers page re-render via search param `?filter=`
  - Table columns: Product, Purchased, Total, Used, Remaining, State badge, Actions

State badges:
- `ACTIVE` → green `Badge`
- `EXHAUSTED` → muted `Badge`
- `DEACTIVATED` → destructive `Badge`

Actions column:
- `ACTIVE` state → "Deactivate" button (calls `PATCH /admin/entitlements/:id/status { status: "INACTIVE" }`)
- `DEACTIVATED` state → "Reactivate" button (calls `PATCH /admin/entitlements/:id/status { status: "ACTIVE" }`)
- `EXHAUSTED` state → no action (nothing to manage)

Action buttons are client components (TanStack Query `useMutation`). On success, router refresh.

### 5e. Export `dynamic = "force-dynamic"`

Both new pages export `dynamic = "force-dynamic"` (same pattern as all other admin pages).

---

## 6. Testing

- `admin.service.ts`: unit tests for `listCustomers`, `getCustomer`, `updateEntitlementStatus`
- `admin.routes.test.ts`: integration tests for all three new routes, including OPS role access
- `billing.routes.test.ts`: updated test asserting deactivated and exhausted entitlements are excluded from `GET /billing/entitlements`
- `provision.test.ts`: updated test asserting `amountTotal` and `currency` are written when `purchase` arg is provided
- UI: render tests for customers list page and detail page (entitlement state badges, action buttons)

---

## 7. Out of scope (this spike)

- Products page with sales reporting — Spike B
- Subscription-based payments
- Bulk entitlement operations
- Customer search / filtering beyond pagination
- Export to CSV
