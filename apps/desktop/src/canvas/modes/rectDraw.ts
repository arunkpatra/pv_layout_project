/**
 * rectDraw mode — click-and-drag to draw an axis-aligned rectangle.
 *
 * Behaviour (matches PVlayout_Advance parity contract — see design
 * spec §9 P1, P7):
 *   - mousedown on canvas → record anchor, begin rubber-band.
 *   - mousemove → compute current rect ring, write to MapLibre preview
 *     source directly via setDrawPreview (bypasses React at 60Hz).
 *   - mouseup → emit onCommit with 5-point closed WGS84 ring.
 *     Preview STAYS VISIBLE; caller transitions mode to 'awaiting-ack'
 *     and dispatches /add-road mutation. Mutation's onSettle clears
 *     preview + resets mode.
 *   - Escape → abort, clear preview, stay in draw-rect mode so the
 *     user can start another (matches legacy tool-stays-active).
 *
 * Minimum 1m² guard: enforced server-side via road_manager's
 * `recompute_tables` intersection math (sub-1m² rects intersect no
 * tables and are a harmless addition to placed_roads; /add-road still
 * returns 200). Client emits whatever was drawn.
 */
import type maplibregl from "maplibre-gl"
import type { FeatureCollection } from "geojson"
import type { StoreApi } from "zustand"
import type { LngLat } from "../coords"
import { rectRingFromCorners } from "../coords"
import { makeProbe } from "../debug"
import { clearDrawPreview, setDrawPreview } from "../preview"
import type { useEditingStateStore } from "../../state/editingState"

type EditingStore = ReturnType<typeof useEditingStateStore.getState>

const log = makeProbe("rect")

export interface RectCommit {
  roadType: "rectangle"
  coordsWgs84: LngLat[]
}

export interface RectDrawContext {
  map: maplibregl.Map
  store: StoreApi<EditingStore>
  onCommit: (commit: RectCommit) => void
}

export function attachRectDraw(ctx: RectDrawContext): () => void {
  const { map } = ctx
  const canvas = map.getCanvas()

  let anchor: LngLat | null = null

  const onMouseDown = (e: maplibregl.MapMouseEvent) => {
    if (anchor) return
    anchor = [e.lngLat.lng, e.lngLat.lat]
    log("event", "anchor set", { lngLat: anchor })
    map.dragPan.disable()
    e.preventDefault()
  }

  const onMouseMove = (e: maplibregl.MapMouseEvent) => {
    if (!anchor) return
    const cursor: LngLat = [e.lngLat.lng, e.lngLat.lat]
    const ring = rectRingFromCorners(anchor, cursor)
    const previewFc: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [ring.map(([lng, lat]) => [lng, lat])],
          },
          properties: {},
        },
      ],
    }
    setDrawPreview(map, previewFc, null)
  }

  const onMouseUp = (e: maplibregl.MapMouseEvent) => {
    if (!anchor) return
    const cursor: LngLat = [e.lngLat.lng, e.lngLat.lat]
    const ring = rectRingFromCorners(anchor, cursor)
    log("mode", "commit", { anchor, cursor, ring })
    // Preview stays visible — caller handles awaiting-ack state.
    try {
      ctx.onCommit({ roadType: "rectangle", coordsWgs84: ring })
    } catch (err) {
      log.error("onCommit threw", { err: String(err) })
      clearDrawPreview(map)
    }
    anchor = null
    map.dragPan.enable()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!anchor) return
    if (e.key !== "Escape") return
    log("mode", "abort (Escape)")
    anchor = null
    map.dragPan.enable()
    clearDrawPreview(map)
  }

  const onEnter = () => {
    canvas.style.cursor = "crosshair"
  }
  const onLeave = () => {
    if (!anchor) canvas.style.cursor = ""
  }

  log("lifecycle", "attach")
  map.on("mousedown", onMouseDown)
  map.on("mousemove", onMouseMove)
  map.on("mouseup", onMouseUp)
  map.getContainer().addEventListener("mouseenter", onEnter)
  map.getContainer().addEventListener("mouseleave", onLeave)
  document.addEventListener("keydown", onKeyDown)
  canvas.style.cursor = "crosshair"

  return () => {
    log("lifecycle", "detach")
    map.off("mousedown", onMouseDown)
    map.off("mousemove", onMouseMove)
    map.off("mouseup", onMouseUp)
    map.getContainer().removeEventListener("mouseenter", onEnter)
    map.getContainer().removeEventListener("mouseleave", onLeave)
    document.removeEventListener("keydown", onKeyDown)
    map.dragPan.enable()
    canvas.style.cursor = ""
    anchor = null
    // Detach might happen mid-drag (e.g. mode switch or theme swap).
    // Clear preview so orphaned dashed geometry doesn't persist.
    clearDrawPreview(map)
  }
}
