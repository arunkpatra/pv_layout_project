/**
 * Direct-to-MapLibre preview writers.
 *
 * Why not go through Zustand + React like the rest of the app? High-
 * frequency canvas interactions (drag, rubber-band draw) fire tens of
 * mouse events per second. Bouncing each one through Zustand → React
 * subscriber → useMemo → prop change → MapCanvas effect → setData is
 * 10-30ms of scheduling overhead per event, producing visible jitter
 * (user-verified in the S10.5 demo: "moves slowly, dances around").
 *
 * These helpers write directly to the two MapLibre sources declared in
 * the style JSONs (`kmz-draw-preview`, `kmz-draw-vertices`). React
 * re-renders are unaffected — mode modules just paint transient
 * animation frames straight to the GPU's source-of-truth.
 *
 * Zustand remains the semantic state holder: mode, session start/end,
 * undoStack pushes on commit ack. But per-pixel preview geometry is a
 * render-loop concern, owned by the mode modules.
 *
 * Theme-swap behavior: `setStyle()` re-creates the two sources from the
 * style JSON (empty). InteractionController detaches + re-attaches the
 * active mode on `styledata`. Re-attach creates a fresh mode closure
 * with no session; any in-flight drag/draw is aborted. Matches spec §10
 * error-handling rule "theme swap during in-flight draw → abort".
 *
 * Per-ack persistence: the S11 UX pattern keeps the preview visible
 * between mouseup and sidecar response (mode in `awaiting-ack`). Mode
 * modules hold the preview via `setDrawPreview(map, finalFc, null)` at
 * commit time; the mutation's onSettle handler calls `clearDrawPreview`.
 */
import type { FeatureCollection } from "geojson"
import type maplibregl from "maplibre-gl"

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] }

const PREVIEW_SOURCE_ID = "kmz-draw-preview"
const VERTICES_SOURCE_ID = "kmz-draw-vertices"

/**
 * Write new preview + vertex geometry to the draw sources. Either
 * argument may be null → that source is cleared. If either source isn't
 * registered (map still initialising, or style JSON was missing the
 * declarations), the call is silently no-op — the probe fired by the
 * caller already records the intent.
 */
export function setDrawPreview(
  map: maplibregl.Map,
  preview: FeatureCollection | null,
  vertices: FeatureCollection | null
): void {
  const prev = map.getSource(PREVIEW_SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined
  if (prev) prev.setData(preview ?? EMPTY)
  const vert = map.getSource(VERTICES_SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined
  if (vert) vert.setData(vertices ?? EMPTY)
}

/** Shortcut: both sources empty. Call on mouseup-abort, detach, or
 * mutation onSettle. NOT called on mouseup-commit — the preview
 * persists until sidecar ack. */
export function clearDrawPreview(map: maplibregl.Map): void {
  setDrawPreview(map, null, null)
}
