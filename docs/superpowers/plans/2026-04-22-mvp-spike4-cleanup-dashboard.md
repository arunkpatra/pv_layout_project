# MVP Spike 4: Cleanup + Dashboard App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Phase 2 / "coming soon" language from `apps/mvp_web`, then scaffold `apps/mvp_dashboard` — a Clerk-authenticated Next.js 16 app at `dashboard.solarlayout.in` with sidebar nav (Dashboard, Plan, Usage, License), solar palette dark/light theme, and direct S3 download for the three products.

**Architecture:** Independent Next.js 16 app (`apps/mvp_dashboard`) copying provider/sidebar patterns from `apps/web`. Solar palette already in `packages/ui`. Clerk-authenticated download route added to `apps/mvp_api` (`GET /dashboard/download/:product`). Three new Prisma models added to `packages/mvp_db` (User, LicenseKey, Entitlement) — empty tables, populated in Spike 5.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, `@clerk/nextjs` v7, TanStack Query v5, `@clerk/backend` for JWT verification in Hono, Vitest + React Testing Library, `packages/ui` shadcn primitives, `packages/mvp_db` Prisma client.

---

## File Map

### Modified files — `apps/mvp_web`
- `components/faq-accordion.tsx` — remove 3 "Phase 2 / coming soon" FAQ answers
- `components/system-requirements.tsx` — remove "(Phase 2)" from internet row
- `components/pricing-cards.tsx` — remove Tooltip wrapper + "Payment coming soon"; update bottom callout
- `app/terms/page.tsx` — remove yellow "preliminary" banner
- `app/privacy/page.tsx` — remove yellow "preliminary" banner
- `app/pricing/page.test.tsx` — remove tooltip assertion; keep disabled-button assertion
- `app/terms/page.test.tsx` — remove "preliminary notice" assertion
- `app/privacy/page.test.tsx` — remove "preliminary notice" assertion

### Modified files — `packages/mvp_db`
- `prisma/schema.prisma` — add User, LicenseKey, Entitlement models
- (migration created by `bun run mvp-db:migrate`)

### Modified files — `apps/mvp_api`
- `src/env.ts` — add `MVP_CLERK_SECRET_KEY`, expand `MVP_CORS_ORIGINS` default
- `src/app.ts` — register dashboardRoutes; expand CORS default to include dashboard origin
- `src/middleware/clerk-auth.ts` — **new** Hono middleware: verify Clerk JWT
- `src/modules/dashboard/dashboard.routes.ts` — **new** `GET /dashboard/download/:product`
- `src/modules/dashboard/dashboard.routes.test.ts` — **new** tests

### New app — `apps/mvp_dashboard`
- `package.json`
- `tsconfig.json`
- `next.config.mjs`
- `vitest.config.ts`
- `vitest.setup.ts`
- `.env.local` (gitignored — created manually, not committed)
- `app/layout.tsx` — ClerkProvider → ThemeProvider → QueryProvider → TooltipProvider
- `app/sign-in/[[...sign-in]]/page.tsx`
- `app/sign-up/[[...sign-up]]/page.tsx`
- `app/(main)/layout.tsx` — SidebarProvider + DashboardSidebar + SidebarInset
- `app/(main)/page.tsx` — Dashboard home: welcome + 3 DownloadCards
- `app/(main)/plan/page.tsx` — placeholder card
- `app/(main)/usage/page.tsx` — placeholder card
- `app/(main)/license/page.tsx` — placeholder card
- `middleware.ts` — Clerk route protection
- `components/theme-provider.tsx`
- `components/query-provider.tsx`
- `components/dashboard-sidebar.tsx`
- `components/download-card.tsx`
- `components/dashboard-sidebar.test.tsx`
- `components/download-card.test.tsx`
- `app/(main)/page.test.tsx`
- `app/(main)/plan/page.test.tsx`
- `app/(main)/usage/page.test.tsx`
- `app/(main)/license/page.test.tsx`

### Modified — repo root
- `turbo.json` — add `@renewable-energy/mvp-dashboard#build` and `#typecheck` entries
- `package.json` (root) — add `apps/mvp_dashboard` to workspaces if using explicit list (check)
- `docs/initiatives/mvp-spike-plan.md` — update Spike 4 status, architecture, decisions log

---

## Task 1: Part A — Clean up `apps/mvp_web` content

**Files:**
- Modify: `apps/mvp_web/components/faq-accordion.tsx`
- Modify: `apps/mvp_web/components/system-requirements.tsx`
- Modify: `apps/mvp_web/components/pricing-cards.tsx`
- Modify: `apps/mvp_web/app/terms/page.tsx`
- Modify: `apps/mvp_web/app/privacy/page.tsx`

- [ ] **Step 1: Update `faq-accordion.tsx` — rewrite three answers**

In `apps/mvp_web/components/faq-accordion.tsx`, update three answers inside `faqData`:

```ts
// "Does it work offline?" answer (line 45) — change to:
answer:
  "The layout calculation runs entirely on your machine. An internet connection is required for licence validation.",

// "How do I purchase?" answer (line 103) — change to:
answer:
  "Sign up at dashboard.solarlayout.in to purchase a plan and get your licence key.",

// "Will I receive a receipt?" answer (line 112) — change to:
answer:
  "Yes, a confirmation email is sent after purchase.",
```

Also update the `"What payment methods?"` answer to remove the "To be announced" wording:
```ts
// line 107
answer: "We accept major credit and debit cards via Stripe.",
```

- [ ] **Step 2: Update `system-requirements.tsx` — remove "(Phase 2)"**

In `apps/mvp_web/components/system-requirements.tsx`, update the Internet Connection row (line 24):

```ts
{
  requirement: "Internet Connection",
  details: "Required for licence validation",
},
```

- [ ] **Step 3: Update `pricing-cards.tsx` — remove tooltip, update callout**

Replace the entire `<CardContent>` section for each tier card (removes the `<TooltipProvider>` wrapper):

```tsx
<CardContent className="flex flex-1 flex-col justify-end">
  <Button
    variant="outline"
    className="w-full cursor-not-allowed opacity-60"
    disabled
  >
    Buy Now
  </Button>
</CardContent>
```

Also remove the `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` imports from the top of the file (lines 13-18).

Replace the bottom callout (last `<div>` in the return, currently says "Phase 2"):

```tsx
<div className="rounded-lg border border-border bg-card p-6 text-center">
  <p className="text-muted-foreground">
    <strong className="text-foreground">Need more calculations?</strong>{" "}
    Top up anytime at the same rate.
  </p>
</div>
```

- [ ] **Step 4: Remove "preliminary" banners from terms and privacy pages**

In `apps/mvp_web/app/terms/page.tsx`, delete the entire `<p>` block (lines 21-24):
```tsx
// DELETE this block:
<p className="mt-6 rounded-md border border-yellow-400/40 bg-yellow-50/60 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-950/30 dark:text-yellow-200">
  These terms are preliminary and subject to legal review.
</p>
```

In `apps/mvp_web/app/privacy/page.tsx`, delete the equivalent block (lines 22-25):
```tsx
// DELETE this block:
<p className="mt-6 rounded-md border border-yellow-400/40 bg-yellow-50/60 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-950/30 dark:text-yellow-200">
  This privacy policy is preliminary and subject to legal review.
</p>
```

- [ ] **Step 5: Run gates — should pass**

```bash
cd /path/to/repo
bunx turbo lint --filter=@renewable-energy/mvp-web
bunx turbo typecheck --filter=@renewable-energy/mvp-web
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: tests will FAIL at this point (existing tests assert presence of removed content). Proceed to Task 2.

---

## Task 2: Part A — Update `apps/mvp_web` tests

**Files:**
- Modify: `apps/mvp_web/app/terms/page.test.tsx`
- Modify: `apps/mvp_web/app/privacy/page.test.tsx`
- Modify: `apps/mvp_web/app/pricing/page.test.tsx`

- [ ] **Step 1: Update `terms/page.test.tsx`**

Replace the test `"renders preliminary notice"` (currently asserts the banner exists). The test should now assert the banner is absent:

```tsx
test("does not render preliminary notice banner", () => {
  render(<TermsPage />)
  expect(
    screen.queryByText(/preliminary and subject to legal review/i)
  ).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Update `privacy/page.test.tsx`**

Same change — replace the test `"renders preliminary notice"`:

```tsx
test("does not render preliminary notice banner", () => {
  render(<PrivacyPage />)
  expect(
    screen.queryByText(/preliminary and subject to legal review/i)
  ).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Update `pricing/page.test.tsx`**

Replace the test `"renders disabled Buy Now buttons"` — remove the tooltip assertion. Keep the disabled-button assertion:

```tsx
test("renders disabled Buy Now buttons without tooltip", () => {
  render(<PricingPage />)
  const buyButtons = screen.getAllByRole("button", { name: /Buy Now/i })
  expect(buyButtons.length).toBeGreaterThanOrEqual(3)
  const disabledButtons = buyButtons.filter(
    (btn) =>
      btn.hasAttribute("disabled") ||
      btn.getAttribute("aria-disabled") === "true"
  )
  expect(disabledButtons.length).toBeGreaterThanOrEqual(3)
  expect(screen.queryByText(/Payment coming soon/i)).not.toBeInTheDocument()
})
```

Also update the `"renders top-up note"` test — the new text no longer says "Phase 2":

```tsx
test("renders top-up note", () => {
  render(<PricingPage />)
  expect(
    screen.getAllByText(/Need more calculations/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(screen.queryByText(/Phase 2/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 4: Run tests — should pass now**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: all tests pass.

- [ ] **Step 5: Commit Part A**

```bash
git add apps/mvp_web/components/faq-accordion.tsx \
        apps/mvp_web/components/system-requirements.tsx \
        apps/mvp_web/components/pricing-cards.tsx \
        apps/mvp_web/app/terms/page.tsx \
        apps/mvp_web/app/privacy/page.tsx \
        apps/mvp_web/app/terms/page.test.tsx \
        apps/mvp_web/app/privacy/page.test.tsx \
        apps/mvp_web/app/pricing/page.test.tsx
git commit -m "feat(mvp-web): remove Phase 2 / coming-soon / preliminary references"
```

---

## Task 3: Add Prisma models to `packages/mvp_db`

**Files:**
- Modify: `packages/mvp_db/prisma/schema.prisma`
- Creates: new migration file (auto-generated)

- [ ] **Step 1: Add three new models to `schema.prisma`**

Append to `packages/mvp_db/prisma/schema.prisma`:

```prisma
model User {
  id           String        @id @default("")
  clerkId      String        @unique
  email        String        @unique
  name         String?
  createdAt    DateTime      @default(now())
  licenseKeys  LicenseKey[]
  entitlements Entitlement[]

  @@map("users")
}

model LicenseKey {
  id        String    @id @default("")
  key       String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  product   String
  createdAt DateTime  @default(now())
  revokedAt DateTime?

  @@map("license_keys")
}

model Entitlement {
  id                String   @id @default("")
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  product           String
  totalCalculations Int
  usedCalculations  Int      @default(0)
  purchasedAt       DateTime @default(now())

  @@map("entitlements")
}
```

Note: `@id @default("")` is the pattern used in this codebase — the semantic ID extension generates the actual ID value at runtime.

- [ ] **Step 2: Run the migration (local — requires MVP DB running)**

```bash
# From repo root
bun run mvp-db:migrate
```

When prompted for a migration name, enter: `add_user_license_entitlement`

Expected output includes: `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
bun run mvp-db:generate
```

- [ ] **Step 4: Rebuild packages/mvp_db**

```bash
bunx turbo build --filter=@renewable-energy/mvp-db
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/mvp_db/prisma/schema.prisma \
        packages/mvp_db/prisma/migrations/
git commit -m "feat(mvp-db): add User, LicenseKey, Entitlement models"
```

---

## Task 4: Add Clerk JWT middleware to `apps/mvp_api`

**Files:**
- Modify: `apps/mvp_api/src/env.ts`
- Create: `apps/mvp_api/src/middleware/clerk-auth.ts`
- Create: `apps/mvp_api/src/middleware/clerk-auth.test.ts`

The dashboard download route must verify Clerk JWTs. The MVP dashboard uses a **separate Clerk app** from the cloud platform — env var is `MVP_CLERK_SECRET_KEY`.

- [ ] **Step 1: Write the failing test for Clerk auth middleware**

Create `apps/mvp_api/src/middleware/clerk-auth.test.ts`:

```ts
import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Hono } from "hono"

// Mock @clerk/backend before importing the middleware
const mockVerifyToken = mock(async (_token: string) => ({ sub: "user_abc" }))
mock.module("@clerk/backend", () => ({
  createClerkClient: () => ({
    verifyToken: mockVerifyToken,
  }),
}))

// Import after mock is set up
const { clerkAuth } = await import("./clerk-auth.js")

function makeApp() {
  const app = new Hono()
  app.use("/protected", clerkAuth)
  app.get("/protected", (c) => c.json({ ok: true }))
  return app
}

describe("clerkAuth middleware", () => {
  beforeEach(() => {
    mockVerifyToken.mockReset()
    mockVerifyToken.mockImplementation(async () => ({ sub: "user_abc" }))
  })

  it("returns 401 when Authorization header is missing", async () => {
    const app = makeApp()
    const res = await app.request("/protected", { method: "GET" })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it("returns 401 when token is invalid", async () => {
    mockVerifyToken.mockImplementation(async () => {
      throw new Error("invalid token")
    })
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer bad-token" },
    })
    expect(res.status).toBe(401)
  })

  it("passes through when token is valid", async () => {
    const app = makeApp()
    const res = await app.request("/protected", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd apps/mvp_api && bun test src/middleware/clerk-auth.test.ts
```

Expected: FAIL (module not found or import error).

- [ ] **Step 3: Add `@clerk/backend` to `apps/mvp_api` dependencies**

In `apps/mvp_api/package.json`, add to `"dependencies"`:

```json
"@clerk/backend": "^1.0.0"
```

Then install:

```bash
cd /path/to/repo && bun install
```

- [ ] **Step 4: Add `MVP_CLERK_SECRET_KEY` to `apps/mvp_api/src/env.ts`**

Add to the `EnvSchema` object:

```ts
// Clerk — used to verify dashboard JWT tokens
MVP_CLERK_SECRET_KEY: z.string().optional(),
```

- [ ] **Step 5: Create `apps/mvp_api/src/middleware/clerk-auth.ts`**

```ts
import { createClerkClient } from "@clerk/backend"
import type { MiddlewareHandler } from "hono"
import { env } from "../env.js"
import { AppError } from "../lib/errors.js"

const clerk = createClerkClient({
  secretKey: env.MVP_CLERK_SECRET_KEY ?? "",
})

export const clerkAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined

  if (!token) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401)
  }

  try {
    await clerk.verifyToken(token)
  } catch {
    throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401)
  }

  await next()
}
```

- [ ] **Step 6: Run the test — expect it to pass**

```bash
cd apps/mvp_api && bun test src/middleware/clerk-auth.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_api/src/env.ts \
        apps/mvp_api/src/middleware/clerk-auth.ts \
        apps/mvp_api/src/middleware/clerk-auth.test.ts \
        apps/mvp_api/package.json \
        bun.lock
git commit -m "feat(mvp-api): add Clerk JWT auth middleware for dashboard routes"
```

---

## Task 5: Add dashboard download route to `apps/mvp_api`

**Files:**
- Create: `apps/mvp_api/src/modules/dashboard/dashboard.routes.ts`
- Create: `apps/mvp_api/src/modules/dashboard/dashboard.routes.test.ts`
- Modify: `apps/mvp_api/src/app.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mvp_api/src/modules/dashboard/dashboard.routes.test.ts`:

```ts
import { describe, expect, it, mock, beforeEach } from "bun:test"

// Mock Clerk auth to pass by default
mock.module("../../middleware/clerk-auth.js", () => ({
  clerkAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}))

// Mock S3 presigned URL helper
const mockGetPresignedDownloadUrl = mock(
  async (_key: string, _filename: string, _expiresIn: number) =>
    "https://s3.example.com/presigned-url"
)
mock.module("../../lib/s3.js", () => ({
  getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
}))

const { dashboardRoutes } = await import("./dashboard.routes.js")
import { Hono } from "hono"
import { errorHandler } from "../../middleware/error-handler.js"

function makeApp() {
  const app = new Hono()
  app.route("/", dashboardRoutes)
  app.onError(errorHandler)
  return app
}

describe("GET /dashboard/download/:product", () => {
  beforeEach(() => {
    mockGetPresignedDownloadUrl.mockReset()
    mockGetPresignedDownloadUrl.mockImplementation(async () => "https://s3.example.com/presigned-url")
  })

  it("returns 200 with url for valid product", async () => {
    const app = makeApp()
    const res = await app.request("/dashboard/download/pv-layout-basic", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; data: { url: string } }
    expect(body.success).toBe(true)
    expect(body.data.url).toContain("s3.example.com")
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      "downloads/pv-layout-basic.exe",
      "pv-layout-basic.exe",
      60
    )
  })

  it("returns 200 for pv-layout-pro", async () => {
    const app = makeApp()
    const res = await app.request("/dashboard/download/pv-layout-pro", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; data: { url: string } }
    expect(body.success).toBe(true)
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      "downloads/pv-layout-pro.exe",
      "pv-layout-pro.exe",
      60
    )
  })

  it("returns 400 for invalid product slug", async () => {
    const app = makeApp()
    const res = await app.request("/dashboard/download/nonexistent-product", {
      method: "GET",
      headers: { Authorization: "Bearer valid-token" },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it("returns 401 when unauthenticated (Clerk middleware blocks)", async () => {
    // Override clerkAuth mock to reject
    mock.module("../../middleware/clerk-auth.js", () => ({
      clerkAuth: async () => {
        throw new (await import("../../lib/errors.js")).AppError(
          "UNAUTHORIZED",
          "Authentication required",
          401
        )
      },
    }))
    const { dashboardRoutes: routes } = await import("./dashboard.routes.js")
    const app = new Hono()
    app.route("/", routes)
    app.onError(errorHandler)

    const res = await app.request("/dashboard/download/pv-layout-basic", {
      method: "GET",
    })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd apps/mvp_api && bun test src/modules/dashboard/dashboard.routes.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create `apps/mvp_api/src/modules/dashboard/dashboard.routes.ts`**

```ts
import { Hono } from "hono"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { getPresignedDownloadUrl } from "../../lib/s3.js"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

const VALID_PRODUCTS = [
  "pv-layout-basic",
  "pv-layout-pro",
  "pv-layout-pro-plus",
] as const

type ProductSlug = (typeof VALID_PRODUCTS)[number]

const PRODUCT_S3_KEYS: Record<ProductSlug, string> = {
  "pv-layout-basic": "downloads/pv-layout-basic.exe",
  "pv-layout-pro": "downloads/pv-layout-pro.exe",
  "pv-layout-pro-plus": "downloads/pv-layout-pro-plus.exe",
}

const PRODUCT_FILENAMES: Record<ProductSlug, string> = {
  "pv-layout-basic": "pv-layout-basic.exe",
  "pv-layout-pro": "pv-layout-pro.exe",
  "pv-layout-pro-plus": "pv-layout-pro-plus.exe",
}

function isValidProduct(slug: string): slug is ProductSlug {
  return (VALID_PRODUCTS as readonly string[]).includes(slug)
}

export const dashboardRoutes = new Hono<MvpHonoEnv>()

// All /dashboard/* routes require Clerk authentication
dashboardRoutes.use("/dashboard/*", clerkAuth)

// GET /dashboard/download/:product
dashboardRoutes.get("/dashboard/download/:product", async (c) => {
  const product = c.req.param("product")

  if (!isValidProduct(product)) {
    throw new ValidationError({
      product: [
        `Invalid product. Must be one of: ${VALID_PRODUCTS.join(", ")}`,
      ],
    })
  }

  const s3Key = PRODUCT_S3_KEYS[product]
  const filename = PRODUCT_FILENAMES[product]
  const url = await getPresignedDownloadUrl(s3Key, filename, 60)

  if (!url) {
    throw new Error("S3 not configured — cannot generate download URL")
  }

  return c.json(ok({ url }))
})
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
cd apps/mvp_api && bun test src/modules/dashboard/dashboard.routes.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Register dashboardRoutes in `apps/mvp_api/src/app.ts`**

Add the import at the top with the other route imports:

```ts
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js"
```

Add `"http://localhost:3004"` to the CORS default origins (line 19):

```ts
: ["http://localhost:3002", "http://localhost:3004"] // mvp_web and mvp_dashboard dev defaults
```

Register the route (after the existing `app.route("/", contactRoutes)` line):

```ts
app.route("/", dashboardRoutes)
```

- [ ] **Step 6: Run all mvp_api tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-api
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_api/src/modules/dashboard/ \
        apps/mvp_api/src/app.ts
git commit -m "feat(mvp-api): add GET /dashboard/download/:product with Clerk auth"
```

---

## Task 6: Scaffold `apps/mvp_dashboard` — package and config files

**Files:**
- Create: `apps/mvp_dashboard/package.json`
- Create: `apps/mvp_dashboard/tsconfig.json`
- Create: `apps/mvp_dashboard/next.config.mjs`
- Create: `apps/mvp_dashboard/vitest.config.ts`
- Create: `apps/mvp_dashboard/vitest.setup.ts`
- Create: `apps/mvp_dashboard/.gitignore`

- [ ] **Step 1: Create `apps/mvp_dashboard/package.json`**

```json
{
  "name": "@renewable-energy/mvp-dashboard",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3004",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "format": "prettier --write \"**/*.{ts,tsx}\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@clerk/nextjs": "^7.2.3",
    "@renewable-energy/ui": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-query-devtools": "^5.0.0",
    "lucide-react": "^0.511.0",
    "next": "16.2.4",
    "next-themes": "^0.4.6",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "sonner": "^2.0.0"
  },
  "devDependencies": {
    "@renewable-energy/eslint-config": "workspace:^",
    "@renewable-energy/typescript-config": "workspace:*",
    "@tailwindcss/postcss": "^4.1.18",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^25.1.0",
    "@types/react": "^19.2.10",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^9.39.2",
    "jsdom": "^29.0.2",
    "typescript": "^5.9.3",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 2: Create `apps/mvp_dashboard/tsconfig.json`**

```json
{
  "extends": "@renewable-energy/typescript-config/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@renewable-energy/ui/*": ["../../packages/ui/src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "next-env.d.ts",
    "next.config.mjs",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/mvp_dashboard/next.config.mjs`**

```mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@renewable-energy/ui"],
}

export default nextConfig
```

- [ ] **Step 4: Create `apps/mvp_dashboard/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@renewable-energy/ui": path.resolve(
        __dirname,
        "../../packages/ui/src"
      ),
    },
  },
})
```

- [ ] **Step 5: Create `apps/mvp_dashboard/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest"

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: IntersectionObserverStub,
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverStub,
})

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
```

- [ ] **Step 6: Create `apps/mvp_dashboard/postcss.config.mjs`**

```mjs
export { default } from "@renewable-energy/ui/postcss.config"
```

- [ ] **Step 7: Create `apps/mvp_dashboard/.gitignore`**

```
# Dependencies
node_modules/
.pnp
.pnp.js

# Next.js
.next/
out/

# Build
dist/

# Env files — never commit secrets
.env.local
.env.*.local

# TypeScript
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 8: Install dependencies**

```bash
cd /path/to/repo && bun install
```

Expected: resolves workspace packages including the new `@renewable-energy/mvp-dashboard`.

- [ ] **Step 9: Commit scaffold files**

```bash
git add apps/mvp_dashboard/package.json \
        apps/mvp_dashboard/tsconfig.json \
        apps/mvp_dashboard/next.config.mjs \
        apps/mvp_dashboard/postcss.config.mjs \
        apps/mvp_dashboard/vitest.config.ts \
        apps/mvp_dashboard/vitest.setup.ts \
        apps/mvp_dashboard/.gitignore \
        bun.lock
git commit -m "feat(mvp-dashboard): scaffold package and config files"
```

---

## Task 7: `apps/mvp_dashboard` — providers, layout, auth pages, middleware

**Files:**
- Create: `apps/mvp_dashboard/components/theme-provider.tsx`
- Create: `apps/mvp_dashboard/components/query-provider.tsx`
- Create: `apps/mvp_dashboard/app/layout.tsx`
- Create: `apps/mvp_dashboard/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `apps/mvp_dashboard/app/sign-up/[[...sign-up]]/page.tsx`
- Create: `apps/mvp_dashboard/middleware.ts`

- [ ] **Step 1: Create `apps/mvp_dashboard/components/theme-provider.tsx`**

Copied verbatim from `apps/web/components/theme-provider.tsx`:

```tsx
"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeHotkey />
      {children}
    </NextThemesProvider>
  )
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() !== "d") return
      if (isTypingTarget(event.target)) return
      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider }
```

- [ ] **Step 2: Create `apps/mvp_dashboard/components/query-provider.tsx`**

```tsx
"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { useState } from "react"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV !== "production" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
```

- [ ] **Step 3: Create `apps/mvp_dashboard/app/layout.tsx`**

```tsx
import { Geist } from "next/font/google"
import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"

import "@renewable-energy/ui/globals.css"

import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/components/query-provider"
import { TooltipProvider } from "@renewable-energy/ui/components/tooltip"
import { cn } from "@renewable-energy/ui/lib/utils"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: {
    default: "SolarLayout Dashboard",
    template: "%s | SolarLayout",
  },
  description: "Manage your SolarLayout licence keys, entitlements, and downloads.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html
        lang="en"
        suppressHydrationWarning
        className={cn("antialiased", fontSans.variable, "font-sans")}
      >
        <body>
          <ThemeProvider>
            <QueryProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </QueryProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
```

- [ ] **Step 4: Create `apps/mvp_dashboard/app/sign-in/[[...sign-in]]/page.tsx`**

```tsx
import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn />
    </div>
  )
}
```

- [ ] **Step 5: Create `apps/mvp_dashboard/app/sign-up/[[...sign-up]]/page.tsx`**

```tsx
import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp />
    </div>
  )
}
```

- [ ] **Step 6: Create `apps/mvp_dashboard/middleware.ts`**

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

const isProtectedRoute = createRouteMatcher(["/", "/plan(.*)", "/usage(.*)", "/license(.*)"])
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])

export const middleware = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  if (userId && isAuthRoute(req)) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  if (isProtectedRoute(req)) {
    await auth.protect({ unauthenticatedUrl: new URL("/sign-in", req.url).toString() })
  }
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_dashboard/components/theme-provider.tsx \
        apps/mvp_dashboard/components/query-provider.tsx \
        apps/mvp_dashboard/app/layout.tsx \
        apps/mvp_dashboard/app/sign-in/ \
        apps/mvp_dashboard/app/sign-up/ \
        apps/mvp_dashboard/middleware.ts
git commit -m "feat(mvp-dashboard): add providers, root layout, sign-in/up pages, middleware"
```

---

## Task 8: `apps/mvp_dashboard` — sidebar component

**Files:**
- Create: `apps/mvp_dashboard/components/dashboard-sidebar.tsx`
- Create: `apps/mvp_dashboard/components/dashboard-sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mvp_dashboard/components/dashboard-sidebar.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      fullName: "Test User",
      primaryEmailAddress: { emailAddress: "test@example.com" },
      imageUrl: undefined,
    },
  }),
  useClerk: () => ({ signOut: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}))

import { DashboardSidebar } from "./dashboard-sidebar"
import {
  SidebarProvider,
} from "@renewable-energy/ui/components/sidebar"

function Wrapper({ children }: { children: React.ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>
}

describe("DashboardSidebar", () => {
  it("renders all four nav items", () => {
    render(<DashboardSidebar />, { wrapper: Wrapper })
    expect(screen.getByText("Dashboard")).toBeInTheDocument()
    expect(screen.getByText("Plan")).toBeInTheDocument()
    expect(screen.getByText("Usage")).toBeInTheDocument()
    expect(screen.getByText("License")).toBeInTheDocument()
  })

  it("renders user name and email", () => {
    render(<DashboardSidebar />, { wrapper: Wrapper })
    expect(screen.getByText("Test User")).toBeInTheDocument()
    expect(screen.getByText("test@example.com")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd apps/mvp_dashboard && bunx vitest run components/dashboard-sidebar.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create `apps/mvp_dashboard/components/dashboard-sidebar.tsx`**

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  Key,
  ChevronsUpDown,
  LogOut,
} from "lucide-react"
import { useUser, useClerk } from "@clerk/nextjs"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@renewable-energy/ui/components/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@renewable-energy/ui/components/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@renewable-energy/ui/components/avatar"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Plan", href: "/plan", icon: CreditCard },
  { title: "Usage", href: "/usage", icon: BarChart3 },
  { title: "License", href: "/license", icon: Key },
]

function NavUser({
  user,
}: {
  user: { name: string; email: string; avatar: string | undefined }
}) {
  const { isMobile } = useSidebar()
  const { signOut } = useClerk()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function DashboardSidebar(
  props: React.ComponentProps<typeof Sidebar>
) {
  const pathname = usePathname()
  const { isLoaded, user } = useUser()

  const clerkUser = {
    name: user?.fullName || user?.username || "User",
    email: user?.primaryEmailAddress?.emailAddress ?? "",
    avatar: user?.imageUrl || undefined,
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                  SL
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">SolarLayout</span>
                  <span className="truncate text-xs text-muted-foreground">Dashboard</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                tooltip={item.title}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        {!isLoaded || !user ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" disabled>
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="grid flex-1 gap-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-32" />
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          <NavUser user={clerkUser} />
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
cd apps/mvp_dashboard && bunx vitest run components/dashboard-sidebar.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_dashboard/components/dashboard-sidebar.tsx \
        apps/mvp_dashboard/components/dashboard-sidebar.test.tsx
git commit -m "feat(mvp-dashboard): add DashboardSidebar with nav items and user footer"
```

---

## Task 9: `apps/mvp_dashboard` — DownloadCard component

**Files:**
- Create: `apps/mvp_dashboard/components/download-card.tsx`
- Create: `apps/mvp_dashboard/components/download-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mvp_dashboard/components/download-card.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Mock useAuth for Clerk token
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue("mock-clerk-token"),
  }),
}))

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

import { DownloadCard } from "./download-card"

describe("DownloadCard", () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  const defaultProps = {
    name: "PV Layout Basic",
    price: "$1.99",
    calculations: "5 layout calculations",
    productSlug: "pv-layout-basic" as const,
    apiBaseUrl: "https://api.example.com",
  }

  it("renders product name, price, and calculations", () => {
    render(<DownloadCard {...defaultProps} />)
    expect(screen.getByText("PV Layout Basic")).toBeInTheDocument()
    expect(screen.getByText("$1.99")).toBeInTheDocument()
    expect(screen.getByText("5 layout calculations")).toBeInTheDocument()
  })

  it("renders Download button", () => {
    render(<DownloadCard {...defaultProps} />)
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument()
  })

  it("calls API and triggers download on button click", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { url: "https://s3.example.com/file.exe" } }),
    })

    // Mock createElement/click for download trigger
    const mockClick = vi.fn()
    const mockAnchor = { href: "", download: "", click: mockClick, remove: vi.fn() }
    vi.spyOn(document, "createElement").mockReturnValueOnce(mockAnchor as unknown as HTMLAnchorElement)
    vi.spyOn(document.body, "appendChild").mockImplementationOnce(() => mockAnchor as unknown as HTMLElement)

    render(<DownloadCard {...defaultProps} />)
    await userEvent.click(screen.getByRole("button", { name: /download/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/dashboard/download/pv-layout-basic",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mock-clerk-token",
          }),
        })
      )
    })
  })

  it("shows error state when API call fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: { message: "S3 error" } }),
    })

    render(<DownloadCard {...defaultProps} />)
    await userEvent.click(screen.getByRole("button", { name: /download/i }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /download/i })).not.toBeDisabled()
    })
  })
})
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd apps/mvp_dashboard && bunx vitest run components/download-card.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create `apps/mvp_dashboard/components/download-card.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"

type ProductSlug = "pv-layout-basic" | "pv-layout-pro" | "pv-layout-pro-plus"

interface DownloadCardProps {
  name: string
  price: string
  calculations: string
  productSlug: ProductSlug
  apiBaseUrl: string
  highlighted?: boolean
}

export function DownloadCard({
  name,
  price,
  calculations,
  productSlug,
  apiBaseUrl,
  highlighted,
}: DownloadCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { getToken } = useAuth()

  async function handleDownload() {
    setLoading(true)
    setError(null)

    try {
      const token = await getToken()
      const res = await fetch(
        `${apiBaseUrl}/dashboard/download/${productSlug}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const body = (await res.json()) as
        | { success: true; data: { url: string } }
        | { success: false; error: { message: string } }

      if (!body.success) {
        setError("Download failed. Please try again.")
        return
      }

      // Trigger browser download
      const a = document.createElement("a")
      a.href = body.data.url
      a.download = `${productSlug}.exe`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      console.error("Download error:", err)
      setError("Download failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      className={`flex flex-col text-center ${highlighted ? "border-accent ring-2 ring-accent/20" : ""}`}
    >
      <CardHeader>
        <CardTitle className="text-xl">{name}</CardTitle>
        <div className="mt-2">
          <span className="text-4xl font-bold text-foreground">{price}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{calculations}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end gap-2">
        <Button
          onClick={handleDownload}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download
            </>
          )}
        </Button>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
cd apps/mvp_dashboard && bunx vitest run components/download-card.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_dashboard/components/download-card.tsx \
        apps/mvp_dashboard/components/download-card.test.tsx
git commit -m "feat(mvp-dashboard): add DownloadCard component with Clerk-authenticated S3 download"
```

---

## Task 10: `apps/mvp_dashboard` — `(main)` layout and all pages

**Files:**
- Create: `apps/mvp_dashboard/app/(main)/layout.tsx`
- Create: `apps/mvp_dashboard/app/(main)/page.tsx`
- Create: `apps/mvp_dashboard/app/(main)/page.test.tsx`
- Create: `apps/mvp_dashboard/app/(main)/plan/page.tsx`
- Create: `apps/mvp_dashboard/app/(main)/plan/page.test.tsx`
- Create: `apps/mvp_dashboard/app/(main)/usage/page.tsx`
- Create: `apps/mvp_dashboard/app/(main)/usage/page.test.tsx`
- Create: `apps/mvp_dashboard/app/(main)/license/page.tsx`
- Create: `apps/mvp_dashboard/app/(main)/license/page.test.tsx`

- [ ] **Step 1: Write failing tests for all four pages**

Create `apps/mvp_dashboard/app/(main)/page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import DashboardPage from "./page"

describe("Dashboard home page", () => {
  it("renders welcome heading", () => {
    render(<DashboardPage />)
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
  })

  it("renders three download cards", () => {
    render(<DashboardPage />)
    expect(screen.getByText("PV Layout Basic")).toBeInTheDocument()
    expect(screen.getByText("PV Layout Pro")).toBeInTheDocument()
    expect(screen.getByText("PV Layout Pro Plus")).toBeInTheDocument()
  })
})
```

Create `apps/mvp_dashboard/app/(main)/plan/page.test.tsx`:

```tsx
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import PlanPage from "./page"

describe("Plan page", () => {
  it("renders Plan heading", () => {
    render(<PlanPage />)
    expect(screen.getByRole("heading", { name: /Plan/i })).toBeInTheDocument()
  })

  it("renders coming-soon content", () => {
    render(<PlanPage />)
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
```

Create `apps/mvp_dashboard/app/(main)/usage/page.test.tsx`:

```tsx
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import UsagePage from "./page"

describe("Usage page", () => {
  it("renders Usage heading", () => {
    render(<UsagePage />)
    expect(screen.getByRole("heading", { name: /Usage/i })).toBeInTheDocument()
  })

  it("renders coming-soon content", () => {
    render(<UsagePage />)
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
```

Create `apps/mvp_dashboard/app/(main)/license/page.test.tsx`:

```tsx
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import LicensePage from "./page"

describe("License page", () => {
  it("renders License heading", () => {
    render(<LicensePage />)
    expect(screen.getByRole("heading", { name: /License/i })).toBeInTheDocument()
  })

  it("renders coming-soon content", () => {
    render(<LicensePage />)
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
cd apps/mvp_dashboard && bunx vitest run
```

Expected: FAIL (modules not found).

- [ ] **Step 3: Create `apps/mvp_dashboard/app/(main)/layout.tsx`**

```tsx
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { Separator } from "@renewable-energy/ui/components/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@renewable-energy/ui/components/sidebar"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

- [ ] **Step 4: Create `apps/mvp_dashboard/app/(main)/page.tsx`**

```tsx
import type { Metadata } from "next"
import { DownloadCard } from "@/components/download-card"

export const metadata: Metadata = {
  title: "Dashboard",
}

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

const products = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    calculations: "5 layout calculations per purchase",
    productSlug: "pv-layout-basic" as const,
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    calculations: "10 layout calculations per purchase",
    productSlug: "pv-layout-pro" as const,
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    calculations: "50 layout and yield calculations per purchase",
    productSlug: "pv-layout-pro-plus" as const,
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Downloads
        </h1>
        <p className="mt-1 text-muted-foreground">
          Download the SolarLayout desktop application for your plan.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <DownloadCard
            key={product.productSlug}
            name={product.name}
            price={product.price}
            calculations={product.calculations}
            productSlug={product.productSlug}
            apiBaseUrl={MVP_API_URL}
            highlighted={product.highlighted}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create placeholder pages**

Create `apps/mvp_dashboard/app/(main)/plan/page.tsx`:

```tsx
import type { Metadata } from "next"
import { Card, CardContent, CardHeader, CardTitle } from "@renewable-energy/ui/components/card"
import { CreditCard } from "lucide-react"

export const metadata: Metadata = { title: "Plan" }

export default function PlanPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Plan</h1>
        <p className="mt-1 text-muted-foreground">Your current plan and entitlements.</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Plan details</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Coming soon — purchase a plan from the{" "}
            <a
              href="https://solarlayout.in/pricing"
              className="text-primary underline underline-offset-4"
              target="_blank"
              rel="noopener noreferrer"
            >
              Pricing page
            </a>{" "}
            to see your entitlements here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

Create `apps/mvp_dashboard/app/(main)/usage/page.tsx`:

```tsx
import type { Metadata } from "next"
import { Card, CardContent, CardHeader, CardTitle } from "@renewable-energy/ui/components/card"
import { BarChart3 } from "lucide-react"

export const metadata: Metadata = { title: "Usage" }

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Usage</h1>
        <p className="mt-1 text-muted-foreground">Your calculation usage history.</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Usage history</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Coming soon — usage history will appear here once you start generating layouts.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

Create `apps/mvp_dashboard/app/(main)/license/page.tsx`:

```tsx
import type { Metadata } from "next"
import { Card, CardContent, CardHeader, CardTitle } from "@renewable-energy/ui/components/card"
import { Key } from "lucide-react"

export const metadata: Metadata = { title: "License" }

export default function LicensePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">License</h1>
        <p className="mt-1 text-muted-foreground">Your licence keys for SolarLayout desktop applications.</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Licence keys</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Coming soon — your licence key will appear here after purchase.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Run all tests — expect them to pass**

```bash
cd apps/mvp_dashboard && bunx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_dashboard/app/
git commit -m "feat(mvp-dashboard): add (main) layout, home page, and Plan/Usage/License placeholders"
```

---

## Task 11: Update `turbo.json` and spike plan

**Files:**
- Modify: `turbo.json`
- Modify: `docs/initiatives/mvp-spike-plan.md`

- [ ] **Step 1: Add `@renewable-energy/mvp-dashboard` to `turbo.json`**

Add two new entries to the `"tasks"` object in `turbo.json`:

```json
"@renewable-energy/mvp-dashboard#build": {
  "dependsOn": ["^build"],
  "outputs": [".next/**", "!.next/cache/**"],
  "env": [
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_MVP_API_URL",
    "NODE_ENV"
  ]
},
"@renewable-energy/mvp-dashboard#typecheck": {
  "dependsOn": ["^build"],
  "outputs": []
},
```

Note: `CLERK_SECRET_KEY` is server-side only and not needed in the Next.js build env array (it is used at runtime via Next.js middleware, not baked in at build time for `NEXT_PUBLIC_*` vars). `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is the only Clerk build-time var.

- [ ] **Step 2: Update `docs/initiatives/mvp-spike-plan.md`**

Make these targeted updates:

**a) Update the Overview table row for Spike 4:**
```markdown
| 4 | Cleanup + Dashboard app | Remove Phase 2 refs/banners from mvp_web; scaffold `apps/mvp_dashboard` with Clerk, sidebar nav (Dashboard, Plan, Usage, License), solar palette dark/light; direct S3 download for authenticated users | in-progress | — |
```

**b) Add `apps/mvp_dashboard` to the Architecture section:**
```
apps/mvp_dashboard/   → Next.js 16 App Router — user dashboard (dashboard.solarlayout.in)
```

**c) Update Spike 4 scope note** — add: "No `packages/mvp_api-client` in this spike — single fetch call inlined in DownloadCard. Evaluated and deferred to Spike 5."

**d) Add to Decisions Log:**
```markdown
| D20 | 2026-04-22 | Dashboard home page uses direct presigned S3 URL (no registration form) | Users are Clerk-authenticated; their identity is already known. Skip the registration form used on the marketing site. |
| D21 | 2026-04-22 | `packages/mvp_api-client` deferred to Spike 5 | Single API call in Spike 4 does not justify NodeNext package build pipeline overhead. Re-evaluate when Spike 5 expands the API surface. |
| D22 | 2026-04-22 | Dashboard Clerk keys in `apps/mvp_dashboard/.env.local` (not root .env) | Avoids env var name collision with `apps/web` Clerk config locally. Vercel per-project env vars handle production isolation automatically. |
```

- [ ] **Step 3: Commit**

```bash
git add turbo.json docs/initiatives/mvp-spike-plan.md
git commit -m "chore: update turbo.json for mvp-dashboard; update spike plan"
```

---

## Task 12: Full gates pass + install `.env.local` values

**Files:**
- No code changes — gate verification only
- Human action: create `apps/mvp_dashboard/.env.local` with Clerk keys

- [ ] **Step 1: Human creates `apps/mvp_dashboard/.env.local`**

The implementor must create this file manually (it is gitignored). Template:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_MVP_API_URL=http://localhost:3003
```

Values are provided by the user (separate Clerk app for the dashboard).

Also add `MVP_CLERK_SECRET_KEY=sk_test_...` to the root `.env` file (used by `apps/mvp_api` to verify dashboard JWTs locally).

- [ ] **Step 2: Run full gate from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all four commands exit 0.

If typecheck fails for `apps/mvp_dashboard`, ensure `next-env.d.ts` was generated (run `bunx turbo build --filter=@renewable-energy/mvp-dashboard` first to let Next.js generate it, then re-run typecheck).

- [ ] **Step 3: Final commit (if any fixups needed)**

```bash
git add -p  # stage only intentional changes
git commit -m "fix: address gate failures in mvp-dashboard scaffold"
```

---

## Acceptance criteria checklist

Before declaring Spike 4 done, the human must verify these in a running environment:

**Local (`localhost:3002` for mvp_web, `localhost:3004` for mvp_dashboard):**
- [ ] No "Phase 2", "coming soon", "preliminary", "Payment coming soon" text on any `solarlayout.in` page
- [ ] `localhost:3004/sign-up` — Clerk sign-up form renders
- [ ] `localhost:3004/sign-in` — Clerk sign-in form renders
- [ ] After sign-in, sidebar shows: Dashboard, Plan, Usage, License
- [ ] `localhost:3004/` — three download cards render with product names and prices
- [ ] Download button calls `localhost:3003/dashboard/download/pv-layout-basic` with Bearer token and triggers file download
- [ ] `localhost:3004/plan`, `/usage`, `/license` — placeholder cards with "Coming soon" render
- [ ] `d` key toggles dark/light theme
- [ ] Unauthenticated access to `/` redirects to `/sign-in`
- [ ] Signed-in user visiting `/sign-in` redirects to `/`

**Production (after deploying `apps/mvp_dashboard` as new Vercel project):**
- [ ] All the above at `dashboard.solarlayout.in`
- [ ] `solarlayout.in` — no Phase 2 / preliminary content
