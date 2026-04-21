# MVP SolarLayout Website — Design Spec

**Date:** 2026-04-21
**PRD Reference:** `docs/mvp/PRD.md`
**Branch:** `mvp`

---

## 1. Goal

Build the public-facing SolarLayout website (`solarlayout.in`) — a marketing and product distribution site for three Windows desktop PV layout tools. Phase 1 delivers all 9 pages with full content, responsive design, and the PRD's solar brand palette. Backend integration (download registration, contact form, analytics, legal) follows in subsequent spikes.

---

## 2. Architecture

### New app: `apps/mvp_web`

A standalone Next.js 16 App Router project deployed to Vercel at `solarlayout.in`.

**Relationship to existing codebase:**

| Dependency | Used? | Notes |
|---|---|---|
| `packages/ui` (shadcn) | Yes | Button, Card, Dialog, Accordion, Table, Sheet, Input, Textarea, etc. |
| `packages/db` (Prisma) | No (Spike 1) | New models added in Spikes 2-3 |
| `packages/shared` | No | MVP has its own types |
| `packages/api-client` | No | MVP calls `apps/api` directly in later spikes |
| `apps/api` (Hono) | No (Spike 1) | Unauthenticated routes added in Spikes 2-3 |
| Clerk | No | MVP site has no auth |
| AWS S3 | No (Spike 1) | Same bucket, `downloads/` prefix, wired in Spike 2 |

**Rendering strategy:** All pages are static (SSG). No dynamic server data in Spike 1. Forms and modals are client components but do not call APIs.

### Route structure

```
app/
  layout.tsx              — root layout (Header + Footer + font + theme)
  page.tsx                — Home (/)
  products/page.tsx       — Products (/products)
  pricing/page.tsx        — Pricing (/pricing)
  how-it-works/page.tsx   — How It Works (/how-it-works)
  about/page.tsx          — About Us (/about)
  faq/page.tsx            — FAQ (/faq)
  contact/page.tsx        — Contact (/contact)
  terms/page.tsx          — Terms & Conditions (/terms)
  privacy/page.tsx        — Privacy Policy (/privacy)
```

---

## 3. Theme & Brand Palette

The PRD's color palette is applied via CSS custom properties in `apps/mvp_web/app/globals.css`, overriding shadcn defaults. The site uses `packages/ui` shadcn components but with its own visual identity.

| Role | Color | Hex |
|---|---|---|
| Primary | Deep Solar Blue | `#1A3A5C` |
| Accent / CTA | Solar Amber / Gold | `#F5A623` |
| Secondary Accent | Clean White | `#FFFFFF` |
| Background | Light Grey | `#F4F6F8` |
| Text Primary | Dark Charcoal | `#1C1C1C` |
| Text Secondary | Medium Grey | `#6B7280` |
| Success / Highlight | Solar Green | `#2CA02C` |

**Icons:** `lucide-react` (consistent with existing `apps/web`).

**Typography:** A clean, professional sans-serif. Specific font choice decided at implementation time (Inter or similar — must be Google Fonts or self-hosted for performance).

**Design principles from PRD:**
- Modern, clean, professional B2B aesthetic
- Fully responsive (mobile, tablet, desktop)
- Core Web Vitals optimised
- WCAG 2.1 AA minimum accessibility

---

## 4. Component Design

### Shared layout

- **`Header`** — sticky, logo left, nav links (Home, Products, Pricing, How It Works, About, FAQ, Contact), CTA button "Download Free Trial" right. Mobile: hamburger with Sheet/drawer.
- **`Footer`** — logo + tagline, nav links, legal links (Terms, Privacy), social icons (LinkedIn, YouTube), contact email, location (Bangalore, India), copyright.

### Home page (`/`)

| Component | Description |
|---|---|
| `HeroSection` | Bold headline + tagline, sub-headline, two CTA buttons (Explore Products, See Pricing), placeholder background image |
| `FeaturesOverview` | Three product cards (Basic, Pro, Pro Plus) — icon, name, 3-4 bullet points, "Learn More" link to /products |
| `HowItWorksSummary` | 4-step horizontal diagram with icons: Upload KMZ → Enter Parameters → Generate Layout → Export Results |
| `ScreenshotsSection` | 3-5 placeholder images, lightbox/modal on click, caption under each |
| `SystemRequirements` | Clean table: OS, RAM, Disk Space, Additional Software, Internet |

### Products page (`/products`)

| Component | Description |
|---|---|
| `ProductCard` | Product name, price badge, feature bullet list, calculation count, "Download" button |
| `DownloadModal` | shadcn Dialog: Full Name (required), Email (required), Mobile (optional), T&C checkbox (required), Submit button. Spike 1: submit shows toast "Download coming soon" |

### Pricing page (`/pricing`)

| Component | Description |
|---|---|
| `PricingCards` | Three columns: feature comparison table from PRD Section 8.4. "Buy Now" buttons disabled with tooltip "Payment coming soon" |

### How It Works page (`/how-it-works`)

| Component | Description |
|---|---|
| `StepByStep` | 4 steps with icons and full descriptions from PRD Section 8.5 |
| `SupportedFeatures` | Bulleted feature list from PRD |

### About page (`/about`)

Static content — "Built by Solar Industry Veterans", mission statement. No personal details.

### FAQ page (`/faq`)

| Component | Description |
|---|---|
| `FaqAccordion` | shadcn Accordion, questions grouped by category (About the Software, Products & Downloads, Entitlements & Calculations, Payments, Support). Real answers written — not placeholder text. Payment answers note "Phase 2". |

### Contact page (`/contact`)

| Component | Description |
|---|---|
| `ContactInfo` | Email, location, LinkedIn, YouTube |
| `ContactForm` | Full Name, Email, Subject, Message — all required. Spike 1: submit shows toast "Message sending coming soon" |

### Legal pages (`/terms`, `/privacy`)

Spike 1: brief placeholder text noting full legal content coming soon. Spike 4: full DPDP Act / IT Act compliant templates.

---

## 5. Content & Copy

**Tone:** Professional, peer-to-peer. Technical solar vocabulary used freely (GCR, MMS, ICR, string inverter, P50/P75/P90). No patronising explanations of basic solar concepts.

**Source:** All page content derived directly from PRD Sections 8.2-8.10. FAQ answers written as concise, direct responses.

**Placeholders:**
- Screenshots: placeholder images (3-5), swapped for real exe screenshots when Prasanta provides them
- Legal pages: brief placeholder text in Spike 1
- Logo: developer-created clean logo conveying solar energy and precision engineering

---

## 6. Spike Plan

### Spike 1: App scaffold + all 9 pages (stubbed API)

Full responsive website with all content. No API calls. Forms render but submit is stubbed (toast notification).

### Spike 2: DB models + download-register API

- New Prisma models: `DownloadRegistration`
- New unauthenticated Hono route: `POST /mvp/download-register` (under `/mvp` prefix to separate from existing Clerk-authenticated routes)
- Wire Products page modal to submit + trigger S3 presigned download URL
- Same S3 bucket, `downloads/` key prefix

### Spike 3: Contact form API

- New Prisma model: `ContactSubmission`
- New unauthenticated Hono route: `POST /mvp/contact` (same `/mvp` prefix)
- Wire Contact page form to submit

### Spike 4: Legal pages (full content)

- Full Terms & Conditions — IT Act 2000, Consumer Protection Act 2019 compliant
- Full Privacy Policy — DPDP Act 2023 compliant, grievance officer details
- Cookie consent banner (gates analytics in Spike 6)

### Spike 5: SEO

- Unique `<title>` and `<meta description>` per page
- Open Graph and Twitter Card meta tags
- JSON-LD structured data (Organization, SoftwareApplication)
- `sitemap.xml` auto-generated
- `robots.txt`
- Semantic HTML audit (H1/H2/H3 hierarchy)

### Spike 6: GA4 + consent mode v2

- Google Analytics 4 integration
- Consent mode v2 — GA4 only fires after cookie consent
- Event tracking: page views, download clicks, form submissions, CTA clicks

### Spike 7: Domain + production deployment

- Vercel project for `apps/mvp_web`
- Domain `solarlayout.in` configured
- SSL certificate
- Production verification

---

## 7. Out of Scope (Phase 2)

- Payment gateway integration
- User login / registration portal
- Licence key generation
- Entitlement validation API (for exe apps)
- Email confirmation on download
- Admin dashboard
- Mac / Linux support
- Multi-language support
- Blog / content section

---

## 8. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | `apps/mvp_web` as new standalone Next.js app | Different audience, no auth, different brand — clean separation from `apps/web` |
| D2 | Reuse `packages/ui` with CSS variable overrides | Avoids rebuilding shadcn primitives; theme override keeps brand distinct |
| D3 | Backend routes in existing `apps/api` | Reuses Prisma, S3, deployment infra; new routes are unauthenticated |
| D4 | Same S3 bucket, `downloads/` prefix | Simpler infra, no new bucket needed |
| D5 | Same Prisma schema, new models | Consistent DB access patterns, shared migration pipeline |
| D6 | Spike-by-spike delivery | Incremental verification; most important content ships first |
| D7 | All pages in Spike 1 (stubbed API) | Get full visual product out fast; wire up backend incrementally |
| D8 | Legal templates generated, lawyer-reviewed before launch | Faster delivery; legal review happens in parallel |
| D9 | SSG for all pages in Spike 1 | Best Core Web Vitals and SEO; no dynamic data needed yet |
