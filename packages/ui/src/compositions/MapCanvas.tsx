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

export interface MapCanvasProps {
  boundariesGeoJson?: FeatureCollection
  obstaclesGeoJson?: FeatureCollection
  lineObstructionsGeoJson?: FeatureCollection
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
  })
  propsRef.current = {
    boundariesGeoJson,
    obstaclesGeoJson,
    lineObstructionsGeoJson,
  }

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
      const { boundariesGeoJson: b, obstaclesGeoJson: o, lineObstructionsGeoJson: l } =
        propsRef.current
      hydrateSources(map, b, o, l)
      fitToBoundariesIfNew(map, b, lastBoundariesKey)
      setMapReady(true)
      onMapReady?.(map)
    })

    return () => {
      setMapReady(false)
      mapRef.current = null
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
      const { boundariesGeoJson: b, obstaclesGeoJson: o, lineObstructionsGeoJson: l } =
        propsRef.current
      hydrateSources(map, b, o, l)
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
    hydrateSources(
      map,
      boundariesGeoJson,
      obstaclesGeoJson,
      lineObstructionsGeoJson
    )
    fitToBoundariesIfNew(map, boundariesGeoJson, lastBoundariesKey)
  }, [mapReady, boundariesGeoJson, obstaclesGeoJson, lineObstructionsGeoJson])

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
      {children}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────

function hydrateSources(
  map: maplibregl.Map,
  boundaries?: FeatureCollection,
  obstacles?: FeatureCollection,
  lines?: FeatureCollection
) {
  setSource(map, "kmz-boundaries", boundaries)
  setSource(map, "kmz-obstacles", obstacles)
  setSource(map, "kmz-line-obstructions", lines)
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
