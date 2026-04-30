# MVP Web Customer Dashboard Redesign

## Goal

Redesign the information architecture of the customer-facing authenticated dashboard in `apps/mvp_web` so that every page delivers genuine value, there is zero duplication across pages, and the experience is shippable at launch.

## Current Problems

- `/dashboard` is a download page, not a real dashboard — misleading label
- `/dashboard/plan` mixes buying, entitlements, and license key — unfocused
- `/dashboard/license` duplicates the license key already shown on Plan — redundant page
- `/dashboard/usage` is a 100% placeholder with "Coming soon" text
- Products on the download page are hardcoded, not API-driven
- Exhausted entitlements are filtered out and invisible to the user
- No Clerk-authenticated endpoint exists for usage records — the web dashboard can't show them

## New Sidebar Structure

Three nav items, all fully implemented:

| Label | Route | Icon |
|---|---|---|
| Dashboard | `/dashboard` | LayoutDashboard |
| Plans | `/dashboard/plans` | CreditCard |
| Usage | `/dashboard/usage` | BarChart3 |

The `/dashboard/license` page and folder are deleted entirely. The `/dashboard/plan` folder is renamed to `/dashboard/plans`.

## Pages

### Dashboard (`/dashboard`)

The home page. A user who just logs in should be able to see everything important without navigating elsewhere.

**Data fetched (parallel):**
- `GET /billing/entitlements` — remaining calculations, active entitlement count, license key
- `GET /billing/usage?page=1&pageSize=5` — last 5 usage records

**Layout:**

```
┌──────────────────────┬──────────────────────┐
│  Remaining           │  Active              │
│  Calculations        │  Entitlements        │
│  (large, prominent)  │                      │
└──────────────────────┴──────────────────────┘

┌──────────────────────┬──────────────────────┐
│  Your License Key    │  Download SolarLayout │
│  [masked] [Copy]     │  [Download button]   │
└──────────────────────┴──────────────────────┘

┌─────────────────────────────────────────────┐
│  Recent Activity                            │
│  Feature | Product | Date          View all →│
│  ─────────────────────────────────────────  │
│  (last 5 usage records)                     │
│  Empty state if no records                  │
└─────────────────────────────────────────────┘
```

**Remaining calculations** is the sum of `remainingCalculations` across all active (non-exhausted, non-deactivated) entitlements from the entitlements response.

**License key card:** Shows the key masked (first 8 chars + `...`). A copy-to-clipboard button copies the full (unmasked) key to clipboard. If no license key exists, shows "Purchase a plan to get your license key."

**Download card:** Single download button for the unified SolarLayout desktop app. Calls `GET /dashboard/download/:product` to get a presigned S3 URL, then initiates the download. Uses the first active product slug from the entitlements response. If no active entitlement, the button is disabled with tooltip "Purchase a plan to download."

**Recent activity table:** Columns: Feature, Product, Date. `featureKey` is displayed as-is. "View all →" links to `/dashboard/usage`. Empty state: "No calculations run yet. Download the app to get started."

**Error handling:** Summary cards show inline skeleton/error independently. Recent activity section shows its own error state without affecting the cards above.

---

### Plans (`/dashboard/plans`)

Replaces `/dashboard/plan`. Handles buying packs and viewing all purchase history.

**Stripe return URL:** `billing.routes.ts` `success_url` changes from `/dashboard/plan?session_id={CHECKOUT_SESSION_ID}` to `/dashboard/plans?session_id={CHECKOUT_SESSION_ID}`. The verify-session logic (detecting `session_id` in URL, calling `POST /billing/verify-session`, showing confirmation) is preserved exactly — only the route name changes.

**Data fetched:**
- `GET /products` — purchasable products
- `GET /billing/entitlements` — all entitlements (active + exhausted + deactivated)

**Layout:**

```
── Buy Calculations ──────────────────────────
[Product card] [Product card] [Product card]
  Name, price, calc count, features, Buy button

── Your Purchases ────────────────────────────
Product | Purchased | Total | Used | Remaining | Status
(all entitlements, newest first)
Active   → normal styling
Exhausted → muted styling, "Exhausted" badge
Deactivated → muted styling, "Deactivated" badge
```

**Removed from this page:** license key card (now on Dashboard only).

**Exhausted entitlements** are shown, not filtered out. This gives users a visible purchase history.

---

### Usage (`/dashboard/usage`)

Replaces the current dead stub. Full paginated usage history.

**Data fetched:**
- `GET /billing/usage?page=N&pageSize=20` — user's own usage records, newest first

**Layout:**

```
Usage History                     (total count)

Feature | Product | Date
─────────────────────────────────────────────
(20 rows per page)

← Previous    Page N of M    Next →
```

**Empty state:** "No calculations recorded yet. Download the app and run your first layout."

**Pagination:** URL-based (`?page=N`), same pattern as admin customers/products pages.

---

## New API Endpoint

### `GET /billing/usage`

**Location:** `apps/mvp_api/src/modules/billing/billing.routes.ts` (and new `billing.service.ts` function)

**Auth:** Clerk JWT (same middleware as `GET /billing/entitlements`)

**Query params:**
- `page` (default: 1)
- `pageSize` (default: 20, max: 100)

**Response:**
```typescript
{
  success: true,
  data: {
    data: Array<{
      featureKey: string
      productName: string
      createdAt: string  // ISO 8601
    }>,
    pagination: {
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
  }
}
```

**Implementation:** Queries `db.usageRecord.findMany` filtered by `userId` (from Clerk context), ordered by `createdAt` desc, with `skip`/`take` pagination. Joins `product` to get `productName`.

---

## Files Created or Modified

### `apps/mvp_api`
- **Modify** `src/modules/billing/billing.routes.ts` — add `GET /billing/usage`; update `success_url`
- **Modify** `src/modules/billing/billing.service.ts` — add `getUserUsage(userId, page, pageSize)`
- **Create** `src/modules/billing/billing.service.test.ts` additions — `getUserUsage` tests
- **Create** `src/modules/billing/billing.routes.test.ts` additions — `GET /billing/usage` tests

### `apps/mvp_web`
- **Modify** `components/dashboard-sidebar.tsx` — 3 nav items; remove License; Plan → Plans
- **Modify** `app/(main)/dashboard/page.tsx` — full dashboard (stat cards, license key, download, recent activity)
- **Delete** `app/(main)/dashboard/license/` — entire folder
- **Rename** `app/(main)/dashboard/plan/` → `app/(main)/dashboard/plans/`
- **Modify** `app/(main)/dashboard/plans/page.tsx` — remove license card; show exhausted entitlements; update verify redirect
- **Modify** `app/(main)/dashboard/usage/page.tsx` — implement fully (replace stub)
- **Modify** `lib/hooks/` — add `useUserUsage` hook; update any `plan` route references to `plans`

## Non-Goals

- Multiple license keys per user
- Invoice PDF downloads
- Usage filtering by date range or feature
- Profile / account settings page
- Per-feature usage breakdown charts
