/**
 * Project slice — local-KMZ workflow + post-parity backend project metadata.
 *
 * History:
 * - Parity-era (S8.8): introduced `project: {kmz, fileName}` for the
 *   currently-loaded KMZ — read by MapCanvas, TopBar, StatusBar, Inspector.
 * - Post-parity (F4, 2026-04-29): added `currentProject` (backend-persisted
 *   metadata with `prj_*` semantic ID), `runs[]` (Run records for the project),
 *   and `selectedRunId`. Both layers coexist during the post-parity transition:
 *   P1/P2 (new-project / open-project rows) populate `currentProject` from the
 *   backend response and `project` from parsing the downloaded KMZ blob.
 *
 * The slice intentionally keeps each concept narrow — derived data (GeoJSON
 * FeatureCollections, status counts, selected-run object) is computed at the
 * consumer side via memoised selectors. That keeps the slice tiny + stable
 * and avoids over-rendering when unrelated parts mutate.
 */
import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import type { ParsedKMZ } from "@solarlayout/sidecar-client"
import type {
  ProjectV2Wire,
  RunSummaryV2Wire,
} from "@solarlayout/entitlements-client"

// ---------------------------------------------------------------------------
// Parity-era types — the locally-parsed KMZ workflow.
// ---------------------------------------------------------------------------

export interface Project {
  kmz: ParsedKMZ
  fileName: string
}

// ---------------------------------------------------------------------------
// Post-parity types — backend-persisted Project + Run.
// ---------------------------------------------------------------------------

/** Opaque ID minted server-side with `prj_` semantic-ID prefix. */
export type ProjectId = string

/** Opaque ID minted server-side with `run_` semantic-ID prefix. */
export type RunId = string

/**
 * User-authored edits to a project that aren't part of the original KMZ —
 * drawn obstructions, water bodies, road overrides, ICR repositions, etc.
 *
 * Starts opaque; D1–D7 rows narrow the shape as drawing tools land. Backend
 * round-trips this as an opaque JSON column (`PATCH /v2/projects/:id` with
 * `{edits}` body — see B13). At parity-close (2026-04-29) the desktop has
 * no edits to round-trip, so a fresh project always carries `{}`.
 */
export type ProjectEdits = unknown

/**
 * Backend-persisted project metadata. Type-alias of B11/B12/B13's
 * `ProjectV2Wire` response shape — the desktop stores the wire row
 * verbatim, no adapter. The KMZ blob itself lives in S3 at `kmzBlobUrl`;
 * this struct only holds the URL + sha256 fingerprint.
 *
 * `userId` is informational only — the desktop is single-user-per-key,
 * so it's never used for branching, just persisted for audit. `deletedAt`
 * is null for live projects in the active flow; soft-deleted records are
 * filtered out server-side before reaching the desktop.
 *
 * Source of truth: `ProjectV2Wire` in
 * `renewable_energy/apps/mvp_api/src/modules/projects/projects.service.ts`,
 * mirrored to `packages/entitlements-client/src/types-v2.ts`.
 */
export type PersistedProject = ProjectV2Wire

/**
 * Backend-persisted run record at LIST-row granularity. Type-alias of
 * B12's `RunSummaryV2Wire` — what the desktop receives when it fetches
 * a project detail (B12) and what populates the runs gallery (P5).
 *
 * Detail-level fields (inputsSnapshot, presigned-GET layoutResultBlobUrl,
 * energyResultBlobUrl, exports list) live on B17's RunDetail and don't
 * belong in this list-row shape — fetched on demand when the user opens
 * a specific run (P7). Keeping the slice strict to the wire shape means
 * lockstep updates flow one-way (backend → desktop) without manual
 * adapter code drifting.
 *
 * `projectId` is intentionally NOT on the wire — it's implicit in
 * `currentProject.id` for any code branch that has a Run in scope.
 */
export type Run = RunSummaryV2Wire

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

interface ProjectState {
  // Parity-era — local parsed KMZ workflow.
  project: Project | null
  setProject: (project: Project) => void
  clearProject: () => void

  // Post-parity — backend project metadata + runs + selection.
  currentProject: PersistedProject | null
  runs: Run[]
  selectedRunId: RunId | null

  setCurrentProject: (project: PersistedProject | null) => void
  setRuns: (runs: Run[]) => void
  addRun: (run: Run) => void
  removeRun: (id: RunId) => void
  selectRun: (id: RunId | null) => void

  /** Reset every field — used on tab close, sign-out, or project switch. */
  clearAll: () => void
}

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set) => ({
    // Parity-era state
    project: null,
    setProject: (project) => set({ project }),
    clearProject: () => set({ project: null }),

    // Post-parity state
    currentProject: null,
    runs: [],
    selectedRunId: null,

    setCurrentProject: (project) => set({ currentProject: project }),

    setRuns: (runs) =>
      set((s) => ({
        runs,
        // Drop a selection that isn't represented in the new list. Preserve
        // it otherwise. This matches the UX expectation that selection is a
        // pointer into the visible list, not a sticky preference.
        selectedRunId:
          s.selectedRunId !== null && runs.some((r) => r.id === s.selectedRunId)
            ? s.selectedRunId
            : null,
      })),

    addRun: (run) => set((s) => ({ runs: [...s.runs, run] })),

    removeRun: (id) =>
      set((s) => ({
        runs: s.runs.filter((r) => r.id !== id),
        // If the removed run was the selected one, clear the selection.
        // Otherwise leave it untouched.
        selectedRunId: s.selectedRunId === id ? null : s.selectedRunId,
      })),

    selectRun: (id) => set({ selectedRunId: id }),

    clearAll: () =>
      set({
        project: null,
        currentProject: null,
        runs: [],
        selectedRunId: null,
      }),
  }))
)
