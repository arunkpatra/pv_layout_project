# SolarLayout — Design Foundations

**Status:** Draft for S5.5 review
**Last updated:** 2026-04-23
**Owning spike:** S5.5 — Design Foundations
**Sources of truth:**
- Tokens: [docs/design/tokens/tokens.css](./design/tokens/tokens.css)
- Base components CSS: [docs/design/tokens/base.css](./design/tokens/base.css)
- Mocks: [docs/design/light/](./design/light/) + rendered PNGs in [docs/design/rendered/](./design/rendered/)
- Quality bar: [reference_screenshots_for_UX_dsktop/](../reference_screenshots_for_UX_dsktop/)

This document is the quality contract for every UI spike from S6 onward. It is not inspiration — it is normative. If a decision is not here, it goes in an ADR under `docs/adr/` before code ships.

---

## 1. Principles

Five operating rules the system is built on. Every later decision derives from these; when two guidelines collide, the earlier-numbered wins.

1. **Restraint.** Less color, fewer borders, smaller shadows, tighter type. A canvas-first engineering tool earns trust by quieting itself so the work is legible. Color is information, not decoration — the accent appears when something is selected, pending, or inviting action, and nowhere else.
2. **Weight-led hierarchy.** Structure is carried by typographic weight (400/500/600), size, and spacing. Borders are hairlines and rare. Shadows are reserved for floating surfaces (popover, menu, toast). Depth in the app proper comes from 1–3% luminance shifts between surfaces.
3. **Canvas-first.** The map canvas is the protagonist. Chrome surrounds it; chrome never competes with it. When a choice exists between adding chrome ornament and giving the canvas more room, the canvas wins.
4. **Motion you feel, not see.** Two durations (fast 120ms, base 180ms) and one easing (standard). Motion confirms a state change — it doesn't decorate. If an interaction needs motion longer than 260ms, rethink the interaction.
5. **Semantic tokens from day one.** No component references a color literal or a pixel value that could have been a token. Dark theme flips by changing the token, not the component. Branding in S13.6 swaps accent and type without touching markup.

---

## 2. Color tokens

### 2.1 Surfaces (ambient depth via luminance, not shadow)

| Token | Light | Dark (draft) | Role |
|---|---|---|---|
| `--surface-canvas` | `#f7f6f3` | `#17171a` | Map / workspace ground |
| `--surface-ground` | `#faf9f7` | `#1a1a1c` | App chrome ground (rails, bars) |
| `--surface-panel` | `#ffffff` | `#1f1f22` | Inspector, dialog, card surfaces |
| `--surface-popover` | `#ffffff` | `#23232a` | Menus, command palette, tooltips |
| `--surface-muted` | `#f1efeb` | `#2a2a30` | Selected rows, quiet chips |

**Principle:** each successive surface is 1–3% brighter/darker than the one beneath it. Never pure white (`#ffffff` appears only at the topmost panel level and only in light theme, per shadcn/Claude Desktop convention). Never pure black in dark.

### 2.2 Text

| Token | Light | Dark | Role |
|---|---|---|---|
| `--text-primary` | `#1a1a19` | `#ececea` | Headings, body copy, values |
| `--text-secondary` | `#60605d` | `#a6a6a2` | Labels, captions, explanatory copy |
| `--text-muted` | `#94938f` | `#70706c` | Meta (timestamps, path hints, units) |
| `--text-placeholder` | `#b1b0ab` | `#575753` | Input placeholders, empty-state hints |
| `--text-on-accent` | `#ffffff` | `#1a1a19` | Text against an accent-filled surface |

Hierarchy is carried by **weight and opacity**, not hue. All text tokens are warm-neutral — the ground color's personality is preserved all the way up the hierarchy.

### 2.3 Borders

All borders inherit from the text color at low alpha, which tints them warm.

| Token | Value (light) | Role |
|---|---|---|
| `--border-subtle` | `rgba(26,26,25,0.08)` | Default card/input border |
| `--border-default` | `rgba(26,26,25,0.12)` | Hovered or focused container |
| `--border-strong` | `rgba(26,26,25,0.20)` | Emphasis, e.g. active tab underline |
| `--border-focus` | `rgba(211,110,49,0.55)` | Keyboard focus ring (accent-tinted) |

### 2.4 Accent (placeholder — swapped in S13.6)

Warm amber. Used sparingly: selected state, primary action, progress, key information chips. Never for ambient decoration.

| Token | Light | Dark |
|---|---|---|
| `--accent-default` | `#d36e31` | `#e0864a` |
| `--accent-hover` | `#b85b22` | `#ed9358` |
| `--accent-muted` | `rgba(211,110,49,0.12)` | `rgba(224,134,74,0.18)` |
| `--accent-ink` | `#6e3a1a` | — (text on `accent-muted` chip) |

Dark-theme accent is lifted slightly (more red → more orange, higher lightness) so it hits the same perceptual weight against `#17171a` ground. Both derive from the same hue family; S13.6 can re-tune both with one hue change.

### 2.5 Signal colors

Reserved for **meaningful** states only. Not decoration. Each has a filled variant and a muted (12% alpha) variant for chip backgrounds.

| Token | Light | Role |
|---|---|---|
| `--success-default` | `#2f7a44` | Healthy sidecar, successful export, positive metric delta |
| `--warning-default` | `#b37a00` | Unsaved changes, license expiring soon |
| `--error-default` | `#b42c2c` | Failed operation, feature-gate block |

### 2.6 Data-vis palette (the canvas)

See §8 for how each token renders on the map.

| Token | Purpose |
|---|---|
| `--canvas-boundary-stroke` / `--canvas-boundary-fill` | Plant boundary polygon |
| `--canvas-obstacle-fill` / `--canvas-obstacle-stroke` | Obstacles and user-drawn obstructions |
| `--canvas-tl-stroke` | Transmission-line corridor (dashed red) |
| `--canvas-table-fill` / `--canvas-table-stroke` | PV module tables (muted slate-blue) |
| `--canvas-table-fill-selected` | Selected table (accent amber) |
| `--canvas-icr-fill` / `--canvas-icr-stroke` | ICR building footprint |
| `--canvas-inverter-fill` | String inverter markers (green) |
| `--canvas-cable-dc` / `--canvas-cable-ac` | Cable strokes (DC slate, AC muted red) |
| `--canvas-la-fill` / `--canvas-la-radius` | LA marker + its coverage halo |
| `--canvas-grid-dot` | Subtle empty-state dot grid |

**Rationale for table-blue (`#3f5d7a`):** warm amber is the accent, so tables — the most-repeated mark on the canvas — cannot be amber. A muted slate-blue reads cleanly at any zoom, separates from the boundary stroke, and lets the accent do its job on selection.

---

## 3. Typography

### 3.1 Family

- **Inter** (OFL) — body, UI, headings. System fallback chain in the mocks; real Inter woff2 bundled in S6 at `packages/ui/assets/fonts/`.
- **Geist Mono** (OFL) — tabular numerics when alignment matters (grid data, summary stats). Fallback stack until S6.

No italic. Weights used: **400 regular**, **500 medium**, **600 semibold**. `700 bold` is not used — bundle discipline and visual restraint. If you need emphasis, use weight 600 with tighter tracking, not 700.

### 3.2 Scale

| Token | Size | Intended use |
|---|---|---|
| `--fs-xs` | 11 px | Status bar meta, keyboard hints, chip labels |
| `--fs-sm` | 12 px | Secondary labels, tooltips, caption copy |
| `--fs-base` | 13 px | Default body copy, inspector content |
| `--fs-md` | 14 px | Primary controls, inputs, wordmark |
| `--fs-lg` | 16 px | Section headers, stat values |
| `--fs-xl` | 20 px | Dialog titles |
| `--fs-2xl` | 28 px | Splash wordmark (rare) |

### 3.3 Line-height and tracking

| Token | Value | Use |
|---|---|---|
| `--lh-tight` | 1.25 | Headings, stat values |
| `--lh-snug` | 1.4 | Labels, short-form copy |
| `--lh-normal` | 1.5 | Long-form body copy (rare in this app) |
| `--letter-tight` | -0.01em | Body headings |
| `--letter-tighter` | -0.02em | Dialog titles, wordmark |

**Numerics:** anywhere a column of numbers must align (summary panel, CSV preview), apply `font-variant-numeric: tabular-nums`. Mono font optional; usually `Inter tabular-nums` is enough.

---

## 4. Spacing and sizing

### 4.1 Spacing — 4px grid

Every inter-element gap resolves to one of: `--space-1` (4) / `--space-2` (8) / `--space-3` (12) / `--space-4` (16) / `--space-5` (20) / `--space-6` (24) / `--space-8` (32) / `--space-10` (40) / `--space-12` (48) / `--space-16` (64) / `--space-20` (80).

If you reach for `6px` or `18px`, reconsider the layout — it almost always signals a missing rhythm.

### 4.2 Component heights — desktop density

| Token | Value | Use |
|---|---|---|
| `--size-control-sm` | 24 px | Compact chips, segmented control tabs |
| `--size-control-md` | 28 px | Default button, input, select |
| `--size-control-lg` | 36 px | Primary CTA button (e.g. Generate, Continue) |
| `--size-rail` | 52 px | Left tool rail width |
| `--size-topbar` | 44 px | Top bar height |
| `--size-statusbar` | 28 px | Bottom status bar height |
| `--size-inspector` | 320 px | Right inspector default width |

Rails and bars are thinner than a typical web app — desktop users want maximum canvas.

---

## 5. Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4 px | Chips, kbd, small inline affordances |
| `--radius-md` | 6 px | Inputs, secondary buttons, tooltips |
| `--radius-lg` | 10 px | Cards, dialogs, popovers, primary CTAs |
| `--radius-xl` | 14 px | Floating canvas widgets (scale bar, zoom controls) |
| `--radius-2xl` | 20 px | Large feature cards (rare) |

Window chrome is not rounded by us — Tauri + OS provide native corner radius.

---

## 6. Motion

### 6.1 Durations

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 120 ms | Hover color change, focus ring appear, tab switch |
| `--duration-base` | 180 ms | Dialog open, popover reveal, sidebar collapse |
| `--duration-slow` | 260 ms | Dialog dismiss, inspector slide, canvas layer toggle |

### 6.2 Easing

| Token | Value | Use |
|---|---|---|
| `--easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default (enter + most transitions) |
| `--easing-emphasized` | `cubic-bezier(0.3, 0, 0, 1)` | Primary state change (mode switch, commit) |
| `--easing-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Dismiss, disappear |

### 6.3 Named primitives (implemented in S6 on Framer Motion)

- `motion/dialog-open` — 180ms standard, scale 0.98→1 + opacity 0→1
- `motion/sidebar-collapse` — 180ms standard, width-only transition
- `motion/inspector-slide` — 260ms emphasized on first render, 120ms standard on re-hydration
- `motion/toast-enter` — 180ms standard, translateY 8px→0 + opacity 0→1
- `motion/tab-switch` — 120ms standard on the underline, no content fade
- `motion/layer-toggle` — 180ms standard on the layer's opacity, no reflow

**Rule:** no bouncy easing, no spring physics. This is an engineering tool, not a consumer app. Reduce motion if `prefers-reduced-motion: reduce` — swap duration to `0ms` and skip any transform/opacity delta.

---

## 7. Elevation

Shadows are reserved for **floating** surfaces only — popovers, menus, toasts, dragged objects. Ambient cards get no shadow; their depth comes from the luminance shift between `--surface-ground` and `--surface-panel`.

| Token | Use |
|---|---|
| `--shadow-xs` | Hovered input (rare) |
| `--shadow-sm` | Tooltip, kbd |
| `--shadow-md` | Popover, dropdown, command palette |
| `--shadow-lg` | Dialog, toast, dragged item |

Each shadow carries a 1px hairline ring at low alpha so floating surfaces have a crisp edge over the canvas at any zoom.

Dark theme shadows are heavier (rgba ~45–55% black) to maintain perceptual depth against the dark ground.

---

## 8. Canvas visual language

This is the spec that S8 implements as the `pv-light.json` MapLibre style. Dark draft stays rough until S13.5.

| Feature | Fill | Stroke | Notes |
|---|---|---|---|
| Boundary polygon | `--canvas-boundary-fill` | `--canvas-boundary-stroke`, 1.5px | Primary reference frame |
| Obstacle polygon | `--canvas-obstacle-fill` | `--canvas-obstacle-stroke`, 1px | User-drawn or KMZ-imported |
| TL corridor | none | `--canvas-tl-stroke`, 1.5px dashed 6,4 | Respect `TL_SETBACK_M` buffer visually |
| Table | `--canvas-table-fill` | `--canvas-table-stroke`, 0.5px | Muted slate-blue; hover: +4% lightness |
| Table (selected) | `--canvas-table-fill-selected` | same | Accent amber |
| ICR building | `--canvas-icr-fill` | `--canvas-icr-stroke`, 1px | Black/white label `ICR <n>` inside |
| String inverter | `--canvas-inverter-fill` | none | 6px radius circle |
| DC cable | `--canvas-cable-dc` | 1px | Blue-slate tint |
| AC cable | `--canvas-cable-ac` | 1.5px | Muted red tint; hidden by default |
| LA marker | `--canvas-la-fill` | none | 10x6px rect with label |
| LA coverage halo | `--canvas-la-radius` | none | 8% fill, no stroke |
| Dot grid (empty state) | `--canvas-grid-dot` | none | 12px spacing, 1px dots |

**Selection and hover:** always non-destructive overlays (+/- 4% lightness or +1px stroke). Never a filter change that mutates the feature's identity color.

**Labels:** Inter 12/500, `--text-secondary` in light, `--text-primary` in dark (legibility against darker ground).

**Basemap:** decision deferred to S8's ADR. Current direction: start with a free online vector provider (MapTiler free tier or Protomaps) and evaluate an offline vector pack bundle as a fallback if redistribution terms fit.

---

## 9. Icon discipline

**Primary set:** [Lucide](https://lucide.dev). Monoline, `2px` stroke, 24×24 viewBox, `stroke-linecap: round`, `stroke-linejoin: round`. Inherits color via `currentColor`.

**Sizing grid:** 16 / 20 / 24 px. Defined as CSS classes `.icon-16 .icon-20 .icon-24` in `base.css`. Never hand-scale outside this grid.

**Stroke weight:** always `2`. Never switch to solid/filled variants — the aesthetic depends on stroke consistency.

**Solar-specific icons** — custom glyphs where Lucide doesn't cover the domain. Inventory, all to be drawn on the same grid with the same stroke weight, for implementation in S6:

- `icon/module` — a single PV module (rectangle, 6 cells)
- `icon/table` — a portrait/landscape module stack on a frame
- `icon/tracker` — table + small axis line
- `icon/icr` — house-silhouette with power symbol
- `icon/string-inverter` — rectangle with three connector teeth
- `icon/la` — lightning bolt within a dashed circle
- `icon/cable-dc` / `icon/cable-ac` — two connectors linked with a straight / wavy line

**Placeholder brand mark (S5.5 → S13.6):** the Lucide `sun` icon, rendered at `--accent-default`. This exactly matches the icon used in the Tauri shell build from S5, so design mocks and shipped app share the same glyph until S13.6 swaps in the real brand.

---

## 10. Component inventory

### 10.1 shadcn/ui primitives used

Installed into `packages/ui/` in S6 and themed via the tokens above. We extend, never fork.

`Button` (ghost / subtle / primary / destructive), `IconButton`, `Card`, `Dialog`, `Sheet`, `Tabs`, `Segmented`, `Tooltip`, `Input`, `Select`, `Label`, `Separator`, `Toaster`, `Popover`, `DropdownMenu`, `Command`, `Kbd`, `Badge`, `Chip`, `Switch`, `Slider`, `NumberInput`, `Skeleton`.

### 10.2 Custom compositions

Live in `packages/ui/` alongside shadcn primitives. Tokens drive all styling; no inline styles in consumers.

- **`ToolRail`** — left 52px icon-only rail; hover tooltip; keyboard shortcut hint. Tools: Select, Pan, DrawRect, DrawPolygon, DrawLine, ICR, Measure.
- **`Inspector`** — right 320px panel, section headers, collapsible groups, tab header (Parameters / Summary / Export).
- **`StatusBar`** — bottom 28px bar; left: sidecar health dot + CRS/EPSG + dev-build FPS; right: units toggle, view-mode indicator.
- **`TopBar`** — 44px; wordmark + project breadcrumb + status chip + ⌘K hint + edition chip + user menu.
- **`MapCanvas`** — MapLibre GL container; floating scale bar + zoom controls at bottom-left/right.
- **`CommandBar`** — `Press ⌘K for commands` affordance inside the canvas surface; expands via cmdk.
- **`FeatureGate`** — wraps children; if entitlement check fails, renders the children disabled with an `UpgradeBadge` overlay.
- **`UpgradeBadge`** — small accent chip with an "Upgrade to <edition>" tooltip; clicking opens pricing in external browser.
- **`SummaryCard`** — labelled stat block (label + value + optional unit). Used for MWp, Tables, Modules, etc.
- **`PropertyRow`** — label-left / value-right row, used inside Area/Spacing sections of Inspector.
- **`Kbd`** — monospaced keyboard affordance; renders `⌘K`, `G`, `⌘O` per-platform.

---

## 11. Interaction language

### 11.1 Global keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl K` | Command palette |
| `⌘O` | Open KMZ |
| `⌘S` | Save project |
| `⌘E` | Export (opens export tab in Inspector) |
| `G` | Generate layout (when focus is on canvas or Inspector) |
| `V` | Select tool |
| `H` | Pan tool |
| `R` | Rectangle obstruction |
| `P` | Polygon obstruction |
| `L` | Line (TL corridor) |
| `I` | ICR tool (drag mode) |
| `M` | Measure |
| `Z` / `Shift+Z` | Undo / Redo (limited to 10 entries) |
| `Esc` | Cancel current tool / close dialog / dismiss popover |

### 11.2 Drag affordances

- **ICR drag:** cursor changes to `grab`/`grabbing`; ghost outline follows cursor; debounced 80ms sidecar refresh. Optimistic local move so feel stays at 60fps.
- **Obstruction drawing:** preview polygon/line grows under cursor; `Enter` commits, `Esc` cancels, `Backspace` removes last vertex during polygon drawing.

### 11.3 States

Every interactive component defines four states. No component ships without them.

| State | Affordance |
|---|---|
| Default | Token-default fill, token-default border |
| Hover | Border shifts to `--border-default`, cursor changes if interactive |
| Focus (keyboard) | 2px outline using `--border-focus`, never removed via `outline: none` without replacement |
| Active (pressed) | Fill shifts to `--surface-muted` (subtle) or accent (primary) |
| Disabled | 40% opacity, no hover, no focus, `cursor: not-allowed` |

### 11.4 Empty / loading / error

- **Empty state** — centered card with icon + headline + one-line hint + a single primary action. Example: Empty-mock's "Drop a KMZ file to begin".
- **Loading** — skeleton placeholders for known-shape content (stats, rows); spinner only for unknown-duration actions.
- **Error** — inline banner (`--error-muted` fill + `--error-default` icon) above the affected surface with the error reason and a single retry action. Modal errors only for app-level failures (sidecar crash, missing license).

---

## 12. Accessibility

- **Contrast target:** WCAG AA across both themes. Body text against its surface verified; accent-on-accent-muted verified; text-on-accent verified. Manual spot-checks performed on the five mocks; automated audit in S13.5.
- **Focus visibility:** every interactive component renders a visible `--border-focus` ring on keyboard focus. `outline: none` is allowed only if immediately replaced by an equivalent visible ring.
- **Keyboard reachability:** every action achievable by mouse is achievable by keyboard, including canvas operations (ICR drag via arrow keys when ICR is focused, obstruction drawing via `Enter` to commit).
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables all transitions and transforms app-wide.
- **Screen reader:** every icon-only button has an `aria-label`; form controls have explicit `<label>` associations.
- **Color independence:** no state is conveyed by color alone — always accompanied by icon, shape, or text. Example: feature-gate isn't only muted, it also shows the lock icon and upgrade badge.
- **Hi-contrast mode:** explicitly deferred to a future spike. Not in S13.5 scope.

---

## 13. Out of scope (explicitly)

- **Marketing-quality bespoke components.** `mvp_web` handles marketing. This doc constrains the engineering tool only.
- **Illustration system.** No illustrations ship in v1. If we need one later, it earns its own spike.
- **Custom icon language.** We extend Lucide; we never replace or re-skin it.
- **Final brand identity.** Placeholder wordmark, placeholder accent, placeholder favicon — real identity lands in S13.6.
- **Design-mode adaptations** (sunlight-readable / high-contrast / color-blind-safe palette). Deferred to future spikes per ARCHITECTURE §11.

---

## 14. Governance

- **Token changes.** Any token value change requires an ADR under `docs/adr/` if the change is not a simple hue shift within the same role. Adding a new token is fine; repurposing an existing one is not.
- **Component additions.** New shadcn primitives can be added to `packages/ui/` without ceremony, as long as they're themed via tokens. New custom compositions require an entry in §10.2.
- **Exceptions.** If a feature genuinely requires a literal value or a one-off color, it lives in the component's own file with a comment explaining why — and a TODO to fold it into a token in the next design sweep.

---

**End of document.** Reviewed and accepted at: S5.5 gate (pending).
