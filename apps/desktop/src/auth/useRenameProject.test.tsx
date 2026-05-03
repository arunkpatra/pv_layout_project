/**
 * Tests for `useRenameProjectMutation` — the P3 rename hook that wraps
 * `client.patchProjectV2(key, projectId, { name })` and reflects the
 * server's response into the desktop's `currentProject` slice.
 *
 * Single-attempt: PATCH is naturally idempotent (same body = same end
 * state), but with no idempotency key in the wire there's no benefit to
 * automatic retry. The user-facing "Rename" button is the retry surface.
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
import { useRenameProjectMutation } from "./useRenameProject"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"
import { useProjectStore } from "../state/project"

const REAL_KEY = "sl_live_real_key_for_test"

const STUB_PROJECT: ProjectV2Wire = {
  id: "prj_abc",
  userId: "usr_test1",
  name: "Original Name",
  kmzBlobUrl: "s3://b/k",
  kmzSha256: "a".repeat(64),
  edits: {},
  createdAt: "2026-04-30T10:00:00.000Z",
  updatedAt: "2026-04-30T10:00:00.000Z",
  deletedAt: null,
  parsedKmz: null,
}

const STUB_RENAMED: ProjectV2Wire = {
  ...STUB_PROJECT,
  name: "Renamed",
  updatedAt: "2026-04-30T12:30:00.000Z",
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
    patchProjectV2: vi.fn().mockResolvedValue(STUB_RENAMED),
    deleteProjectV2: vi.fn(),
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

describe("useRenameProjectMutation — happy path", () => {
  it("calls patchProjectV2 with { name } and updates currentProject", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    // Seed currentProject so the hook has something to update.
    useProjectStore.getState().setCurrentProject(STUB_PROJECT)

    const { result } = renderHook(
      () => useRenameProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc", name: "Renamed" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.patchProjectV2).toHaveBeenCalledWith(REAL_KEY, "prj_abc", {
      name: "Renamed",
    })
    expect(useProjectStore.getState().currentProject?.name).toBe("Renamed")
    expect(useProjectStore.getState().currentProject?.updatedAt).toBe(
      STUB_RENAMED.updatedAt
    )
  })

  it("preserves kmzDownloadUrl when spreading the patch response", async () => {
    // currentProject came from B12 (with kmzDownloadUrl populated). The
    // PATCH response is the lighter ProjectV2Wire (no kmzDownloadUrl).
    // Spread must keep the existing kmzDownloadUrl intact, not clobber
    // it with undefined.
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const detailFromB12 = {
      ...STUB_PROJECT,
      kmzDownloadUrl: "https://s3.example/presigned",
      runs: [],
    }
    // setCurrentProject types ProjectV2Wire, but at runtime the slice
    // accepts the wire-superset (TypeScript is fine since extra fields
    // pass through).
    useProjectStore
      .getState()
      .setCurrentProject(detailFromB12 as unknown as ProjectV2Wire)

    const { result } = renderHook(
      () => useRenameProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc", name: "Renamed" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const updated = useProjectStore.getState().currentProject as {
      kmzDownloadUrl?: string
    }
    expect(updated.kmzDownloadUrl).toBe("https://s3.example/presigned")
  })

  it("does NOT update currentProject if the IDs don't match (stale rename)", async () => {
    // Edge case: user opens project A, fires rename, switches tabs to
    // project B before response lands. The rename success shouldn't
    // overwrite project B's currentProject.
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    useProjectStore.getState().setCurrentProject({
      ...STUB_PROJECT,
      id: "prj_DIFFERENT",
    })

    const { result } = renderHook(
      () => useRenameProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc", name: "Renamed" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(useProjectStore.getState().currentProject?.id).toBe("prj_DIFFERENT")
    expect(useProjectStore.getState().currentProject?.name).toBe("Original Name")
  })
})

describe("useRenameProjectMutation — error paths", () => {
  it("propagates 404 NOT_FOUND with code populated", async () => {
    const client = makeClient({
      patchProjectV2: vi
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

    const { result } = renderHook(
      () => useRenameProjectMutation(REAL_KEY, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_x", name: "x" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const e = result.current.error as EntitlementsError
    expect(e.status).toBe(404)
    expect(e.code).toBe("NOT_FOUND")
  })

  it("throws when license key is null without touching the network", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useRenameProjectMutation(null, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc", name: "x" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.patchProjectV2).not.toHaveBeenCalled()
  })
})

describe("useRenameProjectMutation — preview-mode", () => {
  it("renames in-memory only (no network call)", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    useProjectStore.getState().setCurrentProject(STUB_PROJECT)

    const { result } = renderHook(
      () => useRenameProjectMutation(PREVIEW_LICENSE_KEY_PRO_PLUS, client),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc", name: "Preview Rename" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.patchProjectV2).not.toHaveBeenCalled()
    expect(useProjectStore.getState().currentProject?.name).toBe(
      "Preview Rename"
    )
  })
})
