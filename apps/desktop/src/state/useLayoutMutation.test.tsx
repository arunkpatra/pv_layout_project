/**
 * useLayoutMutation tests — mocked sidecar client; verifies the success
 * path hydrates the layoutResult store, and the error path surfaces.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import type {
  LayoutResult,
  ParsedKMZ,
  SidecarClient,
} from "@solarlayout/sidecar-client"
import { DEFAULT_LAYOUT_PARAMETERS } from "@solarlayout/sidecar-client"
import { createMockSidecarClient } from "../test-utils/mockSidecar"
import { useLayoutMutation } from "./useLayoutMutation"
import { useLayoutResultStore } from "./layoutResult"

const sampleResult: LayoutResult = {
  boundary_name: "Plant 1",
  placed_tables: [],
  placed_icrs: [],
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

const sampleKmz: ParsedKMZ = {
  boundaries: [],
  centroid_lat: 0,
  centroid_lon: 0,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe("useLayoutMutation", () => {
  beforeEach(() => {
    useLayoutResultStore.getState().clearResult()
  })

  it("calls sidecar.runLayout with the variables and stores result on success", async () => {
    const sidecar: SidecarClient = createMockSidecarClient({
      runLayout: vi.fn().mockResolvedValue([sampleResult]),
    })
    const { result } = renderHook(() => useLayoutMutation(sidecar), { wrapper })
    act(() => {
      result.current.mutate({
        parsedKmz: sampleKmz,
        params: DEFAULT_LAYOUT_PARAMETERS,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sidecar.runLayout).toHaveBeenCalledWith(
      sampleKmz,
      DEFAULT_LAYOUT_PARAMETERS
    )
    expect(useLayoutResultStore.getState().result).toEqual([sampleResult])
  })

  it("does NOT hydrate the store on error", async () => {
    const sidecar: SidecarClient = createMockSidecarClient({
      runLayout: vi.fn().mockRejectedValue(new Error("boom")),
    })
    const { result } = renderHook(() => useLayoutMutation(sidecar), { wrapper })
    act(() => {
      result.current.mutate({
        parsedKmz: sampleKmz,
        params: DEFAULT_LAYOUT_PARAMETERS,
      })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useLayoutResultStore.getState().result).toBeNull()
  })

  it("throws synchronously on null sidecar (caller must guard)", async () => {
    const { result } = renderHook(() => useLayoutMutation(null), { wrapper })
    act(() => {
      result.current.mutate({
        parsedKmz: sampleKmz,
        params: DEFAULT_LAYOUT_PARAMETERS,
      })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
