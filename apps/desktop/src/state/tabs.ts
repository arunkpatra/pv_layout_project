/**
 * Tabs slice — S2 multi-tab top bar.
 *
 *   tabs: { id, projectId, projectName }[]    // open tabs in order
 *   activeTabId: string | null                // null when no tabs open
 *
 * **Single-project-per-tab enforcement.** `openTab(projectId, name)`
 * checks for an existing tab with that projectId; if found, that tab
 * becomes active instead of creating a duplicate. The desktop's UX is
 * that the same project never opens in two tabs.
 *
 * **State coupling with the rest of the app.** This slice tracks ONLY
 * the tab metadata (id, projectId, projectName). The actual project
 * state — currentProject, runs, layoutResult, layoutParams, edits —
 * lives in its existing per-domain slice and is mutated by the tab-
 * switching effect in App.tsx via the existing P2 open flow. So
 * there's only ever ONE project's state in memory at a time; tabs are
 * UX shortcuts that re-load via B12 + S3 GET when switched to.
 *
 * Trade-off: switching tabs incurs ~1s of B12 + S3 round-trip + sidecar
 * parse. Acceptable at v1 — the cloud-first desktop assumes online
 * access anyway, and the P4 auto-save flow keeps server state in sync.
 * If we later observe slow tab switches as a UX problem, we can layer
 * a per-tab cache slice in front of this one without changing the
 * existing per-domain slices.
 */
import { create } from "zustand"

export interface Tab {
  /** Locally-minted UUID. Distinct from projectId so future "two views
   *  of the same project" use cases (split-pane compare in P8) can
   *  exist without breaking the data model. v1 enforces single-project-
   *  per-tab so id and projectId are 1:1, but the shape allows growth. */
  id: string
  projectId: string
  /** Cached for the tab title. Updated by App.tsx when a rename lands
   *  (P3's renameProjectMutation success → updateTabName). */
  projectName: string
}

interface TabsSlice {
  tabs: Tab[]
  activeTabId: string | null

  /**
   * Open a tab for the given project. If a tab with the same projectId
   * already exists, switches to it (and returns its id) instead of
   * creating a duplicate. Otherwise appends a fresh tab and makes it
   * active.
   *
   * Returns the active tab id (existing or new) so callers can compose
   * downstream effects.
   */
  openTab: (projectId: string, projectName: string) => string

  /**
   * Close a tab. If it was the active one, picks the adjacent tab as
   * the new active (right neighbour preferred; falls back to left;
   * null when no tabs remain). Does nothing if the id doesn't exist.
   */
  closeTab: (tabId: string) => void

  /**
   * Switch active tab to the given id. No-op if id doesn't exist or
   * is already active.
   */
  switchTab: (tabId: string) => void

  /**
   * Update the cached `projectName` on whatever tab carries the given
   * projectId. Called from P3's rename onSuccess. No-op if no tab
   * holds the project.
   */
  updateTabName: (projectId: string, name: string) => void

  /**
   * Reset to empty (sign-out, clear-license, etc.). Mirrors the slice
   * reset patterns elsewhere.
   */
  reset: () => void
}

const INITIAL = {
  tabs: [] as Tab[],
  activeTabId: null as string | null,
}

function nextTabId(): string {
  // crypto.randomUUID is universally available in modern browsers +
  // happy-dom + Tauri's webview.
  return crypto.randomUUID()
}

export const useTabsStore = create<TabsSlice>()((set, get) => ({
  ...INITIAL,

  openTab: (projectId, projectName) => {
    const existing = get().tabs.find((t) => t.projectId === projectId)
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }
    const id = nextTabId()
    set((s) => ({
      tabs: [...s.tabs, { id, projectId, projectName }],
      activeTabId: id,
    }))
    return id
  },

  closeTab: (tabId) => {
    const tabs = get().tabs
    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx < 0) return
    const next = tabs.slice(0, idx).concat(tabs.slice(idx + 1))
    let nextActive = get().activeTabId
    if (nextActive === tabId) {
      // Pick the right neighbour first; fall back to the left; null if
      // we just emptied the list.
      const right = tabs[idx + 1]
      const left = tabs[idx - 1]
      nextActive = right?.id ?? left?.id ?? null
    }
    set({ tabs: next, activeTabId: nextActive })
  },

  switchTab: (tabId) => {
    const exists = get().tabs.some((t) => t.id === tabId)
    if (!exists) return
    if (get().activeTabId === tabId) return
    set({ activeTabId: tabId })
  },

  updateTabName: (projectId, name) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.projectId === projectId ? { ...t, projectName: name } : t
      ),
    }))
  },

  reset: () => set({ ...INITIAL }),
}))
