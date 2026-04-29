/**
 * Tests for `useCreateProjectMutation` — the P1 hook that orchestrates
 * the new-project flow:
 *
 *   bytes → uploadKmzToS3 (B6 + S3 PUT) → createProjectV2 (B11) → wire row
 *
 * Verified contracts:
 *   - Single-attempt POST (no retry — B11 isn't idempotent and a duplicate
 *     create would burn an extra quota slot).
 *   - 402 PAYMENT_REQUIRED surfaces with `code` populated so the App can
 *     branch into the upsell modal without parsing the message string.
 *   - Successful create invalidates the entitlements query so
 *     `projectsActive`/`projectsRemaining` refresh in the UI.
 *   - Preview-license-key short-circuit: never hits the network, returns
 *     a synthetic ProjectV2Wire and decrements cached preview quota.
 *   - Upload failure (S3UploadError) propagates through the same mutation
 *     `onError` path, so the App can handle "couldn't upload" and
 *     "couldn't create" with one error surface.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type EntitlementSummaryV2,
  type ProjectV2Wire,
} from "@solarlayout/entitlements-client"
import { useCreateProjectMutation } from "./useCreateProject"
import { S3UploadError } from "./s3upload"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"

const REAL_KEY = "sl_live_real_key_for_test"

const SAMPLE_SHA =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"

const STUB_PROJECT: ProjectV2Wire = {
  id: "prj_abc123",
  userId: "usr_test1",
  name: "Site A",
  kmzBlobUrl: `s3://solarlayout-local-projects/projects/usr_test1/kmz/${SAMPLE_SHA}.kmz`,
  kmzSha256: SAMPLE_SHA,
  edits: {},
  createdAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z",
  deletedAt: null,
}

const STUB_ENTITLEMENTS: EntitlementSummaryV2 = {
  user: { name: "Test", email: "test@example.com" },
  plans: [
    {
      planName: "Pro",
      features: [],
      totalCalculations: 50,
      usedCalculations: 0,
      remainingCalculations: 50,
    },
  ],
  licensed: true,
  availableFeatures: ["plant_layout"],
  totalCalculations: 50,
  usedCalculations: 0,
  remainingCalculations: 50,
  projectQuota: 10,
  projectsActive: 2,
  projectsRemaining: 8,
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
    getKmzUploadUrl: vi.fn().mockResolvedValue({
      uploadUrl: "https://s3.example/presigned",
      blobUrl: STUB_PROJECT.kmzBlobUrl,
      expiresAt: "2026-04-30T12:15:00.000Z",
    }),
    getRunResultUploadUrl: vi.fn(),
    createProjectV2: vi.fn().mockResolvedValue(STUB_PROJECT),
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

// Stub fetch for the S3 PUT step inside uploadKmzToS3 — always succeeds
// here unless a test overrides it.
function s3OkFetch(): typeof fetch {
  return (async () => new Response("", { status: 200 })) as unknown as typeof fetch
}

const SAMPLE_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]) // PK header

describe("useCreateProjectMutation — happy path", () => {
  it("orchestrates B6 mint → S3 PUT → B11 create and returns the new project", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useCreateProjectMutation(REAL_KEY, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        bytes: SAMPLE_BYTES,
        name: "Site A",
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.getKmzUploadUrl).toHaveBeenCalledTimes(1)
    expect(client.createProjectV2).toHaveBeenCalledTimes(1)

    const [seenKey, body] = (
      client.createProjectV2 as ReturnType<typeof vi.fn>
    ).mock.calls[0]!
    expect(seenKey).toBe(REAL_KEY)
    expect(body.name).toBe("Site A")
    expect(body.kmzBlobUrl).toBe(STUB_PROJECT.kmzBlobUrl)
    expect(body.kmzSha256).toMatch(/^[0-9a-f]{64}$/)

    expect(result.current.data?.id).toBe("prj_abc123")
  })

  it("invalidates the entitlements query on success so projectsActive refreshes", async () => {
    const client = makeClient()
    const { Wrapper, queryClient } = makeWrapper()

    queryClient.setQueryData(["entitlements", REAL_KEY], STUB_ENTITLEMENTS)
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(
      () =>
        useCreateProjectMutation(REAL_KEY, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ bytes: SAMPLE_BYTES, name: "Site A" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The hook invalidates ["entitlements", licenseKey] specifically (or
    // the broader ["entitlements"] root). Either is acceptable; we just
    // need the cache to know it's stale.
    expect(invalidateSpy).toHaveBeenCalled()
    const calls = invalidateSpy.mock.calls
    const matched = calls.some((c) => {
      const arg = c[0] as { queryKey?: unknown }
      const k = arg?.queryKey
      return Array.isArray(k) && k[0] === "entitlements"
    })
    expect(matched).toBe(true)
  })

  it("uses the provided name verbatim (no derivation from filename)", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useCreateProjectMutation(REAL_KEY, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({
        bytes: SAMPLE_BYTES,
        name: "Custom Project Name",
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [, body] = (
      client.createProjectV2 as ReturnType<typeof vi.fn>
    ).mock.calls[0]!
    expect(body.name).toBe("Custom Project Name")
  })
})

describe("useCreateProjectMutation — error paths", () => {
  it("propagates 402 PAYMENT_REQUIRED with code populated (App branches into upsell)", async () => {
    const client = makeClient({
      createProjectV2: vi
        .fn()
        .mockRejectedValue(
          new EntitlementsError(
            402,
            "Project quota exhausted (3/3). Delete a project or upgrade your plan to add more.",
            null,
            "PAYMENT_REQUIRED"
          )
        ),
    })
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useCreateProjectMutation(REAL_KEY, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ bytes: SAMPLE_BYTES, name: "Site A" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeInstanceOf(EntitlementsError)
    const e = result.current.error as EntitlementsError
    expect(e.status).toBe(402)
    expect(e.code).toBe("PAYMENT_REQUIRED")
    expect(client.createProjectV2).toHaveBeenCalledTimes(1) // no retry
  })

  it("does NOT invalidate the entitlements cache on 402 (state didn't change)", async () => {
    const client = makeClient({
      createProjectV2: vi
        .fn()
        .mockRejectedValue(
          new EntitlementsError(402, "exhausted", null, "PAYMENT_REQUIRED")
        ),
    })
    const { Wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(["entitlements", REAL_KEY], STUB_ENTITLEMENTS)
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(
      () =>
        useCreateProjectMutation(REAL_KEY, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ bytes: SAMPLE_BYTES, name: "Site A" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const matched = invalidateSpy.mock.calls.some((c) => {
      const arg = c[0] as { queryKey?: unknown }
      const k = arg?.queryKey
      return Array.isArray(k) && k[0] === "entitlements"
    })
    expect(matched).toBe(false)
  })

  it("propagates an upload-stage S3UploadError without calling createProjectV2", async () => {
    const failingFetch: typeof fetch = (async () =>
      new Response("EXPIRED", { status: 403 })) as unknown as typeof fetch

    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useCreateProjectMutation(REAL_KEY, client, {
          fetchImpl: failingFetch,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ bytes: SAMPLE_BYTES, name: "Site A" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeInstanceOf(S3UploadError)
    expect(client.createProjectV2).not.toHaveBeenCalled()
  })

  it("throws when license key is null without touching the network", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () =>
        useCreateProjectMutation(null, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ bytes: SAMPLE_BYTES, name: "Site A" })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getKmzUploadUrl).not.toHaveBeenCalled()
    expect(client.createProjectV2).not.toHaveBeenCalled()
  })
})

describe("useCreateProjectMutation — preview-mode short-circuit", () => {
  let queryClient: QueryClient
  let Wrapper: (props: { children: ReactNode }) => ReactNode

  beforeEach(() => {
    const w = makeWrapper()
    queryClient = w.queryClient
    Wrapper = w.Wrapper
  })

  it("does NOT hit the V2 client for a preview license key", async () => {
    const client = makeClient()
    queryClient.setQueryData(["entitlements", PREVIEW_LICENSE_KEY_PRO_PLUS], {
      ...STUB_ENTITLEMENTS,
      projectQuota: 15,
      projectsActive: 0,
      projectsRemaining: 15,
    })

    const { result } = renderHook(
      () =>
        useCreateProjectMutation(PREVIEW_LICENSE_KEY_PRO_PLUS, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ bytes: SAMPLE_BYTES, name: "Preview Site" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.getKmzUploadUrl).not.toHaveBeenCalled()
    expect(client.createProjectV2).not.toHaveBeenCalled()
    expect(result.current.data?.name).toBe("Preview Site")
    expect(result.current.data?.id).toMatch(/^prj_/)
  })

  it("decrements cached preview projectsRemaining on each successful create", async () => {
    const client = makeClient()
    queryClient.setQueryData(["entitlements", PREVIEW_LICENSE_KEY_PRO_PLUS], {
      ...STUB_ENTITLEMENTS,
      projectQuota: 15,
      projectsActive: 0,
      projectsRemaining: 15,
    })

    const { result } = renderHook(
      () =>
        useCreateProjectMutation(PREVIEW_LICENSE_KEY_PRO_PLUS, client, {
          fetchImpl: s3OkFetch(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate({ bytes: SAMPLE_BYTES, name: "Preview Site" })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const cached = queryClient.getQueryData<EntitlementSummaryV2>([
      "entitlements",
      PREVIEW_LICENSE_KEY_PRO_PLUS,
    ])
    expect(cached!.projectsActive).toBe(1)
    expect(cached!.projectsRemaining).toBe(14)
  })
})
