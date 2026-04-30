/**
 * Tests for `useDeleteRunMutation` — P9 soft-delete hook (B18).
 * Removes the run from the project slice + clears the active selection
 * if the deleted run was active.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
} from "@solarlayout/entitlements-client"
import { useDeleteRunMutation } from "./useDeleteRun"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"
import { useProjectStore } from "../state/project"
import { useLayoutResultStore } from "../state/layoutResult"
import type { LayoutResult } from "@solarlayout/sidecar-client"

const REAL_KEY = "sl_live_real_key_for_test"

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
    deleteProjectV2: vi.fn(),
    listProjectsV2: vi.fn(),
    getRunV2: vi.fn(),
    deleteRunV2: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as EntitlementsClient
}

function makeWrapper(): { Wrapper: (p: { children: ReactNode }) => ReactNode } {
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
  return { Wrapper }
}

beforeEach(() => {
  useProjectStore.getState().clearAll()
  useLayoutResultStore.getState().clearResult()
  useProjectStore.getState().setRuns([
    {
      id: "run_a",
      name: "A",
      params: {},
      billedFeatureKey: "plant_layout",
      createdAt: "2026-04-30T10:00:00.000Z",
    },
    {
      id: "run_b",
      name: "B",
      params: {},
      billedFeatureKey: "plant_layout",
      createdAt: "2026-04-30T11:00:00.000Z",
    },
  ])
})

describe("useDeleteRunMutation — happy path", () => {
  it("calls deleteRunV2 and removes the run from the slice", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useDeleteRunMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_xyz", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.deleteRunV2).toHaveBeenCalledWith(REAL_KEY, "prj_xyz", "run_a")
    const runs = useProjectStore.getState().runs
    expect(runs.map((r) => r.id)).toEqual(["run_b"])
  })

  it("clears selectedRunId if the deleted run was active", async () => {
    useProjectStore.getState().selectRun("run_a")
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useDeleteRunMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_xyz", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(useProjectStore.getState().selectedRunId).toBeNull()
  })

  it("clears layoutResult if the deleted run was producing it", async () => {
    useProjectStore.getState().selectRun("run_a")
    useLayoutResultStore.getState().setResult([] as LayoutResult[], "run_a")
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useDeleteRunMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_xyz", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(useLayoutResultStore.getState().result).toBeNull()
    expect(useLayoutResultStore.getState().resultRunId).toBeNull()
  })

  it("does NOT clear selectedRunId when a DIFFERENT run is deleted", async () => {
    useProjectStore.getState().selectRun("run_a") // keep this active
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useDeleteRunMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_xyz", runId: "run_b" }) // different
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(useProjectStore.getState().selectedRunId).toBe("run_a")
  })
})

describe("useDeleteRunMutation — error paths", () => {
  it("propagates 404 NOT_FOUND without removing from slice", async () => {
    const client = makeClient({
      deleteRunV2: vi
        .fn()
        .mockRejectedValue(
          new EntitlementsError(404, "Not found", null, "NOT_FOUND")
        ),
    })
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useDeleteRunMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_x", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const e = result.current.error as EntitlementsError
    expect(e.status).toBe(404)
    // Slice unchanged on failure.
    expect(useProjectStore.getState().runs).toHaveLength(2)
  })

  it("throws when license key is null", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useDeleteRunMutation(null, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_x", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.deleteRunV2).not.toHaveBeenCalled()
  })
})

describe("useDeleteRunMutation — preview-mode", () => {
  it("removes from slice in-memory only (no network call)", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useDeleteRunMutation(PREVIEW_LICENSE_KEY_PRO_PLUS, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_x", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.deleteRunV2).not.toHaveBeenCalled()
    expect(useProjectStore.getState().runs.map((r) => r.id)).toEqual(["run_b"])
  })
})
