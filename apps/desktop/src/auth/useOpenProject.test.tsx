/**
 * Tests for `useOpenProjectMutation` — the P2 hook that orchestrates
 * the open-existing-project flow:
 *
 *   B12 GET /v2/projects/:id → ProjectDetail
 *      → fetch(detail.kmzDownloadUrl)        → bytes
 *      → returns { detail, bytes }
 *
 * The sidecar /parse-kmz step + setCurrentProject + setRuns are App.tsx's
 * orchestration job (mirrors P1's split-of-responsibility); the hook just
 * does the network round-trips.
 *
 * Verified contracts:
 *   - Single-attempt B12 + S3 GET; no retry (a 403 EXPIRED_URL means re-
 *     calling B12 from the caller for a fresh URL).
 *   - 404 NOT_FOUND from B12 propagates with `code: "NOT_FOUND"` populated
 *     so the App can surface a "project not found" overlay.
 *   - kmzDownloadUrl=null (S3 bucket env unset on backend) propagates as
 *     a typed S3DownloadError-like error rather than crashing the fetch.
 *   - Preview-license-key short-circuit: throws — the desktop's preview
 *     mode can't open existing backend projects (no real backend in
 *     headless / vite preview runs).
 */
import { describe, it, expect, vi } from "vitest"
import type { ReactNode } from "react"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type ProjectDetailV2Wire,
} from "@solarlayout/entitlements-client"
import { useOpenProjectMutation } from "./useOpenProject"
import { S3DownloadError } from "./s3upload"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"

const REAL_KEY = "sl_live_real_key_for_test"

const SAMPLE_SHA =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"

const STUB_DETAIL: ProjectDetailV2Wire = {
  id: "prj_abc",
  userId: "usr_test1",
  name: "Site A",
  kmzBlobUrl: `s3://b/projects/usr_test1/kmz/${SAMPLE_SHA}.kmz`,
  kmzSha256: SAMPLE_SHA,
  edits: {},
  createdAt: "2026-04-30T10:00:00.000Z",
  updatedAt: "2026-04-30T10:00:00.000Z",
  deletedAt: null,
  kmzDownloadUrl: "https://s3.example/presigned",
  runs: [
    {
      id: "run_1",
      name: "Run 1",
      params: {},
      billedFeatureKey: "plant_layout",
      createdAt: "2026-04-30T10:05:00.000Z",
    },
  ],
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
    getProjectV2: vi.fn().mockResolvedValue(STUB_DETAIL),
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

const SAMPLE_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

function s3OkFetch(): typeof fetch {
  return (async () =>
    new Response(SAMPLE_BYTES.slice().buffer, {
      status: 200,
    })) as unknown as typeof fetch
}

describe("useOpenProjectMutation — happy path", () => {
  it("fetches B12 and returns { detail, bytes }", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useOpenProjectMutation(REAL_KEY, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.getProjectV2).toHaveBeenCalledTimes(1)
    expect(client.getProjectV2).toHaveBeenCalledWith(REAL_KEY, "prj_abc")
    expect(result.current.data?.detail.id).toBe("prj_abc")
    expect(result.current.data?.detail.runs).toHaveLength(1)
    expect(result.current.data?.bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(result.current.data!.bytes)).toEqual([
      0x50, 0x4b, 0x03, 0x04,
    ])
  })

  it("hits the URL from detail.kmzDownloadUrl with GET (no Authorization)", async () => {
    let seenUrl = ""
    let seenAuth: string | null = ""
    let seenMethod = ""
    const fetchImpl = vi.fn(async (url, init) => {
      seenUrl = String(url)
      seenAuth = new Headers(init?.headers).get("authorization")
      seenMethod = init?.method ?? "GET"
      return new Response(SAMPLE_BYTES.slice().buffer, { status: 200 })
    }) as unknown as typeof fetch

    const client = makeClient()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useOpenProjectMutation(REAL_KEY, client, { fetchImpl }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(seenUrl).toBe(STUB_DETAIL.kmzDownloadUrl)
    expect(seenAuth).toBeNull()
    expect(seenMethod).toBe("GET")
  })
})

describe("useOpenProjectMutation — error paths", () => {
  it("propagates 404 NOT_FOUND from B12 with code populated", async () => {
    const client = makeClient({
      getProjectV2: vi
        .fn()
        .mockRejectedValue(
          new EntitlementsError(
            404,
            'Project "prj_missing" not found',
            null,
            "NOT_FOUND"
          )
        ),
    })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useOpenProjectMutation(REAL_KEY, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_missing" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const e = result.current.error as EntitlementsError
    expect(e.status).toBe(404)
    expect(e.code).toBe("NOT_FOUND")
  })

  it("rejects with S3DownloadError-like error when kmzDownloadUrl is null", async () => {
    // Backend returns null when MVP_S3_PROJECTS_BUCKET is unset (local dev
    // without S3). The desktop must NOT try to fetch null — surface a
    // meaningful error instead.
    const client = makeClient({
      getProjectV2: vi.fn().mockResolvedValue({
        ...STUB_DETAIL,
        kmzDownloadUrl: null,
      }),
    })
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useOpenProjectMutation(REAL_KEY, client, { fetchImpl }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const e = result.current.error as Error
    expect(e.message).toMatch(/kmz.*not.*available/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("propagates 403 EXPIRED_URL from S3 GET as S3DownloadError", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("Forbidden", { status: 403 })
    ) as unknown as typeof fetch
    const client = makeClient()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useOpenProjectMutation(REAL_KEY, client, { fetchImpl }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeInstanceOf(S3DownloadError)
    const e = result.current.error as S3DownloadError
    expect(e.kind).toBe("EXPIRED_URL")
  })

  it("throws when license key is null without touching the network", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useOpenProjectMutation(null, client, { fetchImpl: s3OkFetch() }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getProjectV2).not.toHaveBeenCalled()
  })

  it("rejects on a preview license key (no backend in preview mode)", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useOpenProjectMutation(PREVIEW_LICENSE_KEY_PRO_PLUS, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_abc" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getProjectV2).not.toHaveBeenCalled()
    expect(result.current.error?.message).toMatch(/preview/i)
  })
})
