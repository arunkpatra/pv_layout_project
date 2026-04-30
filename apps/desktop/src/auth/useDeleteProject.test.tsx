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
