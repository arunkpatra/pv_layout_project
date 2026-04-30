/**
 * Tests for `useOpenRunMutation` — the P7 hook that loads an older
 * run's layout result onto the canvas.
 *
 *   B17 GET /v2/projects/:id/runs/:runId  → RunDetail
 *      → fetch(detail.layoutResultBlobUrl) → layout JSON bytes
 *      → JSON.parse → LayoutResult[]
 *      → onSuccess: setResult + selectedRunId carried through
 *
 * Verified contracts:
 *   - Single-attempt (B17 + S3 GET; no retry — same reasoning as P2's
 *     useOpenProject: a 403 EXPIRED_URL means re-call B17 for fresh)
 *   - Null `layoutResultBlobUrl` (S3 unset on backend, OR blob not yet
 *     uploaded) surfaces a typed S3DownloadError-like error
 *   - 404 NOT_FOUND from B17 propagates with `code` populated
 *   - Preview-license-key short-circuit (no real backend → no run to
 *     load; design preview never has runs anyway)
 *   - Null license key fails fast without touching the network
 *   - Hydrates `useLayoutResultStore` with both the layout AND the
 *     `runId` so subsequent selectedRunId effects skip redundant
 *     re-fetches
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type RunDetailV2Wire,
} from "@solarlayout/entitlements-client"
import type { LayoutResult } from "@solarlayout/sidecar-client"
import { useOpenRunMutation } from "./useOpenRun"
import { S3DownloadError } from "./s3upload"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"
import { useLayoutResultStore } from "../state/layoutResult"

const REAL_KEY = "sl_live_real_key_for_test"

const STUB_DETAIL: RunDetailV2Wire = {
  id: "run_abc",
  projectId: "prj_xyz",
  name: "Layout @ A",
  params: {},
  inputsSnapshot: {},
  billedFeatureKey: "plant_layout",
  usageRecordId: "ur_q",
  createdAt: "2026-04-30T12:00:00.000Z",
  deletedAt: null,
  layoutResultBlobUrl: "https://s3.example/presigned-layout",
  energyResultBlobUrl: null,
  exportsBlobUrls: [],
}

const STUB_LAYOUT_RESULT: LayoutResult[] = [
  {
    boundary_name: "phaseboundary2",
    boundary_polygon_wgs84: [],
    tables: [],
    icrs: [],
    string_inverters: [],
    dc_cables: [],
    ac_cables: [],
    las: [],
    summary: {
      table_count: 0,
      module_count: 0,
      total_dc_kwp: 0,
      icr_count: 0,
      string_inverter_count: 0,
      la_count: 0,
    },
  } as unknown as LayoutResult,
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
    listProjectsV2: vi.fn(),
    getRunV2: vi.fn().mockResolvedValue(STUB_DETAIL),
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

function s3JsonFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
    })) as unknown as typeof fetch
}

beforeEach(() => {
  useLayoutResultStore.getState().clearResult()
})

describe("useOpenRunMutation — happy path", () => {
  it("fetches B17 and hydrates layoutResultStore with the run id", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useOpenRunMutation(REAL_KEY, client, {
          fetchImpl: s3JsonFetch(STUB_LAYOUT_RESULT),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_xyz", runId: "run_abc" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.getRunV2).toHaveBeenCalledWith(REAL_KEY, "prj_xyz", "run_abc")
    const slice = useLayoutResultStore.getState()
    expect(slice.result).toEqual(STUB_LAYOUT_RESULT)
    expect(slice.resultRunId).toBe("run_abc")
  })

  it("hits the URL from detail.layoutResultBlobUrl with GET (no auth)", async () => {
    let seenUrl = ""
    let seenAuth: string | null = ""
    let seenMethod = ""
    const fetchImpl = vi.fn(async (url, init) => {
      seenUrl = String(url)
      seenAuth = new Headers(init?.headers).get("authorization")
      seenMethod = init?.method ?? "GET"
      return new Response(JSON.stringify(STUB_LAYOUT_RESULT), { status: 200 })
    }) as unknown as typeof fetch

    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useOpenRunMutation(REAL_KEY, client, { fetchImpl }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_xyz", runId: "run_abc" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(seenUrl).toBe(STUB_DETAIL.layoutResultBlobUrl)
    expect(seenAuth).toBeNull()
    expect(seenMethod).toBe("GET")
  })
})

describe("useOpenRunMutation — error paths", () => {
  it("rejects when layoutResultBlobUrl is null (S3 unset OR blob never uploaded)", async () => {
    const client = makeClient({
      getRunV2: vi
        .fn()
        .mockResolvedValue({ ...STUB_DETAIL, layoutResultBlobUrl: null }),
    })
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useOpenRunMutation(REAL_KEY, client, { fetchImpl }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_x", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(fetchImpl).not.toHaveBeenCalled()
    const e = result.current.error as Error
    expect(e.message).toMatch(/result.*not.*available/i)
  })

  it("propagates 404 NOT_FOUND from B17 with code populated", async () => {
    const client = makeClient({
      getRunV2: vi
        .fn()
        .mockRejectedValue(
          new EntitlementsError(
            404,
            'Run "run_x" not found',
            null,
            "NOT_FOUND"
          )
        ),
    })
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useOpenRunMutation(REAL_KEY, client, {
          fetchImpl: s3JsonFetch(STUB_LAYOUT_RESULT),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_x", runId: "run_x" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const e = result.current.error as EntitlementsError
    expect(e.status).toBe(404)
    expect(e.code).toBe("NOT_FOUND")
  })

  it("propagates S3 GET 403 EXPIRED_URL as S3DownloadError", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("Forbidden", { status: 403 })
    ) as unknown as typeof fetch
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useOpenRunMutation(REAL_KEY, client, { fetchImpl }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_x", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeInstanceOf(S3DownloadError)
    const e = result.current.error as S3DownloadError
    expect(e.kind).toBe("EXPIRED_URL")
  })

  it("rejects on a preview license key", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useOpenRunMutation(PREVIEW_LICENSE_KEY_PRO_PLUS, client, {
          fetchImpl: s3JsonFetch(STUB_LAYOUT_RESULT),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_x", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getRunV2).not.toHaveBeenCalled()
  })

  it("throws when license key is null without touching the network", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useOpenRunMutation(null, client, {
          fetchImpl: s3JsonFetch(STUB_LAYOUT_RESULT),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ projectId: "prj_x", runId: "run_a" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getRunV2).not.toHaveBeenCalled()
  })
})
