/**
 * Tests for `useDeleteProjectMutation` — the P3 soft-delete hook that
 * wraps `client.deleteProjectV2(key, projectId)` and resets the desktop's
 * project state on success.
 *
 * Single-attempt: re-deleting an already-deleted project returns 404, so
 * automatic retry would create the worst kind of UX (success → second
 * retry → "not found" surfaced). The Delete confirm modal is the retry
 * surface.
 *
 * onSuccess clears `currentProject` + `runs[]` + the parity-era
 * `project` field (so the canvas resets to empty), then invalidates
 * `["entitlements", key]` so the quota chip's `projectsActive` /
 * `projectsRemaining` refresh.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type ProjectV2Wire,
} from "@solarlayout/entitlements-client"
import { useDeleteProjectMutation } from "./useDeleteProject"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"
import { useProjectStore } from "../state/project"
import { useTabsStore } from "../state/tabs"

const REAL_KEY = "sl_live_real_key_for_test"

const STUB_PROJECT: ProjectV2Wire = {
  id: "prj_abc",
  userId: "usr_test1",
  name: "Site A",
  kmzBlobUrl: "s3://b/k",
  kmzSha256: "a".repeat(64),
  edits: {},
  createdAt: "2026-04-30T10:00:00.000Z",
  updatedAt: "2026-04-30T10:00:00.000Z",
  deletedAt: null,
}

function makeClient(
  overrides: Partial<EntitlementsClient> = {}
): EntitlementsClient {
  return {
    baseUrl: "http://localhost:3003",
    getEntitlements: vi.fn(),
    reportUsage: vi.fn(),
    getEntitlementsV2: vi.fn(),
    reportUsageV2: vi.fn(),
    getKmzUploadUrl: vi.fn(),
    getRunResultUploadUrl: vi.fn(),
    createProjectV2: vi.fn(),
    getProjectV2: vi.fn(),
    createRunV2: vi.fn(),
    patchProjectV2: vi.fn(),
    deleteProjectV2: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as EntitlementsClient
}

function makeWrapper(): {
  Wrapper: (props: { children: ReactNode }) => ReactNode
  queryClient: QueryClient
} {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
  return { Wrapper, queryClient }
}

beforeEach(() => {
  useProjectStore.getState().clearAll()
  useTabsStore.getState().reset()
})

describe("useDeleteProjectMutation — happy path", () => {
  it("calls deleteProjectV2 and clears all project state on success", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    useProjectStore.getState().setCurrentProject(STUB_PROJECT)
    useProjectStore.getState().setRuns([
      {
        id: "run_x",
        name: "Run 1",
        params: {},
        billedFeatureKey: "plant_layout",
        createdAt: "2026-04-30T10:05:00.000Z",
      },
    ])

    const { result } = renderHook(
      () => useDeleteProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.deleteProjectV2).toHaveBeenCalledWith(REAL_KEY, "prj_abc")
    const state = useProjectStore.getState()
    expect(state.currentProject).toBeNull()
    expect(state.runs).toEqual([])
    expect(state.project).toBeNull()
  })

  it("invalidates [entitlements, key] so projectsRemaining refreshes", async () => {
    const client = makeClient()
    const { Wrapper, queryClient } = makeWrapper()
    useProjectStore.getState().setCurrentProject(STUB_PROJECT)

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(
      () => useDeleteProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const matched = invalidateSpy.mock.calls.some((c) => {
      const arg = c[0] as { queryKey?: unknown }
      const k = arg?.queryKey
      return Array.isArray(k) && k[0] === "entitlements"
    })
    expect(matched).toBe(true)
  })

  it("does NOT clear state if the IDs don't match (stale delete)", async () => {
    // User clicked delete on project A then switched tabs to B before
    // response landed. The success shouldn't wipe project B.
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    useProjectStore.getState().setCurrentProject({
      ...STUB_PROJECT,
      id: "prj_DIFFERENT",
    })

    const { result } = renderHook(
      () => useDeleteProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(useProjectStore.getState().currentProject?.id).toBe(
      "prj_DIFFERENT"
    )
  })
})

describe("useDeleteProjectMutation — tab cleanup (SP3 / S2-02 bug 4)", () => {
  it("closes the tab carrying the deleted project's id BEFORE clearAll", async () => {
    // The race that motivated this fix: clearAll() flips currentProject
    // to null, App.tsx's tab-switch effect sees activeTabId still set
    // pointing at the deleted project, fires B12 → 404. Closing the
    // tab inside the hook before clearAll prevents the race.
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    useProjectStore.getState().setCurrentProject(STUB_PROJECT)
    const tabId = useTabsStore.getState().openTab(STUB_PROJECT.id, "Site A")

    const events: string[] = []
    const unsubProject = useProjectStore.subscribe((state, prev) => {
      if (prev.currentProject !== null && state.currentProject === null) {
        events.push("currentProject-cleared")
      }
    })
    const unsubTabs = useTabsStore.subscribe((state, prev) => {
      const wasOpen = prev.tabs.some((t) => t.id === tabId)
      const stillOpen = state.tabs.some((t) => t.id === tabId)
      if (wasOpen && !stillOpen) events.push("tab-closed")
    })

    const { result } = renderHook(
      () => useDeleteProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: STUB_PROJECT.id })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    unsubProject()
    unsubTabs()

    // Both events fired; tab-closed must come first.
    expect(events).toEqual(["tab-closed", "currentProject-cleared"])
    // Tabs slice has no orphan tab pointing at the deleted project.
    expect(
      useTabsStore.getState().tabs.find((t) => t.projectId === STUB_PROJECT.id)
    ).toBeUndefined()
  })

  it("closes orphan tabs even when currentProject is a DIFFERENT project (stale-delete case)", async () => {
    // User has projects A + B open as tabs, currently focused on B,
    // deletes A from the Recents card menu. A's tab must close even
    // though A isn't currentProject; otherwise A's tab leaks and
    // becomes a 404 magnet on next click.
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    useProjectStore.getState().setCurrentProject({
      ...STUB_PROJECT,
      id: "prj_B",
      name: "Project B",
    })
    const tabAId = useTabsStore.getState().openTab("prj_A", "Project A")
    useTabsStore.getState().openTab("prj_B", "Project B")

    const { result } = renderHook(
      () => useDeleteProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_A" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // A's tab is gone.
    expect(
      useTabsStore.getState().tabs.find((t) => t.id === tabAId)
    ).toBeUndefined()
    // B's tab is preserved.
    expect(
      useTabsStore.getState().tabs.find((t) => t.projectId === "prj_B")
    ).toBeDefined()
    // currentProject (B) untouched by stale-delete guard.
    expect(useProjectStore.getState().currentProject?.id).toBe("prj_B")
  })

  it("no-op on tabs slice when no tab carries the deleted project's id", async () => {
    // User deletes a project from RecentsView that they never opened
    // as a tab in this session. Tabs slice should be untouched.
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    useProjectStore.getState().setCurrentProject({
      ...STUB_PROJECT,
      id: "prj_OPEN",
    })
    const openTabId = useTabsStore.getState().openTab("prj_OPEN", "Open")

    const { result } = renderHook(
      () => useDeleteProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_NEVER_OPENED" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Open tab survives — wasn't pointing at the deleted project.
    expect(
      useTabsStore.getState().tabs.find((t) => t.id === openTabId)
    ).toBeDefined()
  })
})

describe("useDeleteProjectMutation — error paths", () => {
  it("propagates 404 NOT_FOUND", async () => {
    const client = makeClient({
      deleteProjectV2: vi
        .fn()
        .mockRejectedValue(
          new EntitlementsError(
            404,
            'Project "prj_x" not found',
            null,
            "NOT_FOUND"
          )
        ),
    })
    const { Wrapper } = makeWrapper()
    useProjectStore.getState().setCurrentProject(STUB_PROJECT)

    const { result } = renderHook(
      () => useDeleteProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const e = result.current.error as EntitlementsError
    expect(e.status).toBe(404)
    expect(e.code).toBe("NOT_FOUND")
    // State unchanged on failure.
    expect(useProjectStore.getState().currentProject?.id).toBe("prj_abc")
  })

  it("throws when license key is null without touching the network", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useDeleteProjectMutation(null, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.deleteProjectV2).not.toHaveBeenCalled()
  })
})

describe("useDeleteProjectMutation — preview-mode", () => {
  it("clears state in-memory only (no network call)", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    useProjectStore.getState().setCurrentProject(STUB_PROJECT)
    useProjectStore.getState().setRuns([
      {
        id: "run_x",
        name: "Run 1",
        params: {},
        billedFeatureKey: "plant_layout",
        createdAt: "2026-04-30T10:05:00.000Z",
      },
    ])

    const { result } = renderHook(
      () => useDeleteProjectMutation(PREVIEW_LICENSE_KEY_PRO_PLUS, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.deleteProjectV2).not.toHaveBeenCalled()
    const state = useProjectStore.getState()
    expect(state.currentProject).toBeNull()
    expect(state.runs).toEqual([])
  })
})
