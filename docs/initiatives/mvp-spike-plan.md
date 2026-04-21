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
| 4 | Legal pages (full content) | T&C (IT Act), Privacy (DPDP Act), cookie consent banner | planned | — |
| 5 | SEO | Meta tags, Open Graph, JSON-LD, sitemap.xml, robots.txt | planned | — |
| 6 | GA4 + consent mode v2 | Google Analytics 4, consent gating, event tracking | planned | — |
| 7 | Domain + production deployment | Vercel projects for mvp_web + mvp_api, solarlayout.in, api.solarlayout.in | planned | — |
| 8 | Dashboard app + license key generation | `apps/mvp_dashboard` (Clerk auth), license key CRUD, display entitlements | planned | — |
| 9 | Entitlement validation + usage reporting API | API key auth middleware, entitlement check endpoint, usage recording | planned | — |
| 10 | Python app integration guide | `keyring` storage, API call pattern, usage reporting, reference implementation | planned | — |

---

## Architecture

```
apps/mvp_web/         → Next.js 16 App Router — public marketing site (solarlayout.in)
apps/mvp_api/         → Hono API on Bun — MVP backend (api.solarlayout.in)
apps/mvp_dashboard/   → Next.js 16 App Router — user dashboard (dashboard.solarlayout.in) [Spike 8]
packages/ui/          → Shared shadcn/ui components (reused with solar palette overrides)
packages/mvp_db/      → Prisma schema + client for MVP domain (separate DB from cloud platform)
packages/db/          → Prisma schema + client for cloud platform (unchanged, not used by MVP)
```

**Key boundaries:**
- `apps/mvp_web` — public, NO auth, NO Clerk. Calls `apps/mvp_api` for download registration + contact
- `apps/mvp_api` — standalone Hono server (same tech stack as `apps/api`). Two auth modes:
  - Unauthenticated: download-register, contact form
  - API key auth: entitlement validation, usage reporting (called by desktop Python apps)
  - Clerk auth: dashboard API routes (Spike 8)
- `apps/mvp_dashboard` — Clerk-authenticated, where users view license keys and entitlements
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

## Spike 4: Legal Pages (Full Content)

**Status:** planned

**Scope:**
- Full Terms & Conditions page — IT Act 2000, Consumer Protection Act 2019 compliant
  - Covers: software use, IP, liability, refund, jurisdiction (Bangalore), prohibited uses
- Full Privacy Policy page — DPDP Act 2023 compliant
  - Covers: data collected, purpose, storage, retention, user rights, third-party sharing, cookies, grievance officer
- Cookie consent banner on first visit
  - Must gate analytics tracking (wired in Spike 6)
  - Stores consent preference in localStorage or cookie

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] Terms page has substantive legal content with Indian law references
- [ ] Privacy page has DPDP Act compliant content with grievance officer details
- [ ] Cookie consent banner appears on first visit
- [ ] Banner does not reappear after consent given
- [ ] Banner reappears if consent cookie is cleared

---

## Spike 5: SEO

**Status:** planned

**Scope:**
- Unique `<title>` and `<meta description>` for every page (Next.js metadata API)
- Open Graph and Twitter Card meta tags for social sharing
- JSON-LD structured data: Organization schema, SoftwareApplication schema
- `sitemap.xml` auto-generated (next-sitemap or Next.js built-in)
- `robots.txt` configured
- Semantic HTML audit (H1/H2/H3 hierarchy on all pages)
- Image alt tags on all images

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] Each page has unique title and meta description (verify with View Source)
- [ ] Social sharing preview works (Open Graph tags present)
- [ ] `/sitemap.xml` returns valid sitemap with all pages
- [ ] `/robots.txt` returns valid robots file
- [ ] JSON-LD structured data in page source
- [ ] H1 → H2 → H3 hierarchy correct on all pages

---

## Spike 6: GA4 + Consent Mode v2

**Status:** planned

**Scope:**
- Google Analytics 4 integration with measurement ID
- Consent mode v2 — GA4 only fires after user accepts cookie consent (from Spike 4)
- Event tracking:
  - Page views
  - Download button clicks (per product)
  - Email capture form submissions (per product)
  - Contact form submissions
  - Pricing page views
  - CTA button clicks

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] GA4 does NOT fire before cookie consent
- [ ] GA4 fires after cookie consent accepted
- [ ] Page view events tracked in GA4 dashboard
- [ ] Download click events tracked
- [ ] Form submission events tracked

---

## Spike 7: Domain + Production Deployment

**Status:** planned

**Scope:**
- New Vercel project for `apps/mvp_web` → `solarlayout.in`
- New Vercel project for `apps/mvp_api` → `api.solarlayout.in`
- SSL certificates (automatic via Vercel)
- Environment variables configured (DB, S3, CORS)
- Production build and deployment for both
- All pages + API endpoints verified in production

**Acceptance Criteria:**
- [ ] `solarlayout.in` resolves to the MVP website
- [ ] `api.solarlayout.in` resolves to the MVP API
- [ ] HTTPS working on both domains
- [ ] All 9 pages load correctly in production
- [ ] Download registration works end-to-end in production
- [ ] Contact form works end-to-end in production
- [ ] Core Web Vitals within acceptable range

---

## Spike 8: Dashboard App + License Key Generation

**Status:** planned

**Scope:**
- New Next.js 16 app: `apps/mvp_dashboard` — deployed to `dashboard.solarlayout.in`
  - Clerk authentication (user signup/login)
  - Solar brand palette (shared with `mvp_web`)
  - Reuses `packages/ui` components
- New Prisma models in `packages/mvp_db`:
  - `LicenseKey` (key, userId, email, product, createdAt, revokedAt)
  - `Entitlement` (userId, product, totalCalculations, usedCalculations, purchasedAt)
- Dashboard pages:
  - Home: overview of license keys and remaining entitlements
  - License Keys: generate, view, revoke API keys
  - Entitlements: view purchased plans, remaining calculations per product
- License key generation: cryptographically random, prefixed (e.g. `sl_live_...`)
- API routes in `apps/mvp_api` for dashboard CRUD (Clerk-authenticated)
- Consider creating `packages/mvp_shared` — shared TypeScript types between `mvp_api` and `mvp_dashboard` (LicenseKey, Entitlement, User types). Evaluate at spike start — YAGNI until cross-app type dependency is confirmed.
- Consider creating `packages/mvp_api-client` — type-safe HTTP client for `mvp_dashboard` → `mvp_api`. Evaluate at spike start — may not be needed if dashboard uses server-side API calls directly.

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] User can sign up / sign in at `dashboard.solarlayout.in`
- [ ] User can generate a license key
- [ ] User can view their license key(s)
- [ ] User can see their entitlement balances
- [ ] License key is displayed once at creation (copy-to-clipboard)

---

## Spike 9: Entitlement Validation + Usage Reporting API

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

## Spike 10: Python App Integration Guide + Reference Implementation

**Status:** planned

**Scope:**
- Python reference module (`solarlayout_client/`) demonstrating:
  - License key storage via `keyring` (cross-platform: Windows Credential Locker, macOS Keychain, Linux Secret Service)
  - First-run prompt: ask user for license key → store in keyring
  - Subsequent runs: retrieve silently from keyring
  - API client: check entitlements before generation, report usage after successful generation
  - Error handling: expired key, exhausted entitlements, network failure
- Integration guide document for Prasanta's Python apps:
  - `pip install keyring` + usage pattern
  - API endpoint reference
  - Example code for each API call
  - Platform-specific notes (Windows UAC, macOS Keychain access prompt, Linux Secret Service setup)
- Modify one of Prasanta's apps as reference (or provide a standalone demo script)

**Acceptance Criteria:**
- [ ] Reference module stores/retrieves license key on all 3 platforms
- [ ] `keyring.get_password("solarlayout", "license_key")` returns stored key
- [ ] Entitlement check works before generation
- [ ] Usage reporting works after generation
- [ ] Integration guide document reviewed by Prasanta
- [ ] At least one Python app demonstrates the full flow end-to-end

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
| D11 | 2026-04-22 | `apps/mvp_dashboard` as separate Clerk-authenticated app | Users manage license keys and view entitlements at dashboard.solarlayout.in |
| D12 | 2026-04-22 | Python `keyring` library for license key storage in desktop apps | Uses OS-native credential stores (Windows Credential Locker, macOS Keychain, Linux Secret Service) — secure, cross-platform, no custom encryption |
| D13 | 2026-04-22 | License key = API key with `sl_live_` prefix | Simple bearer token auth for desktop apps; tied to user identity via dashboard |
| D14 | 2026-04-22 | New `packages/mvp_db` with separate Postgres DB | MVP and cloud platform have fundamentally different data models (license/entitlement vs project/version/job); shared schema would couple unrelated migrations and risk cross-domain breakage |
