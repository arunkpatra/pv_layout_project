/**
 * Tests for `useReportUsageMutation` — the F3 hook that ties V2 usage-
 * report to the idempotency-and-retry policy + entitlements cache
 * hydration.
 *
 * The hook integrates four moving parts:
 *   1. `client.reportUsageV2(licenseKey, feature, idempotencyKey)`
 *      from @solarlayout/entitlements-client.
 *   2. `withIdempotentRetry` (transient-vs-permanent error branching).
 *   3. `generateIdempotencyKey` (UUID v4) per `mutate()` invocation.
 *   4. TanStack Query cache hydration into the `["entitlements", key]`
 *      query so UI gating + the quota chip refresh in the same round-trip.
 *
 * Tests check each of these touch points in isolation. Real network is
 * never touched — a fake `EntitlementsClient` is passed in so the tests
 * don't depend on @tauri-apps/plugin-http, the real fetchImpl, or the
 * production base URL.
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
  type UsageReportV2Result,
} from "@solarlayout/entitlements-client"
import { useReportUsageMutation } from "./useReportUsage"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"

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
    ...overrides,
  } as EntitlementsClient
}

function makeWrapper(): {
  Wrapper: (props: { children: ReactNode }) => ReactNode
  queryClient: QueryClient
} {
  const queryClient = new QueryClient({
    defaultOptions: {
      // We exercise the hook's retry directly (via withIdempotentRetry).
      // TanStack Query's outer retry would double-count; turn it off.
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

// Always a no-op sleep so transient-retry tests don't burn timers.
const noSleep = async () => undefined

const STUB_RESULT: UsageReportV2Result = {
  recorded: true,
  remainingCalculations: 41,
  availableFeatures: [
    "plant_layout",
    "obstruction_exclusion",
    "cable_routing",
    "cable_measurements",
  ],
}

const STUB_ENTITLEMENTS: EntitlementSummaryV2 = {
  user: { name: "Test", email: "test@example.com" },
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
  availableFeatures: [
    "plant_layout",
    "obstruction_exclusion",
    "cable_routing",
    "cable_measurements",
  ],
  totalCalculations: 50,
  usedCalculations: 8,
  remainingCalculations: 42,
  projectQuota: 10,
  projectsActive: 0,
  projectsRemaining: 10,
}

describe("useReportUsageMutation — happy path", () => {
  it("calls reportUsageV2 with the license key, feature, and a fresh UUID", async () => {
    const reportUsageV2 = vi.fn().mockResolvedValue(STUB_RESULT)
    const client = makeClient({ reportUsageV2 })
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useReportUsageMutation(REAL_KEY, client, { retry: { sleep: noSleep } }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ feature: FEATURE_KEYS.CABLE_ROUTING })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(reportUsageV2).toHaveBeenCalledTimes(1)
    const [seenKey, seenFeature, seenIdempotency] =
      reportUsageV2.mock.calls[0]!
    expect(seenKey).toBe(REAL_KEY)
    expect(seenFeature).toBe(FEATURE_KEYS.CABLE_ROUTING)
    // UUID v4 shape — version digit 4, variant 8/9/a/b.
    expect(seenIdempotency).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it("hydrates the entitlements cache with refreshed availableFeatures + remainingCalculations", async () => {
    const reportUsageV2 = vi.fn().mockResolvedValue(STUB_RESULT)
    const client = makeClient({ reportUsageV2 })
    const { Wrapper, queryClient } = makeWrapper()

    queryClient.setQueryData(["entitlements", REAL_KEY], STUB_ENTITLEMENTS)

    const { result } = renderHook(
      () => useReportUsageMutation(REAL_KEY, client, { retry: { sleep: noSleep } }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ feature: FEATURE_KEYS.CABLE_ROUTING })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const updated = queryClient.getQueryData<EntitlementSummaryV2>([
      "entitlements",
      REAL_KEY,
    ])
    expect(updated).toBeDefined()
    expect(updated!.remainingCalculations).toBe(41)
    expect(updated!.availableFeatures).toContain("cable_routing")
    // usedCalculations = total - remaining = 50 - 41 = 9 (was 8, +1 debit).
    expect(updated!.usedCalculations).toBe(9)
    // Other fields untouched.
    expect(updated!.projectQuota).toBe(STUB_ENTITLEMENTS.projectQuota)
  })

  it("uses a caller-supplied idempotencyKey when provided", async () => {
    const reportUsageV2 = vi.fn().mockResolvedValue(STUB_RESULT)
    const client = makeClient({ reportUsageV2 })
    const { Wrapper } = makeWrapper()

    const fixedKey = "00000000-0000-4000-8000-000000000000"
    const { result } = renderHook(
      () => useReportUsageMutation(REAL_KEY, client, { retry: { sleep: noSleep } }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        feature: FEATURE_KEYS.PLANT_LAYOUT,
        idempotencyKey: fixedKey,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(reportUsageV2.mock.calls[0]![2]).toBe(fixedKey)
  })
})

describe("useReportUsageMutation — error paths", () => {
  it("propagates 402 PAYMENT_REQUIRED without retrying (permanent — show upsell)", async () => {
    const reportUsageV2 = vi
      .fn()
      .mockRejectedValue(
        new EntitlementsError(
          402,
          "No remaining calculations",
          null,
          "PAYMENT_REQUIRED"
        )
      )
    const client = makeClient({ reportUsageV2 })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useReportUsageMutation(REAL_KEY, client, { retry: { sleep: noSleep } }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ feature: FEATURE_KEYS.PLANT_LAYOUT })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(reportUsageV2).toHaveBeenCalledTimes(1) // no retry
    expect(result.current.error?.code).toBe("PAYMENT_REQUIRED")
  })

  it("retries transient 409 CONFLICT with the SAME idempotencyKey across attempts", async () => {
    let calls = 0
    const reportUsageV2 = vi.fn(async () => {
      calls += 1
      if (calls < 3) {
        throw new EntitlementsError(409, "race", null, "CONFLICT")
      }
      return STUB_RESULT
    })
    const client = makeClient({ reportUsageV2 })
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useReportUsageMutation(REAL_KEY, client, {
          retry: { sleep: noSleep, maxAttempts: 3 },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ feature: FEATURE_KEYS.PLANT_LAYOUT })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(reportUsageV2).toHaveBeenCalledTimes(3)
    // The same key must be threaded through each attempt — that's the
    // contract that makes retry safe (server dedupes).
    const keysAcrossAttempts = reportUsageV2.mock.calls.map(
      (args) => (args as unknown[])[2]
    )
    expect(keysAcrossAttempts[0]).toBe(keysAcrossAttempts[1])
    expect(keysAcrossAttempts[1]).toBe(keysAcrossAttempts[2])
  })

  it("returns the same response on transient retry (server idempotency)", async () => {
    // Simulates the realistic case: first attempt times out at the network
    // layer, second attempt succeeds — server returns the original
    // response because it deduped on the same key.
    let calls = 0
    const reportUsageV2 = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new EntitlementsError(0, "Failed to fetch")
      return STUB_RESULT
    })
    const client = makeClient({ reportUsageV2 })
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useReportUsageMutation(REAL_KEY, client, { retry: { sleep: noSleep } }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ feature: FEATURE_KEYS.PLANT_LAYOUT })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(STUB_RESULT)
    expect(reportUsageV2).toHaveBeenCalledTimes(2)
  })

  it("throws when the license key is null", async () => {
    const reportUsageV2 = vi.fn()
    const client = makeClient({ reportUsageV2 })
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useReportUsageMutation(null, client, { retry: { sleep: noSleep } }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ feature: FEATURE_KEYS.PLANT_LAYOUT })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(reportUsageV2).not.toHaveBeenCalled()
    expect(result.current.error?.message).toContain("missing license key")
  })
})

describe("useReportUsageMutation — preview-mode short-circuit", () => {
  let queryClient: QueryClient
  let Wrapper: (props: { children: ReactNode }) => ReactNode

  beforeEach(() => {
    const w = makeWrapper()
    queryClient = w.queryClient
    Wrapper = w.Wrapper
  })

  it("does NOT hit the V2 client for a preview license key", async () => {
    const reportUsageV2 = vi.fn()
    const client = makeClient({ reportUsageV2 })

    queryClient.setQueryData(["entitlements", PREVIEW_LICENSE_KEY_PRO_PLUS], {
      ...STUB_ENTITLEMENTS,
      remainingCalculations: 95,
      totalCalculations: 100,
      usedCalculations: 5,
    })

    const { result } = renderHook(
      () =>
        useReportUsageMutation(PREVIEW_LICENSE_KEY_PRO_PLUS, client, {
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ feature: FEATURE_KEYS.CABLE_ROUTING })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(reportUsageV2).not.toHaveBeenCalled()
    // Stub return shape — desktop's design-preview rendering can read it
    // without further branching.
    expect(result.current.data).toMatchObject({
      recorded: true,
      remainingCalculations: 94,
    })
  })

  it("decrements cached preview entitlements remainingCalculations on each call", async () => {
    const reportUsageV2 = vi.fn()
    const client = makeClient({ reportUsageV2 })

    queryClient.setQueryData(
      ["entitlements", PREVIEW_LICENSE_KEY_PRO_PLUS],
      { ...STUB_ENTITLEMENTS, remainingCalculations: 5, totalCalculations: 100 }
    )

    const { result } = renderHook(
      () =>
        useReportUsageMutation(PREVIEW_LICENSE_KEY_PRO_PLUS, client, {
          retry: { sleep: noSleep },
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ feature: FEATURE_KEYS.PLANT_LAYOUT })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const cached = queryClient.getQueryData<EntitlementSummaryV2>([
      "entitlements",
      PREVIEW_LICENSE_KEY_PRO_PLUS,
    ])
    expect(cached!.remainingCalculations).toBe(4)
    expect(cached!.usedCalculations).toBe(96) // 100 - 4
  })
})
