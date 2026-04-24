/**
 * icrDrag mode — click-and-hold on an ICR rectangle, drag to new
 * position, release to commit to the sidecar via /refresh-inverters.
 *
 * Behaviour (matches PVlayout_Advance parity contract — see design
 * spec §9 P4, P5, P7):
 *   - mousedown on icrs-fill feature → capture boundary + index +
 *     original ring + centroid + click point, enter drag-icr mode
 *     (store-driven session-start signal).
 *   - mousemove → compute drag delta from clickPoint, translate the
 *     original ring and a centroid dot, write directly to the MapLibre
 *     preview sources via setDrawPreview. Bypasses React entirely —
 *     see canvas/preview.ts for the rationale.
 *   - mouseup → emit onCommit with { boundaryName, icrIndex,
 *     newCenter = originalCenter + delta }. Preview STAYS VISIBLE; the
 *     caller transitions mode to 'awaiting-ack' and dispatches the
 *     mutation. Mutation onSettle handler (in App.tsx) clears the
 *     preview and resets mode to idle.
 *   - Escape → abort, clear preview, return to idle, no commit.
 *
 * Bounds check: deferred to S13.8 parity sweep. Client-side
 * `@turf/boolean-point-in-polygon` on `usable_polygon` is an easy win
 * when we add it; sidecar doesn't currently validate.
 */
import type maplibregl from "maplibre-gl"
import type { FeatureCollection } from "geojson"
import type { StoreApi } from "zustand"
import type { LngLat } from "../coords"
import { ringCentroid } from "../coords"
import { makeProbe } from "../debug"
import { clearDrawPreview, setDrawPreview } from "../preview"
import type { useEditingStateStore } from "../../state/editingState"

type EditingStore = ReturnType<typeof useEditingStateStore.getState>

const log = makeProbe("drag")

export interface IcrDragCommit {
  boundaryName: string
  icrIndex: number
  newCenter: LngLat
}

export interface IcrDragContext {
  map: maplibregl.Map
  store: StoreApi<EditingStore>
  onCommit: (commit: IcrDragCommit) => void
}

const ICR_LAYER_ID = "icrs-fill"

export function attachIcrDrag(ctx: IcrDragContext): () => void {
  const { map, store } = ctx
  const canvas = map.getCanvas()

  let session: {
    boundaryName: string
    icrIndex: number
    originalRing: LngLat[]
    originalCenter: LngLat
    clickPoint: LngLat
  } | null = null

  const onMouseDown = (e: maplibregl.MapMouseEvent) => {
    if (session) return
    const hits = map.queryRenderedFeatures(e.point, {
      layers: [ICR_LAYER_ID],
    })
    if (hits.length === 0) {
      log("event", "mousedown miss", { lngLat: [e.lngLat.lng, e.lngLat.lat] })
      return
    }
    const feat = hits[0]!
    const props = feat.properties ?? {}
    const boundaryName = String(props.boundary ?? "")
    const icrIndex = Number(props.index ?? -1)
    if (icrIndex < 0) {
      log.error("icr hit had no valid index", { props })
      return
    }
    if (feat.geometry.type !== "Polygon") {
      log.error("icr hit was not a Polygon", { geomType: feat.geometry.type })
      return
    }
    const ring: LngLat[] = (feat.geometry.coordinates[0] ?? []).map(
      (p) => [p[0]!, p[1]!] as LngLat
    )
    if (ring.length < 4) {
      log.error("icr ring too short", { len: ring.length })
      return
    }
    const originalCenter = ringCentroid(ring)
    const clickPoint: LngLat = [e.lngLat.lng, e.lngLat.lat]
    session = {
      boundaryName,
      icrIndex,
      originalRing: ring,
      originalCenter,
      clickPoint,
    }
    store.getState().setSelectedIcrIndex(icrIndex)
    log("event", "mousedown hit", {
      boundaryName,
      icrIndex,
      clickPoint,
      originalCenter,
    })
    map.dragPan.disable()
    canvas.style.cursor = "grabbing"
    e.preventDefault()
  }

  const onMouseMove = (e: maplibregl.MapMouseEvent) => {
    if (!session) return
    const dx = e.lngLat.lng - session.clickPoint[0]
    const dy = e.lngLat.lat - session.clickPoint[1]
    const translated: [number, number][] = session.originalRing.map(
      ([lng, lat]) => [lng + dx, lat + dy]
    )
    const previewFc: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [translated] },
          properties: {},
        },
      ],
    }
    const verticesFc: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [
              session.originalCenter[0] + dx,
              session.originalCenter[1] + dy,
            ],
          },
          properties: {},
        },
      ],
    }
    setDrawPreview(map, previewFc, verticesFc)
  }

  const onMouseUp = (e: maplibregl.MapMouseEvent) => {
    if (!session) return
    const dx = e.lngLat.lng - session.clickPoint[0]
    const dy = e.lngLat.lat - session.clickPoint[1]
    const newCenter: LngLat = [
      session.originalCenter[0] + dx,
      session.originalCenter[1] + dy,
    ]
    log("mode", "commit", {
      boundaryName: session.boundaryName,
      icrIndex: session.icrIndex,
      originalCenter: session.originalCenter,
      newCenter,
      deltaDegrees: [dx, dy],
    })
    // IMPORTANT: do NOT clearDrawPreview here. Preview stays visible
    // until sidecar ack per S11 UX spec. Caller (App.tsx) transitions
    // mode to 'awaiting-ack' and fires the mutation; mutation's
    // onSettle handler clears the preview + resets mode.
    try {
      ctx.onCommit({
        boundaryName: session.boundaryName,
        icrIndex: session.icrIndex,
        newCenter,
      })
    } catch (err) {
      log.error("onCommit threw", { err: String(err) })
      // Caller didn't transition to awaiting-ack; clear preview as
      // fallback so the user isn't left with orphaned dashed geometry.
      clearDrawPreview(map)
    }
    session = null
    map.dragPan.enable()
    canvas.style.cursor = ""
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!session) return
    if (e.key !== "Escape") return
    log("mode", "abort (Escape)")
    session = null
    map.dragPan.enable()
    canvas.style.cursor = ""
    clearDrawPreview(map)
    store.getState().setSelectedIcrIndex(null)
    store.getState().setMode("idle")
  }

  const onMouseEnterIcr = () => {
    if (!session) canvas.style.cursor = "grab"
  }
  const onMouseLeaveIcr = () => {
    if (!session) canvas.style.cursor = ""
  }

  log("lifecycle", "attach")
  map.on("mousedown", onMouseDown)
  map.on("mousemove", onMouseMove)
  map.on("mouseup", onMouseUp)
  map.on("mouseenter", ICR_LAYER_ID, onMouseEnterIcr)
  map.on("mouseleave", ICR_LAYER_ID, onMouseLeaveIcr)
  document.addEventListener("keydown", onKeyDown)

  return () => {
    log("lifecycle", "detach")
    map.off("mousedown", onMouseDown)
    map.off("mousemove", onMouseMove)
    map.off("mouseup", onMouseUp)
    map.off("mouseenter", ICR_LAYER_ID, onMouseEnterIcr)
    map.off("mouseleave", ICR_LAYER_ID, onMouseLeaveIcr)
    document.removeEventListener("keydown", onKeyDown)
    map.dragPan.enable()
    canvas.style.cursor = ""
    if (session) {
      session = null
      store.getState().setSelectedIcrIndex(null)
    }
    // Detach might happen mid-drag (e.g. mode switch or theme swap).
    // Clear preview so the dashed ghost doesn't persist.
    clearDrawPreview(map)
  }
}
