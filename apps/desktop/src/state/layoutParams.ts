/**
 * Layout parameters slice — the form state behind S9's InputPanel.
 *
 * Schema and defaults mirror the sidecar's `LayoutParameters` pydantic
 * model. The slice exists in S8.8 (no UI consumers yet); S9 wires
 * react-hook-form to read defaults from / write back to this slice.
 *
 * Why Zustand here (not local component state)?
 *   - LayoutPanel will be sibling to SummaryPanel (which reads counts
 *     after Generate) and the Generate button itself.
 *   - The params survive panel collapse/expand and tab switches.
 *   - The future "save project to cloud" feature (S12+, ADR-0004) will
 *     serialise the slice directly.
 *
 * Form lifecycle (touched/errors/dirty) lives in react-hook-form, NOT
 * here. RHF's `defaultValues` come from `useLayoutParamsStore.getState()`
 * at form mount; the form's onChange (debounced) calls `setParam` to
 * persist back. Single source of truth, clear ownership.
 */
import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import {
  DEFAULT_LAYOUT_PARAMETERS,
  type LayoutParameters,
} from "@solarlayout/sidecar-client"

interface LayoutParamsState {
  params: LayoutParameters
  /**
   * Replace a single top-level field. Object-typed fields (`module`,
   * `table`) take a fully-merged object — callers spread the existing
   * value when patching one nested field.
   */
  setParam: <K extends keyof LayoutParameters>(
    key: K,
    value: LayoutParameters[K]
  ) => void
  /** Replace the entire params object (used by RHF on form submit). */
  setAll: (params: LayoutParameters) => void
  /** Restore field-level defaults from the sidecar schema. */
  resetToDefaults: () => void
}

export const useLayoutParamsStore = create<LayoutParamsState>()(
  subscribeWithSelector((set) => ({
    params: DEFAULT_LAYOUT_PARAMETERS,
    setParam: (key, value) =>
      set((s) => ({ params: { ...s.params, [key]: value } })),
    setAll: (params) => set({ params }),
    resetToDefaults: () => set({ params: DEFAULT_LAYOUT_PARAMETERS }),
  }))
)
