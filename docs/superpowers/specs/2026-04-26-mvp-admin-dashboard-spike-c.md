# MVP Admin Dashboard Stats — Spike C Design

## Goal

Populate the admin dashboard page with all-time summary stat cards and two trend charts (revenue over time, customer signups over time). Fix the products page summary stats hack with a proper server-side aggregation endpoint.

## Architecture

Two new API endpoints in `mvp_api` served by a new `dashboard.routes.ts` and `dashboard.service.ts`. A third endpoint fixes the products page summary hack. The frontend replaces the dashboard placeholder with a `DashboardClient` component containing two dynamically-imported recharts charts (same `ssr: false` pattern as the product detail page).

### New API endpoints

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/admin/dashboard/summary` | `{ totalRevenueUsd, totalCustomers, totalPurchases, activeEntitlements }` |
| `GET` | `/admin/dashboard/trends?granularity=daily\|weekly\|monthly` | `{ granularity, revenue: SalesDataPoint[], customers: CustomerDataPoint[] }` |
| `GET` | `/admin/products/summary` | `{ totalRevenueUsd, totalPurchases, activeEntitlements }` |

All endpoints require `clerkAuth + requireRole("ADMIN", "OPS")`.

## Shared Utilities

`getCutoff`, `generatePeriods`, `getPeriod`, and `getISOWeek` currently live in `product.service.ts`. They are extracted to `src/modules/admin/sales-utils.ts` and imported by both `product.service.ts` and `dashboard.service.ts`. No duplication.

## Data Flow

### `getDashboardSummary()`

Four Prisma aggregations run in `Promise.all`:
```
db.checkoutSession.aggregate({ _sum: { amountTotal }, where: { processedAt: { not: null } } })
db.user.count()
db.checkoutSession.count({ where: { processedAt: { not: null } } })
db.entitlement.count({ where: { deactivatedAt: null } })
```
Revenue divided by 100 to convert cents → USD.

### `getDashboardTrends(granularity)`

Two parallel queries:
- `db.checkoutSession.findMany({ where: { processedAt: { not: null, gte: cutoff } }, select: { amountTotal, processedAt } })`
- `db.user.findMany({ where: { createdAt: { gte: cutoff } }, select: { createdAt } })`

Both grouped into the same `periods` array using the shared utils. Returns:
```typescript
{
  granularity: "daily" | "weekly" | "monthly",
  revenue: Array<{ period: string; revenueUsd: number }>,
  customers: Array<{ period: string; count: number }>,
}
```

### `getProductsSummary()`

Single-pass aggregation across all products — no pagination, no JS Map join:
```
db.checkoutSession.aggregate({ _sum: { amountTotal }, where: { processedAt: { not: null } } })
db.checkoutSession.count({ where: { processedAt: { not: null } } })
db.entitlement.count({ where: { deactivatedAt: null } })
```

## Frontend Components

### Files created or modified

**API layer (`mvp_api`):**
- Create `src/modules/admin/sales-utils.ts` — shared `getCutoff`, `generatePeriods`, `getPeriod`, `getISOWeek`
- Create `src/modules/admin/dashboard.service.ts` — `getDashboardSummary`, `getDashboardTrends`
- Create `src/modules/admin/dashboard.service.test.ts`
- Create `src/modules/admin/dashboard.routes.ts` — registers both dashboard endpoints
- Create `src/modules/admin/dashboard.routes.test.ts`
- Modify `src/modules/admin/product.service.ts` — import from `sales-utils.ts`; add `getProductsSummary`
- Modify `src/modules/admin/product.service.test.ts` — add `getProductsSummary` tests
- Modify `src/modules/admin/product.routes.ts` — add `GET /admin/products/summary`
- Modify `src/app.ts` — register `dashboardRoutes`

**Admin app (`mvp_admin`):**
- Modify `lib/api.ts` — add `DashboardSummary`, `DashboardTrends`, `ProductsSummary` types
- Create `lib/hooks/use-admin-dashboard.ts` — `useAdminDashboardSummary`, `useAdminDashboardTrends`
- Modify `lib/hooks/use-admin-products.ts` — add `useAdminProductsSummary`
- Modify `app/(admin)/dashboard/page.tsx` — replace placeholder with `<DashboardClient>`
- Create `app/(admin)/dashboard/_components/dashboard-client.tsx`
- Create `app/(admin)/dashboard/_components/revenue-trend-chart.tsx` — recharts Bar, `ssr: false`
- Create `app/(admin)/dashboard/_components/customer-trend-chart.tsx` — recharts Bar, `ssr: false`
- Modify `app/(admin)/products/_components/products-page-client.tsx` — replace `useAdminProducts({pageSize:100})` with `useAdminProductsSummary`

### Dashboard layout

```
┌──────────┬──────────┬──────────┬──────────┐
│  Total   │  Total   │  Total   │  Active  │
│ Revenue  │Customers │Purchases │Entitls.  │
└──────────┴──────────┴──────────┴──────────┘

[Daily] [Weekly] [Monthly]   ← single toggle, controls both charts

┌─────────────────────┐  ┌─────────────────────┐
│   Revenue over time │  │  New customers/period│
│   (Bar chart)       │  │  (Bar chart)         │
└─────────────────────┘  └─────────────────────┘
```

Granularity state lives in the URL (`?granularity=daily|weekly|monthly`), defaulting to `monthly`. Consistent with the product page pattern.

### Error handling

`DashboardClient` fetches summary and trends independently via two separate hooks. If summary fails, stat cards show an inline error; charts still render. If trends fail, charts show an inline error; stat cards still render. Loading states per-section with `Skeleton` components.

## Testing

### Service unit tests

**`dashboard.service.test.ts`** (mock `db`):
- `getDashboardSummary` — correct totals; returns zeros when no data
- `getDashboardTrends` — daily periods filled correctly; weekly ISO week grouping; empty periods produce zero values

**`product.service.test.ts`** additions:
- `getProductsSummary` — correct totals across products; zeros when no sessions/entitlements

### Route integration tests

**`dashboard.routes.test.ts`**:
- `GET /admin/dashboard/summary` — authenticated returns 200 with correct shape; unauthenticated returns 401
- `GET /admin/dashboard/trends` — valid granularity returns 200; missing granularity defaults to `monthly`

**`product.routes.test.ts`** additions:
- `GET /admin/products/summary` — authenticated returns 200; unauthenticated returns 401

## Non-goals

- No per-customer or per-product breakdown on the dashboard (those live on their own pages)
- No date range picker (all-time totals; trend window is fixed at 30 days/12 weeks/12 months)
- No real-time updates or websockets
