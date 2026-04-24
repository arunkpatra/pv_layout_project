import { describe, it, expect } from "vitest"
import type { LayoutResult } from "@solarlayout/sidecar-client"
import { layoutToGeoJson } from "./layoutToGeoJson"

const closedRing: [number, number][] = [
  [76.4, 14.8],
  [76.40028, 14.8],
  [76.40028, 14.80004],
  [76.4, 14.80004],
  [76.4, 14.8],
]

const sample = (overrides: Partial<LayoutResult> = {}): LayoutResult => ({
  boundary_name: "Plant 1",
  placed_tables: [
    { x: 100, y: 100, width: 31.6, height: 4.8, row_index: 0, col_index: 0 },
    { x: 132, y: 100, width: 31.6, height: 4.8, row_index: 0, col_index: 1 },
  ],
  placed_icrs: [{ x: 200, y: 200, width: 40, height: 14, index: 0 }],
  placed_roads: [],
  tables_pre_icr: [],
  total_modules: 112,
  total_capacity_kwp: 64.96,
  total_capacity_mwp: 0.06496,
  total_area_m2: 1000,
  total_area_acres: 0.247,
  net_layout_area_m2: 800,
  gcr_achieved: 0.45,
  row_pitch_m: 7.0,
  tilt_angle_deg: 17.4,
  utm_epsg: 32643,
  boundary_wgs84: [],
  obstacle_polygons_wgs84: [],
  placed_tables_wgs84: [closedRing, closedRing],
  placed_icrs_wgs84: [closedRing],
  placed_string_inverters: [],
  dc_cable_runs: [],
  ac_cable_runs: [],
  total_dc_cable_m: 0,
  total_ac_cable_m: 0,
  string_kwp: 0,
  inverter_capacity_kwp: 0,
  num_string_inverters: 0,
  inverters_per_icr: 0,
  placed_las: [],
  num_las: 0,
  num_central_inverters: 0,
  central_inverter_capacity_kwp: 0,
  plant_ac_capacity_mw: 0,
  dc_ac_ratio: 0,
  ...overrides,
})

describe("layoutToGeoJson", () => {
  it("produces one Polygon feature per placed table", () => {
    const out = layoutToGeoJson([sample()])
    expect(out.tables.features).toHaveLength(2)
    expect(out.tables.features[0]!.geometry.type).toBe("Polygon")
    expect(out.tables.features[0]!.properties).toMatchObject({
      boundary: "Plant 1",
      row: 0,
      col: 0,
    })
  })

  it("produces one Polygon feature per placed ICR with the ring already closed", () => {
    const out = layoutToGeoJson([sample()])
    expect(out.icrs.features).toHaveLength(1)
    const ring = out.icrs.features[0]!.geometry.coordinates[0]!
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it("emits one ICR label per placed ICR with text 'ICR-{index}'", () => {
    const out = layoutToGeoJson([sample()])
    expect(out.icrLabels).toHaveLength(1)
    expect(out.icrLabels[0]!.text).toBe("ICR-0")
    // Position is the centroid of the ring's first 4 corners.
    const [lon, lat] = out.icrLabels[0]!.position
    expect(lon).toBeCloseTo(76.40014, 4)
    expect(lat).toBeCloseTo(14.80002, 4)
  })

  it("aggregates across multiple boundaries (one LayoutResult each)", () => {
    const r1 = sample()
    const r2 = sample({
      boundary_name: "Plant 2",
      placed_tables: [
        { x: 0, y: 0, width: 1, height: 1, row_index: 0, col_index: 0 },
      ],
      placed_icrs: [],
      placed_tables_wgs84: [closedRing],
      placed_icrs_wgs84: [],
    })
    const out = layoutToGeoJson([r1, r2])
    expect(out.tables.features).toHaveLength(3)
    expect(out.icrs.features).toHaveLength(1)
    expect(out.icrLabels).toHaveLength(1)
  })

  it("emits empty FCs for an empty input", () => {
    const out = layoutToGeoJson([])
    expect(out.tables.features).toHaveLength(0)
    expect(out.icrs.features).toHaveLength(0)
    expect(out.icrLabels).toHaveLength(0)
  })

  it("skips entries where wgs84 ring count doesn't match utm count", () => {
    // Defensive: should the sidecar ever emit asymmetric data, we don't crash.
    const out = layoutToGeoJson([
      sample({
        placed_tables_wgs84: [closedRing], // shorter than placed_tables
      }),
    ])
    expect(out.tables.features).toHaveLength(1)
  })
})
