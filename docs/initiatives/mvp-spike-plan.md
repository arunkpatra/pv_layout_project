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
| 5.1 | Clerk sign-in preserve original URL | After sign-in, redirect to the page user was trying to reach instead of always /dashboard | planned | — |
| 6 | Entitlement API + license key generation | API key auth middleware, license key CRUD, entitlement check, usage reporting endpoints | planned | — |
| 7 | Python app integration | Integrate auth/license key into PVlayout_Advance, write PRD + Claude Code prompt for Prasanta | planned | — |
| 8 | SEO | Meta tags, Open Graph, JSON-LD, sitemap.xml, robots.txt | post-launch | — |
| 9 | GA4 + consent mode v2 | Google Analytics 4, consent gating, event tracking | post-launch | — |
| 10 | Legal pages full review | Full DPDP Act / IT Act legal review | post-launch | — |
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

**Status:** planned

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

**Status:** planned

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

**Status:** planned

**Scope:**
- After sign-in, Clerk should redirect to the page the user was originally trying to reach (e.g. `/dashboard/plan?product=pv-layout-pro`) instead of always redirecting to `/dashboard`
- Affects: `apps/mvp_web/proxy.ts`, sign-in/sign-up page `forceRedirectUrl`, and Clerk env vars
- Small scope — configuration fix, no new features

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] User visits `/dashboard/plan?product=pv-layout-pro` while signed out → Clerk sign-in → redirected back to `/dashboard/plan?product=pv-layout-pro`
- [ ] Normal sign-in (no original URL) → redirected to `/dashboard`

---

## Spike 6: Entitlement API + License Key Generation

**Status:** planned

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

**Status:** planned

**Scope:**
- Integrate auth/license key into `/Users/arunkpatra/codebase/PVlayout_Advance` as reference implementation:
  - License key storage via `keyring` (cross-platform: Windows Credential Locker, macOS Keychain, Linux Secret Service)
  - First-run prompt: ask user for license key → store in keyring
  - Subsequent runs: retrieve silently from keyring
  - API client: check entitlements before generation, report usage after successful generation
  - Error handling: expired key, exhausted entitlements, network failure
- Extract PRD + Claude Code prompt for Prasanta from the working implementation:
  - What to change in each Python app
  - `pip install keyring` + usage pattern
  - API endpoint reference with example calls
  - Platform-specific notes (Windows UAC, macOS Keychain, Linux Secret Service)

**Acceptance Criteria:**
- [ ] PVlayout_Advance prompts for license key on first run
- [ ] Key stored in OS credential store via keyring
- [ ] Entitlement check works before generation
- [ ] Usage reporting works after successful generation
- [ ] PRD document written for Prasanta
- [ ] Claude Code prompt tested and produces working integration
- [ ] End-to-end flow: dashboard signup → purchase → get key → paste in Python app → generate → usage recorded

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
