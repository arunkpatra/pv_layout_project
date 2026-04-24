import { describe, it, expect, beforeEach } from "vitest"
import type { LayoutResult } from "@solarlayout/sidecar-client"
import { useLayoutResultStore } from "./layoutResult"

const sampleResult: LayoutResult = {
  boundary_name: "Plant 1",
  placed_tables: [
    { x: 100, y: 100, width: 31.6, height: 4.8, row_index: 0, col_index: 0 },
  ],
  placed_icrs: [
    { x: 200, y: 200, width: 40, height: 14, index: 0 },
  ],
  placed_roads: [],
  tables_pre_icr: [],
  total_modules: 56,
  total_capacity_kwp: 32.48,
  total_capacity_mwp: 0.03248,
  total_area_m2: 1000,
  total_area_acres: 0.247,
  net_layout_area_m2: 800,
  gcr_achieved: 0.45,
  row_pitch_m: 7.0,
  tilt_angle_deg: 17.4,
  utm_epsg: 32643,
  boundary_wgs84: [
    [76.4, 14.8],
    [76.5, 14.9],
  ],
  obstacle_polygons_wgs84: [],
  placed_tables_wgs84: [
    [
      [76.4, 14.8],
      [76.40028, 14.8],
      [76.40028, 14.80004],
      [76.4, 14.80004],
      [76.4, 14.8],
    ],
  ],
  placed_icrs_wgs84: [
    [
      [76.41, 14.81],
      [76.41036, 14.81],
      [76.41036, 14.81013],
      [76.41, 14.81013],
      [76.41, 14.81],
    ],
  ],
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
}

describe("useLayoutResultStore", () => {
  beforeEach(() => {
    useLayoutResultStore.getState().clearResult()
  })

  it("starts with null result", () => {
    expect(useLayoutResultStore.getState().result).toBeNull()
  })

  it("setResult stores an array of LayoutResult", () => {
    useLayoutResultStore.getState().setResult([sampleResult])
    expect(useLayoutResultStore.getState().result).toHaveLength(1)
    expect(useLayoutResultStore.getState().result![0]!.boundary_name).toBe(
      "Plant 1"
    )
  })

  it("setResult replaces, doesn't merge", () => {
    useLayoutResultStore.getState().setResult([sampleResult])
    const second: LayoutResult = { ...sampleResult, boundary_name: "Plant 2" }
    useLayoutResultStore.getState().setResult([second])
    expect(useLayoutResultStore.getState().result).toHaveLength(1)
    expect(useLayoutResultStore.getState().result![0]!.boundary_name).toBe(
      "Plant 2"
    )
  })

  it("clearResult resets to null", () => {
    useLayoutResultStore.getState().setResult([sampleResult])
    useLayoutResultStore.getState().clearResult()
    expect(useLayoutResultStore.getState().result).toBeNull()
  })

  it("supports multiple boundaries (one LayoutResult each)", () => {
    const second: LayoutResult = { ...sampleResult, boundary_name: "Plant 2" }
    useLayoutResultStore.getState().setResult([sampleResult, second])
    expect(useLayoutResultStore.getState().result).toHaveLength(2)
  })
})
