/**
 * Convert a parsed KMZ's boundaries into a `BoundaryGeojson` payload
 * for B11 createProject (SP6 / B26).
 *
 * Single-boundary KMZ → `Polygon` (one outer ring, no holes).
 * Multi-boundary KMZ → `MultiPolygon` (one polygon per boundary).
 *
 * Each ring is closed (first point repeated as last) per the GeoJSON
 * spec. KMZ parsers typically already include the closing point; we
 * close defensively to keep backend Zod validation happy regardless
 * of parser quirks.
 *
 * Returns `undefined` when the parsed KMZ has no usable boundaries
 * (defensive — `sidecar.parseKmz` should reject in that case, but we
 * don't want to send `{type: "Polygon", coordinates: [[]]}` to backend
 * either way).
 */
import type {
  BoundaryGeojson,
  BoundaryGeojsonMultiPolygon,
} from "@solarlayout/entitlements-client"
import type { ParsedKMZ, Wgs84Point } from "@solarlayout/sidecar-client"

export function boundaryGeojsonFromParsed(
  parsed: ParsedKMZ
): BoundaryGeojson | undefined {
  const boundaries = parsed.boundaries.filter((b) => b.coords.length >= 3)
  if (boundaries.length === 0) return undefined

  // One polygon per boundary, each polygon = one closed outer ring (no
  // holes — KMZ obstacles are separate features rendered atop, not
  // polygon holes).
  const polygons: BoundaryGeojsonMultiPolygon["coordinates"] =
    boundaries.map((b) => [closeRing(b.coords)])

  if (polygons.length === 1) {
    return { type: "Polygon", coordinates: polygons[0]! }
  }
  return { type: "MultiPolygon", coordinates: polygons }
}

function closeRing(coords: Wgs84Point[]): Wgs84Point[] {
  if (coords.length === 0) return coords
  const first = coords[0]!
  const last = coords[coords.length - 1]!
  if (first[0] === last[0] && first[1] === last[1]) return coords
  return [...coords, first]
}
