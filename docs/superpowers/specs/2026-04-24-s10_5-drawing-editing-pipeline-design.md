# S10.5 — Drawing / Editing Pipeline Design Spec

**Status:** Approved (via brainstorm 2026-04-24) · Pending demo validation · ADR-0006 in draft
**Spike:** S10.5 — Drawing / editing pipeline ADR
**Related ADR:** [ADR-0006 — Drawing / editing pipeline](../../adr/0006-drawing-editing-pipeline.md)
**Deliverable owner:** S11 implementation builds against this spec.
**Last updated:** 2026-04-24

---

## 1. Summary

S11 introduces two interactive features on the MapLibre canvas: dragging the ICR (Inverter Control Room) to a new position, and drawing obstructions (rectangle, polygon, or line) that exclude regions from the layout. MapLibre GL is a renderer, not an editor — a separate interaction layer is needed. After evaluating four candidates (Terra Draw, deck.gl + `@deck.gl-community/editable-layers`, `@mapbox/mapbox-gl-draw` + MapLibre shim, and a custom implementation on raw MapLibre events — see [ADR-0006](../../adr/0006-drawing-editing-pipeline.md)), we chose **custom**.

This spec describes the custom pipeline: a Zustand slice for editing state, an `InteractionController` that attaches MapLibre event handlers based on the active mode, pure per-mode modules for rect/polygon/line/drag/select, draw-preview sources + layers declared in the style JSON, WGS84 coordinates end-to-end on the client, and first-class debug instrumentation baked in from day 1.

---

## 2. Goals and non-goals

### Goals
- **Match PVlayout_Advance parity** on drag + draw behaviors (close tolerance, min sizes, bounds checks, mutual exclusion, refresh ordering).
- **Zero external drawing-library dependency.** Interaction logic lives in our monorepo.
- **Ride the existing theme-swap architecture** — no special-case re-attach code for drawn preview shapes.
- **Consistent with ADR-0003** — editing state is a Zustand slice; cross-component by design.
- **Consistent with S9 pattern** — client is WGS84-native, sidecar projects to UTM via pyproj.
- **Debuggable by default.** Every state transition and side-effect emits a structured probe.

### Non-goals
- Not a general-purpose drawing library. Five modes, period: `idle`, `drag-icr`, `draw-rect`, `draw-polygon`, `draw-line`, and `select`.
- Not building vertex-level editing UX (midpoint insertion, snap-to-vertex, hover handles). PVlayout_Advance doesn't have these; S11 doesn't either. Future spike if ever needed.
- Not adding touch-gesture support. Tauri desktop app, mouse/trackpad only.
- Not wiring Ctrl+Z. PVlayout_Advance has an "Undo Last" button, not a keyboard binding. We match.

---

## 3. Architecture

### File layout

```
apps/desktop/src/
├── state/
│   └── editingState.ts              (new — Zustand slice)
├── canvas/
│   ├── InteractionController.ts     (new — event attach/detach)
│   ├── debug.ts                     (new — probe factory)
│   ├── coords.ts                    (new — WGS84 helpers, polygon-close tolerance in degrees)
│   └── modes/
│       ├── icrDrag.ts               (new)
│       ├── rectDraw.ts              (new)
│       ├── polygonDraw.ts           (new)
│       ├── lineDraw.ts              (new)
│       └── selection.ts             (new)
├── panels/
│   └── DrawingToolbar.tsx           (new — mode buttons + "Undo Last" + "Clear All")
└── App.tsx                          (modified — wire InteractionController to mapRef from onMapReady)

apps/desktop/public/map-styles/
├── pv-light.json                    (+ 2 sources: kmz-draw-preview, kmz-draw-vertices;
│                                       + ~4 layers: draw-preview-fill/outline, draw-vertex-point)
└── pv-dark.json                     (same additions, dark tokens)

packages/sidecar-client/src/
└── index.ts                          (+ AddRoadRequest + RefreshInvertersRequest types;
                                         schema change: WGS84 coords, not UTM)
```

### Component responsibilities

- **`useEditingStateStore`** (Zustand slice) — mode enum, in-progress geometry (nullable), selected feature, obstruction undo stack. Actions: `setMode`, `setInProgressGeometry`, `commitObstruction`, `undoLastObstruction`, `clearAllObstructions`, `reset`. See §4.
- **`InteractionController`** — holds the active `maplibregl.Map` instance (received via `onMapReady`). On mode change, detaches previous mode's handlers and attaches new mode's. Routes events to the active mode module. On `styledata`, re-attaches handlers (same pattern as `MapCanvas.hydrateSources`). Lives as a singleton attached via React `useEffect`. See §5.
- **Mode modules** — each exports a `Mode` interface: `attach(map, store) → detach()`. Modules read editingState, mutate `inProgressGeometry` during interaction, call `commit(...)` on commit event, `reset` otherwise. Pure — no direct sidecar calls; commits emit intents that App.tsx wires to mutation hooks. See §6.
- **`coords.ts`** — `polygonCloseThresholdDeg(centroidLat)` converts 10m to degrees-of-longitude at the map centroid (PVlayout_Advance's tolerance is 10m UTM; we match by converting per-centroid). `wgs84ToShapelyRing(ring)` etc. as needed.
- **`debug.ts`** — probe factory (§11).
- **`DrawingToolbar.tsx`** — UI for mode buttons + undo/clear. Mutually exclusive toggle group.

### Data flow

**Key rule (adopted from S10.5 demo findings, 2026-04-24):** High-frequency canvas interactions (drag, rubber-band draw) **bypass React entirely** for transient preview geometry. Mode modules call `setDrawPreview(map, previewFc, verticesFc)` from `apps/desktop/src/canvas/preview.ts`, which writes directly to the `kmz-draw-preview` + `kmz-draw-vertices` MapLibre sources. Zustand tracks mode + session start/end + undoStack (low-frequency semantic state); per-pixel preview is a render-loop concern, not a React concern. Going through Zustand → React subscriber → useMemo → prop → MapCanvas effect took 10-30ms per event and produced visible jitter in the demo.

**Obstruction draw (rect):**

```
User clicks [Rect] button
  ↓
DrawingToolbar calls setMode('draw-rect')
  ↓
editingState slice updates mode + clears inProgressGeometry
  ↓
InteractionController detaches prior handlers + attaches rectDraw.ts handlers
  ↓
mousedown → set rect anchor; store mode session via setInProgressGeometry (single low-freq call)
mousemove → compute current rect ring, setDrawPreview(map, previewFc, null)  ← direct to MapLibre
  ↓
(MapLibre renders preview polygon immediately; no React render)
  ↓
mouseup → compute final WGS84 ring, emit commitIntent via callback to App.tsx
         setInProgressGeometry(null), clearDrawPreview(map)
  ↓
App.tsx → useAddRoadMutation → POST /add-road { road_type, coords_wgs84 }
  ↓
sidecar projects to UTM, appends PlacedRoad, recomputes via run_layout_multi from tables_pre_icr
  ↓
LayoutResponse replaces layoutResult → canvas re-renders → editingState pushes onto undoStack,
returns to idle mode
```

**ICR drag:**

```
mousedown on kmz-icrs feature (via queryRenderedFeatures hit test)
  ↓
Capture feature.geometry.coordinates[0] as originalRing, compute originalCenter (ring centroid)
Record clickPoint.
editingState: setInProgressGeometry({ type: 'icr-drag', originalRing, originalCenter, newCenter: originalCenter })
                                                              ← session-start signal, single low-freq call
  ↓
mousemove → compute delta = (lngLat - clickPoint); translate originalRing by delta
            setDrawPreview(map, translatedRingFc, centroidPointFc)  ← direct to MapLibre
(canvas shows ICR rect at new position; no React render, no layoutResult mutation)
  ↓
mouseup → emit commit { boundary_name, icr_index, newCenter = originalCenter + delta }
         via callback to App.tsx (see S11 UX pattern below — preview persists until sidecar ack)
  ↓
S11: App.tsx → useRefreshInvertersMutation → POST /refresh-inverters
   { boundary_index, icr_index, new_center_wgs84 }
  ↓
sidecar places LAs first, then string inverters (CRITICAL ORDER), returns LayoutResponse
  ↓
layoutResult replaces → clearDrawPreview(map) → canvas atomic swap → idle mode
```

**S11 extension — preview persists until sidecar ack:** on drag release, the preview ring stays visible (dashed = "pending ack") while the sidecar recomputes. Mode transitions to a new `awaiting-ack` state (rather than `idle`), preventing further interaction during the round-trip. On response, `setLayoutResult` + `clearDrawPreview` + mode `idle` land atomically. On error, `clearDrawPreview` + toast + mode `idle` with no optimistic state to unwind. See [ADR-0006 Consequences](../../adr/0006-drawing-editing-pipeline.md) "S11 UX pattern" for the full flow.

---

## 4. Zustand slice — `editingState.ts`

### Schema

```ts
type EditingMode =
  | 'idle'
  | 'drag-icr'
  | 'draw-rect'
  | 'draw-polygon'
  | 'draw-line'
  | 'select'

type InProgressGeometry =
  | null
  | { type: 'rect'; anchor: LngLat; cursor: LngLat }
  | { type: 'polygon'; vertices: LngLat[]; cursor: LngLat | null }
  | { type: 'line'; vertices: LngLat[]; cursor: LngLat | null }
  | { type: 'icr-drag'; icrIndex: number; newCenter: LngLat }

interface CommittedObstruction {
  roadType: 'rectangle' | 'polygon' | 'line'
  coordsWgs84: LngLat[]
  serverAck: true  // set only after sidecar acks; optimistic entries never hit stack
}

interface EditingStateSlice {
  mode: EditingMode
  inProgressGeometry: InProgressGeometry
  selectedIcrIndex: number | null
  undoStack: CommittedObstruction[]

  // actions
  setMode(next: EditingMode): void
  setInProgressGeometry(g: InProgressGeometry): void
  pushObstruction(o: CommittedObstruction): void
  popLastObstruction(): CommittedObstruction | null
  clearUndoStack(): void
  reset(): void  // used on new KMZ open, mirrors layoutParams/layerVisibility resets
}
```

### Invariants

- `mode === 'idle'` ⇒ `inProgressGeometry === null` AND `selectedIcrIndex === null`.
- Changing `mode` always clears `inProgressGeometry` and `selectedIcrIndex`.
- `undoStack` only contains server-ack'd obstructions. Optimistic adds never enter it; a failed `/add-road` leaves the stack unchanged.
- `reset()` clears everything and returns to `idle`.
- `pushObstruction` does not deduplicate. Two identical rectangles can legitimately exist.

### Tests

- Default state: idle, null geometry, empty stack.
- `setMode` transitions clear in-progress and selection.
- `pushObstruction` → `popLastObstruction` → stack depth 0.
- `pushObstruction` (a), (b), (c) → `popLast` returns (c), then (b), then (a).
- `reset` mirrors initial state.
- Immutable updates (existing store test pattern).

---

## 5. InteractionController

### Contract

```ts
class InteractionController {
  private map: maplibregl.Map | null = null
  private activeMode: EditingMode = 'idle'
  private activeDetach: (() => void) | null = null
  private styledataHandler: (() => void) | null = null

  attach(map: maplibregl.Map): void {
    this.map = map
    this.subscribeToStoreChanges()
    this.subscribeToStyledata()
  }

  detach(): void { /* clean everything up */ }
}
```

### Behavior

- On construct + attach, subscribes to `useEditingStateStore` changes. On `mode` change: call `activeDetach()` (tearing down current mode's handlers), look up new mode's module, call `mode.attach(map, store)`, save returned detach fn.
- On `styledata` event (fires after `setStyle`), re-attach current mode. This is cheaper than caching state externally: each mode's `attach` initializes from current store state, so re-attach is idempotent.
- All probe-logged (§11).

### Lifecycle with theme-swap

```
user toggles theme
  ↓
App passes new styleUrl to MapCanvas
  ↓
MapCanvas effect: map.setStyle(newStyleUrl)
  ↓
fires styledata
  ↓
MapCanvas styledata handler (EXISTING): hydrateSources() → repopulates all kmz-* sources
  ↓
InteractionController styledata handler (NEW): activeDetach() + mode.attach(map, store)
  ↓
preview source repopulates automatically because inProgressGeometry is still in store
  and MapCanvas's source-update effect notices the source exists again
```

No caching of geometry; no `draw.getSnapshot()`/`start()` dance. The Zustand slice is the source of truth across the style-swap boundary.

---

## 6. Mode modules

### Common interface

```ts
interface Mode {
  attach(map: maplibregl.Map, store: StoreApi<EditingStateSlice>): () => void
  // returns detach fn
}
```

**Keyboard events.** MapLibre captures pointer events on the map canvas but does NOT emit keyboard events — its canvas isn't focusable. Escape-to-abort, Enter-to-commit-line, Delete-to-remove-selection bindings register at the `document` level inside each mode's `attach()`, and the returned detach fn removes them. The keydown handler gates on the mode-active check so we don't hijack global shortcuts when nothing is in progress.

This is a divergence from PVlayout_Advance (matplotlib canvas captures keyboard events natively because matplotlib backs its canvas with a QWidget). Behaviorally equivalent to the user.

### `icrDrag.ts`

- On `mousedown`: `queryRenderedFeatures({ layers: ['kmz-icrs-fill'] })`. If hit, capture `icrIndex`, set mode cursor, begin drag.
- On `mousemove`: compute delta from last position, update `inProgressGeometry.newCenter`.
- On `mouseup`: validate new center is inside `usable_polygon` (use Shapely-in-browser via `@turf/boolean-point-in-polygon` — already a candidate; OR ask sidecar to validate — see Open Questions).
- On commit: emit `{ icrIndex, newCenter }` via callback (App.tsx wires to `useRefreshInvertersMutation`).
- On invalid: snap back, return to idle.

### `rectDraw.ts`

- On `mousedown`: record anchor = `map.unproject(event.point)`.
- On `mousemove`: set `inProgressGeometry = { type: 'rect', anchor, cursor }`.
- On `mouseup`: compute 5-point closed ring from anchor+cursor. Emit `{ roadType: 'rectangle', coordsWgs84: ring }`.
- Minimum-size guard: **after sidecar projects, it enforces 1m² min**. Client emits whatever was drawn; silent-cancel happens server-side if too small. (Cleaner than client-side UTM math.)

### `polygonDraw.ts`

- On `click`: append vertex. If ≥3 vertices AND distance from click to `vertices[0]` < `polygonCloseThresholdDeg(centroidLat)`, close polygon and commit.
- On `dblclick`: if ≥3 vertices, close and commit.
- On `contextmenu` (right-click): if ≥3 vertices, close and commit; else ignore (prevents accidental right-click close on a 2-vertex polygon).
- On `mousemove`: update `inProgressGeometry.cursor` for preview segment.
- On `Escape`: abort, return to idle without committing.

### `lineDraw.ts`

- Same vertex-accumulation as polygon, but **no close semantics** — a line is complete when user commits via `Enter` key or right-click (must have ≥2 vertices). Does not auto-close into a polygon.

### `selection.ts`

- On `click`: `queryRenderedFeatures({ layers: ['kmz-icrs-fill', 'kmz-obstructions-fill'] })`. Update `selectedFeature` in store. Emit nothing.
- On `Delete` / `Backspace` (when selection is an obstruction): emit remove intent → `POST /remove-road { index }`.
- ICR is not deletable via this mode; selection is informational only.

---

## 7. Coordinate policy

**WGS84 end-to-end on client.** Every coordinate the client holds, stores, or transmits is `[longitude, latitude]` in degrees. `map.unproject(event.point)` returns lng/lat. All preview GeoJSON is WGS84.

**SPIKE_PLAN amendment — S11 `/add-road` payload changes from UTM to WGS84.**

Rationale: consistent with S9's "pre-project on sidecar" pattern. Sidecar already runs pyproj; client stays light. Legacy was UTM-native because it never crossed a wire; our wire IS WGS84-native.

**Degenerate cases:**
- 10m polygon-close tolerance in UTM → client uses Haversine distance in metres directly, not a precomputed degree threshold. `coords.ts:haversineMetres(a, b)` returns metres; close-check is `haversineMetres(click, vertices[0]) < 10`. Independent of latitude, correct at every zoom and every location.
- 1m² min rectangle: deferred to sidecar (it has UTM). Client never rejects for size.
- All distance comparisons that matter for UX use Haversine in metres. Component-wise degree comparisons are reserved for cheap first-pass filters (not currently needed).

**Sidecar endpoints (amended for S11):**

```
POST /add-road
  { road_type: "rectangle" | "polygon" | "line",
    coords_wgs84: [[lng, lat], ...]  }
  → LayoutResponse

POST /refresh-inverters
  { boundary_index: number,
    icr_index: number,
    new_center_wgs84: [lng, lat] }
  → LayoutResponse

POST /remove-road
  { index: number }
  → LayoutResponse
```

---

## 8. Theme-swap re-attach

**Zero special-case code.** See [§5 lifecycle with theme-swap](#lifecycle-with-theme-swap). The two draw-preview sources + their layers are declared in both style JSONs. `MapCanvas.hydrateSources` already re-populates all `kmz-*` sources on `styledata`. `InteractionController.styledata` re-attaches the active mode's handlers.

**Style JSON additions** (both `pv-light.json` and `pv-dark.json`):

```json
"sources": {
  ...,
  "kmz-draw-preview": { "type": "geojson", "data": { "type": "FeatureCollection", "features": [] } },
  "kmz-draw-vertices": { "type": "geojson", "data": { "type": "FeatureCollection", "features": [] } }
},
"layers": [
  ...,
  {
    "id": "draw-preview-fill",
    "type": "fill",
    "source": "kmz-draw-preview",
    "paint": {
      "fill-color": "var(--accent-default)" /* pseudo — real token via map style function */,
      "fill-opacity": 0.18
    }
  },
  { /* draw-preview-outline */ },
  { /* draw-vertex-point */ }
]
```

Exact paint values picked in implementation; semantic tokens (`--accent-*`) resolved the same way existing canvas layers resolve them (via the style JSON's theme-token mapping at load time).

---

## 9. Parity contract (PVlayout_Advance)

Extracted from the read-only legacy reference. All items are hard requirements for S11.

| # | Behavior | Requirement |
|---|---|---|
| P1 | Rectangle minimum area | 1m² (enforced server-side post-projection; silent-cancel if smaller). |
| P2 | Polygon close tolerance | 10m in UTM → converted per-centroid-latitude to WGS84 degrees on client. |
| P3 | Polygon minimum vertices | 3 to close, otherwise ignore close gesture. |
| P4 | Drag bounds | New ICR rect must be fully contained in `usable_polygon`. Reject → snap back. |
| P5 | Refresh order on any commit | **LAs placed before string inverters.** Sidecar responsibility; ADR flags this as load-bearing. Inverting = silently wrong counts. |
| P6 | Cable staleness after ICR drag | Match legacy: cables not regenerated (known limitation). Document in S11 gate memo. |
| P7 | Drag/draw mutual exclusion | Enforced by `editingMode` switch. Entering any draw mode clears active drag; entering drag mode clears active draw. |
| P8 | Undo scope | Obstructions only. No ICR-drag undo. "Undo Last" button = LIFO pop + `/remove-road`. |
| P9 | Clear All | Removes all obstructions in one call. Legacy has this. |
| P10 | Draw mode auto-exit | On successful commit, return to `idle`. Legacy exits after every commit. |
| P11 | Ctrl+Z | Not bound. Match legacy. |

---

## 10. Error handling

| Condition | Behavior |
|---|---|
| Rect smaller than 1m² | Sidecar silent-cancels; client stays in draw mode; no toast. |
| Polygon < 3 vertices on close | Ignore close gesture; stay in draw mode. |
| ICR dragged outside usable_polygon | Snap back, return to idle, no toast (matches legacy's silent snap). |
| Escape key during draw | Abort, clear preview, return to idle. |
| Sidecar 4xx on /add-road | Toast: "Couldn't add obstruction: ..."; do NOT push onto undoStack; return to idle. |
| Sidecar 5xx | Same as 4xx but toast copy is "Sidecar error, try again". |
| Theme swap during in-flight draw | Abort: clear `inProgressGeometry`, reset mode to idle. (Edge case — user toggles theme mid-draw; unlikely but well-defined.) |
| KMZ open during in-flight draw | `editingState.reset()` called in App.tsx's `handleOpenKmz` (mirrors existing `layoutParams.reset()`). |

---

## 11. Debug instrumentation

### `debug.ts` contract

```ts
export type ProbeKind = 'state' | 'event' | 'mode' | 'sidecar' | 'lifecycle'

export interface Probe {
  (kind: ProbeKind, message: string, payload?: Record<string, unknown>): void
  error: (message: string, payload?: Record<string, unknown>) => void
}

export function makeProbe(namespace: string): Probe
```

### Gate

Two layers:

1. **Build-time kill-switch.** The `debug.ts` module checks `import.meta.env.PROD` at module load and, in production, returns a no-op factory. Because this is a statically-evaluable literal expression, Vite tree-shakes the console call sites out of the production bundle entirely.

2. **Dev runtime toggle.** In non-production builds, `debugEnabled()` additionally checks `VITE_INTERACTION_DEBUG === '1'` (baked in at dev-server start) OR `window.__S11_DEBUG__ === true` (toggleable at runtime in DevTools). Production ignores both.

```ts
const debugEnabled = (): boolean => {
  if (import.meta.env.PROD) return false
  if (import.meta.env.VITE_INTERACTION_DEBUG === '1') return true
  if (typeof window !== 'undefined' && (window as any).__S11_DEBUG__) return true
  return false
}
```

Disabled → all `Probe` calls short-circuit at the top of the factory-returned function. Production builds strip them to no-ops; dev builds retain them for on-demand flipping.

### Emission format

```
[s11:<namespace>] <message>  { payload: JSON }
```

Examples:

```
[s11:state] setMode idle → draw-rect
[s11:ctrl] attach draw-rect handlers
[s11:rect] anchor set  { lng: 77.614, lat: 12.934 }
[s11:rect] dims  { widthM: 45.2, heightM: 18.7 }
[s11:rect] commit emit  { roadType: 'rectangle', coordsWgs84: [...5 points...] }
[s11:sidecar] POST /add-road start  { roadType: 'rectangle' }
[s11:sidecar] POST /add-road end  { ms: 142, status: 200 }
[s11:state] pushObstruction  { stackDepth: 3 }
[s11:ctrl] mode change idle → idle (commit cleared)
```

### Probe points (exhaustive)

- **`editingState` slice:** every action logs a `state` probe with before/after values.
- **`InteractionController`:** `lifecycle` on attach/detach/styledata, `event` on every handler dispatch.
- **Mode modules:** `mode` probes at key milestones (drag start/end, vertex added, close triggered, min-size guard).
- **Mutation hooks:** `sidecar` probes at start + end (with ms + status).
- **App.tsx wiring:** `lifecycle` when resetting editing state on new KMZ.

### Visual state panel (optional, dev-only, Phase 3 demo)

- Fixed-position overlay in bottom-right, toggleable via `Cmd+Shift+D`.
- Shows: current mode, selectedIcrIndex, `inProgressGeometry` summary (`rect: 45.2m × 18.7m @ [77.614, 12.934]`), undoStack depth.
- ~60 LOC React component. Hidden in production builds (env flag gate).
- If the throwaway demo demonstrates clear value, ships with S11. If noisy/unhelpful, we strip it before ADR finalizes.

---

## 12. Testing strategy

### Unit tests (Vitest + RTL)

- **`editingState.test.ts`** (new) — every action, invariants (§4).
- **`coords.test.ts`** (new) — `polygonCloseThresholdDeg`, WGS84 helpers.
- **`rectDraw.test.ts`**, **`polygonDraw.test.ts`**, **`lineDraw.test.ts`**, **`icrDrag.test.ts`**, **`selection.test.ts`** (new) — pure function mode logic. Mock `map.unproject`, simulate event sequences, assert `inProgressGeometry` and commit emissions.
- **`InteractionController.test.ts`** (new) — attach/detach sequence, styledata re-attach, mode transitions. MapLibre mocked.

### Deferred to S13.8 parity spike

- Real MapLibre event-dispatch integration tests (hard to unit-test reliably; expensive to set up).
- End-to-end count parity (draw rect over N tables, verify N tables gone after recompute, compare against PVlayout_Advance for same input).
- Per-tier gate walk for drawing features (all Basic+ tiers — `obstruction_exclusion` is Basic per seed, so all paid users can draw).

### Manual gate (S11 physical gate)

- Follow gate memo checklist in Tauri dev app.
- Probe log captures the causal chain for any weird behavior.

---

## 13. Throwaway demo (S10.5 Phase 3)

### Scope

- ICR point drag + rectangle draw. **Skip** polygon, line, and selection modes.
- Demo ships with probes on from line 1 — exercises the debug instrumentation alongside the drawing.
- Branch: `spike/s10_5-custom-drawing-demo`. Not merged. Archived after ADR-0006 lands.

### What the demo validates

1. MapLibre event pipeline on a real `phaseboundary2.kmz` layout.
2. `map.unproject()` accuracy at 3 zoom levels (10, 15, 18).
3. Preview-source `setData` throughput at 60fps during drag.
4. Theme-swap-during-draw correctly aborts via `styledata` handler.
5. Actual LOC written vs the 440 estimate (honesty check).
6. Probes surface the right signal at the right volume (not deafening, not silent).

### Hard time-box

- **4 hours.** If the demo isn't clean-working at that point, escalate: re-open library path, extend box, or scope-down S11.

### Artifacts

- Short screen recording (~30s): load KMZ → drag ICR → draw rect → observe recompute.
- LOC tally: line counts for each file in `apps/desktop/src/canvas/` and the new slice.
- Gotchas doc: `docs/gates/s10_5.md` captures any MapLibre edge cases, probe-log-surfaced surprises, or design amendments.

### Disposition

- Demo branch deleted after ADR-0006 is accepted. S11 implements from scratch, reusing the lessons and patterns but not the demo code (intentional — demo was a spike, not production).

---

## 14. Sidecar contract amendments

Requires an edit to [SPIKE_PLAN.md](../../SPIKE_PLAN.md) S11 entry and the corresponding `pvlayout_engine/schemas.py` + `pvlayout_engine/routes/layout.py` when S11 implements:

- `/add-road` request body: `{ road_type: "rectangle" | "polygon" | "line", coords_wgs84: [[lng, lat], ...] }` (was: UTM).
- `/refresh-inverters` request body: `{ boundary_index, icr_index, new_center_wgs84: [lng, lat] }`.
- `/remove-road` unchanged: `{ index }`.
- Sidecar projects WGS84 → UTM internally via pyproj (existing helper).

This is a spike-time contract amendment; lands as part of S11 implementation. The amendment is recorded in ADR-0006's Consequences section.

---

## 15. Open questions

- **Bounds check for ICR drag — client-side or server-side?** Spec says client-side with `@turf/boolean-point-in-polygon`. Alternative: send to sidecar, let it validate and 422 if invalid, client snaps back on 422. Server-side is cleaner (no turf dep) but costs a round-trip per drag release. Demo will settle: if turf is < 5 KB gzip, client wins; otherwise sidecar. **Default: client-side pending demo.**
- **Enter-key-to-commit for lines.** Spec says so. Might feel weird — most map UX uses double-click or right-click. Alternative: right-click only. Demo will feel it out. **Default: right-click or Enter, either works.**
- **Which layer ID does `queryRenderedFeatures` hit on ICR?** Current style has `kmz-icrs-fill` — confirm at demo time the click-target area is right-sized (ICR rects are small at low zoom).

These are not ADR-blocking; demo resolves them. ADR-0006 notes them in Consequences.

---

## Appendix A — Summary of why custom over library

See [ADR-0006](../../adr/0006-drawing-editing-pipeline.md) §Options and §Decision for the full analysis. Short version: S11's scope is narrow (5 modes, all paralleling PVlayout_Advance semantics); our env has specific constraints (theme-swap via `setStyle` destroys runtime layers, WGS84-native canvas, no existing deck.gl usage despite the old spike entry's assumption); library integration costs stack up (Terra Draw bus-factor 1; deck.gl fork ~200 KB bundle; mapbox-gl-draw shim + missing rectangle + React-19 typing lag); our monorepo patterns (Zustand slices, style-JSON sources) make the "custom" path disproportionately cheap.

The three questions that would have dominated library integration (coordinate shim, theme-swap re-attach strategy, library-state caching across `setStyle`) all evaporate under custom. Three others (mode mutual exclusion, undo stack, drag/draw semantics) are implemented the same way in either path. Net: custom avoids meaningful integration patchwork for this narrow use case.
