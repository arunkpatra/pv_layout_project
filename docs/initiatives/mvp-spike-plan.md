# MVP SolarLayout Website — Spike Plan

**Initiative:** MVP SolarLayout Public Website  
**PRD:** [docs/mvp/PRD.md](../mvp/PRD.md)  
**Design Spec:** [docs/superpowers/specs/2026-04-21-mvp-solarlayout-website-design.md](../superpowers/specs/2026-04-21-mvp-solarlayout-website-design.md)  
**Status:** In Progress  
**Created:** 2026-04-21  
**Target Domain:** solarlayout.in  
**Branch:** `mvp`

---

## Living Document Policy

This document is the single source of truth for the MVP project. Keep it current.

**Update this document when:**
- A spike status changes — update the status field and the overview table immediately
- A spike completes — record the outcome date and any decisions in the Decisions Log
- A spike's scope changes — update the spike section and note the reason
- A new spike is added — add it to the overview table and give it a full section

**Rule:** Never leave this document inconsistent with the actual state of the codebase.

---

## How to Use This Document

Each spike is a self-contained unit of work with a defined scope and acceptance criteria. Spikes are ordered by dependency — a spike must be verified complete before the next begins. When a spike starts, update its status. When it completes, record the outcome and any decisions made.

**Status values:** `planned` · `in-progress` · `complete` · `blocked`

### Definition of Done (applies to every spike)

A spike is complete only when **all** of the following are true:

1. All static gates pass from the repo root: `bun run lint && bun run typecheck && bun run test && bun run build`
2. Every acceptance criterion has been verified by a human, step by step, in a running environment
3. Verification covers every applicable environment — local dev and production — not just one
4. No criterion is marked complete on Claude's assertion alone — "it should work" is not done

---

## Overview

| # | Spike | Scope | Status | Completed |
|---|---|---|---|---|
| 1 | Website scaffold + all 9 pages | Full responsive site, stubbed forms, solar brand palette | complete | 2026-04-22 |
| 2 | MVP DB + MVP API scaffold + download registration | New `packages/mvp_db`, `apps/mvp_api`, docker-compose, download-register endpoint | complete | 2026-04-22 |
| 3 | Contact form API | ContactSubmission model, endpoint, wire Contact form | complete | 2026-04-22 |
| 4 | Cleanup + Dashboard app | Remove Phase 2 refs/banners from mvp_web; scaffold `apps/mvp_dashboard` with Clerk, sidebar nav, solar palette dark/light | complete | 2026-04-22 |
| 4.1 | Merge dashboard into mvp_web | Consolidate mvp_dashboard into mvp_web — single app, single domain | complete | 2026-04-22 |
| 5 | Stripe integration | Purchase flow, entitlement provisioning on payment success | complete | 2026-04-22 |
| 5.1 | Clerk sign-in preserve original URL | After sign-in, redirect to the page user was trying to reach instead of always /dashboard | complete | 2026-04-22 |
| 6 | Entitlement API + license key generation | API key auth middleware, license key CRUD, entitlement check, usage reporting endpoints | complete | 2026-04-22 |
| 7 | Python app integration | Integrate auth/license key into PVlayout_Advance, write PRD + Claude Code prompt for Prasanta | complete | 2026-04-22 |
| 7.1 | Free Plan Auto-Provisioning + Quota Enforcement | DB isFree field + pv-layout-free seed; clerkAuth auto-provisions Entitlement + LicenseKey on signup; GET /products excludes free; checkout guard; pricing page Free column; Plan page Free badge; Python re-fetches entitlements on every generate click; quota dialog when exhausted | complete | 2026-04-22 |
| 7.2 | Python GUI — account & license info modal | Toolbar button (user icon) opens modal: name, email, all plans, entitled features, remaining calculations, Change Key | complete | 2026-04-22 |
| 7.3 | mvp_web usability improvements | UI/UX polish on the web dashboard — scope TBD at brainstorm time | planned | — |
| 8 | SEO | Meta tags, Open Graph, JSON-LD, sitemap.xml, robots.txt | post-launch | — |
| 9 | GA4 + consent mode v2 | Google Analytics 4, consent gating, event tracking | post-launch | — |
| 10 | Legal pages full review | Full DPDP Act / IT Act legal review | post-launch | — |
| 11 | Admin UI | Usage records, user list, entitlement overview, license key revocation | planned | — |
| ~~7~~ | ~~Domain + production deployment~~ | ~~solarlayout.in + api.solarlayout.in~~ | complete | 2026-04-22 |

---

## Architecture

```
apps/mvp_web/         → Next.js 16 App Router — marketing site + dashboard (solarlayout.in)
apps/mvp_api/         → Hono API on Bun — MVP backend (api.solarlayout.in)
packages/ui/          → Shared shadcn/ui components (reused with solar palette overrides)
packages/mvp_db/      → Prisma schema + client for MVP domain (separate DB from cloud platform)
packages/db/          → Prisma schema + client for cloud platform (unchanged, not used by MVP)
```

**Key boundaries:**
- `apps/mvp_web` — marketing pages (public, no auth) + dashboard at `/dashboard` (Clerk-authenticated). Clerk middleware protects `/dashboard(.*)` routes. Header shows Sign In / Dashboard buttons using `<SignedIn>` / `<SignedOut>`
- `apps/mvp_api` — standalone Hono server (same tech stack as `apps/api`). Two auth modes:
  - Unauthenticated: download-register, contact form
  - API key auth: entitlement validation, usage reporting (called by desktop Python apps)
  - Clerk auth: dashboard API routes (`GET /dashboard/download/:product`) — called from `apps/mvp_web/dashboard`
- `packages/mvp_db` — separate Prisma schema and Postgres DB from `packages/db`. Independent migrations, no coupling between MVP and cloud platform
- Desktop Python apps store license key (API key) via `keyring` (OS-native credential store)
- `apps/mvp_api` is separate from `apps/api` — different auth models, different domain concerns
- Same S3 bucket, `downloads/` key prefix for exe files
- `docker-compose.yml` gets a second Postgres service (`mvp_db`, port 5433)

---

## Spike 1: Website Scaffold + All 9 Pages

**Status:** complete (2026-04-22)  
**Implementation Plan:** [docs/superpowers/plans/2026-04-21-mvp-spike1-website-scaffold.md](../superpowers/plans/2026-04-21-mvp-spike1-website-scaffold.md)

**Scope:**
- New Next.js 16 app at `apps/mvp_web`
- Solar brand palette (Deep Solar Blue, Solar Amber, Light Grey)
- Sticky header with mobile Sheet drawer, footer
- All 9 pages with full content from PRD:
  - Home (hero, features, how-it-works summary, screenshots placeholders, system requirements)
  - Products (product cards, email capture modal — stubbed)
  - Pricing (feature comparison table, disabled Buy Now)
  - How It Works (4-step detail, supported features list)
  - About (industry veterans, mission statement)
  - FAQ (accordion, 18 Q&A pairs across 5 categories)
  - Contact (form — stubbed, contact info)
  - Terms (placeholder content)
  - Privacy (placeholder content)
- Sonner toast for stubbed form submissions
- Vitest tests for all pages

**Acceptance Criteria:**
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` passes
- [ ] `bunx turbo dev --filter=@renewable-energy/mvp-web` starts without errors
- [ ] All 9 pages render at their respective URLs
- [ ] Header navigation works on desktop and mobile
- [ ] Products download modal opens and shows toast on submit
- [ ] Contact form shows toast on submit
- [ ] FAQ accordion expands/collapses
- [ ] Responsive on mobile, tablet, desktop
- [ ] Screenshots section shows placeholder images with lightbox

---

## Spike 2: MVP DB + MVP API Scaffold + Download Registration

**Status:** complete (2026-04-22)

**Scope:**
- New Prisma package: `packages/mvp_db`
  - Own Prisma schema, own DB connection (`MVP_DATABASE_URL`)
  - Same patterns as `packages/db` (semantic IDs, appPrisma/adminPrisma exports, bun:test)
  - `docker-compose.yml` updated: new `mvp_db` Postgres service on port 5433
  - `turbo.json` updated: `@renewable-energy/mvp-db` tasks mirroring `@renewable-energy/db`
- New Hono API server: `apps/mvp_api` (same tech stack as `apps/api` — Hono v4, Bun, Prisma, Zod)
  - package.json, tsconfig, env, middleware, error handler, response helpers
  - Modelled on `apps/api` patterns but independent codebase
  - Imports `@renewable-energy/mvp-db` (NOT `@renewable-energy/db`)
  - Vercel deployment entry point
- New Prisma model in `packages/mvp_db`: `DownloadRegistration` (name, email, mobile, product, ipAddress, timestamp)
- DB migration
- Unauthenticated route: `POST /download-register`
  - Validates input (Zod)
  - Saves registration to DB
  - Returns S3 presigned download URL for the selected product exe
  - Handles duplicate email logic
- Wire Products page DownloadModal to call the API
- On success: trigger file download from presigned URL
- Upload three placeholder exe files to S3 under `downloads/` prefix

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] `docker compose up -d` starts both `db` (5432) and `mvp_db` (5433)
- [ ] `packages/mvp_db` builds and generates Prisma client
- [ ] `apps/mvp_api` builds and starts on its own port (e.g. 3003)
- [ ] POST to `/download-register` with valid data returns presigned URL
- [ ] Registration saved to MVP DB (verify in Prisma Studio)
- [ ] Products page modal submits and triggers file download
- [ ] Invalid input returns appropriate error
- [ ] Duplicate email handled gracefully

---

## Spike 3: Contact Form API

**Status:** complete (2026-04-22)

**Scope:**
- New Prisma model in `packages/mvp_db`: `ContactSubmission` (name, email, subject, message, ipAddress, timestamp)
- DB migration
- New unauthenticated route in `apps/mvp_api`: `POST /contact`
  - Validates input (Zod)
  - Saves submission to DB
- Wire Contact page form to call the API
- Success message: "Thank you for reaching out. We will get back to you within 2 business days."

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] POST to `/contact` with valid data returns success
- [ ] Submission saved to DB
- [ ] Contact page form submits and shows success message
- [ ] Invalid input returns appropriate error

---

## Spike 4: Cleanup + Dashboard App

**Status:** complete (2026-04-22)  
**Implementation Plan:** [docs/superpowers/plans/2026-04-22-mvp-spike4-cleanup-dashboard.md](../superpowers/plans/2026-04-22-mvp-spike4-cleanup-dashboard.md)

**Scope:**

**Part A — Website cleanup (mvp_web):**
- Removed "preliminary and subject to legal review" banners from Terms and Privacy pages
- Removed all Phase 2 / "coming soon" / "Payment coming soon" references from FAQ, pricing, system requirements
- Buy Now buttons remain disabled (no tooltip); will be wired in Spike 5 after Stripe integration

**Part B — Dashboard app (mvp_dashboard):**
- New Next.js 16 app: `apps/mvp_dashboard` — ~~deployed to `dashboard.solarlayout.in`~~ (superseded by Spike 4.1: merged into `apps/mvp_web` at `solarlayout.in/dashboard`)
  - Clerk authentication (signup/signin) using standard `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
  - Solar brand palette with dark/light theme support (same CSS vars as `apps/mvp_web`)
  - Reuses `packages/ui` shadcn components
  - Left sidebar navigation: Dashboard, Plan, Usage, License — collapsible icon mode
  - Provider stack: ClerkProvider → ThemeProvider → QueryProvider → TooltipProvider
- New Prisma models in `packages/mvp_db`:
  - `User` (clerkId, email, name, createdAt)
  - `LicenseKey` (key, userId, product, createdAt, revokedAt)
  - `Entitlement` (userId, product, totalCalculations, usedCalculations, purchasedAt)
  - Tables created; populated in Spike 5 after Stripe purchase flow
- New API route in `apps/mvp_api`:
  - `GET /dashboard/download/:product` — Clerk-JWT authenticated, returns presigned S3 URL (60s expiry)
  - Validates product slug against allowlist; returns 400 for unknown products
- Dashboard home page: 3 `DownloadCard` components — click fetches presigned URL and triggers browser download
- Plan / Usage / License pages: coming-soon placeholder cards
- `packages/mvp_api-client` deferred to Spike 5 (single inline fetch is sufficient now)

**Acceptance Criteria:**
- [x] Gates pass (lint + typecheck + test + build from root)
- [ ] Human verifies locally: no Phase 2 refs on `localhost:3002`; dashboard sign-up/sign-in works at `localhost:3004`; download buttons trigger file download; sidebar nav works
- [ ] CI/CD passes
- [ ] Production: `solarlayout.in` clean; dashboard at `solarlayout.in/dashboard` live with working download (superseded by Spike 4.1 — dashboard merged into mvp_web)

---

## Spike 4.1: Merge Dashboard into mvp_web

**Status:** complete (2026-04-22)
**Design Spec:** [docs/superpowers/specs/2026-04-22-spike4.1-merge-dashboard-into-mvp-web-design.md](../superpowers/specs/2026-04-22-spike4.1-merge-dashboard-into-mvp-web-design.md)
**Implementation Plan:** [docs/superpowers/plans/2026-04-22-spike4.1-merge-dashboard-into-mvp-web.md](../superpowers/plans/2026-04-22-spike4.1-merge-dashboard-into-mvp-web.md)

**Scope:**
- Merged `apps/mvp_dashboard` into `apps/mvp_web` — single Next.js app, single domain (`solarlayout.in`)
- Marketing pages in `(marketing)` route group, dashboard in `(main)` route group
- Clerk middleware protects `/dashboard(.*)` routes
- Header shows Sign In / Dashboard auth buttons using `<SignedIn>` / `<SignedOut>`
- Dark mode palette + sidebar CSS variables added to `globals.css`
- `apps/mvp_dashboard` deleted, turbo.json cleaned up

**Acceptance Criteria:**
- [x] Gates pass (lint + typecheck + test + build from root)
- [ ] Human verifies locally: marketing pages at localhost:3002, dashboard at localhost:3002/dashboard
- [ ] CI/CD passes
- [ ] Production: solarlayout.in serves both marketing and dashboard
- [ ] Human sign-off

---

## Spike 5: Stripe Integration

**Status:** complete (2026-04-22)
**Design Spec:** [docs/superpowers/specs/2026-04-22-spike5-stripe-integration-design.md](../superpowers/specs/2026-04-22-spike5-stripe-integration-design.md)
**Implementation Plan:** [docs/superpowers/plans/2026-04-22-spike5-stripe-integration.md](../superpowers/plans/2026-04-22-spike5-stripe-integration.md)

**Scope:**
- Stripe Checkout one-time payments (`mode: 'payment'`) — not subscriptions
- Product and ProductFeature tables seeded per environment with Stripe price IDs
- Purchase flow: Plan page → POST /billing/checkout → Stripe Checkout redirect → webhook + verify-session → provision Entitlement + LicenseKey
- Idempotent provisioning via `processedAt` timestamp on CheckoutSession
- Plan page: product cards with Purchase buttons, entitlement balances, license key with copy-to-clipboard
- License page: license key display
- Dashboard home: remaining calculations per product, "Buy calculations" links
- Pricing page: Buy Now buttons enabled, link to `/dashboard/plan?product=<slug>`
- GET /products (public), POST /billing/checkout, POST /billing/verify-session, GET /billing/entitlements, POST /webhooks/stripe

**Acceptance Criteria:**
- [x] Gates pass (lint + typecheck + test + build)
- [ ] Human verifies locally: purchase flow end-to-end with Stripe test mode
- [ ] CI/CD passes
- [ ] Production: Stripe live products created, purchase works at solarlayout.in
- [ ] Human sign-off

---

## Spike 5.1: Clerk Sign-In Preserve Original URL

**Status:** complete (2026-04-22)

**Scope:**
- After sign-in, Clerk should redirect to the page the user was originally trying to reach (e.g. `/dashboard/plan?product=pv-layout-pro`) instead of always redirecting to `/dashboard`
- Affects: `apps/mvp_web/proxy.ts`, sign-in/sign-up page `forceRedirectUrl`, and Clerk env vars
- Small scope — configuration fix, no new features

**Acceptance Criteria:**
- [x] Gates pass
- [x] User visits `/dashboard/plan?product=pv-layout-pro` while signed out → Clerk sign-in → redirected back to `/dashboard/plan?product=pv-layout-pro`
- [x] Normal sign-in (no original URL) → redirected to `/dashboard`

---

## Spike 6: Entitlement API + License Key Generation

**Status:** complete (2026-04-22)

**Scope:**
- API key auth middleware in `apps/mvp_api` — validates `Authorization: Bearer sl_live_...` header
  - Looks up `LicenseKey` → resolves userId → loads entitlements
  - Rejects revoked/invalid keys
- New authenticated-by-API-key routes:
  - `GET /entitlements` — returns remaining calculations per product for this key's user
  - `POST /usage/report` — records a successful generation (product, timestamp, metadata)
    - Decrements remaining calculations
    - Returns updated balance
  - `GET /usage/history` — returns usage history for this key's user
- New Prisma model in `packages/mvp_db`: `UsageRecord` (userId, product, licenseKeyId, metadata, timestamp)

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] Valid API key returns entitlements
- [ ] Invalid/revoked API key returns 401
- [ ] Usage report decrements entitlement count
- [ ] Usage report rejects when entitlement exhausted (0 remaining)
- [ ] Usage history returns chronological records

---

## Spike 7: Python App Integration

**Status:** complete  
**Completed:** 2026-04-22  
**Design Spec:** [docs/superpowers/specs/2026-04-22-spike7-python-app-integration-design.md](../superpowers/specs/2026-04-22-spike7-python-app-integration-design.md)

**Scope:**
- Integrate auth/license key into `PVlayout_Advance` (`add-auth` branch) as reference implementation:
  - `auth/` module: `license_client.py`, `key_store.py`, `workers.py` (QThread-based)
  - `gui/license_key_dialog.py`: masked key entry, "Buy a license" link
  - Three touch points in `main_window.py`: startup entitlement check, `_can_generate()` guard, post-generate usage report
  - Freemium-forward: no blocking on startup; `_can_generate()` returns `True` unconditionally (Spike 7.1 adds quota enforcement)
  - Dismissable banner for no-key state; soft banner for quota exhausted
  - Non-fatal error handling: all API errors logged, never block the UI
  - `keyring` for OS-native credential storage (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Deliverables in `PVlayout_Advance`:
  - `docs/PRD-license-key-integration.md` — full PRD for Prasanta
  - `docs/CLAUDE_CODE_PROMPT.md` — standalone Claude Code implementation prompt
  - Full test coverage of `auth/` module with mocked HTTP and keyring

**Acceptance Criteria:**
- [ ] `flake8 . && python -m pytest` passes in PVlayout_Advance on `add-auth` branch
- [ ] First-run: no key → banner shown, dialog opens, key saved, entitlements fetched silently
- [ ] Startup with key: status bar shows remaining count, no blocking spinner
- [ ] Generate: `_can_generate()` returns True, layout runs, usage reported after done, status bar updates
- [ ] Quota exhausted: 402 response → soft banner, app still usable
- [ ] Network offline at startup: warning in status bar only, UI fully usable
- [ ] PRD and Claude Code prompt committed to `add-auth`
- [ ] End-to-end flow: dashboard signup → purchase → copy key → enter in app → generate → usage recorded in prod

---

## Spike 7.1: Free Plan Auto-Provisioning + Quota Enforcement

**Status:** complete  
**Completed:** 2026-04-22  
**Implementation Plan:** [docs/superpowers/plans/2026-04-22-spike7.1-free-plan.md](../superpowers/plans/2026-04-22-spike7.1-free-plan.md)

**Scope:**

**DB (`packages/mvp_db`):**
- New `isFree Boolean @default(false)` field on `Product` model — migration required (DB wipe permitted, no backward compat)
- New seed entry: `pv-layout-free` — 5 calculations, all Pro Plus features, `priceAmount: 0`, `stripePriceId: "price_free_tier"` (sentinel, never called against Stripe), `isFree: true`

**API (`apps/mvp_api`):**
- `clerkAuth` middleware: after creating a new User, auto-provision Free plan — create `Entitlement` (5 calc) + `LicenseKey` (`sl_live_...`) in a single transaction. Non-fatal: provisioning failure logs and continues, never breaks auth.
- `GET /products`: add `isFree: false` filter — Free product never appears in purchasable product list
- `POST /billing/checkout`: reject `isFree: true` products — 422 Validation Error

**Web (`apps/mvp_web`):**
- Pricing page (`pricing-cards.tsx`): add Free tier column — "Free / On signup / 5 Layout / all Pro Plus features", "Get Started Free" button links to `/sign-up`
- Dashboard Plan page: "Free" badge on `pv-layout-free` entitlement card; license key helper text updated to "Enter this key in your SolarLayout desktop application to activate your plan"

**Python app (`PVlayout_Advance`):**
- `_on_generate()` re-fetches entitlements from the API before every layout click (no local cache check). Rationale: license key is multi-machine, API call is cheap (~200 ms).
- `_run_layout()` extracted from `_on_generate()` — called by `_on_entitlements_result` only after quota confirmed > 0.
- `_on_entitlements_result`: `remainingCalculations == 0` → `QMessageBox.information` pointing to `solarlayout.in/dashboard/plan`; no layout runs.
- `_on_entitlements_error`: on 401 clears key; on network/5xx fails open and calls `_run_layout()`.
- No `_can_generate()` method — quota enforcement lives entirely in `_on_entitlements_result`.

**Design decision:** No anonymous tracking, no install IDs. Every user must sign up to get a license key. The Free plan key IS the key they enter in the desktop app — it works identically to a paid key. Conversion path: sign up → dashboard shows Free plan key → copy into app → generate 5 times → quota prompt → upgrade.

**Acceptance Criteria:**
- [ ] Gates pass (`bun run lint && bun run typecheck && bun run test && bun run build` from repo root)
- [ ] Python gates pass (`flake8` + `pytest`) in PVlayout_Advance
- [ ] New user signs up → dashboard Plan page shows "PV Layout Free — 5 remaining" + license key
- [ ] Free product does NOT appear in Plan page purchase grid
- [ ] Free product slug in `POST /billing/checkout` returns 422
- [ ] User copies Free plan key → enters in desktop app → status bar shows "5 calculation(s) remaining"
- [x] After 5 generates → quota dialog shown → layout does not run
- [ ] Pricing page shows Free tier column with "Get Started Free" button
- [ ] Human sign-off

---

## Spike 7.2: Python GUI — Account & License Info Modal

**Status:** complete (2026-04-22)

**Scope:**

**Python app (`PVlayout_Advance`):**
- New toolbar button at the right end of the existing main toolbar (the bar containing Home, left arrow, right arrow). Button uses a user/person icon. Only shown when a license key is stored; hidden otherwise.
- Clicking opens `LicenseInfoDialog` — a new read-only modal dialog showing:
  - Name and email (from API)
  - All plans the user has purchased (e.g. Basic, Pro, Pro+)
  - Features entitled per plan (e.g. Plant Layout, Cable Routing)
  - Remaining calculations
  - "Change Key" button — opens the existing `LicenseKeyDialog`; replaces stored key only after new key confirmed valid by API (same validate-then-persist flow as Spike 7)
- `LicenseInfoDialog` is populated from the last fetched entitlements data (no extra network call on open); data refreshed in background via `EntitlementsWorker` on each startup
- New file: `gui/license_info_dialog.py`

**API (`apps/mvp_api`):**
- Extend `GET /entitlements` response to include user profile and plan details:
  ```json
  {
    "success": true,
    "data": {
      "user": { "name": "Ravi Kumar", "email": "ravi@example.com" },
      "plans": [
        {
          "planName": "Pro",
          "features": ["plant_layout", "cable_routing"],
          "totalCalculations": 10,
          "usedCalculations": 3,
          "remainingCalculations": 7
        }
      ]
    }
  }
  ```
- `license_client.py` and `EntitlementsWorker` consume the new response shape; `_entitlements` dict in `main_window.py` stores it for the dialog to read
- Existing `remainingCalculations` field on the top level retained for backwards compatibility (status bar still works)
- PRD (`docs/PRD-license-key-integration.md`) and Claude Code prompt (`docs/CLAUDE_CODE_PROMPT.md`) updated for Prasanta

**Acceptance Criteria:**
- [x] Gates pass (`flake8` + `pytest`) in PVlayout_Advance
- [x] Toolbar button appears when key is stored; hidden when no key
- [x] Dialog opens and shows correct name, email, plan(s), features, remaining count
- [x] "Change Key" opens `LicenseKeyDialog`; successful validation replaces key; dialog refreshes
- [x] "Change Key" with invalid key: banner shows error, old key remains active
- [x] API `GET /entitlements` returns user + plan fields; existing status bar still updates correctly
- [x] PRD and Claude Code prompt updated and committed

---

## Spike 7.3: mvp_web Usability Improvements

**Status:** planned

**Scope:** To be defined during Spike 7.3 brainstorming session.

Likely scope: UI/UX polish on the web dashboard — layout, copy, information hierarchy, mobile responsiveness gaps, and any friction points identified during real usage.

---

## Spike 8: SEO (post-launch)

**Status:** post-launch

**Scope:**
- Unique `<title>` and `<meta description>` for every page
- Open Graph and Twitter Card meta tags
- JSON-LD structured data (Organization, SoftwareApplication)
- `sitemap.xml` auto-generated
- `robots.txt`
- Semantic HTML audit

---

## Spike 9: GA4 + Consent Mode v2 (post-launch)

**Status:** post-launch

**Scope:**
- Google Analytics 4 integration
- Consent mode v2 — GA4 only fires after cookie consent
- Event tracking: page views, downloads, form submissions, CTA clicks
- Cookie consent banner

---

## Spike 10: Legal Pages Full Review (post-launch)

**Status:** post-launch

**Scope:**
- Full Terms & Conditions — IT Act 2000, Consumer Protection Act 2019 compliant
- Full Privacy Policy — DPDP Act 2023 compliant with grievance officer
- Professional legal review

---

## Spike 11: Admin UI

**Status:** planned

**Scope:** To be defined during Spike 11 brainstorming session.

Likely scope: usage records table, user list, entitlement overview per user, license key revocation.

---

## Decisions Log

| # | Date | Decision | Rationale |
|---|---|---|---|
| D1 | 2026-04-21 | New standalone app `apps/mvp_web` | Different audience, no auth, different brand — clean separation from `apps/web` |
| D2 | 2026-04-21 | Reuse `packages/ui` with CSS variable overrides | Avoids rebuilding shadcn primitives; theme override keeps brand distinct |
| D3 | ~~2026-04-21~~ 2026-04-22 | ~~Backend routes in existing `apps/api`~~ → New standalone `apps/mvp_api` | Different auth models (API key vs Clerk JWT), different domain concerns (license mgmt vs layout engine), cleaner separation — supersedes original D3 |
| D4 | 2026-04-21 | Same S3 bucket, `downloads/` key prefix | Simpler infra, no new bucket needed |
| D5 | 2026-04-21 | Same Prisma schema, new models | Consistent DB access patterns, shared migration pipeline |
| D6 | 2026-04-21 | Spike-by-spike delivery | Incremental verification; most important content ships first |
| D7 | 2026-04-21 | All pages in Spike 1 (stubbed API) | Get full visual product out fast; wire up backend incrementally |
| D8 | 2026-04-21 | Legal templates generated by developer, lawyer-reviewed before launch | Faster delivery; legal review happens in parallel |
| D9 | 2026-04-21 | SSG for all pages in Spike 1 | Best Core Web Vitals and SEO; no dynamic data needed yet |
| D10 | 2026-04-22 | New standalone `apps/mvp_api` instead of adding routes to `apps/api` | Different auth models (unauthenticated + API key + Clerk), different domain (license/entitlement vs layout engine), independent deployment at api.solarlayout.in |
| D11 | 2026-04-22 | ~~`apps/mvp_dashboard` as separate Clerk-authenticated app~~ → superseded by D23 | ~~Users manage license keys and view entitlements at dashboard.solarlayout.in~~ → dashboard merged into `apps/mvp_web` at `solarlayout.in/dashboard` (see D23) |
| D12 | 2026-04-22 | Python `keyring` library for license key storage in desktop apps | Uses OS-native credential stores (Windows Credential Locker, macOS Keychain, Linux Secret Service) — secure, cross-platform, no custom encryption |
| D13 | 2026-04-22 | License key = API key with `sl_live_` prefix | Simple bearer token auth for desktop apps; tied to user identity via dashboard |
| D14 | 2026-04-22 | New `packages/mvp_db` with separate Postgres DB | MVP and cloud platform have fundamentally different data models (license/entitlement vs project/version/job); shared schema would couple unrelated migrations and risk cross-domain breakage |
| D15 | 2026-04-22 | Spike plan re-prioritized for weekend launch | Dashboard + Stripe + Entitlement API + Python integration are launch-critical; SEO, GA4, legal review are post-launch |
| D16 | 2026-04-22 | Domain + deployment (old Spike 7) already complete | solarlayout.in and api.solarlayout.in live, SSL active, prod DB and S3 provisioned |
| D17 | 2026-04-22 | Website cleanup folded into Dashboard spike | Remove Phase 2 refs, "coming soon" placeholders, legal banners — small scope, natural to do alongside dashboard work |
| D18 | 2026-04-22 | Python integration: build reference impl first, then extract PRD for Prasanta | Working code is better than a spec written in isolation; PRD + Claude Code prompt derived from what actually works |
| D19 | 2026-04-22 | Stripe integration as separate spike from Dashboard | Payment flow is complex enough to warrant its own spike; dashboard can exist without Stripe initially (manual entitlement provisioning as fallback) |
| D20 | 2026-04-22 | Dashboard home page: direct presigned S3 download (no registration form) | Users are already authenticated via Clerk — we know who they are. Skip the email capture form used for unauthenticated downloads. MVP API's `GET /dashboard/download/:product` returns a 60s presigned URL directly. |
| D21 | 2026-04-22 | `packages/mvp_api-client` deferred to Spike 5 | Single inline `fetch` call in DownloadCard is sufficient for now; client package adds complexity without enough call-sites to justify it yet. |
| D22 | 2026-04-22 | Use standard Clerk env vars (`CLERK_SECRET_KEY`) in `apps/mvp_api` | Clerk's SDK expects standard env var names; custom var names (`MVP_CLERK_SECRET_KEY`) require explicit passing and are error-prone. Both MVP and cloud platform use the same Clerk org with separate apps, so per-Vercel-project env isolation handles any conflict. |
| D23 | 2026-04-22 | Merge dashboard into mvp_web (single-app pattern) | Separate dashboard app created unnecessary deployment + domain overhead. Cloud product `apps/web` proves marketing + auth pages coexist cleanly in one Next.js app. |
| D24 | 2026-04-22 | One-time payment packs, not subscriptions | Target market (Indian solar professionals) has project-based usage. Subscriptions feel wasteful for irregular use. Low price points ($1.99–$14.99) are impulse buys. Subscriptions can be added as upsell in future spike once power users emerge. |
| D25 | 2026-04-22 | Always Stripe Checkout, even for top-ups | Indian RBI mandates 2FA/OTP for most card transactions. Stripe Checkout handles 3DS automatically. Embedded Payment Element is a future enhancement. |
| D26 | 2026-04-22 | Products and features in seeded DB tables, not hardcoded | Stripe price IDs differ per environment. Feature table enables Python desktop app to query capabilities via API. |
| D27 | 2026-04-22 | Manual redirect_url param in middleware instead of auth.protect() unauthenticatedUrl | auth.protect() does not append redirect_url automatically; explicit param in proxy.ts + fallbackRedirectUrl on SignIn/SignUp components is the correct pattern. |
| D28 | 2026-04-22 | Spike 7.2 account info sourced from extended GET /entitlements (not a new endpoint) | Modal is populated from data already fetched at startup; no extra network call on dialog open. Simpler worker model — one worker, one signal, one dict. |
| D29 | 2026-04-22 | Spike 7.2 toolbar button hidden when no key stored | No point opening an account info dialog when there is no account linked. Keeps UI uncluttered for first-run users who haven't entered a key. |
| D30 | 2026-04-22 | Spike 7.2 Change Key reuses existing LicenseKeyDialog + validate-then-persist flow | Consistency with Spike 7 — same UX, same safety guarantee. New key only replaces stored key after API confirms it valid. |
