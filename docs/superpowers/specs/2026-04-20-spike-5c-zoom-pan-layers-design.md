# Spike 5c — Zoom/Pan + Layer Toggles

## Goal

Extend the SVG layout preview (`SvgPreview`) with mouse/touch zoom and pan, a reset-zoom button, and three layer visibility toggles (AC Cables, DC Cables, Lightning Arresters).

## Architecture

One file changes: `apps/web/components/svg-preview.tsx`. No new files, no API changes, no shared type changes.

**New dependency:** `react-zoom-pan-pinch` added to `apps/web/package.json`.

Three new capabilities, each cleanly separated:

1. **Zoom/pan** — `TransformWrapper` + `TransformComponent` wraps the existing SVG wrapper div. A forwarded ref exposes `resetTransform`.
2. **Toolbar overlay** — two-button group (Rotate + Reset Zoom) rendered `absolute` at top-right of the SVG container. Both disabled when `status !== "loaded"`.
3. **Layer toggles** — three shadcn `Switch` components rendered below the container div. State is a `Set<LayerId>`. A `useRef` + `useEffect` on `[visibleLayers, status]` manipulates `element.style.display` directly on the SVG DOM nodes.

## Component Changes

### New types and state

```ts
type LayerId = "ac-cables" | "dc-cables" | "la"

const [visibleLayers, setVisibleLayers] = React.useState<Set<LayerId>>(new Set())
```

All three layers default OFF (empty set).

### New refs

```ts
const svgWrapperRef = React.useRef<HTMLDivElement>(null)
const transformRef = React.useRef<{ resetTransform: () => void }>(null)
```

### Layer effect

```ts
React.useEffect(() => {
  if (status !== "loaded" || !svgWrapperRef.current) return
  const el = svgWrapperRef.current
  const toggle = (id: string, on: boolean) => {
    const node = el.querySelector<SVGGElement>(`#${id}`)
    if (node) node.style.display = on ? "" : "none"
  }
  toggle("ac-cables",     visibleLayers.has("ac-cables"))
  toggle("dc-cables",     visibleLayers.has("dc-cables"))
  toggle("la-footprints", visibleLayers.has("la"))
  toggle("la-circles",    visibleLayers.has("la"))
}, [visibleLayers, status])
```

The LA switch controls both `#la-footprints` and `#la-circles` together. Missing ids (old layout runs) are silently skipped via the `if (node)` guard.

### JSX structure (loaded state)

```
outer container div (aspect-ratio box)
  TransformWrapper (ref=transformRef)
    TransformComponent (wrapperStyle: absolute inset-0)
      svg-wrapper div (ref=svgWrapperRef, dangerouslySetInnerHTML with DOMPurify-sanitized SVG)
  toolbar div (absolute right-2 top-2 z-10 flex gap-1)
    Rotate button (disabled when not loaded) — RotateCwSquare icon, CSS-rotated to match rotation state
    Reset Zoom button (disabled when not loaded) — Maximize2 icon

layer toggles div (mt-2 flex flex-wrap gap-4, outside the aspect-ratio container)
  Switch + label: AC Cables
  Switch + label: DC Cables
  Switch + label: Lightning Arresters
```

**Icons:**
- Rotate: `RotateCwSquare` from `lucide-react` — icon itself CSS-rotates to match `rotation` state (0/90/180/270 deg)
- Reset Zoom: `Maximize2` from `lucide-react`

**Toolbar button styling:** same as existing rotate button — `rounded-md border bg-background/80 p-1.5 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground` plus `disabled:opacity-50 disabled:cursor-not-allowed`.

## Data Flow

```
User scrolls/pinches       → react-zoom-pan-pinch handles internally (no React state)
User clicks Reset Zoom     → transformRef.current.resetTransform()
User clicks Rotate         → setRotation → wrapperStyle recalculates → re-render
User toggles Switch        → setVisibleLayers → useEffect fires → querySelector → display style
SVG re-fetched (retry)     → setSvgContent → status "loaded" → layer effect re-runs with current visibleLayers
```

Layer toggle state survives retry — user choices are not reset when the SVG is re-fetched.

Retry resets zoom: the retry onClick calls `transformRef.current?.resetTransform()` before incrementing `retryCount`.

## Error Handling

| Scenario | Behaviour |
|---|---|
| status "loading" or "error" | Toolbar buttons disabled; switches disabled; layer effect no-ops |
| SVG group id absent in older layout run | querySelector returns null, if(node) guard skips silently |
| transformRef not yet initialised | Optional chain transformRef.current?.resetTransform() — no-op |
| Retry | Zoom reset + SVG re-fetched; layer toggle state preserved |

## Testing

**File updated:** `apps/web/components/svg-preview.test.tsx`

All existing 8 tests remain unchanged.

**New tests (8 additional):**

1. Mock `react-zoom-pan-pinch` — TransformWrapper passes ref with resetTransform spy; TransformComponent renders children
2. Toolbar renders two buttons when loaded; both absent when loading; both absent when error
3. Rotate button icon style contains `rotate(0deg)` initially; after one click contains `rotate(90deg)`
4. Reset zoom button calls `resetTransform` on click
5. All three switch labels present when loaded; all disabled when loading; all disabled when error
6. AC Cables switch unchecked by default; toggle ON sets display "" on #ac-cables; toggle OFF sets display "none"
7. LA switch toggle sets display "" on both #la-footprints and #la-circles
8. Retry resets zoom (spy resetTransform, trigger error state, click Retry, assert called)

## Out of Scope

- Download button for SVG/DXF/KMZ artifacts (deferred)
- Pre-signed URL refresh after 1-hour expiry (deferred)
- Additional layer types beyond the 10 existing gid-tagged groups
- Per-layer colour or opacity controls
