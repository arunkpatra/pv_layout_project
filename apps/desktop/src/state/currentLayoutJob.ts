/**
 * Current layout-job slice — Spike 1 Phase 6.
 *
 * Holds the live state of an in-flight layout job (or the most recent
 * terminal snapshot). Updated by `useGenerateLayoutMutation`'s polling
 * loop; read by `LayoutPanel` to render the pinned action area's
 * idle / running / post-run states.
 *
 * Lifecycle
 *   - `null` on app boot.
 *   - On Generate click: `useGenerateLayoutMutation` calls
 *     `sidecar.startLayoutJob`, then immediately `setJobState` with the
 *     server's first snapshot (status `queued` or `running`).
 *   - The mutation's polling loop calls `setJobState` on every poll (~2s
 *     cadence) until the job reaches a terminal status.
 *   - The terminal snapshot stays in the slice as the "last run summary"
 *     until the next Generate click (which overwrites with a new
 *     queued-state snapshot) or a project change (App.tsx clears).
 *
 * Why a slice (not query state):
 *   The polling loop lives inside the mutation so that the same
 *   idempotency-key-protected attempt threads through B16 → sidecar →
 *   S3 PUT cleanly. Splitting the polling into a sibling `useQuery`
 *   would force the panel to coordinate completion with the mutation's
 *   onSuccess. A shared slice lets the mutation own orchestration and
 *   the panel just observe.
 */
import { create } from "zustand"
import type { LayoutJobState } from "@solarlayout/sidecar-client"

interface CurrentLayoutJobStoreState {
  /** Latest snapshot. `null` only on boot / after explicit clear. */
  jobState: LayoutJobState | null
  setJobState: (state: LayoutJobState) => void
  clearJobState: () => void
}

export const useCurrentLayoutJobStore = create<CurrentLayoutJobStoreState>(
  (set) => ({
    jobState: null,
    setJobState: (state) => set({ jobState: state }),
    clearJobState: () => set({ jobState: null }),
  })
)
