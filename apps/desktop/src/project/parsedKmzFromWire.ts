/**
 * Convert the wire `ParsedKmz` (from entitlements-client; populated by
 * the parse-kmz Lambda at C4) to the canvas-render shape today's
 * desktop code expects (the same shape the sidecar's `/parse-kmz`
 * previously returned via `@solarlayout/sidecar-client`).
 *
 * Why this helper exists:
 *   - Type safety at the runtime boundary (entitlements-client wire
 *     shape ↔ desktop's canvas-render shape).
 *   - A single conversion site that future schema changes flow
 *     through. When the canvas code is migrated to consume the wire
 *     shape directly (Task 8 + downstream), this helper becomes the
 *     last hop to delete.
 *
 * Wire vs render divergence (2026-05-03):
 *   The sidecar's `ParsedKMZ` (from `@solarlayout/sidecar-client`) does
 *   NOT carry `water_obstacles` per boundary; the wire shape does (the
 *   Lambda's `_parsed_to_wire` output is the richer of the two). To
 *   avoid lossy conversion at the single source-of-truth helper, we
 *   widen the return type with a `water_obstacles: Wgs84Point[][]`
 *   field on each boundary. Today's canvas code that types `ParsedKMZ`
 *   ignores the extra field at the type level (structural subtyping);
 *   downstream consumers that want the water layer can read it.
 */
import type { ParsedKmz as WireParsedKmz } from "@solarlayout/entitlements-client"
import type {
  ParsedKMZ as RenderParsedKmz,
  ParsedBoundary as RenderParsedBoundary,
  Wgs84Point,
} from "@solarlayout/sidecar-client"

export interface ParsedKmzBoundaryWithWater extends RenderParsedBoundary {
  water_obstacles: Wgs84Point[][]
}

export interface ParsedKmzWithWater extends RenderParsedKmz {
  boundaries: ParsedKmzBoundaryWithWater[]
}

export function parsedKmzFromWire(
  wire: WireParsedKmz
): ParsedKmzWithWater {
  return {
    boundaries: wire.boundaries.map((b) => ({
      name: b.name,
      coords: b.coords.map(([lon, lat]) => [lon, lat] as Wgs84Point),
      obstacles: b.obstacles.map((obs) =>
        obs.map(([lon, lat]) => [lon, lat] as Wgs84Point)
      ),
      water_obstacles: b.water_obstacles.map((wo) =>
        wo.map(([lon, lat]) => [lon, lat] as Wgs84Point)
      ),
      line_obstructions: b.line_obstructions.map((line) =>
        line.map(([lon, lat]) => [lon, lat] as Wgs84Point)
      ),
    })),
    centroid_lat: wire.centroid_lat,
    centroid_lon: wire.centroid_lon,
  }
}
