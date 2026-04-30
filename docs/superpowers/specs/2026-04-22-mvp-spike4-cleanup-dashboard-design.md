# MVP Spike 4: Cleanup + Dashboard App — Design Spec

**Date:** 2026-04-22  
**Spike:** 4 — Cleanup + Dashboard App  
**Spike plan:** [docs/initiatives/mvp-spike-plan.md](../../initiatives/mvp-spike-plan.md)  
**Status:** Approved

---

## Overview

Spike 4 has two independent parts:

- **Part A** — Remove Phase 2 / "coming soon" / "preliminary" references from `apps/mvp_web`
- **Part B** — Scaffold `apps/mvp_dashboard` — a new Clerk-authenticated Next.js 16 app deployed to `dashboard.solarlayout.in`

No new packages are created in this spike. `packages/mvp_api-client` and `packages/mvp_shared` are deferred to Spike 5 when the API surface justifies them.

---

## Part A: Website Cleanup (`apps/mvp_web`)

### Scope

Six targeted edits across six files. No new files. Screenshot "coming soon" placeholders in `screenshots-section.tsx` are intentional and left untouched.

### Changes

| File | Change |
|---|---|
| `app/terms/page.tsx` | Remove yellow "preliminary and subject to legal review" banner |
| `app/privacy/page.tsx` | Remove yellow "preliminary and subject to legal review" banner |
| `components/pricing-cards.tsx` | Remove `<Tooltip>` wrapper and "Payment coming soon" tooltip text from Buy Now buttons; keep buttons disabled but plain; replace bottom callout "Phase 2" sentence with "Top up anytime at the same rate." |
| `components/system-requirements.tsx` | Remove "(Phase 2)" parenthetical from internet connectivity note |
| `components/faq-accordion.tsx` | Rewrite three FAQ answers that reference "Phase 2" or "coming soon" to accurate present-tense; remove forward-looking language |
| Tests | Update `app/terms/page.test.tsx`, `app/privacy/page.test.tsx`, `app/pricing/page.test.tsx` to remove assertions that relied on removed content |

### Pricing page buttons

Buy Now buttons remain disabled for now. They will be wired end-to-end only after Stripe is fully integrated in Spike 5 and the purchase flow is decided. No CTA or redirect is added in Spike 4.

---

## Part B: Dashboard App (`apps/mvp_dashboard`)

### Architecture decision

Independent Next.js 16 app — copy-and-adapt pattern from `apps/web`. No shared shell package. Solar palette reused from `packages/ui` CSS variable overrides (already established in `apps/mvp_web`). No cross-app coupling.

### App structure

```
apps/mvp_dashboard/
  app/
    layout.tsx                    ← ClerkProvider → ThemeProvider → QueryProvider → TooltipProvider
    sign-in/[[...sign-in]]/
      page.tsx                    ← Clerk <SignIn /> centered page
    sign-up/[[...sign-up]]/
      page.tsx                    ← Clerk <SignUp /> centered page
    (main)/
      layout.tsx                  ← SidebarProvider + DashboardSidebar + SidebarInset + breadcrumb header
      page.tsx                    ← Dashboard home: welcome + 3 download cards
      plan/
        page.tsx                  ← Coming-soon placeholder card
      usage/
        page.tsx                  ← Coming-soon placeholder card
      license/
        page.tsx                  ← Coming-soon placeholder card
  components/
    dashboard-sidebar.tsx         ← Sidebar with nav items + NavUser footer
    theme-provider.tsx            ← next-themes dark/light
    query-provider.tsx            ← TanStack Query v5
    download-card.tsx             ← Product download card
  middleware.ts                   ← Clerk middleware — protects (main) routes
  package.json
  next.config.ts
  tsconfig.json
  vitest.config.ts
  vitest.setup.ts
```

### Provider stack

`ClerkProvider → ThemeProvider → QueryProvider → TooltipProvider`

Same order as `apps/web`. All providers in root `layout.tsx` — no duplicate providers in nested layouts.

### Sidebar

Built with `packages/ui` shadcn sidebar primitives (same components used in `apps/web`).

**Nav items:**

| Label | Icon | Route |
|---|---|---|
| Dashboard | `LayoutDashboard` | `/` |
| Plan | `CreditCard` | `/plan` |
| Usage | `BarChart3` | `/usage` |
| License | `Key` | `/license` |

**Sidebar footer:** `NavUser` component — Clerk user avatar, name, email, sign-out. Skeleton loading state while Clerk resolves (same pattern as `apps/web`).

**Collapsible:** `collapsible="icon"` mode with `SidebarRail`.

**Theme toggle:** `d` key toggles dark/light (same as `apps/web`), skipped when input/textarea focused.

### Dashboard home page (`(main)/page.tsx`)

Welcome heading + three `DownloadCard` components in a responsive grid (1 col mobile → 3 col desktop).

Each `DownloadCard` displays:
- Product name
- Price + calculation count
- **Download** button

On button click:
1. Button shows spinner (loading state)
2. Calls `GET /api/dashboard/download/:product` on `apps/mvp_api` with Clerk JWT
3. Receives `{ url: string }` — presigned S3 URL (60s expiry)
4. Triggers browser download
5. On error: Sonner error toast

Product slugs: `pv-layout-basic`, `pv-layout-pro`, `pv-layout-pro-plus`

Base URL from env var `NEXT_PUBLIC_MVP_API_URL` (already set in Vercel for `mvp_web`, added for `mvp_dashboard`).

### Plan / Usage / License pages

Each page renders its title + a single placeholder card with a "Coming soon" message and a note that the feature will be available after purchase. No data fetching in Spike 4.

### Middleware

`middleware.ts` protects all routes under `(main)`. Unauthenticated users are redirected to `/sign-in`. Signed-in users visiting `/sign-in` or `/sign-up` are redirected to `/`.

---

## New API Route: `GET /dashboard/download/:product`

**App:** `apps/mvp_api`  
**Auth:** Clerk JWT (same middleware pattern as `apps/api` uses for Clerk routes)

**Logic:**
1. Validate `:product` — must be one of `pv-layout-basic`, `pv-layout-pro`, `pv-layout-pro-plus`. Return 400 otherwise.
2. Call AWS S3 `GetObjectCommand` + `getSignedUrl` for `downloads/<product>.exe`, expiry 60 seconds.
3. Return `{ url: string }`.

**Unauthenticated:** 401.

No DB involvement — direct S3 presigned URL generation.

---

## Prisma Models (`packages/mvp_db`)

Three new models added to the existing schema. One migration. Tables start empty — populated in Spike 5 after Stripe purchase flow.

```prisma
model User {
  id           String        @id @default(cuid())
  clerkId      String        @unique
  email        String        @unique
  name         String?
  createdAt    DateTime      @default(now())
  licenseKeys  LicenseKey[]
  entitlements Entitlement[]
}

model LicenseKey {
  id        String    @id @default(cuid())
  key       String    @unique  // format: sl_live_<random>
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  product   String    // pv-layout-basic | pv-layout-pro | pv-layout-pro-plus
  createdAt DateTime  @default(now())
  revokedAt DateTime?
}

model Entitlement {
  id                 String   @id @default(cuid())
  userId             String
  user               User     @relation(fields: [userId], references: [id])
  product            String
  totalCalculations  Int
  usedCalculations   Int      @default(0)
  purchasedAt        DateTime @default(now())
}
```

`User` records are upserted by `clerkId` on first dashboard sign-in (Spike 5). Schema is forward-compatible: `LicenseKey` and `Entitlement` rows are created in Spike 5/6.

---

## Testing

### Part A — updated tests only

- `app/terms/page.test.tsx` — remove "preliminary notice" assertion; assert banner is absent
- `app/privacy/page.test.tsx` — same
- `app/pricing/page.test.tsx` — remove "disabled Buy Now" tooltip assertion; assert buttons are disabled but no tooltip wrapper

### Part B — new tests

**`apps/mvp_dashboard`** (Vitest + React Testing Library + jsdom):

| File | What it tests |
|---|---|
| `components/download-card.test.tsx` | Renders product name/price; triggers fetch on click; shows spinner during load; shows error toast on failure |
| `app/(main)/page.test.tsx` | Renders three download cards |
| `app/(main)/plan/page.test.tsx` | Renders placeholder card |
| `app/(main)/usage/page.test.tsx` | Renders placeholder card |
| `app/(main)/license/page.test.tsx` | Renders placeholder card |
| `components/dashboard-sidebar.test.tsx` | Renders all four nav items |

**`apps/mvp_api`** (Bun test):

| File | What it tests |
|---|---|
| `routes/dashboard/download.test.ts` | Valid product → 200 + URL; invalid product → 400; unauthenticated → 401 |

Clerk mocked with `vi.mock` / bun mock equivalents. No real HTTP or S3 calls in unit tests.

---

## Spike Plan Updates

The following changes to `docs/initiatives/mvp-spike-plan.md` are made as part of this spike:

1. **Spike 4 scope updated** — add Dashboard home page with three download cards; add `GET /dashboard/download/:product` to `apps/mvp_api`; note `mvp_api-client` deferred to Spike 5
2. **Architecture section updated** — add `apps/mvp_dashboard` entry
3. **Decisions log** — add D20: Dashboard home page direct download (presigned S3, no registration form, Clerk-authenticated)

---

## Deployment

New Vercel project for `apps/mvp_dashboard`:
- Domain: `dashboard.solarlayout.in`
- Env vars needed: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_MVP_API_URL=https://api.solarlayout.in`
- Same AWS region (ap-south-1), same RDS instance, same S3 bucket as `apps/mvp_api`

New Clerk app (separate from `apps/web` Clerk app):
- User provides Clerk publishable + secret keys for local dev and production
- Dashboard Clerk app: `dashboard.solarlayout.in` as allowed origin

---

## Definition of Done

Per spike plan protocol — all five conditions must be confirmed in order:

1. `bun run lint && bun run typecheck && bun run test && bun run build` pass from repo root
2. Human verifies locally: no Phase 2 refs on `localhost:3002`; dashboard sign-up/sign-in works at `localhost:3003`; download buttons trigger file download; sidebar nav works
3. CI/CD passes
4. Production verification: `solarlayout.in` clean; `dashboard.solarlayout.in` sign-up + download works
5. Human sign-off
