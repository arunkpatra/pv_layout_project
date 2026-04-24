/**
 * Layer visibility slice — user-toggleable canvas layer flags.
 *
 * S10 introduces two user-controllable visibility toggles that map
 * one-to-one to MapLibre layer groups in `MapCanvas`:
 *
 *   showAcCables  → `ac-cables` layer
 *   showLas       → `la-rects-fill` + `la-rects-outline` +
 *                   `la-circles-fill` + `la-circles-outline`
 *
 * Defaults mirror PVlayout_Advance: both OFF. String inverters and DC
 * cables render whenever present (no user toggle; PVlayout_Advance
 * doesn't hide them either).
 *
 * Why a Zustand slice (not `useState` in the inspector)? Per
 * ADR-0003: the toggle lives in the Inspector and the consumer lives
 * in the MapCanvas composition — two sibling components. Future
 * spikes may add more toggles (S11 draws editing overlays that might
 * want a `showEditHandles` flag; S12 may want `showExportPreview`).
 * Additive in this slice; no refactor cost.
 */
import { create } from "zustand"

interface LayerVisibilityState {
  showAcCables: boolean
  showLas: boolean
  setShowAcCables: (show: boolean) => void
  setShowLas: (show: boolean) => void
  /** Reset to PyQt5-matching defaults. Invoked on new-KMZ load. */
  resetToDefaults: () => void
}

const DEFAULTS = {
  showAcCables: false,
  showLas: false,
} as const

export const useLayerVisibilityStore = create<LayerVisibilityState>()((set) => ({
  showAcCables: DEFAULTS.showAcCables,
  showLas: DEFAULTS.showLas,
  setShowAcCables: (showAcCables) => set({ showAcCables }),
  setShowLas: (showLas) => set({ showLas }),
  resetToDefaults: () => set({ ...DEFAULTS }),
}))
