/**
 * Project slice — the currently-loaded KMZ.
 *
 * Migrated out of `App.tsx`'s `useState` in S8.8: the project is read by
 * MapCanvas (geometry), TopBar (filename), StatusBar (counts), Inspector
 * panels (S9), so it earns a Zustand slice per ADR-0003.
 *
 * The slice intentionally holds only the parsed sidecar response + the
 * file's display name. Derived data (GeoJSON FeatureCollections, status
 * counts) is computed at the consumer side via memoised selectors —
 * keeps this slice tiny and stable.
 */
import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import type { ParsedKMZ } from "@solarlayout/sidecar-client"

export interface Project {
  kmz: ParsedKMZ
  fileName: string
}

interface ProjectState {
  project: Project | null
  setProject: (project: Project) => void
  clearProject: () => void
}

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set) => ({
    project: null,
    setProject: (project) => set({ project }),
    clearProject: () => set({ project: null }),
  }))
)
