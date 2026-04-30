import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react"
import type { FeatureCollection, Geometry } from "geojson"
import { useTheme } from "./ThemeProvider"
import { cn } from "../lib/cn"

/**
 * MapCanvas — MapLibre GL instance hosting the KMZ overlay.
 *
 * No basemap tiles per ADR 0002 (`docs/adr/0002-no-basemap.md`). The
 * style files (`public/map-styles/pv-{light,dark}.json`) only define
 * the canvas background colour and the overlay layers (boundary fill +
 * outline, obstacle fill + outline, line-obstruction dashed stroke).
 *
 * Data is prop-driven:
 *   - `boundariesGeoJson` / `obstaclesGeoJson` / `lineObstructionsGeoJson`
 *     flow into the corresponding MapLibre sources by ID.
 *   - When `boundariesGeoJson` changes to a non-empty collection, the
 *     map animates a `fitBounds` to centre the site. Re-fits skip when
 *     the bounds haven't actually changed (prevents viewport jitter on
 *     prop-identity churn).
 *
 * Theme swap: `useTheme()` drives a `map.setStyle()` to flip between
 * light and dark JSON. Sources are re-hydrated after the new style
 * loads; the viewport is preserved.
 *
 * `children` render as absolute-positioned overlays above the MapLibre
 * canvas (used by App.tsx for the CommandBarHint and EmptyStateCard).
 */

export interface IcrLabel {
  /** WGS84 (lon, lat) anchor point — usually the ICR's centroid. */
  position: [number, number]
  /** Visible label text (e.g. "ICR-0"). */
  text: string
}

export interface MapCanvasProps {
  boundariesGeoJson?: FeatureCollection
  obstaclesGeoJson?: FeatureCollection
  lineObstructionsGeoJson?: FeatureCollection
  /** Placed-table polygons (added in S9). */
  tablesGeoJson?: FeatureCollection
  /** Placed-ICR polygons (added in S9). */
  icrsGeoJson?: FeatureCollection
  /** ICR labels — rendered as HTML overlays repositioned on map move. */
  icrLabels?: IcrLabel[]
  /** Placed-string-inverter polygons (added in S10). */
  stringInvertersGeoJson?: FeatureCollection
  /** DC cable LineStrings (added in S10). */
  dcCablesGeoJson?: FeatureCollection
  /** AC cable LineStrings (added in S10). Visibility gated by `showAcCables`. */
  acCablesGeoJson?: FeatureCollection
  /** LA rect polygons (added in S10). Visibility gated by `showLas`. */
  lasGeoJson?: FeatureCollection
  /** LA protection-circle polygons (added in S10). Visibility gated by `showLas`. */
  laCirclesGeoJson?: FeatureCollection
  /** Toggle AC cable layer visibility (S10). Default: false. */
  showAcCables?: boolean
  /** Toggle LA rects + protection circles visibility (S10). Default: false. */
  showLas?: boolean
  children?: ReactNode
  className?: string
  /** Expose the map instance after the first `load` event. */
  onMapReady?: (map: maplibregl.Map) => void
}

const STYLE_LIGHT_URL = "/map-styles/pv-light.json"
const STYLE_DARK_URL = "/map-styles/pv-dark.json"

const EMPTY_FC: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
}

export function MapCanvas({
  boundariesGeoJson,
  obstaclesGeoJson,
  lineObstructionsGeoJson,
  tablesGeoJson,
  icrsGeoJson,
  icrLabels,
  stringInvertersGeoJson,
  dcCablesGeoJson,
  acCablesGeoJson,
  lasGeoJson,
  laCirclesGeoJson,
  showAcCables = false,
  showLas = false,
  children,
  className,
  onMapReady,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const lastBoundariesKey = useRef<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Refs track the latest props so the map's `load` / `styledata`
  // listeners pull fresh data instead of whatever was captured in the
  // closure at init time. Critical for the fast path where the user
  // opens a KMZ before MapLibre finishes its first style load — without
  // this, the map loads with `undefined` overlays and never re-hydrates
  // because the data-update effect bails on `!mapReady`.
  const propsRef = useRef({
    boundariesGeoJson,
    obstaclesGeoJson,
    lineObstructionsGeoJson,
    tablesGeoJson,
    icrsGeoJson,
    stringInvertersGeoJson,
    dcCablesGeoJson,
    acCablesGeoJson,
    lasGeoJson,
    laCirclesGeoJson,
  })
  propsRef.current = {
    boundariesGeoJson,
    obstaclesGeoJson,
    lineObstructionsGeoJson,
    tablesGeoJson,
    icrsGeoJson,
    stringInvertersGeoJson,
    dcCablesGeoJson,
    acCablesGeoJson,
    lasGeoJson,
    laCirclesGeoJson,
  }

  // Visibility refs — read by the load / styledata handlers so initial
  // paint respects the current toggle state (prevents flash-of-visible
  // before the visibility effect fires).
  const visibilityRef = useRef({ showAcCables, showLas })
  visibilityRef.current = { showAcCables, showLas }

  const { resolved } = useTheme()
  const styleUrl = resolved === "dark" ? STYLE_DARK_URL : STYLE_LIGHT_URL

  // ── Init (once) ──────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = new maplibregl.Map({
      container,
      style: styleUrl,
      center: [0, 0],
      zoom: 1,
      renderWorldCopies: false,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    })

    mapRef.current = map

    // Scale bar — bottom-left. Metric by convention; PVlayout_Advance
    // and site engineers spec plant dimensions in metres.
    map.addControl(
      new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }),
      "bottom-left"
    )

    map.on("load", () => {
      hydrateSources(map, propsRef.current)
      applyVisibility(map, visibilityRef.current)
      fitToBoundariesIfNew(map, propsRef.current.boundariesGeoJson, lastBoundariesKey)
      setMapReady(true)
      onMapReady?.(map)
    })

    // S1-09 — ResizeObserver-driven refit. When the canvas container
    // changes size meaningfully (e.g. the Inspector animates in/out from
    // 0 to 320px on project open via S1-04's gate, or window resize, or
    // ToolRail toggle), MapLibre's previously-fit zoom is now wrong for
    // the new container width. Without this observer, fitBounds runs at
    // the moment `boundariesGeoJson` populates — but mid-Framer-Motion-
    // animation the container hasn't reached its final width, so the
    // computed zoom over-zooms once the inspector finishes settling.
    //
    // Threshold: 50px on either axis. Smaller deltas are noise; we
    // don't want to refit on every micro-pixel reflow.
    //
    // animate: false on the resize-driven refit — snapping is the right
    // feel during a layout reflow; an additional 600ms ease would fight
    // the inspector animation rather than complement it.
    let lastWidth = container.clientWidth
    let lastHeight = container.clientHeight
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (
        Math.abs(width - lastWidth) < 50 &&
        Math.abs(height - lastHeight) < 50
      ) {
        return
      }
      lastWidth = width
      lastHeight = height
      map.resize()
      const bounds = propsRef.current.boundariesGeoJson
        ? computeBounds(propsRef.current.boundariesGeoJson)
        : null
      if (bounds) {
        map.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          {
            padding: 60,
            animate: false,
            maxZoom: 18,
          }
        )
      }
    })
    ro.observe(container)

    return () => {
      setMapReady(false)
      mapRef.current = null
      ro.disconnect()
      map.remove()
    }
    // init-only — deps intentionally omitted. Theme / data effects below
    // pick up subsequent changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Theme swap ───────────────────────────────────────────────────────
  // Skip when styleUrl matches what we last applied. Initialised to the
  // first-render styleUrl so the very first effect run (which races with
  // the init effect's `style: styleUrl`) is a safe no-op. On every later
  // run, we compare against the LAST APPLIED url — not the initial — so
  // returning to a previously-used style still triggers `setStyle`.
  // (Tracking "initial only" was a real bug: dark→light→dark would stick
  // on light forever for any user whose OS started in dark mode.)
  const lastAppliedStyleUrl = useRef(styleUrl)
  useEffect(() => {
    if (styleUrl === lastAppliedStyleUrl.current) return
    const map = mapRef.current
    if (!map) return
    map.setStyle(styleUrl)
    lastAppliedStyleUrl.current = styleUrl
    const onStyle = () => {
      hydrateSources(map, propsRef.current)
      applyVisibility(map, visibilityRef.current)
      // Viewport is preserved — don't re-fit on theme swap.
      map.off("styledata", onStyle)
    }
    map.on("styledata", onStyle)
  }, [styleUrl])

  // ── Data updates ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return // load handler will hydrate from propsRef
    const map = mapRef.current
    if (!map) return
    hydrateSources(map, {
      boundariesGeoJson,
      obstaclesGeoJson,
      lineObstructionsGeoJson,
      tablesGeoJson,
      icrsGeoJson,
      stringInvertersGeoJson,
      dcCablesGeoJson,
      acCablesGeoJson,
      lasGeoJson,
      laCirclesGeoJson,
    })
    fitToBoundariesIfNew(map, boundariesGeoJson, lastBoundariesKey)
  }, [
    mapReady,
    boundariesGeoJson,
    obstaclesGeoJson,
    lineObstructionsGeoJson,
    tablesGeoJson,
    icrsGeoJson,
    stringInvertersGeoJson,
    dcCablesGeoJson,
    acCablesGeoJson,
    lasGeoJson,
    laCirclesGeoJson,
  ])

  // ── Visibility toggles (S10) ─────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    applyVisibility(map, { showAcCables, showLas })
  }, [mapReady, showAcCables, showLas])

  return (
    <div className={cn("relative w-full h-full overflow-hidden", className)}>
      {/* Intentional `w-full h-full` (not `absolute inset-0`).
       * MapLibre adds the `.maplibregl-map` class to this div on init,
       * which sets `position: relative`. That class lives outside any
       * @layer, so per the CSS Cascade Layers spec it beats Tailwind's
       * layered `.absolute { position: absolute }`. The result was a
       * `position: relative` element with `inset: 0` as a no-op,
       * collapsing the container to its content (the absolute-positioned
       * canvas) and leaving MapLibre measuring a 1068×300 letterbox
       * instead of the full 1068×828 main slot. Sizing via the layered
       * `w-full h-full` utilities sidesteps the cascade — MapLibre's
       * `position: relative` is fine when the box has an explicit size. */}
      <div ref={containerRef} className="w-full h-full" />
      <IcrLabelOverlay map={mapRef} mapReady={mapReady} labels={icrLabels} />
      {children}
    </div>
  )
}

/**
 * IcrLabelOverlay — renders text labels for each ICR as absolutely-
 * positioned divs anchored to WGS84 lon/lat via `map.project()`. Updated
 * on every `move` event so labels track during pan/zoom. Pragmatic for
 * the small N (1-5 ICRs per typical plant); deck.gl TextLayer would be
 * the right answer if N grew significantly.
 *
 * No glyph stack required — sidesteps the MapLibre glyphs/sprite setup
 * we don't have (and don't want to bundle ~5MB of fonts for).
 */
function IcrLabelOverlay({
  map,
  mapReady,
  labels,
}: {
  map: MutableRefObject<maplibregl.Map | null>
  mapReady: boolean
  labels?: IcrLabel[]
}) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!mapReady || !labels || labels.length === 0) return
    const m = map.current
    if (!m) return
    const onMove = () => setTick((t) => t + 1)
    m.on("move", onMove)
    m.on("zoom", onMove)
    // Initial position now that mapReady is true.
    setTick((t) => t + 1)
    return () => {
      m.off("move", onMove)
      m.off("zoom", onMove)
    }
  }, [map, mapReady, labels])

  if (!mapReady || !labels || labels.length === 0) return null
  const m = map.current
  if (!m) return null

  return (
    <div
      // tick is in the dependency that re-renders this layer; suppress
      // the unused-expression lint with a void.
      data-tick={tick}
      className="pointer-events-none absolute inset-0"
    >
      {labels.map((label, i) => {
        const point = m.project(label.position)
        return (
          <span
            key={`${label.text}-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 px-[6px] py-[2px] rounded-[var(--radius-sm)] bg-[var(--surface-panel)] border border-[var(--border-subtle)] shadow-[var(--shadow-xs)] text-[10px] font-medium text-[var(--text-primary)] tabular-nums whitespace-nowrap"
            style={{ left: point.x, top: point.y }}
          >
            {label.text}
          </span>
        )
      })}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────

interface SourceData {
  boundariesGeoJson?: FeatureCollection
  obstaclesGeoJson?: FeatureCollection
  lineObstructionsGeoJson?: FeatureCollection
  tablesGeoJson?: FeatureCollection
  icrsGeoJson?: FeatureCollection
  stringInvertersGeoJson?: FeatureCollection
  dcCablesGeoJson?: FeatureCollection
  acCablesGeoJson?: FeatureCollection
  lasGeoJson?: FeatureCollection
  laCirclesGeoJson?: FeatureCollection
}

function hydrateSources(map: maplibregl.Map, data: SourceData) {
  setSource(map, "kmz-boundaries", data.boundariesGeoJson)
  setSource(map, "kmz-obstacles", data.obstaclesGeoJson)
  setSource(map, "kmz-line-obstructions", data.lineObstructionsGeoJson)
  setSource(map, "kmz-tables", data.tablesGeoJson)
  setSource(map, "kmz-icrs", data.icrsGeoJson)
  setSource(map, "kmz-string-inverters", data.stringInvertersGeoJson)
  setSource(map, "kmz-dc-cables", data.dcCablesGeoJson)
  setSource(map, "kmz-ac-cables", data.acCablesGeoJson)
  setSource(map, "kmz-las", data.lasGeoJson)
  setSource(map, "kmz-la-circles", data.laCirclesGeoJson)
}

/**
 * Set layer-group visibility for the S10 toggles.
 *
 * AC cables:   `ac-cables`
 * LAs:         `la-rects-fill` + `la-rects-outline` +
 *              `la-circles-fill` + `la-circles-outline`
 *
 * Called from (a) the `load` handler (initial paint), (b) the
 * `styledata` handler after a theme swap, and (c) the visibility
 * effect on toggle change. Idempotent — setLayoutProperty is a no-op
 * when the value matches.
 */
interface VisibilityState {
  showAcCables: boolean
  showLas: boolean
}

const AC_CABLE_LAYERS = ["ac-cables"] as const
const LA_LAYERS = [
  "la-rects-fill",
  "la-rects-outline",
  "la-circles-fill",
  "la-circles-outline",
] as const

function applyVisibility(map: maplibregl.Map, v: VisibilityState) {
  const acVis = v.showAcCables ? "visible" : "none"
  for (const id of AC_CABLE_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", acVis)
  }
  const laVis = v.showLas ? "visible" : "none"
  for (const id of LA_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", laVis)
  }
}

function setSource(
  map: maplibregl.Map,
  id: string,
  data: FeatureCollection | undefined
) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  if (!src) return
  src.setData(data ?? EMPTY_FC)
}

/**
 * Compute the bounding box of a FeatureCollection and fit the map to it
 * — but only when the bounds are actually new. Prevents re-fitting on
 * every prop-identity change (e.g. when App.tsx re-renders but the data
 * hasn't semantically moved).
 */
function fitToBoundariesIfNew(
  map: maplibregl.Map,
  boundaries: FeatureCollection | undefined,
  lastKey: MutableRefObject<string | null>
) {
  if (!boundaries || boundaries.features.length === 0) return
  const bounds = computeBounds(boundaries)
  if (!bounds) return

  const key = `${bounds[0]},${bounds[1]},${bounds[2]},${bounds[3]}`
  if (lastKey.current === key) return
  lastKey.current = key

  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    {
      padding: 60,
      animate: true,
      duration: 600,
      maxZoom: 18,
    }
  )
}

/** Returns [minLon, minLat, maxLon, maxLat] or null if the input is empty. */
function computeBounds(
  fc: FeatureCollection
): [number, number, number, number] | null {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity

  for (const feat of fc.features) {
    walkGeometry(feat.geometry, (lon, lat) => {
      if (lon < minLon) minLon = lon
      if (lat < minLat) minLat = lat
      if (lon > maxLon) maxLon = lon
      if (lat > maxLat) maxLat = lat
    })
  }

  if (!isFinite(minLon)) return null
  return [minLon, minLat, maxLon, maxLat]
}

function walkGeometry(
  geom: Geometry,
  visit: (lon: number, lat: number) => void
) {
  switch (geom.type) {
    case "Point":
      visit(geom.coordinates[0]!, geom.coordinates[1]!)
      return
    case "MultiPoint":
    case "LineString":
      for (const p of geom.coordinates) visit(p[0]!, p[1]!)
      return
    case "MultiLineString":
    case "Polygon":
      for (const line of geom.coordinates) {
        for (const p of line) visit(p[0]!, p[1]!)
      }
      return
    case "MultiPolygon":
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          for (const p of ring) visit(p[0]!, p[1]!)
        }
      }
      return
    case "GeometryCollection":
      for (const g of geom.geometries) walkGeometry(g, visit)
      return
  }
}

// ── CommandBarHint — kept here for proximity; unchanged from S6 ────────

export function CommandBarHint({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-[16px] left-[16px] inline-flex items-center gap-[8px] h-[28px] pl-[10px] pr-[6px] rounded-[var(--radius-md)] bg-[var(--surface-panel)] border border-[var(--border-subtle)] shadow-[var(--shadow-xs)] text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors duration-[120ms]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-[13px] h-[13px]"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      Press
      <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[var(--text-secondary)] font-mono text-[11px] leading-none">
        ⌘K
      </kbd>
      for commands
    </button>
  )
}
