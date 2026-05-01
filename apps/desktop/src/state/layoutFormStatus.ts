/**
 * Layout-form live status slice.
 *
 * Mirrors two pieces of LayoutPanel's react-hook-form state up to App.tsx
 * so the pinned action area (rendered in App.tsx alongside the tabs band
 * for sticky-stacking — see S3-01b in SMOKE-LOG.md) can read them
 * without consuming RHF's hook tree.
 *
 * Why a slice (vs a callback ref):
 *   - App.tsx already lifts other LayoutPanel-touching state into Zustand
 *     slices per ADR-0003.
 *   - A boolean primitive dep keeps useEffect quiet (errors object identity
 *     changes every render; the derived boolean only flips on real change).
 *   - Decouples the lift: LayoutPanel writes, App.tsx reads, no prop bridge.
 *
 * The slice's two values:
 *   - hasErrors: any RHF validation error currently active. Drives the
 *     "Fix the validation errors above before generating" line under
 *     the Generate button.
 *   - enableCableCalc: live `watch("enable_cable_calc")` value. Used
 *     together with feature-key entitlement + boundary count to decide
 *     whether the pre-flight expectation chip renders.
 */
import { create } from "zustand"

interface LayoutFormStatusState {
  hasErrors: boolean
  enableCableCalc: boolean
  setHasErrors: (v: boolean) => void
  setEnableCableCalc: (v: boolean) => void
}

export const useLayoutFormStatusStore = create<LayoutFormStatusState>(
  (set) => ({
    hasErrors: false,
    enableCableCalc: false,
    setHasErrors: (hasErrors) => set({ hasErrors }),
    setEnableCableCalc: (enableCableCalc) => set({ enableCableCalc }),
  })
)
