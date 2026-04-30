# MVP Web Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all marketing pages, header, footer, and dashboard pages in `apps/mvp_web` to match the Claude Design handoff.

**Architecture:** Component-by-component replacement using Approach A. Reuse shadcn primitives (Card, Button, Table, etc.), restyle with Tailwind utilities, build net-new components (SVG illustrations, page header, section patterns) as local React components. Design spec at `docs/superpowers/specs/2026-04-26-mvp-web-redesign-design.md`. Handoff HTML at `/tmp/solarlayout-handoff/solarlayout/project/SolarLayout.html` (read for layout reference, NOT for copy — current codebase is copy authority).

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, shadcn/ui, Geist + Geist Mono fonts, Lucide icons, Clerk auth.

**Key Rules:**
- The handoff HTML is **layout/structure authority** only. Current codebase components are **copy authority**.
- Where handoff introduces copy that doesn't exist, cross-reference against PRD at `docs/mvp/PRD.md`.
- Drop or correct anything factually incorrect (e.g., "KML" support — we only support KMZ).
- All gates must pass after each task: `bun run lint && bun run typecheck && bun run test && bun run build`

---

## File Map

### New files to create:
- `apps/mvp_web/components/eyebrow.tsx` — Mono uppercase label with accent square marker
- `apps/mvp_web/components/section-band.tsx` — Full-width section wrapper (padding, border, muted variant)
- `apps/mvp_web/components/section-head.tsx` — Section header (eyebrow + title + description + optional CTA)
- `apps/mvp_web/components/page-header.tsx` — Shared page header (breadcrumb, title, description, optional right column)
- `apps/mvp_web/components/schematic-illustration.tsx` — Hero SVG (boundary, tables, inverters, cables)
- `apps/mvp_web/components/layout-canvas-screenshot.tsx` — Screenshot SVG (app canvas view)
- `apps/mvp_web/components/cable-schedule-screenshot.tsx` — Screenshot SVG (cable table)
- `apps/mvp_web/components/yield-report-screenshot.tsx` — Screenshot SVG (yield bar chart)
- `apps/mvp_web/components/window-frame.tsx` — Reusable window chrome (dots bar + content + optional caption)
- `apps/mvp_web/app/(marketing)/how-it-works/page.tsx` — How It Works full page (currently exists, will be rewritten)

### Files to modify:
- `apps/mvp_web/app/layout.tsx` — Add Geist Mono font
- `apps/mvp_web/components/header.tsx` — Full redesign
- `apps/mvp_web/components/footer.tsx` — Full redesign
- `apps/mvp_web/components/hero-section.tsx` — Full redesign
- `apps/mvp_web/components/features-overview.tsx` — Full redesign
- `apps/mvp_web/components/how-it-works-summary.tsx` — Full redesign
- `apps/mvp_web/components/screenshots-section.tsx` — Full redesign
- `apps/mvp_web/components/system-requirements.tsx` — Full redesign
- `apps/mvp_web/app/(marketing)/products/page.tsx` — Full redesign
- `apps/mvp_web/components/pricing-cards.tsx` — Full redesign (comparison table)
- `apps/mvp_web/app/(marketing)/how-it-works/page.tsx` — Full redesign
- `apps/mvp_web/components/faq-accordion.tsx` — Sidebar nav + details accordion
- `apps/mvp_web/app/(marketing)/faq/page.tsx` — Layout update for sidebar
- `apps/mvp_web/components/contact-form.tsx` — Add subject dropdown, new layout
- `apps/mvp_web/components/contact-info.tsx` — Mono key-value layout
- `apps/mvp_web/app/(marketing)/contact/page.tsx` — Two-column layout
- `apps/mvp_web/app/(marketing)/about/page.tsx` — Two-column layout with stats
- `apps/mvp_web/app/(marketing)/pricing/page.tsx` — Page header update
- `apps/mvp_web/app/(main)/dashboard/page.tsx` — Typography/styling
- `apps/mvp_web/app/(main)/dashboard/plans/page.tsx` — Typography/styling
- `apps/mvp_web/app/(main)/dashboard/usage/page.tsx` — Typography/styling
- `apps/mvp_web/components/dashboard-sidebar.tsx` — Mono labels, styling

### Test files to update:
- `apps/mvp_web/app/(marketing)/page.test.tsx`
- `apps/mvp_web/app/(marketing)/products/page.test.tsx`
- `apps/mvp_web/app/(marketing)/pricing/page.test.tsx`
- `apps/mvp_web/app/(marketing)/about/page.test.tsx`
- `apps/mvp_web/app/(marketing)/faq/page.test.tsx`
- `apps/mvp_web/components/contact-form.test.tsx`
- `apps/mvp_web/components/download-card.test.tsx`

### Files to delete:
- `apps/mvp_web/components/step-by-step.tsx` — Content merged into How It Works page
- `apps/mvp_web/components/supported-features.tsx` — Rebuilt as part of How It Works page
- `apps/mvp_web/components/product-card.tsx` — Products page no longer uses this component
- `apps/mvp_web/components/product-card.test.tsx` — (if exists)

---

### Task 1: Foundation — Font + Shared Components

**Files:**
- Modify: `apps/mvp_web/app/layout.tsx`
- Create: `apps/mvp_web/components/eyebrow.tsx`
- Create: `apps/mvp_web/components/section-band.tsx`
- Create: `apps/mvp_web/components/section-head.tsx`
- Create: `apps/mvp_web/components/page-header.tsx`
- Create: `apps/mvp_web/components/window-frame.tsx`

- [ ] **Step 1: Add Geist Mono font to root layout**

In `apps/mvp_web/app/layout.tsx`, add Geist_Mono import and variable:

```tsx
import { Geist, Geist_Mono } from "next/font/google"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})
```

Update the `<html>` className to include both variables:

```tsx
className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
```

- [ ] **Step 2: Create Eyebrow component**

Create `apps/mvp_web/components/eyebrow.tsx`:

```tsx
interface EyebrowProps {
  children: React.ReactNode
}

export function Eyebrow({ children }: EyebrowProps) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
      <span
        className="inline-block h-2 w-2 rounded-[1px] bg-accent"
        aria-hidden="true"
      />
      {children}
    </span>
  )
}
```

- [ ] **Step 3: Create SectionBand component**

Create `apps/mvp_web/components/section-band.tsx`:

```tsx
import { cn } from "@renewable-energy/ui/lib/utils"

interface SectionBandProps {
  children: React.ReactNode
  muted?: boolean
  className?: string
}

export function SectionBand({
  children,
  muted,
  className,
}: SectionBandProps) {
  return (
    <section
      className={cn(
        "border-b border-border py-[72px]",
        muted && "bg-[#FBFCFD]",
        className,
      )}
    >
      <div className="mx-auto max-w-[1200px] px-6">{children}</div>
    </section>
  )
}
```

- [ ] **Step 4: Create SectionHead component**

Create `apps/mvp_web/components/section-head.tsx`:

```tsx
import Link from "next/link"
import { Eyebrow } from "./eyebrow"

interface SectionHeadProps {
  eyebrow: string
  title: string
  description?: string
  ctaHref?: string
  ctaLabel?: string
}

export function SectionHead({
  eyebrow,
  title,
  description,
  ctaHref,
  ctaLabel,
}: SectionHeadProps) {
  return (
    <div className="mb-9 flex items-end justify-between gap-6">
      <div className="max-w-[640px]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-1.5 text-[28px] font-semibold leading-[1.15] tracking-[-0.015em]">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="shrink-0 text-sm text-[#374151] transition-colors hover:text-primary"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create PageHeader component**

Create `apps/mvp_web/components/page-header.tsx`:

```tsx
interface PageHeaderProps {
  breadcrumb: string[]
  title: string
  description: string
  children?: React.ReactNode
}

export function PageHeader({
  breadcrumb,
  title,
  description,
  children,
}: PageHeaderProps) {
  return (
    <div className="border-b border-border bg-[#FBFCFD] pb-10 pt-16">
      <div className="mx-auto max-w-[1200px] px-6">
        <div
          className={
            children
              ? "grid items-end gap-12 lg:grid-cols-[1.2fr_1fr]"
              : undefined
          }
        >
          <div>
            <div className="mb-3.5 flex gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {breadcrumb.map((segment, i) => (
                <span key={segment}>
                  {i > 0 && (
                    <span className="mr-1.5 text-[#9CA3AF]">/</span>
                  )}
                  {segment}
                </span>
              ))}
            </div>
            <h1 className="text-[40px] font-bold leading-[1.1] tracking-[-0.02em]">
              {title}
            </h1>
            <p className="mt-3.5 max-w-[60ch] text-lg text-[#374151]">
              {description}
            </p>
          </div>
          {children && <div className="pb-1.5">{children}</div>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create WindowFrame component**

Create `apps/mvp_web/components/window-frame.tsx`:

```tsx
interface WindowFrameProps {
  title: string
  badge?: string
  caption?: string
  captionMeta?: string
  children: React.ReactNode
}

export function WindowFrame({
  title,
  badge,
  caption,
  captionMeta,
  children,
}: WindowFrameProps) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border bg-[#FAFBFC] px-3.5 py-2.5 font-mono text-xs text-muted-foreground">
        <div className="flex gap-[5px]">
          <span className="h-[9px] w-[9px] rounded-full bg-[#E5E7EB]" />
          <span className="h-[9px] w-[9px] rounded-full bg-[#E5E7EB]" />
          <span className="h-[9px] w-[9px] rounded-full bg-[#E5E7EB]" />
        </div>
        <span className="ml-2">{title}</span>
        {badge && (
          <span className="ml-auto rounded-full border border-[#cfe3d8] bg-secondary px-2 py-0.5 text-[11px] text-primary">
            {badge}
          </span>
        )}
      </div>
      <div className="bg-[#FAFBFC]">{children}</div>
      {caption && (
        <div className="flex items-center justify-between border-t border-border bg-white px-3.5 py-3">
          <span className="text-[13px] font-medium">{caption}</span>
          {captionMeta && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {captionMeta}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Verify typecheck passes**

Run: `bunx turbo typecheck --filter=@renewable-energy/mvp-web`
Expected: success, no type errors

- [ ] **Step 8: Commit foundation**

```bash
git add apps/mvp_web/app/layout.tsx apps/mvp_web/components/eyebrow.tsx apps/mvp_web/components/section-band.tsx apps/mvp_web/components/section-head.tsx apps/mvp_web/components/page-header.tsx apps/mvp_web/components/window-frame.tsx
git commit -m "feat(mvp-web): add Geist Mono font and shared redesign components"
```

---

### Task 2: Header Redesign

**Files:**
- Modify: `apps/mvp_web/components/header.tsx`

- [ ] **Step 1: Rewrite header component**

Rewrite `apps/mvp_web/components/header.tsx` to match the handoff design. Key changes:
- Background: semi-transparent with `backdrop-filter: saturate(140%) blur(8px)`, use `bg-background/85`
- Brand: replace Sun icon with a green square mark (28px div with Sun SVG inside) + "SolarLayout" text + mono `/ pv layout` subtitle
- Nav links: same 7 links, hover adds `bg-secondary text-primary`, active is `text-primary font-medium`
- CTA: change from orange "Download Now" to green primary "Download" button with Lucide `Download` icon
- Keep auth buttons (Sign In / Dashboard) in same position
- Mobile sheet: restyle brand, nav links, and CTA to match new design
- Keep existing responsive breakpoint at `md:`

Reference the handoff HTML `.header` section (lines 484-506) for exact layout. Keep all existing functionality (Clerk auth, pathname-based active state, Sheet mobile menu).

- [ ] **Step 2: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass (warnings OK, no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_web/components/header.tsx
git commit -m "feat(mvp-web): redesign header with backdrop blur and brand mark"
```

---

### Task 3: Footer Redesign

**Files:**
- Modify: `apps/mvp_web/components/footer.tsx`

- [ ] **Step 1: Rewrite footer component**

Rewrite `apps/mvp_web/components/footer.tsx`. Key changes:
- Background: `bg-[#0F1418]` (near-black) replaces `bg-primary`
- Text colors: links `text-[#D1D5DB]` hover `text-white`, labels `text-[#9CA3AF]`
- Border top: `border-[#1F2A30]`
- 4-column grid `lg:grid-cols-[1.4fr_1fr_1fr_1fr]`:
  1. Brand block: green square mark + white "SolarLayout" name + description paragraph + social icons (LinkedIn, YouTube) in 34px bordered square buttons
  2. Product: Products, Pricing, How it works, Download (links)
  3. Company: About, FAQ, Contact, Careers (Careers href="#")
  4. Legal: Terms & Conditions, Privacy Policy, Cookie Policy (href="#"), DPDP grievance (href="#")
- Column headings: `font-mono text-[11px] uppercase tracking-[0.1em] text-[#9CA3AF]`
- Legal bar at bottom: mono text, flex row with copyright left + email right, `border-t border-[#1F2A30]`
- Social icons: use inline SVGs (LinkedIn and YouTube) in bordered square buttons, not Lucide icons (to match handoff exactly)
- Keep `new Date().getFullYear()` for copyright year

Reference the handoff HTML footer section (lines 1461-1510) for layout.

- [ ] **Step 2: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 3: Commit**

```bash
git add apps/mvp_web/components/footer.tsx
git commit -m "feat(mvp-web): redesign footer with dark background and restructured columns"
```

---

### Task 4: Home Page — Hero Section + Schematic

**Files:**
- Modify: `apps/mvp_web/components/hero-section.tsx`
- Create: `apps/mvp_web/components/schematic-illustration.tsx`

- [ ] **Step 1: Create SchematicIllustration component**

Create `apps/mvp_web/components/schematic-illustration.tsx`. This is a static inline SVG React component wrapped in a WindowFrame. It shows:
- Window bar: "site_boundary.kmz · 184.3 ha · 12 obstructions" + badge "Auto-layout · 47.2 MWp"
- SVG content (viewBox 640x360): grid background pattern, KMZ boundary polygon (green stroke), MMS table rows (green rectangles in 3 blocks), exclusion zone ellipse (labeled "EXCL · pond"), transmission corridor (orange dashed line with label), 4 inverters (orange squares with INV-01..04 labels), 4 lightning arresters, ICR building, DC cable trace (green dashed), GCR annotation, compass rose
- Footer data strip: 4 cells (Capacity DC: 47.2 MWp, GCR: 0.42, Tables: 1,184, Inverters: 4 x CUF)

Port the SVG directly from the handoff HTML lines 544-645. Use the WindowFrame component for the chrome. Export as a default function component.

- [ ] **Step 2: Rewrite HeroSection component**

Rewrite `apps/mvp_web/components/hero-section.tsx`. Key changes:
- Two-column grid: `grid-cols-[1.05fr_1.1fr]` with `gap-16`, `items-center`
- Padding: `py-16 pb-20`, bottom border
- Left column:
  - Eyebrow: "Utility-scale PV · Windows desktop"
  - Display heading: `text-[56px] font-bold leading-[1.05] tracking-[-0.025em]` with `<em className="not-italic text-primary">bankable layout</em>`
  - Subtitle paragraph: `text-lg text-[#374151] max-w-[54ch]`
  - CTA row: green primary Button "Explore products" with arrow SVG + outline Button "See pricing" — Link to `/products` and `/pricing`
  - Meta strip `<dl>`: 3-column grid below a top border with `mt-9 pt-5`. Each item has mono `<dt>` label (Input, Output, Topology) and `<dd>` value with `<small>` description. Copy from handoff BUT verify against PRD — use "KMZ" not "KMZ / KML".
- Right column: render `<SchematicIllustration />`
- Responsive: single column on `<lg`, schematic below text, display heading 38px on `<sm`

Reference handoff HTML lines 511-648 for exact layout.

- [ ] **Step 3: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_web/components/hero-section.tsx apps/mvp_web/components/schematic-illustration.tsx
git commit -m "feat(mvp-web): redesign hero section with schematic illustration"
```

---

### Task 5: Home Page — Features Overview + How It Works Summary

**Files:**
- Modify: `apps/mvp_web/components/features-overview.tsx`
- Modify: `apps/mvp_web/components/how-it-works-summary.tsx`

- [ ] **Step 1: Rewrite FeaturesOverview component**

Rewrite `apps/mvp_web/components/features-overview.tsx`. Uses SectionBand + SectionHead. Key changes:
- SectionBand (not muted)
- SectionHead: eyebrow "01 / Products", title "Three plans, one application.", description "Pick the depth of automation your project stage needs. Calculations are pooled per purchase.", ctaHref="/products", ctaLabel="All products →"
- 3-column grid of feature cards (NOT shadcn Card — custom styled divs):
  - Each card: border, rounded, padding 24px, flex column, gap 14px, hover border-color change
  - Content: mono tag span (e.g., "PV Layout · Basic"), h3 headline (e.g., "Boundary → Layout"), price div (24px bold + `<small>` text), `<ul>` with `li::before` accent line (use a `border-t` styled span or `w-[14px] h-px bg-accent mt-[10px]`), dashed footer with calcs count + "Learn more →" link
  - Pro card: accent border + inset accent shadow + "Most used" absolute badge
- Copy sourced from current `features-overview.tsx` plan data (names, prices, features). Do NOT use handoff copy — it says "KML" which is wrong.

Reference handoff HTML lines 651-713 for layout structure.

- [ ] **Step 2: Rewrite HowItWorksSummary component**

Rewrite `apps/mvp_web/components/how-it-works-summary.tsx`. Uses SectionBand (muted) + SectionHead. Key changes:
- SectionHead: eyebrow "02 / Pipeline", title "From boundary to deliverable.", description "Four steps. No re-keying coordinates between Google Earth, AutoCAD and PVsyst.", ctaHref="/how-it-works", ctaLabel="Read the workflow →"
- 4-column step strip in a single bordered card with rounded corners, overflow hidden, white bg:
  - Each step: `border-r border-border` (last child none), padding 24px, flex column, gap 10px
  - Icon in 36px bordered square div with primary color SVG (use Lucide: Upload, Server, Activity, Download)
  - Mono "Step 01" label
  - h4 title (16px, 600 weight)
  - p description (13.5px, muted-foreground)
- Steps: Import boundary, Configure parameters, Generate layout, Export deliverables
- Copy from current `how-it-works-summary.tsx` — keep existing step descriptions
- Responsive: 2 columns on tablet, 1 column on mobile, with bottom borders instead of right

Reference handoff HTML lines 715-762 for layout.

- [ ] **Step 3: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_web/components/features-overview.tsx apps/mvp_web/components/how-it-works-summary.tsx
git commit -m "feat(mvp-web): redesign features overview and how-it-works summary"
```

---

### Task 6: Home Page — Screenshots + System Requirements

**Files:**
- Modify: `apps/mvp_web/components/screenshots-section.tsx`
- Modify: `apps/mvp_web/components/system-requirements.tsx`
- Create: `apps/mvp_web/components/layout-canvas-screenshot.tsx`
- Create: `apps/mvp_web/components/cable-schedule-screenshot.tsx`
- Create: `apps/mvp_web/components/yield-report-screenshot.tsx`

- [ ] **Step 1: Create three screenshot SVG components**

Create three inline SVG React components. Each returns an `<svg>` element. Port directly from the handoff HTML:

1. `layout-canvas-screenshot.tsx` (lines 783-857): App canvas with tool rail, properties panel, boundary polygon, table rows, inverters, selection highlight. viewBox="0 0 800 460".

2. `cable-schedule-screenshot.tsx` (lines 870-894): Table showing cable schedule data. viewBox="0 0 600 220".

3. `yield-report-screenshot.tsx` (lines 902-932): Bar chart with monthly generation + P50/P75/P90/CUF stats. viewBox="0 0 600 220".

Each component is a simple function returning the SVG. No props needed.

- [ ] **Step 2: Rewrite ScreenshotsSection component**

Rewrite `apps/mvp_web/components/screenshots-section.tsx`. Uses SectionBand + SectionHead + WindowFrame. Key changes:
- SectionHead: eyebrow "03 / The application", title "A look inside SolarLayout.", description "Selected views from the Windows desktop application."
- Two-column grid `grid-cols-[1.4fr_1fr]` with gap 20px:
  - Left: WindowFrame with `LayoutCanvasScreenshot`, title "SolarLayout — Project: Karnataka_47MW_phase1.slpx", caption "Layout canvas — table grid, inverters, exclusions", captionMeta "View · Layout/2D". This div spans 2 rows (`row-span-2`).
  - Right top: WindowFrame with `CableScheduleScreenshot`, title "BoQ — cable schedule", caption "Cable schedule — automatic from layout", captionMeta "Pro / Pro Plus"
  - Right bottom: WindowFrame with `YieldReportScreenshot`, title "Yield report", caption "Yield report — P50/P75/P90, monthly generation", captionMeta "Pro Plus only"
- Responsive: single column on `<lg`

Reference handoff HTML lines 764-939 for layout.

- [ ] **Step 3: Rewrite SystemRequirements component**

Rewrite `apps/mvp_web/components/system-requirements.tsx`. Uses SectionBand (muted) + SectionHead. Key changes:
- SectionHead: eyebrow "04 / Requirements", title "System requirements.", description "SolarLayout is a Windows desktop application. Internet is required for entitlement validation only."
- Two-column grid `grid-cols-[1.05fr_1fr]` gap 48px:
  - Left: styled `<table>` with 6 rows. `<th>` cells: mono uppercase, 11px, muted-foreground, 40% width, bg `#FBFCFD`. `<td>` cells: 14px. Rows: Operating system (Windows 10 64-bit or higher), RAM (8 GB min, 16 GB recommended), Disk space (1.2 GB + 500 MB working), Display (1920x1080 minimum), Additional software (None required), Internet connection (Required for entitlement validation).
  - Right: heading "Inputs and outputs" + description paragraph + card with 2-column grid (Reads: .kmz, Writes: .kmz .dxf .pdf) separated by border + mono compatibility note "compatible with: AutoCAD · QGIS · Google Earth Pro"
- Copy from current `system-requirements.tsx` for table data
- Responsive: single column on `<lg`

Reference handoff HTML lines 942-984.

- [ ] **Step 4: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_web/components/screenshots-section.tsx apps/mvp_web/components/system-requirements.tsx apps/mvp_web/components/layout-canvas-screenshot.tsx apps/mvp_web/components/cable-schedule-screenshot.tsx apps/mvp_web/components/yield-report-screenshot.tsx
git commit -m "feat(mvp-web): redesign screenshots and system requirements sections"
```

---

### Task 7: Products Page

**Files:**
- Modify: `apps/mvp_web/app/(marketing)/products/page.tsx`
- Delete: `apps/mvp_web/components/product-card.tsx` (no longer used by any page)

- [ ] **Step 1: Rewrite products page**

Rewrite `apps/mvp_web/app/(marketing)/products/page.tsx`. Uses PageHeader component. Key changes:
- PageHeader: breadcrumb `["SolarLayout", "Products"]`, title "PV Layout", description "One desktop application, three plans for every stage of utility-scale solar PV plant development. Calculations are pooled per purchase; top up at any time at the same rate."
- PageHeader children (right column): accent "Download PV Layout" button (wrapping DownloadModal with productName "PV Layout") + free trial callout box below
- SectionBand with 3-column product card grid:
  - Card structure: `.head` div (title + price pill + mono calcs) / `.body` div (dot-prefixed feature list) / `.foot` div (full-width Buy Now button → `/dashboard/plans`)
  - Pro card: accent border + inset box-shadow, accent-colored price pill, primary Buy button
  - Basic/Pro Plus: standard border, primary-colored price pill, outline Buy button
- Top-up note card below: "Need more calculations? Top up anytime at the same rate. Entitlements are tied to your registered email address."
- Keep the DownloadModal import and usage from current page
- Products page is a server component ("use client" NOT needed) — the DownloadModal is already a client component
- Copy from current products page data (plan names, prices, features, calculations)

Reference handoff HTML lines 990-1070 for layout.

- [ ] **Step 2: Delete product-card.tsx**

Delete `apps/mvp_web/components/product-card.tsx` — no longer imported by any page. The products page now renders cards inline. Also delete its test file if it exists.

Check if `download-card.tsx` is still imported anywhere. If not used by any page, delete it and its test too.

- [ ] **Step 3: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 4: Commit**

```bash
git add -A apps/mvp_web/app/\(marketing\)/products/ apps/mvp_web/components/product-card.tsx
git commit -m "feat(mvp-web): redesign products page with plan cards and download CTA"
```

---

### Task 8: Pricing Page

**Files:**
- Modify: `apps/mvp_web/components/pricing-cards.tsx`
- Modify: `apps/mvp_web/app/(marketing)/pricing/page.tsx`

- [ ] **Step 1: Rewrite pricing page**

Update `apps/mvp_web/app/(marketing)/pricing/page.tsx` to use PageHeader:
- PageHeader: breadcrumb `["SolarLayout", "Pricing"]`, title "Simple, transparent pricing.", description "Pay once. Use as many times as your plan allows. No subscription, no automatic renewals."
- Render `<PricingCards />` inside a SectionBand

- [ ] **Step 2: Rewrite PricingCards as comparison table**

Rewrite `apps/mvp_web/components/pricing-cards.tsx`. Replace the current card grid + table with a single comparison table. Key changes:
- Full-width bordered table with rounded corners, overflow hidden, white bg
- Use the shadcn Table components (Table, TableHeader, TableBody, TableRow, TableHead, TableCell)
- Header: Feature column + 3 plan columns with name (15px bold) + mono price below
- Body grouped by mono green group header rows (Layout, Cabling, Yield, Export, Account) — each is a TableRow with a single TableCell spanning 4 columns
- Feature rows with green `✓` and gray `—` for availability. Use current pricing-cards.tsx features data for what's included in each tier.
- Bottom row: 3 Buy buttons (outline for Basic/Pro Plus, primary for Pro) linking to `/dashboard/plans`
- Remove the Free tier from this table (free trial callout is on Products page)
- Top-up note card below the table

Reference handoff HTML lines 1088-1135 for table structure.

- [ ] **Step 3: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_web/components/pricing-cards.tsx apps/mvp_web/app/\(marketing\)/pricing/page.tsx
git commit -m "feat(mvp-web): redesign pricing page with feature comparison table"
```

---

### Task 9: How It Works Page

**Files:**
- Modify: `apps/mvp_web/app/(marketing)/how-it-works/page.tsx`
- Delete: `apps/mvp_web/components/step-by-step.tsx`
- Delete: `apps/mvp_web/components/supported-features.tsx`

- [ ] **Step 1: Read current how-it-works page and component content**

Read `apps/mvp_web/app/(marketing)/how-it-works/page.tsx`, `apps/mvp_web/components/step-by-step.tsx`, and `apps/mvp_web/components/supported-features.tsx` to capture current copy.

- [ ] **Step 2: Rewrite how-it-works page**

Rewrite `apps/mvp_web/app/(marketing)/how-it-works/page.tsx` as a self-contained page (inline content, no external component imports for steps/features). Key changes:

**PageHeader**: breadcrumb `["SolarLayout", "How it works"]`, title "From boundary to bankable layout — in minutes.", description about replacing the manual loop.

**Stepper band** (SectionBand):
- 4 vertical rows in a flex column with gap 24px
- Each row: 3-column grid `grid-cols-[84px_1fr_1.1fr]` gap 32px, top border (first row exempt), padding 32px 0
- Left: mono step number "STEP 01" (primary color)
- Middle: h3 heading (22px) + p description (15px, `#374151`, max-width 50ch)
- Right: visual card (bordered, rounded, padding 14px, mono text) with header row (flex between, mono 11px uppercase) + data rows (flex between, bottom dashed border, 12px mono)
- Steps and visual data:
  1. Import your boundary — visual shows read/kmz, boundary polygons:3, exclusion polygons:9, net usable area:184.3 ha, setbacks applied: tx 35m · road 6m
  2. Configure your parameters — visual shows config/plant.json, module.dim, module.Wp:555, mms.config:2H×28, row.pitch:4.5m, topology:string
  3. Generate your layout — visual shows output/auto-layout, tables.placed:1,184, inverters:4, icr:3, la.placed:28, cable.total:24,970 m
  4. Export your results — visual shows export/3 files, layout.kmz:2.4 MB, layout.dxf:8.1 MB, report.pdf:1.2 MB · 18 pages
- Copy for headings/descriptions from current step-by-step.tsx content
- Responsive: 2-column grid on tablet (visual drops below), single column on mobile

**Supported features band** (SectionBand muted):
- SectionHead: eyebrow "Capabilities", title "Supported features."
- 2-column grid of 8 items in a bordered card with internal borders:
  - Each item: 6px green square marker + div with h4 title (14.5px bold) + p description (13px muted)
  - Border right on odd items, border bottom on all except last 2
- Features from current supported-features.tsx content

Reference handoff HTML lines 1142-1237.

- [ ] **Step 3: Delete old components**

Delete `apps/mvp_web/components/step-by-step.tsx` and `apps/mvp_web/components/supported-features.tsx`. Verify no other file imports them (grep first).

- [ ] **Step 4: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 5: Commit**

```bash
git add -A apps/mvp_web/app/\(marketing\)/how-it-works/ apps/mvp_web/components/step-by-step.tsx apps/mvp_web/components/supported-features.tsx
git commit -m "feat(mvp-web): redesign how-it-works page with stepper and supported features"
```

---

### Task 10: About Page

**Files:**
- Modify: `apps/mvp_web/app/(marketing)/about/page.tsx`

- [ ] **Step 1: Read current about page**

Read `apps/mvp_web/app/(marketing)/about/page.tsx` to capture existing copy.

- [ ] **Step 2: Rewrite about page**

Rewrite with PageHeader + SectionBand. Key changes:

**PageHeader**: breadcrumb `["SolarLayout", "About"]`, title "Built by solar industry veterans." (apply `max-w-[18ch]` to h1 for visual wrap), description from current page.

**Two-column band** (SectionBand): grid `grid-cols-[1.1fr_1fr]` gap 64px.
- Left: mono uppercase heading "Why we built this" (14px, muted-foreground, 0.08em tracking) + body paragraphs (17px, `#374151`, line-height 1.65). Copy from current about page.
- Right: mono uppercase heading "At a glance" + stats card (bordered, rounded, overflow hidden) with key-value rows. Each row: flex between, padding 18px 22px, bottom border (last none). Key: mono 12px uppercase muted. Value: 600 weight.
  - Headquarters: Bangalore, India
  - Industry experience: 15+ years
  - Primary market: Utility-scale (10 MWp+)
  - Platform: Windows desktop + web
  - Compliance: ALMM · IS 14255 · IS 1554
  - Phase: Public beta
- Responsive: single column on `<lg`

Reference handoff HTML lines 1242-1274.

- [ ] **Step 3: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 4: Commit**

```bash
git add apps/mvp_web/app/\(marketing\)/about/page.tsx
git commit -m "feat(mvp-web): redesign about page with two-column layout and stats card"
```

---

### Task 11: FAQ Page

**Files:**
- Modify: `apps/mvp_web/components/faq-accordion.tsx`
- Modify: `apps/mvp_web/app/(marketing)/faq/page.tsx`

- [ ] **Step 1: Read current FAQ content**

Read `apps/mvp_web/components/faq-accordion.tsx` to capture all Q&A content and categories. This is copy authority.

- [ ] **Step 2: Rewrite FAQ page with sidebar layout**

Update `apps/mvp_web/app/(marketing)/faq/page.tsx`:
- PageHeader: breadcrumb `["SolarLayout", "FAQ"]`, title "Frequently asked questions.", description with support email.
- SectionBand with two-column layout `grid-cols-[240px_1fr]` gap 48px

- [ ] **Step 3: Rewrite FaqAccordion as sidebar + details component**

Rewrite `apps/mvp_web/components/faq-accordion.tsx`. This becomes a "use client" component. Key changes:

- State: `activeCategory` (string, default first category)
- Left sidebar: sticky (`sticky top-[84px] self-start`), list of 5 category links. Each is a button/link. Active: `bg-secondary text-primary font-medium`, Hover: same. Click scrolls to category or filters.
  - Simplest approach: use hash links + scroll, or just render all categories and use the sidebar as visual indicator with scroll-into-view.
- Right content: FAQ groups, each with:
  - `<h3>` mono uppercase heading (12px, muted-foreground, 0.08em tracking, bottom border + padding)
  - `<details>` items:
    - `<summary>`: 15.5px, 500 weight, flex between with "+" span in mono. Custom marker hidden (`list-style:none`, `[&::-webkit-details-marker]:hidden`). The "+" rotates 45deg on `[open]` via CSS `[open] summary .plus { transform: rotate(45deg) }`
    - Answer `<p>`: 14.5px, `#374151`, max-w-[64ch], margin-top 12px
- Categories and Q&A content from current faq-accordion.tsx — do NOT use handoff copy
- Responsive: single column on `<lg`, sidebar becomes horizontal or hidden

Reference handoff HTML lines 1279-1378 for layout.

- [ ] **Step 4: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_web/components/faq-accordion.tsx apps/mvp_web/app/\(marketing\)/faq/page.tsx
git commit -m "feat(mvp-web): redesign FAQ page with sidebar navigation and details accordion"
```

---

### Task 12: Contact Page

**Files:**
- Modify: `apps/mvp_web/components/contact-form.tsx`
- Modify: `apps/mvp_web/components/contact-info.tsx`
- Modify: `apps/mvp_web/app/(marketing)/contact/page.tsx`

- [ ] **Step 1: Read current contact page, form, and info components**

Read all three files to capture existing copy and form behavior.

- [ ] **Step 2: Rewrite contact page layout**

Update `apps/mvp_web/app/(marketing)/contact/page.tsx`:
- PageHeader: breadcrumb `["SolarLayout", "Contact"]`, title "Contact us.", description "Reach the SolarLayout team for sales, technical, or partnership enquiries. We respond within two business days."
- SectionBand with two-column grid `grid-cols-[1fr_1.2fr]` gap 48px
- Left: `<ContactInfo />`
- Right: `<ContactForm />`
- Responsive: single column on `<lg`

- [ ] **Step 3: Rewrite ContactInfo component**

Rewrite `apps/mvp_web/components/contact-info.tsx`. Key changes:
- Vertical list of items, each with bottom border, padding 18px 0
- Each item: mono uppercase key label (11px, muted-foreground, 0.08em tracking, mb 6px) + value text (15px)
- Items: Email (linked with primary color + underline), Location, LinkedIn (linked), YouTube (linked), Grievance officer (text with Privacy Policy link)
- Copy from current contact-info.tsx

- [ ] **Step 4: Rewrite ContactForm component**

Rewrite `apps/mvp_web/components/contact-form.tsx`. Key changes:
- Wrapped in bordered card with padding 28px
- Heading "Send us a message" (18px) + muted description (14px)
- Fields: Full name (required), Work email (required), **Subject dropdown** (required — `<select>` with options: Select..., Sales enquiry, Technical question, Partnership, Press/media, Other), Message textarea (required)
- Submit row: flex between with left mono note "solarlayout.in · v1" and right green "Send message" button with arrow icon
- Subject field: include in the form state and POST body. The current API may not handle it — that's OK per spec (UI only for now, API deferred).
- Style inputs/selects: white bg, 1px border, 8px radius, 10px 12px padding, focus ring with primary color
- Keep existing form submission logic and error handling

Reference handoff HTML lines 1383-1456.

- [ ] **Step 5: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_web/components/contact-form.tsx apps/mvp_web/components/contact-info.tsx apps/mvp_web/app/\(marketing\)/contact/page.tsx
git commit -m "feat(mvp-web): redesign contact page with subject dropdown and mono layout"
```

---

### Task 13: Dashboard Pages (Cosmetic)

**Files:**
- Modify: `apps/mvp_web/app/(main)/dashboard/page.tsx`
- Modify: `apps/mvp_web/app/(main)/dashboard/plans/page.tsx`
- Modify: `apps/mvp_web/app/(main)/dashboard/usage/page.tsx`
- Modify: `apps/mvp_web/components/dashboard-sidebar.tsx`

- [ ] **Step 1: Read all dashboard files**

Read all four files to understand current structure.

- [ ] **Step 2: Update dashboard sidebar**

Update `apps/mvp_web/components/dashboard-sidebar.tsx`:
- Section group labels: add `font-mono text-[11px] uppercase tracking-[0.08em]` styling
- Keep all existing functionality (nav items, user dropdown, sign out)

- [ ] **Step 3: Update dashboard home page**

Update `apps/mvp_web/app/(main)/dashboard/page.tsx`:
- Page heading: apply page-title scale (`text-[40px] font-bold tracking-[-0.02em]`)
- Stat card labels (Remaining Calculations, Active Entitlements): add `font-mono text-[11px] uppercase tracking-[0.08em]` to CardTitle components
- License key card label: same mono treatment
- Download card label: same mono treatment
- Recent activity table headers: add `font-mono text-[11px] uppercase tracking-[0.08em]`

- [ ] **Step 4: Update plans page**

Update `apps/mvp_web/app/(main)/dashboard/plans/page.tsx`:
- Page heading: page-title scale
- Plan card labels: mono uppercase where appropriate
- Keep all existing Stripe checkout logic unchanged

- [ ] **Step 5: Update usage page**

Update `apps/mvp_web/app/(main)/dashboard/usage/page.tsx`:
- Page heading: page-title scale
- Table headers: mono uppercase styling
- Keep all existing pagination logic unchanged

- [ ] **Step 6: Run lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: pass

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_web/app/\(main\)/dashboard/ apps/mvp_web/components/dashboard-sidebar.tsx
git commit -m "feat(mvp-web): apply redesign typography to dashboard pages"
```

---

### Task 14: Test Updates + Full Gate Pass

**Files:**
- Modify: `apps/mvp_web/app/(marketing)/page.test.tsx`
- Modify: `apps/mvp_web/app/(marketing)/products/page.test.tsx`
- Modify: `apps/mvp_web/app/(marketing)/pricing/page.test.tsx`
- Modify: `apps/mvp_web/app/(marketing)/about/page.test.tsx`
- Modify: `apps/mvp_web/app/(marketing)/faq/page.test.tsx`
- Modify: `apps/mvp_web/components/contact-form.test.tsx`
- Delete: `apps/mvp_web/components/download-card.test.tsx` (if download-card.tsx was deleted)

- [ ] **Step 1: Run all tests to see what fails**

Run: `bun run test`
Capture all failing tests. The failures will be assertion mismatches (heading text, button counts, element presence) due to the redesigned content.

- [ ] **Step 2: Fix home page test**

Update `apps/mvp_web/app/(marketing)/page.test.tsx`:
- Update heading assertion to match new hero heading text
- Update feature overview assertions to match new plan card text
- Verify "Explore products" CTA renders (replaces old CTA text)
- Keep How It Works and System Requirements assertions, update text if changed

- [ ] **Step 3: Fix products page test**

Update `apps/mvp_web/app/(marketing)/products/page.test.tsx`:
- Update heading assertion for "PV Layout"
- Verify all 3 plan names render
- Verify prices render
- Verify single download button
- Verify 3 "Buy now" links
- Verify free trial callout text

- [ ] **Step 4: Fix pricing page test**

Update `apps/mvp_web/app/(marketing)/pricing/page.test.tsx`:
- Update heading for "Simple, transparent pricing."
- Verify plan names appear in comparison table header
- Verify feature rows render (check for a few feature names)
- Verify Buy buttons render (3 links)
- Remove Free tier assertions

- [ ] **Step 5: Fix about page test**

Update `apps/mvp_web/app/(marketing)/about/page.test.tsx`:
- Update heading assertion for "Built by solar industry veterans."
- Verify "At a glance" stats card renders

- [ ] **Step 6: Fix FAQ page test**

Update `apps/mvp_web/app/(marketing)/faq/page.test.tsx`:
- Verify heading renders
- Verify FAQ categories render
- Verify at least one Q&A item renders

- [ ] **Step 7: Fix contact form test**

Update `apps/mvp_web/components/contact-form.test.tsx`:
- Add test for subject dropdown rendering
- Update any label text assertions that changed

- [ ] **Step 8: Delete orphaned test files**

Delete test files for deleted components (product-card, download-card, step-by-step, supported-features) if they exist. Grep for imports first to confirm nothing references them.

- [ ] **Step 9: Run full gate**

Run: `bun run lint && bun run typecheck && bun run test && bun run build`
Expected: ALL PASS. Fix any remaining failures.

- [ ] **Step 10: Commit**

```bash
git add -A apps/mvp_web/
git commit -m "test(mvp-web): update all tests for redesign, remove orphaned test files"
```

---

## Execution Notes

- Tasks 1-3 (foundation, header, footer) must be done first and in order — they establish the shared patterns used by everything else.
- Tasks 4-6 (home page) depend on Task 1 (shared components) but are independent of each other.
- Tasks 7-12 (individual pages) are independent of each other and can be parallelized after Tasks 1-3.
- Task 13 (dashboard) is independent of marketing pages.
- Task 14 (tests) must be done last after all page changes are complete.
- Each task should run `bun run lint && bun run typecheck` before committing. Full gate (`bun run test && bun run build`) runs in Task 14.
- The handoff HTML file is at `/tmp/solarlayout-handoff/solarlayout/project/SolarLayout.html` — read it for exact SVG content and layout measurements but NOT for copy.
