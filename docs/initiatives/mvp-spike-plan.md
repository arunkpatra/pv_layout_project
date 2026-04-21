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
| 1 | Website scaffold + all 9 pages | Full responsive site, stubbed forms, solar brand palette | in-progress | — |
| 2 | Download registration API | Prisma model, Hono endpoint, wire Products modal, S3 presigned download | planned | — |
| 3 | Contact form API | Prisma model, Hono endpoint, wire Contact form | planned | — |
| 4 | Legal pages (full content) | T&C (IT Act), Privacy (DPDP Act), cookie consent banner | planned | — |
| 5 | SEO | Meta tags, Open Graph, JSON-LD, sitemap.xml, robots.txt | planned | — |
| 6 | GA4 + consent mode v2 | Google Analytics 4, consent gating, event tracking | planned | — |
| 7 | Domain + production deployment | Vercel project, solarlayout.in, SSL, production verification | planned | — |

---

## Architecture

```
apps/mvp_web/     → Next.js 16 App Router — public marketing site (solarlayout.in)
apps/api/         → Hono API server — new unauthenticated /mvp/* routes (Spikes 2-3)
packages/ui/      → Shared shadcn/ui components (reused with solar palette overrides)
packages/db/      → Prisma schema — new models for download registration + contact (Spikes 2-3)
```

**Key boundaries:**
- `apps/mvp_web` has NO Clerk, NO auth, NO TanStack Query, NO api-client
- Reuses `packages/ui` components with CSS variable overrides for the solar brand palette
- Backend routes in `apps/api` under `/mvp` prefix are unauthenticated (separate from existing Clerk-authenticated routes)
- Same S3 bucket, `downloads/` key prefix for exe files

---

## Spike 1: Website Scaffold + All 9 Pages

**Status:** in-progress  
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

## Spike 2: Download Registration API

**Status:** planned

**Scope:**
- New Prisma model: `DownloadRegistration` (name, email, mobile, product, ipAddress, timestamp)
- DB migration
- New unauthenticated Hono route: `POST /mvp/download-register`
  - Validates input (Zod)
  - Saves registration to DB
  - Returns S3 presigned download URL for the selected product exe
  - Handles duplicate email logic
- Wire Products page DownloadModal to call the API
- On success: trigger file download from presigned URL
- Upload three placeholder exe files to S3 under `downloads/` prefix

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] POST to `/mvp/download-register` with valid data returns presigned URL
- [ ] Registration saved to DB (verify in Prisma Studio)
- [ ] Products page modal submits and triggers file download
- [ ] Invalid input returns appropriate error
- [ ] Duplicate email handled gracefully

---

## Spike 3: Contact Form API

**Status:** planned

**Scope:**
- New Prisma model: `ContactSubmission` (name, email, subject, message, ipAddress, timestamp)
- DB migration
- New unauthenticated Hono route: `POST /mvp/contact`
  - Validates input (Zod)
  - Saves submission to DB
- Wire Contact page form to call the API
- Success message: "Thank you for reaching out. We will get back to you within 2 business days."

**Acceptance Criteria:**
- [ ] Gates pass
- [ ] POST to `/mvp/contact` with valid data returns success
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
- New Vercel project for `apps/mvp_web`
- Domain `solarlayout.in` configured in Vercel
- SSL certificate (automatic via Vercel)
- Environment variables configured
- Production build and deployment
- All pages verified in production

**Acceptance Criteria:**
- [ ] `solarlayout.in` resolves to the MVP website
- [ ] HTTPS working (SSL certificate active)
- [ ] All 9 pages load correctly in production
- [ ] Download registration works in production (after Spike 2)
- [ ] Contact form works in production (after Spike 3)
- [ ] Core Web Vitals within acceptable range

---

## Decisions Log

| # | Date | Decision | Rationale |
|---|---|---|---|
| D1 | 2026-04-21 | New standalone app `apps/mvp_web` | Different audience, no auth, different brand — clean separation from `apps/web` |
| D2 | 2026-04-21 | Reuse `packages/ui` with CSS variable overrides | Avoids rebuilding shadcn primitives; theme override keeps brand distinct |
| D3 | 2026-04-21 | Backend routes in existing `apps/api` under `/mvp` prefix | Reuses Prisma, S3, deployment infra; unauthenticated routes separated by prefix |
| D4 | 2026-04-21 | Same S3 bucket, `downloads/` key prefix | Simpler infra, no new bucket needed |
| D5 | 2026-04-21 | Same Prisma schema, new models | Consistent DB access patterns, shared migration pipeline |
| D6 | 2026-04-21 | Spike-by-spike delivery | Incremental verification; most important content ships first |
| D7 | 2026-04-21 | All pages in Spike 1 (stubbed API) | Get full visual product out fast; wire up backend incrementally |
| D8 | 2026-04-21 | Legal templates generated by developer, lawyer-reviewed before launch | Faster delivery; legal review happens in parallel |
| D9 | 2026-04-21 | SSG for all pages in Spike 1 | Best Core Web Vitals and SEO; no dynamic data needed yet |
