/**
 * Layout result slice — the most recent /layout response from the
 * sidecar. One LayoutResult per boundary in the parsed KMZ.
 *
 * Why Zustand here? The result is read by:
 *   - MapCanvas (placed_tables_wgs84, placed_icrs_wgs84 — S9).
 *   - SummaryPanel (counts, MWp, area metrics — S9).
 *   - InspectorTabs (passes data down — S9 / S10).
 *   - Export buttons (S12 — sends current result to /export/{kmz,pdf,dxf}).
 *   - Future: ICR drag/edit (S11 — modifies result optimistically).
 *
 * Slice exists in S8.8 (no UI consumers yet); S9's mutation onSuccess
 * sets the result.
 */
import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import type { LayoutResult } from "@solarlayout/sidecar-client"

interface LayoutResultState {
  /** `null` = no Generate yet for the current project. */
  result: LayoutResult[] | null
  setResult: (result: LayoutResult[]) => void
  clearResult: () => void
}

export const useLayoutResultStore = create<LayoutResultState>()(
  subscribeWithSelector((set) => ({
    result: null,
    setResult: (result) => set({ result }),
    clearResult: () => set({ result: null }),
  }))
)
