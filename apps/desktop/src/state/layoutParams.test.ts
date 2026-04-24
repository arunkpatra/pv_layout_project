import { describe, it, expect, beforeEach } from "vitest"
import { DEFAULT_LAYOUT_PARAMETERS } from "@solarlayout/sidecar-client"
import { useLayoutParamsStore } from "./layoutParams"

describe("useLayoutParamsStore", () => {
  beforeEach(() => {
    useLayoutParamsStore.getState().resetToDefaults()
  })

  it("initialises with the sidecar's pydantic defaults", () => {
    expect(useLayoutParamsStore.getState().params).toEqual(
      DEFAULT_LAYOUT_PARAMETERS
    )
  })

  it("setParam updates a single top-level field", () => {
    useLayoutParamsStore.getState().setParam("perimeter_road_width", 8.5)
    expect(useLayoutParamsStore.getState().params.perimeter_road_width).toBe(
      8.5
    )
    // Other fields preserved.
    expect(useLayoutParamsStore.getState().params.tilt_angle).toBe(
      DEFAULT_LAYOUT_PARAMETERS.tilt_angle
    )
  })

  it("setParam works for nullable fields (tilt override)", () => {
    useLayoutParamsStore.getState().setParam("tilt_angle", 22.0)
    expect(useLayoutParamsStore.getState().params.tilt_angle).toBe(22.0)
    useLayoutParamsStore.getState().setParam("tilt_angle", null)
    expect(useLayoutParamsStore.getState().params.tilt_angle).toBeNull()
  })

  it("setParam replaces nested objects whole (caller spreads to patch one field)", () => {
    const patched = {
      ...useLayoutParamsStore.getState().params.module,
      wattage: 620,
    }
    useLayoutParamsStore.getState().setParam("module", patched)
    expect(useLayoutParamsStore.getState().params.module.wattage).toBe(620)
    expect(useLayoutParamsStore.getState().params.module.length).toBe(2.38)
  })

  it("setAll replaces the entire params object", () => {
    const next = {
      ...DEFAULT_LAYOUT_PARAMETERS,
      perimeter_road_width: 10,
      design_mode: "central_inverter" as const,
    }
    useLayoutParamsStore.getState().setAll(next)
    expect(useLayoutParamsStore.getState().params).toEqual(next)
  })

  it("resetToDefaults restores the schema defaults", () => {
    useLayoutParamsStore.getState().setParam("perimeter_road_width", 99)
    useLayoutParamsStore.getState().resetToDefaults()
    expect(useLayoutParamsStore.getState().params).toEqual(
      DEFAULT_LAYOUT_PARAMETERS
    )
  })
})
