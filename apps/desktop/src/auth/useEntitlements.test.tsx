/**
 * Tests for useEntitlements — TanStack Query hook + sidecar push effect.
 *
 * The hook orchestrates two flows:
 *   1. `useEntitlementsQuery(key)` — dispatch to either a preview-mode
 *      stub (no network) or the real entitlements client. The desktop's
 *      sign-in machinery in App.tsx hangs off this — a regression here
 *      silently breaks first-launch + every subsequent quota refresh.
 *   2. `useSyncEntitlementsToSidecar(ent, sidecar)` — fire-and-forget POST
 *      to /session/entitlements when entitlements arrive. Tested for the
 *      no-op short-circuits + the success POST shape + abort-on-unmount.
 *
 * Test infrastructure:
 *   - `@solarlayout/entitlements-client.createEntitlementsClient` is
 *     mocked at the import boundary so the module-level singleton in
 *     useEntitlements wraps a controllable mock client, not the real one.
 *   - `globalThis.fetch` is stubbed for the sidecar push test.
 *   - Each test wraps the hook in a fresh QueryClient with retry off so
 *     query state transitions deterministically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ReactNode } from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type {
  Entitlements,
  EntitlementSummaryV2,
} from "@solarlayout/entitlements-client"

// ---------------------------------------------------------------------------
// Mock the entitlements client at the import boundary. Vitest hoists
// `vi.mock` above the static imports below so the mock is in place when
// useEntitlements first evaluates and instantiates its module-level
// singleton via createEntitlementsClient. `vi.hoisted` lifts the
// mockClient declaration to the same hoisted scope so the factory closure
// can reference it without a temporal-dead-zone error.
// ---------------------------------------------------------------------------

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    baseUrl: "https://api.solarlayout.in",
    getEntitlements:
      vi.fn<(key: string) => Promise<Entitlements>>(),
    reportUsage: vi.fn(),
    getEntitlementsV2:
      vi.fn<(key: string) => Promise<EntitlementSummaryV2>>(),
  },
}))

vi.mock("@solarlayout/entitlements-client", async () => {
  const actual = await vi.importActual<
    typeof import("@solarlayout/entitlements-client")
  >("@solarlayout/entitlements-client")
  return {
    ...actual,
    createEntitlementsClient: vi.fn(() => mockClient),
  }
})

// Now import — must come after the vi.mock above.
import {
  useEntitlementsQuery,
  useSyncEntitlementsToSidecar,
  PREVIEW_ENTITLEMENTS_BASIC,
  PREVIEW_ENTITLEMENTS_PRO,
  PREVIEW_ENTITLEMENTS_PRO_PLUS,
} from "./useEntitlements"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"

// ---------------------------------------------------------------------------
// QueryClient wrapper — retry off for deterministic state transitions.
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

// ---------------------------------------------------------------------------
// useEntitlementsQuery
// ---------------------------------------------------------------------------

describe("useEntitlementsQuery", () => {
  beforeEach(() => {
    mockClient.getEntitlements.mockReset()
    mockClient.getEntitlementsV2.mockReset()
  })

  it("is disabled (no fetch) when licenseKey is null", () => {
    const { result } = renderHook(() => useEntitlementsQuery(null), {
      wrapper: makeWrapper(),
    })
    // `enabled: false` → idle state, no fetch attempted.
    expect(result.current.fetchStatus).toBe("idle")
    expect(result.current.data).toBeUndefined()
    expect(mockClient.getEntitlements).not.toHaveBeenCalled()
    expect(mockClient.getEntitlementsV2).not.toHaveBeenCalled()
  })

  it("returns Basic preview entitlements for the basic preview key without hitting the network", async () => {
    const { result } = renderHook(
      () => useEntitlementsQuery(PREVIEW_LICENSE_KEY_BASIC),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(PREVIEW_ENTITLEMENTS_BASIC)
    expect(mockClient.getEntitlements).not.toHaveBeenCalled()
  })

  it("returns Pro preview entitlements for the pro preview key", async () => {
    const { result } = renderHook(
      () => useEntitlementsQuery(PREVIEW_LICENSE_KEY_PRO),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(PREVIEW_ENTITLEMENTS_PRO)
  })

  it("returns Pro Plus preview entitlements for the pro plus preview key", async () => {
    const { result } = renderHook(
      () => useEntitlementsQuery(PREVIEW_LICENSE_KEY_PRO_PLUS),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(PREVIEW_ENTITLEMENTS_PRO_PLUS)
  })

  it("returns Pro Plus preview entitlements for the legacy PREVIEW_LICENSE_KEY (back-compat)", async () => {
    const { result } = renderHook(
      () => useEntitlementsQuery(PREVIEW_LICENSE_KEY),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(PREVIEW_ENTITLEMENTS_PRO_PLUS)
  })

  it("falls through to the real V2 entitlements client for a non-preview key", async () => {
    const real: EntitlementSummaryV2 = {
      user: { name: "Real User", email: "real@example.com" },
      plans: [
        {
          planName: "Basic",
          features: ["Plant Layout (MMS, Inverter, LA)"],
          totalCalculations: 5,
          usedCalculations: 1,
          remainingCalculations: 4,
        },
      ],
      licensed: true,
      availableFeatures: ["plant_layout", "obstruction_exclusion"],
      totalCalculations: 5,
      usedCalculations: 1,
      remainingCalculations: 4,
      projectQuota: 5,
      projectsActive: 0,
      projectsRemaining: 5,
    }
    mockClient.getEntitlementsV2.mockResolvedValueOnce(real)

    const { result } = renderHook(
      () => useEntitlementsQuery("sl_live_realuserkey"),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockClient.getEntitlementsV2).toHaveBeenCalledWith(
      "sl_live_realuserkey"
    )
    // V1 path NOT touched — we're V2-only on the desktop now.
    expect(mockClient.getEntitlements).not.toHaveBeenCalled()
    expect(result.current.data).toEqual(real)
  })

  it("surfaces an error from the V2 client (e.g. 401 on bad key, with code)", async () => {
    const { EntitlementsError } = await import(
      "@solarlayout/entitlements-client"
    )
    mockClient.getEntitlementsV2.mockRejectedValueOnce(
      new EntitlementsError(
        401,
        "License key not recognised.",
        null,
        "UNAUTHORIZED"
      )
    )

    const { result } = renderHook(
      () => useEntitlementsQuery("sl_live_badkey"),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.status).toBe(401)
    expect(result.current.error?.code).toBe("UNAUTHORIZED")
  })
})

// ---------------------------------------------------------------------------
// useSyncEntitlementsToSidecar
// ---------------------------------------------------------------------------

describe("useSyncEntitlementsToSidecar", () => {
  const sidecar = {
    host: "127.0.0.1",
    port: 4567,
    token: "test-sidecar-token",
  }

  let fetchMock: ReturnType<typeof vi.fn>
  // Track the AbortSignal each fetch call received so we can assert
  // unmount-driven cancellation without depending on fetch timing.
  let lastSignal: AbortSignal | undefined

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      lastSignal = init?.signal ?? undefined
      return new Response("", { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)
    lastSignal = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does nothing when entitlements is undefined", () => {
    renderHook(() => useSyncEntitlementsToSidecar(undefined, sidecar), {
      wrapper: makeWrapper(),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does nothing when sidecar is null", () => {
    renderHook(
      () => useSyncEntitlementsToSidecar(PREVIEW_ENTITLEMENTS_PRO, null),
      { wrapper: makeWrapper() }
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does nothing when sidecar.port === 0 (preview / non-Tauri runs)", () => {
    renderHook(
      () =>
        useSyncEntitlementsToSidecar(PREVIEW_ENTITLEMENTS_PRO, {
          host: "127.0.0.1",
          port: 0,
          token: "preview",
        }),
      { wrapper: makeWrapper() }
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("POSTs to /session/entitlements with the correct shape and bearer auth", async () => {
    renderHook(
      () => useSyncEntitlementsToSidecar(PREVIEW_ENTITLEMENTS_PRO, sidecar),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(
      `http://${sidecar.host}:${sidecar.port}/session/entitlements`
    )
    expect(init?.method).toBe("POST")
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${sidecar.token}`
    )
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    )
    const body = JSON.parse(init?.body as string)
    expect(body).toEqual({
      available_features: PREVIEW_ENTITLEMENTS_PRO.availableFeatures,
      plan_name: PREVIEW_ENTITLEMENTS_PRO.plans[0]!.planName,
    })
  })

  it("aborts the in-flight request on unmount", async () => {
    const { unmount } = renderHook(
      () => useSyncEntitlementsToSidecar(PREVIEW_ENTITLEMENTS_PRO, sidecar),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(lastSignal?.aborted).toBe(false)
    unmount()
    expect(lastSignal?.aborted).toBe(true)
  })
})
