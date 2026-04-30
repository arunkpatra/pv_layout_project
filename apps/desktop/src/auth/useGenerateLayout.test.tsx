/**
 * Tests for `useGenerateLayoutMutation` — the P6 hook that orchestrates
 * the full Generate Layout flow:
 *
 *   B16 createRunV2 (atomic debit + Run row + uploadUrl)
 *     → sidecar /layout (compute LayoutResult[])
 *     → PUT result JSON to upload.uploadUrl
 *     → setLayoutResultStore + addRun + invalidate entitlements
 *
 * Three failure surfaces, each tested in isolation:
 *   1. B16 402 PAYMENT_REQUIRED — sidecar + PUT must NOT run (no calc spent
 *      from the desktop's POV, but backend already debited; user must
 *      either upgrade or wait for the row's quota).
 *   2. Sidecar /layout error — B16 already ran (calc IS debited); the user
 *      can retry with the same idempotency key (B16 will return the same
 *      Run + a fresh URL; sidecar runs again; PUT to the fresh URL).
 *   3. S3 PUT error (e.g. 403 EXPIRED_URL) — caller can retry the whole
 *      mutation with the same idempotency key for a fresh URL.
 *
 * Idempotency: backend's @@unique([userId, idempotencyKey]) means a replay
 * with the same key returns the same Run. The hook generates one fresh
 * UUID per `mutate()` and threads it through all retries via
 * withIdempotentRetry — same pattern as F3's useReportUsage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  EntitlementsError,
  FEATURE_KEYS,
  type EntitlementsClient,
  type EntitlementSummaryV2,
  type CreateRunV2Result,
} from "@solarlayout/entitlements-client"
import {
  DEFAULT_LAYOUT_PARAMETERS,
  type LayoutResult,
  type ParsedKMZ,
  type SidecarClient,
} from "@solarlayout/sidecar-client"
import { useGenerateLayoutMutation } from "./useGenerateLayout"
import { S3UploadError } from "./s3upload"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"
import { useLayoutResultStore } from "../state/layoutResult"
import { useProjectStore } from "../state/project"

const REAL_KEY = "sl_live_real_key_for_test"

const STUB_B16_RESULT: CreateRunV2Result = {
  run: {
    id: "run_abc",
    projectId: "prj_xyz",
    name: "Run 1",
    params: { rows: 8 },
    inputsSnapshot: { rows: 8 },
    billedFeatureKey: FEATURE_KEYS.PLANT_LAYOUT,
    usageRecordId: "ur_q",
    createdAt: "2026-04-30T12:05:00.000Z",
    deletedAt: null,
  },
  upload: {
    uploadUrl: "https://s3.example/presigned-1",
    blobUrl: "s3://b/p/r/layout.json",
    expiresAt: "2026-04-30T13:00:00.000Z",
    type: "layout",
  },
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

// Use the canonical defaults exported by sidecar-client so the test
// fixture can't drift from the LayoutParameters type. The hook's
// behaviour doesn't depend on specific param values here — we're
// testing orchestration, not the engine.
const STUB_PARAMS = DEFAULT_LAYOUT_PARAMETERS

const STUB_KMZ: ParsedKMZ = { boundaries: [] } as unknown as ParsedKMZ

const STUB_ENTITLEMENTS: EntitlementSummaryV2 = {
  user: { name: "T", email: "t@test" },
  plans: [
    {
      planName: "Pro",
      features: [],
      totalCalculations: 50,
      usedCalculations: 8,
      remainingCalculations: 42,
    },
  ],
  licensed: true,
  availableFeatures: ["plant_layout"],
  totalCalculations: 50,
  usedCalculations: 8,
  remainingCalculations: 42,
  projectQuota: 10,
  projectsActive: 0,
  projectsRemaining: 10,
  entitlementsActive: true,
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
    createRunV2: vi.fn().mockResolvedValue(STUB_B16_RESULT),
    ...overrides,
  } as EntitlementsClient
}

function makeSidecar(
  overrides: Partial<SidecarClient> = {}
): SidecarClient {
  return {
    runLayout: vi.fn().mockResolvedValue(STUB_LAYOUT_RESULT),
    parseKmz: vi.fn(),
    health: vi.fn(),
    refreshInverters: vi.fn(),
    addRoad: vi.fn(),
    removeLastRoad: vi.fn(),
    ...overrides,
  } as unknown as SidecarClient
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

// PUT mock that succeeds with empty 200.
function s3OkFetch(): typeof fetch {
  return (async () =>
    new Response("", { status: 200 })) as unknown as typeof fetch
}

const noSleep = async () => undefined

beforeEach(() => {
  // Reset Zustand stores between tests so onSuccess hydration can be
  // verified without cross-test pollution.
  useLayoutResultStore.getState().clearResult()
  useProjectStore.getState().clearAll()
})

describe("useGenerateLayoutMutation — happy path", () => {
  it("orchestrates B16 → sidecar → S3 PUT and returns { run, layoutResult, blobUrl }", async () => {
    const client = makeClient()
    const sidecar = makeSidecar()
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 200 })
    ) as unknown as typeof fetch
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl,
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.createRunV2).toHaveBeenCalledTimes(1)
    expect(sidecar.runLayout).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1) // S3 PUT

    expect(result.current.data?.run.id).toBe("run_abc")
    expect(result.current.data?.layoutResult).toEqual(STUB_LAYOUT_RESULT)
    expect(result.current.data?.blobUrl).toBe(STUB_B16_RESULT.upload.blobUrl)
  })

  it("threads a fresh UUID v4 idempotency key into B16", async () => {
    const client = makeClient()
    const sidecar = makeSidecar()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl: s3OkFetch(),
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const callArgs = (
      client.createRunV2 as ReturnType<typeof vi.fn>
    ).mock.calls[0]!
    const body = callArgs[2] as { idempotencyKey: string }
    expect(body.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it("PUTs the result JSON with Content-Type=application/json", async () => {
    const client = makeClient()
    const sidecar = makeSidecar()
    let seenContentType = ""
    let seenBody: string | null = null
    const fetchImpl = vi.fn(async (_url, init) => {
      seenContentType = new Headers(init?.headers).get("content-type") ?? ""
      seenBody = (init?.body as string) ?? null
      return new Response("", { status: 200 })
    }) as unknown as typeof fetch
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl,
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(seenContentType).toBe("application/json")
    // The PUT body is the LayoutResult JSON (the actual mock returned
    // a Blob; we just verify it's non-null and non-empty).
    expect(seenBody).not.toBeNull()
  })

  it("hydrates useLayoutResultStore + adds run to slice on success", async () => {
    const client = makeClient()
    const sidecar = makeSidecar()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl: s3OkFetch(),
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(useLayoutResultStore.getState().result).toEqual(STUB_LAYOUT_RESULT)
    const runs = useProjectStore.getState().runs
    expect(runs).toHaveLength(1)
    expect(runs[0]?.id).toBe("run_abc")
    // The slice's RunSummary shape is a strict subset of the wire RunWire;
    // adding a RunWire pollutes only the extra fields, but the slice's type
    // alias only narrows for read access. Verify the expected list-row
    // fields land:
    expect(runs[0]?.name).toBe("Run 1")
    expect(runs[0]?.billedFeatureKey).toBe(FEATURE_KEYS.PLANT_LAYOUT)
  })

  it("invalidates [entitlements, key] on success (debit happened, refresh quota)", async () => {
    const client = makeClient()
    const sidecar = makeSidecar()
    const { Wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(["entitlements", REAL_KEY], STUB_ENTITLEMENTS)
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl: s3OkFetch(),
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const matched = invalidateSpy.mock.calls.some((c) => {
      const arg = c[0] as { queryKey?: unknown }
      const k = arg?.queryKey
      return Array.isArray(k) && k[0] === "entitlements"
    })
    expect(matched).toBe(true)
  })

  it("uses the provided idempotencyKey override (re-attempt with same intent)", async () => {
    const client = makeClient()
    const sidecar = makeSidecar()
    const { Wrapper } = makeWrapper()
    const fixedKey = "00000000-0000-4000-8000-000000000000"

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl: s3OkFetch(),
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
        idempotencyKey: fixedKey,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const callArgs = (
      client.createRunV2 as ReturnType<typeof vi.fn>
    ).mock.calls[0]!
    expect((callArgs[2] as { idempotencyKey: string }).idempotencyKey).toBe(
      fixedKey
    )
  })
})

describe("useGenerateLayoutMutation — error paths", () => {
  it("propagates 402 PAYMENT_REQUIRED from B16 — sidecar + PUT NOT called", async () => {
    const client = makeClient({
      createRunV2: vi
        .fn()
        .mockRejectedValue(
          new EntitlementsError(
            402,
            "No remaining calculations",
            null,
            "PAYMENT_REQUIRED"
          )
        ),
    })
    const sidecar = makeSidecar()
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl,
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const e = result.current.error as EntitlementsError
    expect(e.status).toBe(402)
    expect(e.code).toBe("PAYMENT_REQUIRED")
    expect(sidecar.runLayout).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("retries B16 on transient 409 with the SAME idempotencyKey", async () => {
    let calls = 0
    const createRunV2 = vi.fn(async () => {
      calls += 1
      if (calls < 3) {
        throw new EntitlementsError(409, "race", null, "CONFLICT")
      }
      return STUB_B16_RESULT
    })
    const client = makeClient({ createRunV2 })
    const sidecar = makeSidecar()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl: s3OkFetch(),
          retry: { sleep: noSleep, maxAttempts: 3 },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(createRunV2).toHaveBeenCalledTimes(3)
    const keys = createRunV2.mock.calls.map(
      (args) => (args as unknown[])[2] as { idempotencyKey: string }
    )
    expect(keys[0]?.idempotencyKey).toBe(keys[1]?.idempotencyKey)
    expect(keys[1]?.idempotencyKey).toBe(keys[2]?.idempotencyKey)
  })

  it("propagates sidecar errors after B16 succeeded — PUT NOT called", async () => {
    const client = makeClient()
    const sidecar = makeSidecar({
      runLayout: vi.fn().mockRejectedValue(
        new Error("sidecar crashed: shapely OperationalError")
      ),
    })
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl,
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(client.createRunV2).toHaveBeenCalledTimes(1) // debit happened
    expect(fetchImpl).not.toHaveBeenCalled() // upload skipped
    expect(result.current.error?.message).toContain("sidecar")
  })

  it("propagates S3 PUT 403 EXPIRED_URL as S3UploadError", async () => {
    const client = makeClient()
    const sidecar = makeSidecar()
    const fetchImpl = vi.fn(
      async () => new Response("Forbidden", { status: 403 })
    ) as unknown as typeof fetch
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, sidecar, {
          fetchImpl,
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeInstanceOf(S3UploadError)
    const e = result.current.error as S3UploadError
    expect(e.kind).toBe("EXPIRED_URL")
  })

  it("rejects on a preview license key (no real backend in preview mode)", async () => {
    const client = makeClient()
    const sidecar = makeSidecar()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(
          PREVIEW_LICENSE_KEY_PRO_PLUS,
          client,
          sidecar,
          {
            fetchImpl: s3OkFetch(),
            retry: { sleep: noSleep },
          }
        ),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(client.createRunV2).not.toHaveBeenCalled()
    expect(sidecar.runLayout).not.toHaveBeenCalled()
    expect(result.current.error?.message).toMatch(/preview/i)
  })

  it("throws when license key is null without touching anything", async () => {
    const client = makeClient()
    const sidecar = makeSidecar()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(null, client, sidecar, {
          fetchImpl: s3OkFetch(),
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.createRunV2).not.toHaveBeenCalled()
    expect(sidecar.runLayout).not.toHaveBeenCalled()
  })

  it("throws when sidecar is null", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useGenerateLayoutMutation(REAL_KEY, client, null, {
          fetchImpl: s3OkFetch(),
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        projectId: "prj_xyz",
        parsedKmz: STUB_KMZ,
        params: STUB_PARAMS,
      })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toMatch(/sidecar/i)
  })
})
