import { describe, it, expect, beforeEach } from "vitest"
import { useLayerVisibilityStore } from "./layerVisibility"

describe("useLayerVisibilityStore", () => {
  beforeEach(() => {
    useLayerVisibilityStore.getState().resetToDefaults()
  })

  it("defaults both toggles to false (matches PVlayout_Advance)", () => {
    const s = useLayerVisibilityStore.getState()
    expect(s.showAcCables).toBe(false)
    expect(s.showLas).toBe(false)
  })

  it("setShowAcCables toggles independently from setShowLas", () => {
    useLayerVisibilityStore.getState().setShowAcCables(true)
    expect(useLayerVisibilityStore.getState().showAcCables).toBe(true)
    expect(useLayerVisibilityStore.getState().showLas).toBe(false)
  })

  it("setShowLas toggles independently from setShowAcCables", () => {
    useLayerVisibilityStore.getState().setShowLas(true)
    expect(useLayerVisibilityStore.getState().showAcCables).toBe(false)
    expect(useLayerVisibilityStore.getState().showLas).toBe(true)
  })

  it("resetToDefaults reverts both toggles to false", () => {
    useLayerVisibilityStore.getState().setShowAcCables(true)
    useLayerVisibilityStore.getState().setShowLas(true)
    useLayerVisibilityStore.getState().resetToDefaults()
    const s = useLayerVisibilityStore.getState()
    expect(s.showAcCables).toBe(false)
    expect(s.showLas).toBe(false)
  })
})
