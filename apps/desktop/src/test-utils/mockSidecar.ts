// Typed mock factory for the SidecarClient.
//
// Tests that need a sidecar use `createMockSidecarClient({ ... overrides })`
// instead of constructing a real one. Method signatures are typed against
// the real interface so drift surfaces as a TypeScript error at compile
// time, not as a silent test pass.

import { vi } from "vitest"
import type {
  SidecarClient,
  HealthResponse,
  LayoutResult,
  ParsedKMZ,
} from "@solarlayout/sidecar-client"

/** Sane defaults that pass any "is the app booting?" smoke test. */
const defaultHealth: HealthResponse = { status: "ok", version: "test" }

const defaultParsedKmz: ParsedKMZ = {
  boundaries: [],
  centroid_lat: 0,
  centroid_lon: 0,
}

/** Default /layout response — empty array. Override in tests that need layout output. */
const defaultLayoutResults: LayoutResult[] = []

/** Placeholder LayoutResult for S11 mutation mocks — all-zero /
 * empty-array fields that satisfy the full wire shape. Cast through
 * `unknown` because the sidecar-client's LayoutResult has ~40 fields
 * and we don't want a fragile literal that breaks every time the
 * schema grows. Tests that care about specific fields override them. */
const defaultLayoutResult: LayoutResult = {
  boundary_name: "",
  placed_tables: [],
  placed_icrs: [],
  placed_roads: [],
  tables_pre_icr: [],
  total_modules: 0,
  total_capacity_kwp: 0,
  total_capacity_mwp: 0,
  total_area_m2: 0,
  total_area_acres: 0,
  net_layout_area_m2: 0,
  gcr_achieved: 0,
  row_pitch_m: 0,
  tilt_angle_deg: 0,
  utm_epsg: 0,
  boundary_wgs84: [],
  obstacle_polygons_wgs84: [],
  placed_tables_wgs84: [],
  placed_icrs_wgs84: [],
  placed_string_inverters: [],
  placed_string_inverters_wgs84: [],
  dc_cable_runs: [],
  dc_cable_runs_wgs84: [],
  ac_cable_runs: [],
  ac_cable_runs_wgs84: [],
  total_dc_cable_m: 0,
  total_ac_cable_m: 0,
  string_kwp: 0,
  inverter_capacity_kwp: 0,
  num_string_inverters: 0,
  inverters_per_icr: 0,
  placed_las: [],
  placed_las_wgs84: [],
  placed_las_circles_wgs84: [],
  num_las: 0,
  num_central_inverters: 0,
  central_inverter_capacity_kwp: 0,
  plant_ac_capacity_mw: 0,
  dc_ac_ratio: 0,
}

/**
 * Build a mock SidecarClient. Each method is a `vi.fn()` so individual
 * tests can assert call counts / arguments. Pass `overrides` to swap in
 * specific responses or rejections.
 *
 * @example
 *   const client = createMockSidecarClient({
 *     health: vi.fn().mockRejectedValue(new Error("boom")),
 *   })
 */
export function createMockSidecarClient(
  overrides: Partial<SidecarClient> = {}
): SidecarClient {
  return {
    baseUrl: "http://127.0.0.1:0",
    health: vi.fn().mockResolvedValue(defaultHealth),
    parseKmz: vi.fn().mockResolvedValue(defaultParsedKmz),
    runLayout: vi.fn().mockResolvedValue(defaultLayoutResults),
    refreshInverters: vi.fn().mockResolvedValue(defaultLayoutResult),
    addRoad: vi.fn().mockResolvedValue(defaultLayoutResult),
    removeLastRoad: vi.fn().mockResolvedValue(defaultLayoutResult),
    // SP1 — best-effort thumbnail render. Default: tiny placeholder
    // bytes so callers that fire-and-forget the upload chain can spy
    // call counts without bytecount assertions failing.
    renderLayoutThumbnail: vi
      .fn()
      .mockResolvedValue(new Uint8Array([0x52, 0x49, 0x46, 0x46])),
    ...overrides,
  }
}
