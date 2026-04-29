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
 * Starts empty; D1–D7 rows extend the shape as drawing tools land. Backend
 * round-trips this as an opaque JSONB column (`PATCH /v2/projects/:id` with
 * `{edits}` body — see B13).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProjectEdits {}

/**
 * Backend-persisted project metadata. The KMZ blob itself lives in S3 at
 * `kmzBlobUrl`; this struct only holds the URL + sha256 fingerprint.
 * Mirrors the `Project` Prisma model shape from
 * `renewable_energy/packages/mvp_db/prisma/schema.prisma` (B3).
 */
export interface PersistedProject {
  id: ProjectId
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  edits: ProjectEdits
  createdAt: string
  updatedAt: string
}

/**
 * Backend-persisted run record. One Run per "Generate Layout" click.
 * Mirrors the `Run` Prisma model shape (B4). `params` is intentionally
 * loose at v1; later rows narrow it to the typed `LayoutParameters` shape.
 */
export interface Run {
  id: RunId
  projectId: ProjectId
  name: string
  params: Record<string, unknown>
  billedFeatureKey: string
  layoutResultBlobUrl: string | null
  energyResultBlobUrl: string | null
  createdAt: string
}

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
