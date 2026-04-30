# mvp_admin Spike B — Products Pages with Sales Reporting

**Date:** 2026-04-26
**Status:** Approved
**Scope:** `apps/mvp_api`, `apps/mvp_admin`

---

## 1. Goal

Add a Products section to the admin portal. Admins and ops users can browse all products, see per-product sales metrics (total revenue, purchase count, active entitlements), and drill into a product detail page showing a time-series sales chart (revenue + purchase count) with daily / weekly / monthly granularity toggle.

This is Spike B of two. Spike A (Customers, purchase recording, entitlement deactivation) is complete.

---

## 2. Architecture

Same data flow as Spike A:

```
apps/mvp_admin → HTTP → apps/mvp_api → packages/mvp_db → PostgreSQL
```

No DB schema changes. All required data (`amountTotal`, `currency`, `processedAt` on `CheckoutSession`; `deactivatedAt` on `Entitlement`) was added in Spike A.

No new external dependencies. Chart rendering uses `recharts` (already at `3.8.0` in `packages/ui`) via shadcn's `chart` primitive (`ChartContainer`, `ChartTooltip`).

---

## 3. API changes (`apps/mvp_api`)

All new routes live in `apps/mvp_api/src/modules/admin/`. All require `clerkAuth + requireRole("ADMIN", "OPS")` via `productRoutes.use("/admin/*", clerkAuth, requireRole("ADMIN", "OPS"))`.

### 3a. `GET /admin/products`

Paginated products list with sales summary.

Query params: `page` (default 1), `pageSize` (default 20, max 100).

Response per item:
```typescript
{
  slug: string
  name: string
  priceAmount: number           // cents, e.g. 4999
  priceCurrency: string         // "usd"
  calculations: number          // calculations granted per purchase
  active: boolean
  isFree: boolean
  totalRevenueUsd: number       // SUM(amountTotal) / 100, null-safe; processedAt IS NOT NULL only
  purchaseCount: number         // count of checkout sessions where processedAt IS NOT NULL
  activeEntitlementCount: number // deactivatedAt IS NULL
}
```

Full response shape:
```typescript
{
  data: ProductListItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}
```

Implementation: `db.product.findMany` with `include: { checkoutSessions: true, entitlements: true }`. Compute aggregates in JS:
- `totalRevenueUsd`: `sessions.filter(s => s.processedAt !== null).reduce((sum, s) => sum + (s.amountTotal ?? 0), 0) / 100`
- `purchaseCount`: `sessions.filter(s => s.processedAt !== null).length`
- `activeEntitlementCount`: `entitlements.filter(e => e.deactivatedAt === null).length`

### 3b. `GET /admin/products/:slug`

Product detail with summary metrics. Same fields as list item. Returns 404 (`AppError("NOT_FOUND", ..., 404)`) if slug not found.

### 3c. `GET /admin/products/:slug/sales`

Time-series chart data for a product.

Query param: `?granularity=daily|weekly|monthly` (default `monthly`).

Fetches all processed `CheckoutSession` rows for the product (where `processedAt IS NOT NULL`), then groups in JS:
- `daily`: last 30 days, grouped by `YYYY-MM-DD`
- `weekly`: last 12 weeks, grouped by ISO week `YYYY-WNN`
- `monthly`: last 12 months, grouped by `YYYY-MM`

Response:
```typescript
{
  granularity: "daily" | "weekly" | "monthly"
  data: {
    period: string        // "2026-04-01" | "2026-W15" | "2026-04"
    revenueUsd: number
    purchaseCount: number
  }[]
}
```

Periods with no purchases are included with `revenueUsd: 0` and `purchaseCount: 0` (filled in JS after grouping).

Returns 404 if product slug not found.

---

## 4. `mvp_admin` UI

### 4a. Sidebar update

Add **Products** to `BASE_NAV` between Customers and the admin-only Users entry.

```
Dashboard   (ADMIN + OPS)
Customers   (ADMIN + OPS)
Products    (ADMIN + OPS)   ← new
Users       (ADMIN only)
```

Import `Package` icon from `lucide-react`.

### 4b. Route tree additions

```
apps/mvp_admin/app/(admin)/
  products/
    page.tsx                        ← Products list (paginated table)
    _components/
      products-page-client.tsx      ← table client component
    [slug]/
      page.tsx                      ← Product detail (summary card + chart)
      _components/
        product-detail-client.tsx   ← summary card + chart client component
```

### 4c. Products list page

**File:** `app/(admin)/products/page.tsx`

Server component. Auth check: redirect to `/dashboard` if not ADMIN or OPS. Exports `dynamic = "force-dynamic"`.

Renders `<ProductsPageClient />`.

**File:** `app/(admin)/products/_components/products-page-client.tsx`

Client component. Uses `useAdminProducts({ page, pageSize: 20 })` hook. Reads `?page=` from `useSearchParams`.

Table columns:
| Column | Notes |
|---|---|
| Product | Name (bold) + slug below in muted text |
| Price | `$X.XX` or "Free" if `isFree` |
| Total Revenue | `$X.XX` USD |
| Purchases | `purchaseCount` |
| Active Entitlements | `activeEntitlementCount` |
| Status | `ACTIVE` green badge / `INACTIVE` outline badge based on `active` field |

Row is clickable → `/products/:slug`.

Pagination controls shown when `totalPages > 1`.

### 4d. Product detail page

**File:** `app/(admin)/products/[slug]/page.tsx`

Server component. Auth check: redirect to `/dashboard` if not ADMIN or OPS. Exports `dynamic = "force-dynamic"`. Reads `granularity` from `searchParams` (default `monthly`).

Passes `slug` and `granularity` to `<ProductDetailClient />`.

**File:** `app/(admin)/products/[slug]/_components/product-detail-client.tsx`

Client component. Uses `useAdminProduct(slug)` and `useAdminProductSales(slug, granularity)`.

Layout:
1. **Back link** → `/products`
2. **Summary card** — product name, slug (muted), price, status badge, plus three stat boxes: Total Revenue (`$X.XX`), Total Purchases (count), Active Entitlements (count)
3. **Sales chart section:**
   - Granularity toggle: **Daily** / **Weekly** / **Monthly** buttons — navigate to `?granularity=daily|weekly|monthly` (Link-based, triggers server re-render and re-fetch)
   - `ComposedChart` from recharts wrapped in shadcn `ChartContainer`:
     - `Bar` series: `revenueUsd` — left Y-axis, USD
     - `Line` series: `purchaseCount` — right Y-axis, count
     - `XAxis`: `period` labels
     - `YAxis` (left): revenue in USD (`$` prefix)
     - `YAxis` (right): purchase count
     - `ChartTooltip` showing both values on hover
     - `Legend` labelling Revenue and Purchases

### 4e. New types in `lib/api.ts`

```typescript
export type ProductListItem = {
  slug: string
  name: string
  priceAmount: number
  priceCurrency: string
  calculations: number
  active: boolean
  isFree: boolean
  totalRevenueUsd: number
  purchaseCount: number
  activeEntitlementCount: number
}

export type AdminProductsResponse = {
  data: ProductListItem[]
  pagination: PaginationMeta
}

export type SalesDataPoint = {
  period: string
  revenueUsd: number
  purchaseCount: number
}

export type ProductSalesResponse = {
  granularity: "daily" | "weekly" | "monthly"
  data: SalesDataPoint[]
}
```

### 4f. New hooks in `lib/hooks/use-admin-products.ts`

```typescript
useAdminProducts(params: { page: number; pageSize: number }): useQuery<AdminProductsResponse>
useAdminProduct(slug: string): useQuery<ProductListItem>
useAdminProductSales(slug: string, granularity: "daily" | "weekly" | "monthly"): useQuery<ProductSalesResponse>
```

---

## 5. Testing

- `product.service.test.ts`: unit tests for `listProducts`, `getProduct`, `getProductSales` — revenue aggregation (null-safe), purchase count (processedAt filter), period grouping (daily/weekly/monthly), 404 for unknown slug
- `product.routes.test.ts`: integration tests for all three routes — OPS role access, 404 for unknown slug, `granularity` param handling, pagination
- UI: no render tests for chart (recharts doesn't render in jsdom); render tests for summary card and table

---

## 6. Out of scope (this spike)

- Editing product details (name, price, active status) — read-only
- Date range picker on the chart — fixed windows only (30 days / 12 weeks / 12 months)
- Per-customer purchase list on the product detail page — visible on Customer detail page (Spike A)
- Revenue by feature / usage analytics
- Export to CSV
