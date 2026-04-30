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
import type { RunId } from "./project"

interface LayoutResultState {
  /** `null` = no Generate yet for the current project. */
  result: LayoutResult[] | null
  /**
   * Which Run produced `result`. P6's generate flow sets `run.id`; P7's
   * open-run flow sets the run it loaded. The App.tsx auto-fetch effect
   * keyed on `selectedRunId` skips its B17 round-trip when
   * `selectedRunId === resultRunId` — so post-Generate selection of
   * the just-generated run doesn't re-fetch the same data.
   *
   * `null` after a fresh KMZ load (handleOpenKmz resets), after delete,
   * or if some legacy callsite calls `setResult` without the runId arg.
   */
  resultRunId: RunId | null
  setResult: (result: LayoutResult[], runId?: RunId | null) => void
  clearResult: () => void
}

export const useLayoutResultStore = create<LayoutResultState>()(
  subscribeWithSelector((set) => ({
    result: null,
    resultRunId: null,
    setResult: (result, runId = null) => set({ result, resultRunId: runId }),
    clearResult: () => set({ result: null, resultRunId: null }),
  }))
)
