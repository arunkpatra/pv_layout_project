/**
 * LayoutResult[] → MapLibre-ready GeoJSON FeatureCollections + ICR labels.
 *
 * Mirror of `kmzToGeoJson` but for the /layout response. Sidecar emits
 * pre-projected WGS84 rings / polylines so this is a structural
 * transform — no projection arithmetic on the client.
 *
 * Layers:
 *   - tables          Polygon   — placed_tables_wgs84     (S9)
 *   - icrs            Polygon   — placed_icrs_wgs84       (S9)
 *   - icrLabels       HTML      — anchored from ring centroids (S9)
 *   - stringInverters Polygon   — placed_string_inverters_wgs84 (S10)
 *   - dcCables        LineString — dc_cable_runs_wgs84    (S10)
 *   - acCables        LineString — ac_cable_runs_wgs84    (S10)
 *   - las             Polygon   — placed_las_wgs84        (S10)
 *   - laCircles       Polygon   — placed_las_circles_wgs84 (S10)
 */
import type {
  Feature,
  FeatureCollection,
  LineString,
  Polygon,
} from "geojson"
import type { IcrLabel } from "@solarlayout/ui"
import type { LayoutResult } from "@solarlayout/sidecar-client"

export interface LayoutGeoJson {
  tables: FeatureCollection<Polygon>
  icrs: FeatureCollection<Polygon>
  icrLabels: IcrLabel[]
  stringInverters: FeatureCollection<Polygon>
  dcCables: FeatureCollection<LineString>
  acCables: FeatureCollection<LineString>
  las: FeatureCollection<Polygon>
  laCircles: FeatureCollection<Polygon>
}

export function layoutToGeoJson(results: LayoutResult[]): LayoutGeoJson {
  const tableFeatures: Feature<Polygon>[] = []
  const icrFeatures: Feature<Polygon>[] = []
  const icrLabels: IcrLabel[] = []
  const inverterFeatures: Feature<Polygon>[] = []
  const dcCableFeatures: Feature<LineString>[] = []
  const acCableFeatures: Feature<LineString>[] = []
  const laFeatures: Feature<Polygon>[] = []
  const laCircleFeatures: Feature<Polygon>[] = []

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
          // Display label from pvlayout_core (1-based: ICR-1, ICR-2…) —
          // used by the label renderer below.
          index: placed.index,
          // 0-based array position into LayoutResult.placed_icrs; the
          // sidecar's /refresh-inverters icr_override.icr_index expects
          // this, not the display label. Keep the two distinct.
          array_index: i,
        },
      })
      icrLabels.push({
        position: ringCentroid(ring),
        text: `ICR-${placed.index}`,
      })
    }

    // ── String inverters ────────────────────────────────────────────────
    for (let i = 0; i < r.placed_string_inverters_wgs84.length; i++) {
      const ring = r.placed_string_inverters_wgs84[i]
      const placed = r.placed_string_inverters[i]
      if (!ring || !placed) continue
      inverterFeatures.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          boundary: r.boundary_name,
          index: placed.index,
          capacity_kwp: placed.capacity_kwp,
        },
      })
    }

    // ── DC cables ───────────────────────────────────────────────────────
    for (let i = 0; i < r.dc_cable_runs_wgs84.length; i++) {
      const line = r.dc_cable_runs_wgs84[i]
      const cable = r.dc_cable_runs[i]
      if (!line || line.length < 2 || !cable) continue
      dcCableFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: line },
        properties: {
          boundary: r.boundary_name,
          index: cable.index,
          length_m: cable.length_m,
        },
      })
    }

    // ── AC cables ───────────────────────────────────────────────────────
    for (let i = 0; i < r.ac_cable_runs_wgs84.length; i++) {
      const line = r.ac_cable_runs_wgs84[i]
      const cable = r.ac_cable_runs[i]
      if (!line || line.length < 2 || !cable) continue
      acCableFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: line },
        properties: {
          boundary: r.boundary_name,
          index: cable.index,
          length_m: cable.length_m,
        },
      })
    }

    // ── LAs — rects + protection circles ───────────────────────────────
    for (let i = 0; i < r.placed_las_wgs84.length; i++) {
      const ring = r.placed_las_wgs84[i]
      const placed = r.placed_las[i]
      if (!ring || !placed) continue
      laFeatures.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          boundary: r.boundary_name,
          index: placed.index,
          radius: placed.radius,
        },
      })
    }
    for (let i = 0; i < r.placed_las_circles_wgs84.length; i++) {
      const ring = r.placed_las_circles_wgs84[i]
      const placed = r.placed_las[i]
      if (!ring || !placed) continue
      laCircleFeatures.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          boundary: r.boundary_name,
          index: placed.index,
          radius: placed.radius,
        },
      })
    }
  }

  return {
    tables: { type: "FeatureCollection", features: tableFeatures },
    icrs: { type: "FeatureCollection", features: icrFeatures },
    icrLabels,
    stringInverters: {
      type: "FeatureCollection",
      features: inverterFeatures,
    },
    dcCables: { type: "FeatureCollection", features: dcCableFeatures },
    acCables: { type: "FeatureCollection", features: acCableFeatures },
    las: { type: "FeatureCollection", features: laFeatures },
    laCircles: { type: "FeatureCollection", features: laCircleFeatures },
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
