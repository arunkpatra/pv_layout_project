/**
 * Coordinate helpers for the S11 interaction layer.
 *
 * Design policy (ADR-0006): client is WGS84-native. Distance comparisons
 * that matter for UX use Haversine metres so behavior is identical at
 * every zoom and every latitude — PVlayout_Advance's component-wise UTM
 * check was a convenience of matplotlib's UTM-native axes, not a design
 * choice we need to inherit.
 */

export type LngLat = readonly [number, number]

const EARTH_RADIUS_M = 6371008.8

const toRad = (deg: number) => (deg * Math.PI) / 180

/**
 * Great-circle distance in metres between two WGS84 points.
 *
 * Use this for close-polygon tolerance, drag threshold checks, anywhere
 * the spec says "within N metres". Component-wise degree checks are
 * forbidden by policy — they misbehave near poles and at high latitudes.
 */
export function haversineMetres(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLng * sinDLng
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)))
}

/**
 * Returns the closed 5-point ring (WGS84) for an axis-aligned rectangle
 * whose opposite corners are at `anchor` and `cursor`. Normalises so the
 * ring is always valid (min/max by both axes) regardless of which way
 * the user dragged. The 5th point is the first, closing the ring.
 *
 * "Axis-aligned" means aligned to WGS84 degree axes — at the small scales
 * we care about (< 1 km), the rectangle that appears on screen is
 * visually axis-aligned to MapLibre's rendered canvas.
 */
export function rectRingFromCorners(
  anchor: LngLat,
  cursor: LngLat
): LngLat[] {
  const [ax, ay] = anchor
  const [cx, cy] = cursor
  const minLng = Math.min(ax, cx)
  const maxLng = Math.max(ax, cx)
  const minLat = Math.min(ay, cy)
  const maxLat = Math.max(ay, cy)
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ]
}

/**
 * Centroid of an axis-aligned WGS84 ring — simple arithmetic mean of
 * the 4 distinct corners. Exact for axis-aligned rectangles (which is
 * what placed_icrs_wgs84 rings always are); close enough for any other
 * quad we'd hit at plant scale.
 */
export function ringCentroid(ring: LngLat[]): LngLat {
  const pts = ring.length >= 5 ? ring.slice(0, -1) : ring
  let sumLng = 0
  let sumLat = 0
  for (const [lng, lat] of pts) {
    sumLng += lng
    sumLat += lat
  }
  const n = pts.length || 1
  return [sumLng / n, sumLat / n]
}
