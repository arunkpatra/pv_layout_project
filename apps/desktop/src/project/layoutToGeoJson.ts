/**
 * LayoutResult[] → MapLibre-ready GeoJSON FeatureCollections + ICR labels.
 *
 * Mirror of `kmzToGeoJson` but for the /layout response. Sidecar emits
 * `placed_tables_wgs84` and `placed_icrs_wgs84` as pre-projected closed
 * 5-tuple corner rings (S9), so this is a structural transform — no
 * projection arithmetic on the client.
 */
import type {
  Feature,
  FeatureCollection,
  Polygon,
} from "geojson"
import type { IcrLabel } from "@solarlayout/ui"
import type { LayoutResult } from "@solarlayout/sidecar-client"

export interface LayoutGeoJson {
  tables: FeatureCollection<Polygon>
  icrs: FeatureCollection<Polygon>
  icrLabels: IcrLabel[]
}

export function layoutToGeoJson(results: LayoutResult[]): LayoutGeoJson {
  const tableFeatures: Feature<Polygon>[] = []
  const icrFeatures: Feature<Polygon>[] = []
  const icrLabels: IcrLabel[] = []

  for (const r of results) {
    for (let i = 0; i < r.placed_tables_wgs84.length; i++) {
      const ring = r.placed_tables_wgs84[i]
      const placed = r.placed_tables[i]
      if (!ring || !placed) continue
      tableFeatures.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          boundary: r.boundary_name,
          row: placed.row_index,
          col: placed.col_index,
        },
      })
    }

    for (let i = 0; i < r.placed_icrs_wgs84.length; i++) {
      const ring = r.placed_icrs_wgs84[i]
      const placed = r.placed_icrs[i]
      if (!ring || !placed) continue
      icrFeatures.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          boundary: r.boundary_name,
          index: placed.index,
        },
      })
      icrLabels.push({
        position: ringCentroid(ring),
        text: `ICR-${placed.index}`,
      })
    }
  }

  return {
    tables: { type: "FeatureCollection", features: tableFeatures },
    icrs: { type: "FeatureCollection", features: icrFeatures },
    icrLabels,
  }
}

/**
 * Mean (lon, lat) of a closed ring's first 4 corners. Skips the closing
 * point so it isn't double-counted. Adequate for label anchoring; not a
 * geodesic centroid.
 */
function ringCentroid(ring: [number, number][]): [number, number] {
  // Closed ring is [TL, TR, BR, BL, TL] — 5 points; average the first 4.
  const corners = ring.slice(0, 4)
  let lon = 0
  let lat = 0
  for (const p of corners) {
    lon += p[0]
    lat += p[1]
  }
  return [lon / corners.length, lat / corners.length]
}
