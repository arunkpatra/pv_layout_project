/**
 * ParsedKMZ → three MapLibre-ready GeoJSON FeatureCollections.
 *
 * Pure transform: the sidecar returns WGS84 coordinate arrays per its
 * schema; MapLibre wants a standard GeoJSON FeatureCollection per source.
 * One FC per source ID so that `MapCanvas` can push each via
 * `source.setData()` without further parsing.
 *
 * Convention: boundary and obstacle polygons are single-ring; we do not
 * emit holes. Line obstructions are LineStrings. Feature properties
 * carry the boundary name so hover/click surfaces in S11 can label.
 */
import type {
  Feature,
  FeatureCollection,
  LineString,
  Polygon,
} from "geojson"
import type { ParsedKMZ, Wgs84Point } from "@solarlayout/sidecar-client"

export interface ProjectGeoJson {
  boundaries: FeatureCollection<Polygon>
  obstacles: FeatureCollection<Polygon>
  lineObstructions: FeatureCollection<LineString>
}

export function kmzToGeoJson(parsed: ParsedKMZ): ProjectGeoJson {
  const boundaries: Feature<Polygon>[] = []
  const obstacles: Feature<Polygon>[] = []
  const lineObstructions: Feature<LineString>[] = []

  for (const b of parsed.boundaries) {
    const ring = closeRing(b.coords)
    if (ring.length >= 4) {
      boundaries.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: { boundary: b.name },
      })
    }

    for (let i = 0; i < b.obstacles.length; i++) {
      const ob = b.obstacles[i]
      if (!ob) continue
      const closed = closeRing(ob)
      if (closed.length < 4) continue
      obstacles.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [closed] },
        properties: { boundary: b.name, index: i },
      })
    }

    for (let i = 0; i < b.line_obstructions.length; i++) {
      const line = b.line_obstructions[i]
      if (!line || line.length < 2) continue
      lineObstructions.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: line as Wgs84Point[] },
        properties: { boundary: b.name, index: i },
      })
    }
  }

  return {
    boundaries: { type: "FeatureCollection", features: boundaries },
    obstacles: { type: "FeatureCollection", features: obstacles },
    lineObstructions: { type: "FeatureCollection", features: lineObstructions },
  }
}

/**
 * GeoJSON polygons must be closed — last coordinate must equal the first.
 * The sidecar emits open rings; close them defensively so MapLibre
 * doesn't silently drop the last edge.
 */
function closeRing(coords: Wgs84Point[]): Wgs84Point[] {
  if (coords.length < 3) return []
  const first = coords[0]!
  const last = coords[coords.length - 1]!
  if (first[0] === last[0] && first[1] === last[1]) return coords
  return [...coords, first]
}

/**
 * Aggregate counts for status-bar display.
 *
 *   boundaries: distinct plant boundaries.
 *   obstacles:  obstacle polygons across all boundaries.
 *   lines:      line obstructions (TL corridors, canals, roads) across all.
 */
export function countKmzFeatures(parsed: ParsedKMZ): {
  boundaries: number
  obstacles: number
  lines: number
} {
  let obstacles = 0
  let lines = 0
  for (const b of parsed.boundaries) {
    obstacles += b.obstacles.length
    lines += b.line_obstructions.length
  }
  return {
    boundaries: parsed.boundaries.length,
    obstacles,
    lines,
  }
}
