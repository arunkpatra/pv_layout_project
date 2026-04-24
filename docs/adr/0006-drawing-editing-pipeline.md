# ADR 0006: Drawing / editing pipeline — custom on raw MapLibre events
Date: 2026-04-24
Spike: S10.5
Status: accepted

## Context

S11 adds two interactive features to the MapLibre canvas: dragging the ICR (Inverter Control Room) building to a new position, and drawing obstructions (rectangle, polygon, line) that exclude regions from the layout. MapLibre GL is a renderer — it has no built-in drawing or editing. A decision is needed before S11 begins, because library choice affects file layout, state architecture, bundle, coordinate policy, and how theme-swap interacts with runtime layers.

The behavioral contract is fixed: we match PVlayout_Advance parity on drag + draw semantics (10m polygon close tolerance, 1m² min rectangle, drag/draw mutual exclusion, LIFO obstruction undo, LA-before-inverter refresh order, usable_polygon bounds check). Parity work is identical regardless of library choice — a library saves event plumbing, not parity glue.

Our environment adds constraints: canvas is WGS84-native (S9 pattern), theme swap calls `map.setStyle()` which destroys any runtime-added layer, and the sidecar runs pyproj (S9's precedent: pre-project on server, send WGS84 to client). S11's scope is narrow — five interaction modes (idle, drag-icr, draw-rect, draw-polygon, draw-line, select) — and no other spike from S12 through S13.6 needs drawing.

Four research agents (2026-04-24) evaluated candidates. Findings below.

## Options considered

### Option 1 — Terra Draw (`terra-draw` + `terra-draw-maplibre-gl-adapter`)
- **License:** MIT.
- **Bundle:** ~42 KB gzip combined. Fits budget comfortably.
- **Maintenance:** 1.28.8 shipped 2026-04-15 (9 days ago). ~30 commits/mo, 20 contributors. Bus factor 1 — James Milner authored ~85% of commits. OSGeo-listed but no corporate sponsor.
- **MapLibre fit:** First-class. MapLibre-first adapter, MapLibre GL 4/5 support. Cleanest MapLibre integration of the three candidates.
- **Mode coverage for S11:** Complete. Point, LineString, Polygon, Rectangle, Select (with drag-existing-vertex). Programmatically-added features (our sidecar-placed ICRs) are fully editable via `addFeatures()` + SelectMode.
- **React 19 / TS:** TypeScript-first; React 19 untested in the wild but framework-agnostic design reduces risk.
- **Known issues:** #735 no sub-path imports (all modes bundled); #168 extending SelectMode is awkward (matters if we need snap-to-grid); #253 no dedicated dragend event (debounce ourselves).
- **Verdict:** Strongest of the three libraries. Would have been our default if we stopped at library comparison.

### Option 2 — deck.gl + `@deck.gl-community/editable-layers`
- **License:** MIT (community fork license not positively confirmed from search; needs verification before locking).
- **Bundle:** ~180–220 KB gzip combined (deck core 145 + GeoJSON 28 + editable-layers, fork not on bundlephobia). **Over our informal 200 KB budget.**
- **Maintenance:** deck.gl 9.3.1 shipped ~2026-04-19; `@deck.gl-community/editable-layers` 9.3.2 shipped 2026-04-16. Active. **Critical:** the original `@nebula.gl/layers` is dead (last release 2023, 158 open issues, migration notice pinned). The live fork is `@deck.gl-community/editable-layers` — ADR must be explicit about this.
- **MapLibre fit:** `MapboxOverlay` from `@deck.gl/mapbox` (misleadingly named; is the official MapLibre adapter). Requires `interleaved: true` for proper z-ordering with MapLibre layers.
- **Mode coverage:** Complete. Includes ModifyMode and TranslateMode which natively cover ICR reposition.
- **React 19 / TS:** Recommended `skipLibCheck: true`. React 19 not tested in examples.
- **Verdict:** Reasonable if we were already using deck.gl for something else. We're not — the original SPIKE_PLAN S10.5 entry's "deck.gl lands in S10 anyway for inverters/cables" assumption is stale; S10 shipped with pure MapLibre layers. Paying 180-220 KB for just drawing is disproportionate.

### Option 3 — `@mapbox/mapbox-gl-draw` + MapLibre shim
- **License:** ISC.
- **Bundle:** ~17 KB gzip (+ ~1 KB rectangle mode addon). Smallest of the three.
- **Maintenance:** 1.5.1 shipped 2025-11-03. ~1 release/yr. Maintained by Mapbox Inc. (bus factor 1-2 employees). The community "maplibre-gl-draw" npm packages are abandoned (2023) — if you choose this, you're actually choosing upstream Mapbox with a CSS-class shim.
- **MapLibre fit:** Works, but requires a ~5-line shim (`MapboxDraw.constants.classes.CANVAS = 'maplibregl-canvas'` etc.). MapLibre GL 5 support via the shim is the de facto pattern on maplibre.org docs.
- **Mode coverage for S11:** Polygon ✓, line ✓, simple_select drag ✓, direct_select vertex drag ✓. **No built-in rectangle** — requires community `mapbox-gl-draw-rectangle-mode` (50 LOC, ~1 KB) or custom mode. Programmatic feature editing via `draw.add(fc)` works but Draw takes ownership of the geometry.
- **React 19 / TS:** TypeScript types are DefinitelyTyped-only and trail custom-mode APIs. No first-party React wrapper; community wrappers aren't React-19-tested. Imperative, verbose API — unchanged since v1.
- **Verdict:** Workable but highest friction. MapLibre-as-afterthought + verbose imperative API + no rectangle + React-19 typing lag + "big corporate maintainer" advantage is small when that maintainer is Mapbox (whose focus is their own product, not MapLibre community).

### Option 4 — Custom, on raw MapLibre events
- **License:** n/a (our code).
- **Bundle:** +0 KB. MapLibre events are already there. Optional `@turf/boolean-point-in-polygon` for drag bounds check (~3 KB gzip).
- **Maintenance:** Our own. No external upgrade cycle.
- **MapLibre fit:** Perfect — native events, no adapter layer.
- **Mode coverage for S11:** Build exactly the five modes we need. Nothing else.
- **React 19 / TS:** Our codebase, our types. No external surface to worry about.
- **Bus factor:** Zero external. Team size factor applies equally to everything we own.
- **Estimated cost:** ~440 LOC production (~800 with tests) — point drag ~80, rect ~50, polygon ~120, line ~80, selection ~50, state slice ~60, coords helpers ~20. Legacy PyQt equivalent is ~300 LOC; TS is typically more verbose.
- **Verdict:** Previously dismissed (LOC overhead) then reconsidered when brainstorm surfaced three big concerns that only exist under the library paths.

## Decision

**Adopt Option 4 — custom implementation on raw MapLibre events.**

Three concerns from the brainstorm process drove the reconsideration:

1. **Theme-swap re-attach.** Every library adds its own sources/layers at runtime; `map.setStyle()` destroys them; we'd need to wrap theme-swap with a save/restart dance. Under custom, we declare two draw-preview sources + layers in `pv-light.json` / `pv-dark.json` up front — MapCanvas's existing `styledata` handler repopulates them for free. This is not a workaround; it's using the architecture we already have.
2. **Coordinate shim.** Libraries force a coordinate model; all three candidates work in GeoJSON lng/lat and that's fine for the preview, but the commit boundary still needs a projection (for `/add-road`). Under custom we adopt a one-way rule: WGS84 end-to-end on client, sidecar projects via its existing pyproj. S9's pattern. No library coord model to bridge.
3. **Bus-factor / maintenance coupling.** Terra Draw's single maintainer, `@deck.gl-community/editable-layers`' untested-at-production-scale status, and `@mapbox/mapbox-gl-draw`'s React-19 typing lag are all small risks individually. None of them exist under custom.

None of these three is a blocker for any library. Collectively, with S11's narrow scope and no future spike needing drawing, they tilt the ROI toward custom.

The library path's benefits (reusable UX patterns, vertex-edit polish, mode breadth) don't materially apply: PVlayout_Advance doesn't do midpoint insertion or snap-to-vertex, and S11 doesn't need either. The parity glue (close tolerance, min size, bounds check, refresh order) is identical either way.

## Consequences

### What we accept

- **We own ~440 LOC of interaction code.** Code review, tests, maintenance all on us. Offset: the code is boring TypeScript (MapLibre events + Zustand slice + source updates), fully reviewable, fully testable.
- **S11 implementation must match PVlayout_Advance parity semantics precisely.** See design spec §9 for the 11-item parity contract. A library would not have saved us this work.
- **We won't have a vertex-editing polish story** (midpoint insertion, snap, etc.). Acceptable for S11 per parity scope. Revisit if a future spike needs it.
- **UX edge cases are ours to catch:** event ordering on fast drags at zoom-level boundaries, trackpad-specific timing on Windows, context-menu interception on right-click close. S13.8 parity spike is the safety net.

### What we commit to in the design

- `apps/desktop/src/state/editingState.ts` — Zustand slice per ADR-0003.
- `apps/desktop/src/canvas/InteractionController.ts` — event attach/detach owner.
- `apps/desktop/src/canvas/modes/` — one pure module per interaction.
- `apps/desktop/src/canvas/debug.ts` — probe factory; first-class debug instrumentation baked in from day 1 per user directive 2026-04-24 (structured probes on every state transition, event, commit, sidecar call, and lifecycle hook, gated by `VITE_INTERACTION_DEBUG`).
- `apps/desktop/public/map-styles/pv-light.json` + `pv-dark.json` — two new sources + ~4 new layers for draw preview and vertices.

### Sidecar contract amendment (SPIKE_PLAN S11)

`/add-road` and `/refresh-inverters` payloads shift from UTM to WGS84. Sidecar projects internally via pyproj. Matches S9's precedent. Lands with S11 implementation; SPIKE_PLAN S11 entry is amended at that time.

### Throwaway demo (S10.5 Phase 3) — completed 2026-04-24

- Branch `spike/s10_5-custom-drawing-demo`, not merged. Deleted post-gate.
- Scope: ICR point drag + rectangle draw only (polygon, line, selection deferred to S11).
- Outcome: ✅ validated. Findings captured in [`docs/gates/s10_5.md`](../gates/s10_5.md).

### Demo findings — adopted as design rules

The demo surfaced two design refinements, both folded into the spec and captured here so future spikes inherit them:

**1. High-frequency canvas interactions bypass React.** The first demo version routed every mousemove through Zustand → React subscriber → useMemo → prop → MapCanvas effect → `hydrateSources`. Each event paid a full React render cycle (10-30ms); the preview lagged the cursor visibly and "danced around." Mode modules now write preview geometry directly to the MapLibre source via `apps/desktop/src/canvas/preview.ts` (`setDrawPreview` / `clearDrawPreview`). Zustand tracks mode + session start/end + undoStack (low-frequency semantic state); per-pixel preview is a render-loop concern, not a React concern. **This rule applies to any future high-frequency interaction work** (e.g. panning ICR markers, live-updating cable paths during drag).

**2. ICR drag translates the polygon ring, not just a marker.** First demo version rendered only a vertex dot at the cursor. PVlayout_Advance translates the rectangle itself (Agent 2's research report). On mousedown, mode captures the hit feature's `coordinates[0]` ring; on mousemove, ring + delta → `setDrawPreview`. Commit payload reports `newCenter = originalCenter + dragDelta` — the ICR centroid's new position, not the mouseup pixel.

### S11 UX pattern — preview persists until sidecar ack

The demo's `onCommit` callbacks were `console.info` stubs. S11's real behavior keeps the preview visible between release and sidecar response:

```
[mouseup — drag released]
  → POST /refresh-inverters { boundary_index, icr_index, new_center_wgs84 }   (80ms debounce per spec)
  preview STAYS VISIBLE (dashed preview rect = "pending ack")
  mode → 'awaiting-ack' (new EditingMode value)
  InteractionController attaches no handlers in this mode; user can't drag/draw until ack settles

[sidecar response — ~100-300ms]
  setLayoutResult(new_result) → atomic canvas swap (tables, inverters, LAs, cables all recomputed)
  clearDrawPreview(map)
  mode → 'idle'

[sidecar error]
  toast with error message
  clearDrawPreview(map)
  mode → 'idle'
  original ICR unchanged (no optimistic update to unwind)
```

Why preview-persists: the alternative (clear preview + original ICR stays + 100-300ms stall + swap) creates a disorienting snap-back-then-move sequence. Keeping the dashed preview explicitly labels the in-flight state without lying about positions (an optimistic client-side ICR move would have stale tables under it). On error, there's nothing to unwind.

S11 amends the `EditingMode` union with `awaiting-ack`. InteractionController handles it as a no-op mode. Mutation success/error handlers in App.tsx drive the transition back to `idle`.

### What this ADR does NOT bind

- The shape of the `useAddRoadMutation` / `useRefreshInvertersMutation` hooks (S11 implementation detail).
- The specific paint properties for draw-preview layers (colors chosen during implementation; must use semantic tokens per S5.5).
- Whether bounds-check for ICR drag lives client-side (turf) or server-side (sidecar). Demo resolves; noted as open question in spec §15.

### Forward-spike impact

- **S11** — implements against this design spec. Dependency confirmed.
- **S12** (KMZ/PDF export) — no direct impact; drawn obstructions flow through sidecar state already.
- **S13** (DXF + energy yield + CSV) — same; sidecar exporters read server-side state.
- **S13.5** (dark theme parity) — draw-preview layers use semantic tokens, so dark theme inherits automatically. Verify at S13.5.
- **S13.8** (parity + gates verification) — end-to-end draw+recompute parity matrix vs PVlayout_Advance on canonical fixtures is this spike's responsibility.
- **S14** (auto-updater) — no impact.
- **S15** (release pipeline) — no impact.

## Supersedes / superseded by

- None.

## References

- Design spec: [`docs/superpowers/specs/2026-04-24-s10_5-drawing-editing-pipeline-design.md`](../superpowers/specs/2026-04-24-s10_5-drawing-editing-pipeline-design.md).
- Spike entry: [`SPIKE_PLAN.md`](../SPIKE_PLAN.md) → S10.5.
- Gate memo (populated after demo): `docs/gates/s10_5.md`.
- Related principles: [`docs/principles/external-contracts.md`](../principles/external-contracts.md), [ADR-0003](./0003-state-architecture.md).
