# MVP Web Redesign — Design Spec

**Date**: 2026-04-26
**Scope**: Full visual redesign of `apps/mvp_web` — all marketing pages, header, footer, and authed dashboard pages.
**Source**: Claude Design handoff (`SolarLayout-handoff.zip`) — layout/structure authority. Current codebase is copy authority.
**Approach**: Component-by-component replacement (Approach A). Reuse shadcn primitives, restyle with Tailwind, add net-new components where needed.

---

## 1. Theme & Typography

### Colors

No token changes. Current `globals.css` already defines the handoff palette:

| Token | Light | Dark |
|---|---|---|
| `--primary` | `#1A5C3A` | `#2E8B57` |
| `--accent` | `#F5A623` | `#F5A623` |
| `--background` | `#F4F6F8` | `#1A1F25` |
| `--foreground` | `#1C1C1C` | `#E8EAED` |
| `--muted` | `#E5E7EB` | `#2A3038` |
| `--muted-foreground` | `#6B7280` | — |
| `--border` | `#D1D5DB` | — |
| `--card` | `#FFFFFF` | — |
| `--secondary` | `#F4F8F6` | `#1E2A22` |

Additional constants used in the handoff (applied via Tailwind utilities, not new tokens):
- `--border-strong`: `#9CA3AF` (used for outline buttons)
- `--green-600`: `#16a34a` (used for check marks in pricing table)
- Footer dark bg: `#0F1418`
- Muted band bg: `#FBFCFD`
- Text gray: `#374151`

### Font

Add Geist Mono alongside existing Geist in `layout.tsx`:

```tsx
import { Geist, Geist_Mono } from "next/font/google"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })
```

Apply both variables to `<html>`. Tailwind's `font-mono` class will use `--font-mono`.

### Typography Scale

Applied via Tailwind utility compositions (not new CSS classes):

| Pattern | Size | Weight | Tracking | Usage |
|---|---|---|---|---|
| display | 56px | 700 | -0.025em | Hero heading only |
| page-title | 40px | 700 | -0.02em | Page header headings |
| section-title | 28px | 600 | -0.015em | Band section headings |
| lead | 18px | 400 | — | Hero/page header description text |
| eyebrow | 12px mono | 400 | 0.08em | Section labels, uppercase, with accent square `::before` |

### Shared Layout Patterns

**Band**: Full-width section wrapper. 72px vertical padding, bottom border. Muted variant has `#FBFCFD` bg.

**Section head**: Flex row, left side (eyebrow + title + muted description), optional right CTA link. Bottom margin 36px.

**Window frame**: Card with dots-bar header (3 gray circles + mono path text + optional badge), content area, optional caption footer. Used for screenshots and schematic.

---

## 2. Header

- Sticky, `z-50`, semi-transparent bg with `backdrop-filter: saturate(140%) blur(8px)`, bottom border
- Brand: green square mark (28px, 6px radius) with sun SVG + "SolarLayout" text + `/ pv layout` mono subtitle in muted color
- Nav: 7 links (Home, Products, Pricing, How It Works, About, FAQ, Contact). Hover: secondary bg. Active: primary color, 500 weight.
- Right: green "Download" CTA button with download icon (replaces current orange). Auth buttons (Sign In / Dashboard) preserved.
- Mobile: existing Sheet hamburger pattern, restyled to match new design

---

## 3. Footer

- Background: `#0F1418` (near-black), replaces current green
- Top border: `1px solid #1F2A30`
- 4-column grid (`1.4fr repeat(3, 1fr)`):
  1. **Brand**: white logo + description paragraph in `#9CA3AF` + social icons (LinkedIn, YouTube) in bordered 34px squares
  2. **Product**: Products, Pricing, How it works, Download
  3. **Company**: About, FAQ, Contact, Careers (placeholder `#`)
  4. **Legal**: Terms & Conditions, Privacy Policy, Cookie Policy, DPDP grievance
- Column headings: mono uppercase, 11px, `#9CA3AF`
- Links: `#D1D5DB`, hover white
- Legal bar: mono, flex between copyright and email, top border `#1F2A30`

---

## 4. Home Page

### 4.1 Hero

Two-column grid (`1.05fr 1.1fr`), 64px top / 80px bottom padding, bottom border.

**Left column**:
- Eyebrow: "Utility-scale PV · Windows desktop"
- Display heading (56px): `From KMZ boundary to <em>bankable layout</em>, in minutes.` — `<em>` in primary color
- Subtitle paragraph (18px, `#374151`, max-width 54ch)
- CTA row: green primary "Explore products" button with arrow icon + outline "See pricing" button
- Meta strip: 3-column `<dl>` below a top border. Mono labels (Input, Output, Topology) with values and `<small>` descriptions. Copy sourced from current codebase, verified against PRD.

**Right column**:
- `SchematicIllustration` component — inline SVG in a window frame
- Shows: KMZ boundary polygon, MMS table rows, inverters (orange squares with INV labels), lightning arresters, exclusion zone (pond), transmission corridor, cable trace, compass, GCR annotation
- Window bar: dots + path text + "Auto-layout · 47.2 MWp" badge
- Footer strip: 4-cell data bar (Capacity DC, GCR, Tables, Inverters)

### 4.2 Features Overview

Band with section head ("01 / Products", "Three plans, one application.", right link "All products →").

3-column feature card grid:
- Each card: mono tag (e.g., "PV Layout · Basic"), headline (e.g., "Boundary → Layout"), price (24px bold + small text), feature list with accent line `::before`, dashed footer with calcs count + "Learn more →" link
- Pro card: accent border + inset accent shadow + "Most used" badge (absolute positioned)

### 4.3 How It Works Summary

Muted band with section head ("02 / Pipeline", "From boundary to deliverable.", right link "Read the workflow →").

4-column step strip in a single bordered card:
- Each step: icon in bordered 36px square, mono "Step 01" label, title (16px bold), description (13.5px muted)
- Steps separated by right border, last step has no border
- Content from current `how-it-works-summary.tsx`

### 4.4 Screenshots

Band with section head ("03 / The application", "A look inside SolarLayout.").

Two-column grid (`1.4fr 1fr`):
- Left: tall window spanning 2 rows — layout canvas SVG (tool rail, properties panel, boundary+tables+inverters, selection highlight). Caption: "Layout canvas — table grid, inverters, exclusions"
- Right top: cable schedule window — SVG table. Caption: "Cable schedule — automatic from layout", meta: "Pro / Pro Plus"
- Right bottom: yield report window — SVG bar chart with P50/P75/P90 stats. Caption: "Yield report — P50/P75/P90, monthly generation", meta: "Pro Plus only"
- All 3 are inline SVG React components in window frames

### 4.5 System Requirements

Muted band with section head ("04 / Requirements", "System requirements.").

Two-column layout (`1.05fr 1fr`):
- Left: styled table with 6 rows (OS, RAM, Disk, Display, Additional software, Internet). Mono uppercase `<th>` labels, 40% width. Content from current `system-requirements.tsx`.
- Right: "Inputs and outputs" heading + description paragraph + card with 2-column reads/writes section (.kmz reads, .kmz .dxf .pdf writes) + mono compatibility line

---

## 5. Products Page

**Page header**: muted bg, two-column grid.
- Left: breadcrumb, page-title "PV Layout", description
- Right: accent "Download PV Layout" button (triggers DownloadModal with productName "PV Layout") + free trial callout box

**Product cards band**: 3-column grid of plan cards.
- Card structure: head (title + price pill + mono calcs) / body (dot-prefixed feature list) / foot (full-width Buy Now button → `/dashboard/plans`)
- Pro card: highlighted, accent price pill, primary Buy button
- Basic/Pro Plus: standard, primary price pill, outline Buy button
- Copy from current products page content (verified against codebase)

**Top-up note**: bordered card, centered, "Need more calculations?" text. Entitlements tied to email mention.

---

## 6. Pricing Page

**Page header**: muted bg, single column. Breadcrumb, page-title "Simple, transparent pricing.", description.

**Comparison table**: full-width bordered table with rounded corners.
- Header: Feature column (46%) + 3 plan columns (18% each) with name + mono price
- Body grouped by green mono group headers (Layout, Cabling, Yield, Export, Account)
- Green `✓` for included, gray `—` for not included
- Bottom row: 3 Buy buttons (outline for Basic/Pro Plus, primary for Pro) → `/dashboard/plans`
- Free tier not shown in this table (free trial callout is on Products page)

**Top-up note**: bordered card below table.

---

## 7. How It Works Page

**Page header**: breadcrumb, page-title, description.

**Stepper band**: 4 vertical rows, each a 3-column grid (`84px | 1fr | 1.1fr`).
- Left: mono step number
- Middle: heading + paragraph
- Right: visual card with mono key-value data table
- Rows separated by top border (first row exempt)
- Copy from current step-by-step content

**Supported features band** (muted): 2-column grid of 8 items in bordered card.
- Each item: green square marker + bold title + muted description
- Internal borders between cells (right border on odd items, bottom border except last 2)

---

## 8. About Page

**Page header**: breadcrumb, page-title "Built by solar industry veterans." (max-width ~18ch), description.

**Two-column band** (`1.1fr 1fr`, 64px gap):
- Left: mono heading "Why we built this" + body paragraphs (17px, `#374151`, 1.65 line-height). Copy from current about page.
- Right: mono heading "At a glance" + stats card with bordered key-value rows (Headquarters, Industry experience, Primary market, Platform, Compliance, Phase). Keys in mono uppercase, values in bold.

---

## 9. FAQ Page

**Page header**: breadcrumb, page-title "Frequently asked questions.", description with support email.

**Two-column layout** (`240px | 1fr`, 48px gap):
- Left: sticky sidebar nav (top: 84px) with 5 category links. Active: secondary bg + primary color + 500 weight. Hover: same.
- Right: FAQ groups, each with mono uppercase heading + bottom border padding, then `<details>` items.
  - Summary: 15.5px 500 weight text + mono "+" that rotates 45deg on `[open]`
  - Answer: 14.5px `#374151` paragraph, max-width 64ch
- Categories: About the software, Products & downloads, Entitlements & calculations, Payments, Support
- Content from current `faq-accordion.tsx` (14 Q&A items)

---

## 10. Contact Page

**Page header**: breadcrumb, page-title "Contact us.", description.

**Two-column layout** (`1fr 1.2fr`, 48px gap):
- Left: contact info items, each with mono uppercase key + value below, separated by bottom borders.
  - Email (linked), Location, LinkedIn (linked), YouTube (linked), Grievance officer note
- Right: form card with heading + muted description + fields:
  - Full name (required), Work email (required), Subject dropdown (required — Sales enquiry, Technical question, Partnership, Press/media, Other), Message textarea (required)
  - Submit row: left mono note + right green "Send message" button with arrow
  - Subject dropdown: **UI only** — included in POST body but API changes deferred to later spike
  - Form submits to existing `/contact` endpoint

---

## 11. Dashboard / Authed Pages

No layout restructuring. Apply new design system patterns:

**Shared**:
- Sidebar: restyle typography (mono section labels), updated hover/active colors
- Page headings: page-title scale (40px)
- Cards: existing styling already matches (white, 1px border, 10px radius)
- Data labels: Geist Mono for stat labels, table headers, metadata

**Dashboard** (`/dashboard`):
- Stat card labels: mono uppercase
- License key / download card: restyle labels
- Recent activity table: mono table headers

**Plans** (`/dashboard/plans`):
- Plan cards echo Products page card pattern (price pill, dot features, buy button)

**Usage** (`/dashboard/usage`):
- Table headers: mono uppercase
- Pagination styling consistent

---

## 12. Components Summary

### Modified (restyle existing):
- `header.tsx` — backdrop blur, brand mark, restyled nav/CTA
- `footer.tsx` — dark bg, restructured columns, social icons
- `hero-section.tsx` — two-column with schematic, meta strip
- `features-overview.tsx` — feature cards with pricing, badges, accent markers
- `how-it-works-summary.tsx` — step strip in single card
- `screenshots-section.tsx` — window frames with SVG illustrations
- `system-requirements.tsx` — styled table + inputs/outputs card
- `pricing-cards.tsx` — feature comparison table replaces card grid
- `faq-accordion.tsx` — sidebar nav + details/summary accordion
- `contact-form.tsx` — add subject dropdown, submit row layout
- `contact-info.tsx` — mono key-value vertical layout
- `product-card.tsx` — plan card with price pill, dot features
- `dashboard-sidebar.tsx` — mono labels, updated styling
- Dashboard page, plans page, usage page — typography/styling updates

### New components:
- `schematic-illustration.tsx` — hero SVG illustration (boundary, tables, inverters)
- `layout-canvas-screenshot.tsx` — screenshot SVG (tool rail, properties, canvas)
- `cable-schedule-screenshot.tsx` — screenshot SVG (table data)
- `yield-report-screenshot.tsx` — screenshot SVG (bar chart, P50/P75/P90)
- `page-header.tsx` — shared page header (breadcrumb, title, description, optional right column)
- `section-band.tsx` — shared band wrapper (padding, border, muted variant)
- `section-head.tsx` — shared section head (eyebrow, title, description, optional CTA)
- `eyebrow.tsx` — mono uppercase label with accent square marker

### Removed:
- `step-by-step.tsx` — content merged into How It Works page directly
- `supported-features.tsx` — rebuilt as part of How It Works page

---

## 13. Copy Authority Rule

The handoff is **layout/structure authority**. The current codebase is **copy authority**. Where the handoff introduces copy that doesn't exist in the codebase (hero meta, schematic labels, FAQ answers, about page text), cross-reference against PRD and existing content. Drop or correct anything factually incorrect (e.g., KML support references).

---

## 14. Responsive Behavior

Three breakpoints matching the handoff:

**> 1024px**: full layout as described above.

**641–1024px**:
- Hero: single column, schematic below text
- Feature/product grids: 2 columns
- Steps: 2 columns with bottom borders
- System requirements, about, contact, FAQ: single column
- Page headers: single column
- Stepper: 2-column grid (remove visual column on mobile, visual appears below on grid-column:2)
- Footer: 2-column grid
- Screenshots: single column

**<= 640px**:
- Desktop nav hidden (hamburger only)
- Display heading: 38px, page-title: 30px
- All grids: single column
- Steps: single column with bottom borders
- Comparison table: smaller font/padding
- Container padding: 18px
- Hero: reduced padding (40px / 56px)
- Bands: reduced padding (48px)

---

## 15. Testing Strategy

- Update existing test assertions (heading text, button counts, link targets) to match new content
- New components (schematic, screenshots) are static SVG — snapshot tests or simple render tests
- FAQ sidebar: test active state toggling
- Contact form: test subject dropdown renders and value included in submission
- No new integration tests needed — functionality unchanged
- All gates must pass: `bun run lint && bun run typecheck && bun run test && bun run build`

---

## 16. Out of Scope

- Contact form subject field API handling (deferred to later spike)
- Dark mode redesign (carry forward existing dark tokens, no handoff for dark mode)
- Dashboard layout restructuring (cosmetic only)
- Cookie Policy / DPDP grievance page content (footer links to placeholder `#`)
- Careers page (footer link to placeholder `#`)
