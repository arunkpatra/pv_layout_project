/**
 * Tests for `useProjectsListQuery` — read-only TanStack Query wrapper
 * around `client.listProjectsV2(key)` (B10). Powers the S3 recents grid.
 *
 * Verified contracts:
 *   - Disabled when licenseKey is null (no auto-fetch on the no-license
 *     splash).
 *   - Preview-license-key short-circuits to an empty list — design
 *     preview never has projects.
 *   - Real key triggers the V2 client; resolved data flows through.
 *   - 401 propagates as EntitlementsError.
 */
import { describe, it, expect, vi } from "vitest"
import type { ReactNode } from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type ProjectSummaryListRowV2,
} from "@solarlayout/entitlements-client"
import { useProjectsListQuery } from "./useProjectsList"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"

const REAL_KEY = "sl_live_real_key_for_test"

const STUB_LIST: ProjectSummaryListRowV2[] = [
  {
    id: "prj_a",
    name: "First",
    kmzBlobUrl: "s3://b/k1",
    kmzSha256: "a".repeat(64),
    createdAt: "2026-04-30T09:00:00.000Z",
    updatedAt: "2026-04-30T11:00:00.000Z",
    runsCount: 2,
    lastRunAt: "2026-04-30T11:00:00.000Z",
    mostRecentRunThumbnailBlobUrl: null,
  },
  {
    id: "prj_b",
    name: "Second",
    kmzBlobUrl: "s3://b/k2",
    kmzSha256: "b".repeat(64),
    createdAt: "2026-04-30T08:00:00.000Z",
    updatedAt: "2026-04-30T08:00:00.000Z",
    runsCount: 0,
    lastRunAt: null,
    mostRecentRunThumbnailBlobUrl: null,
  },
]

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
    listProjectsV2: vi.fn().mockResolvedValue(STUB_LIST),
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

describe("useProjectsListQuery", () => {
  it("returns the project list on success", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(() => useProjectsListQuery(REAL_KEY, client), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.listProjectsV2).toHaveBeenCalledWith(REAL_KEY)
    expect(result.current.data).toEqual(STUB_LIST)
  })

  it("disables the query when licenseKey is null", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(() => useProjectsListQuery(null, client), {
      wrapper: Wrapper,
    })

    // No fetch; the query stays in pending-but-disabled state.
    expect(client.listProjectsV2).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe("idle")
  })

  it("returns an empty list for a preview license key (no real backend)", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useProjectsListQuery(PREVIEW_LICENSE_KEY_PRO_PLUS, client),
      { wrapper: Wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.listProjectsV2).not.toHaveBeenCalled()
    expect(result.current.data).toEqual([])
  })

  it("propagates 401 UNAUTHORIZED via EntitlementsError", async () => {
    const client = makeClient({
      listProjectsV2: vi
        .fn()
        .mockRejectedValue(
          new EntitlementsError(401, "Bad key", null, "UNAUTHORIZED")
        ),
    })
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(() => useProjectsListQuery(REAL_KEY, client), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const e = result.current.error as EntitlementsError
    expect(e.status).toBe(401)
    expect(e.code).toBe("UNAUTHORIZED")
  })
})
