/**
 * Tests for `useAutoSaveProject` — debounced PATCH of project edits.
 *
 * The hook watches `(projectId, edits)` and fires a B13 PATCH after
 * `debounceMs` of idle (default 2000ms). Tests use vitest's fake
 * timers to drive the debounce deterministically.
 *
 * Verified contracts:
 *   - First mount with edits captures the baseline (no save — that
 *     state was just loaded from B12, no need to round-trip it back).
 *   - Edits change → debounce → PATCH; status reflects each phase.
 *   - Rapid changes within debounce → only the LAST value is saved
 *     (debounce coalesces, doesn't queue).
 *   - Project switch → cancel any pending save + reset baseline.
 *   - Unchanged edits don't trigger save (re-render no-op).
 *   - PATCH error surfaces in status (UI shows "save failed" toast).
 *   - Null projectId / null licenseKey / preview keys — no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ReactNode } from "react"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type ProjectV2Wire,
} from "@solarlayout/entitlements-client"
import { useAutoSaveProject } from "./useAutoSaveProject"
import { PREVIEW_LICENSE_KEY_PRO_PLUS } from "./licenseKey"
import {
  EMPTY_EDITS,
  editsFromUndoStack,
  type ProjectEdits,
} from "../state/projectEdits"

const REAL_KEY = "sl_live_real_key_for_test"

const STUB_PATCHED: ProjectV2Wire = {
  id: "prj_abc",
  userId: "usr_test1",
  name: "Site A",
  kmzBlobUrl: "s3://b/k",
  kmzSha256: "a".repeat(64),
  edits: {},
  createdAt: "2026-04-30T10:00:00.000Z",
  updatedAt: "2026-04-30T12:30:00.000Z",
  deletedAt: null,
  parsedKmz: null,
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
    patchProjectV2: vi.fn().mockResolvedValue(STUB_PATCHED),
    deleteProjectV2: vi.fn(),
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

const editsA: ProjectEdits = editsFromUndoStack([
  {
    roadType: "rectangle",
    coordsWgs84: [
      [77.5, 12.9],
      [77.6, 12.9],
      [77.6, 13.0],
      [77.5, 13.0],
    ],
    serverAck: true,
  },
])

const editsB: ProjectEdits = editsFromUndoStack([
  ...editsA.obstructions.map((o) => ({
    roadType: o.roadType,
    coordsWgs84: o.coordsWgs84.map(
      ([lng, lat]) => [lng, lat] as [number, number]
    ),
    serverAck: true as const,
  })),
  {
    roadType: "polygon",
    coordsWgs84: [
      [77.55, 12.95],
      [77.58, 12.96],
      [77.57, 12.99],
    ],
    serverAck: true,
  },
])

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useAutoSaveProject — baseline + idle", () => {
  it("does NOT save on first mount with the just-loaded edits (B12 baseline)", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    renderHook(
      () => useAutoSaveProject(REAL_KEY, client, "prj_abc", editsA),
      { wrapper: Wrapper }
    )

    // Advance past the debounce window — nothing should fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(client.patchProjectV2).not.toHaveBeenCalled()
  })

  it("idle status when projectId is null", () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useAutoSaveProject(REAL_KEY, client, null, null),
      { wrapper: Wrapper }
    )
    expect(result.current.kind).toBe("idle")
  })
})

describe("useAutoSaveProject — debounced save", () => {
  it("fires PATCH after debounce when edits change", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { rerender } = renderHook(
      ({ edits }: { edits: ProjectEdits }) =>
        useAutoSaveProject(REAL_KEY, client, "prj_abc", edits, {
          debounceMs: 100,
        }),
      { wrapper: Wrapper, initialProps: { edits: editsA } }
    )

    // Baseline captured. Now change edits.
    rerender({ edits: editsB })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(client.patchProjectV2).not.toHaveBeenCalled() // still in debounce

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60)
    })
    // After 100ms+ → fired.
    expect(client.patchProjectV2).toHaveBeenCalledTimes(1)
    expect(client.patchProjectV2).toHaveBeenCalledWith(REAL_KEY, "prj_abc", {
      edits: editsB,
    })
  })

  it("coalesces rapid changes — only the LAST edits get saved", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { rerender } = renderHook(
      ({ edits }: { edits: ProjectEdits }) =>
        useAutoSaveProject(REAL_KEY, client, "prj_abc", edits, {
          debounceMs: 100,
        }),
      { wrapper: Wrapper, initialProps: { edits: editsA } }
    )

    rerender({ edits: editsB })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    // Within the debounce window, change again — earlier timer should
    // be cancelled.
    const editsC = { ...editsB, obstructions: [...editsB.obstructions] }
    editsC.obstructions[0] = {
      ...editsC.obstructions[0]!,
      coordsWgs84: [[78, 13]],
    }
    rerender({ edits: editsC })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(client.patchProjectV2).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60)
    })
    expect(client.patchProjectV2).toHaveBeenCalledTimes(1)
    expect(client.patchProjectV2).toHaveBeenCalledWith(REAL_KEY, "prj_abc", {
      edits: editsC,
    })
  })

  it("does NOT save when edits are unchanged (rendering noise)", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { rerender } = renderHook(
      ({ edits }: { edits: ProjectEdits }) =>
        useAutoSaveProject(REAL_KEY, client, "prj_abc", edits, {
          debounceMs: 100,
        }),
      { wrapper: Wrapper, initialProps: { edits: editsA } }
    )

    // Re-render with the *same* content, new identity.
    rerender({ edits: { ...editsA, obstructions: [...editsA.obstructions] } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(client.patchProjectV2).not.toHaveBeenCalled()
  })

  it("status reflects saving → saved", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { result, rerender } = renderHook(
      ({ edits }: { edits: ProjectEdits }) =>
        useAutoSaveProject(REAL_KEY, client, "prj_abc", edits, {
          debounceMs: 100,
        }),
      { wrapper: Wrapper, initialProps: { edits: editsA } }
    )
    expect(result.current.kind).toBe("idle")

    rerender({ edits: editsB })
    // Status flips to "saving" once the effect runs (synchronously
    // when editsJson differs from baseline, before the timer even
    // schedules — see the hook's setStatus("saving") + setTimeout).
    expect(result.current.kind).toBe("saving")

    // Advance past the debounce + flush the microtask queue from the
    // resolved mock — `advanceTimersByTimeAsync` does both in order.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110)
    })
    expect(result.current.kind).toBe("saved")
  })
})

describe("useAutoSaveProject — project switch", () => {
  it("cancels a pending save when projectId changes", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { rerender } = renderHook(
      ({
        projectId,
        edits,
      }: {
        projectId: string
        edits: ProjectEdits
      }) =>
        useAutoSaveProject(REAL_KEY, client, projectId, edits, {
          debounceMs: 100,
        }),
      {
        wrapper: Wrapper,
        initialProps: { projectId: "prj_A", edits: editsA },
      }
    )

    // Schedule a save for prj_A
    rerender({ projectId: "prj_A", edits: editsB })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    // Switch to prj_B mid-debounce → previous timer must be cancelled.
    rerender({ projectId: "prj_B", edits: editsA })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    // No save should fire — prj_A was cancelled, prj_B's editsA is the
    // baseline (just-loaded).
    expect(client.patchProjectV2).not.toHaveBeenCalled()
  })

  it("captures new baseline on project switch (next change saves to NEW project)", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { rerender } = renderHook(
      ({
        projectId,
        edits,
      }: {
        projectId: string
        edits: ProjectEdits
      }) =>
        useAutoSaveProject(REAL_KEY, client, projectId, edits, {
          debounceMs: 100,
        }),
      {
        wrapper: Wrapper,
        initialProps: { projectId: "prj_A", edits: editsA },
      }
    )

    // Switch to prj_B with empty baseline.
    rerender({ projectId: "prj_B", edits: EMPTY_EDITS })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })

    // Now change in prj_B — should save to prj_B (not prj_A).
    rerender({ projectId: "prj_B", edits: editsA })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(client.patchProjectV2).toHaveBeenCalledTimes(1)
    expect(client.patchProjectV2).toHaveBeenCalledWith(REAL_KEY, "prj_B", {
      edits: editsA,
    })
  })
})

describe("useAutoSaveProject — error path", () => {
  it("surfaces save failures in status", async () => {
    const client = makeClient({
      patchProjectV2: vi
        .fn()
        .mockRejectedValue(
          new EntitlementsError(0, "Failed to fetch", null, undefined)
        ),
    })
    const { Wrapper } = makeWrapper()

    const { result, rerender } = renderHook(
      ({ edits }: { edits: ProjectEdits }) =>
        useAutoSaveProject(REAL_KEY, client, "prj_abc", edits, {
          debounceMs: 100,
        }),
      { wrapper: Wrapper, initialProps: { edits: editsA } }
    )

    rerender({ edits: editsB })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })

    expect(result.current.kind).toBe("error")
    if (result.current.kind === "error") {
      expect(result.current.error.message).toContain("Failed to fetch")
    }
  })
})

describe("useAutoSaveProject — auth gates", () => {
  it("never fires PATCH when licenseKey is null", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { rerender } = renderHook(
      ({ edits }: { edits: ProjectEdits }) =>
        useAutoSaveProject(null, client, "prj_abc", edits, { debounceMs: 50 }),
      { wrapper: Wrapper, initialProps: { edits: editsA } }
    )
    rerender({ edits: editsB })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(client.patchProjectV2).not.toHaveBeenCalled()
  })

  it("never fires PATCH on a preview license key", async () => {
    const client = makeClient()
    const { Wrapper } = makeWrapper()

    const { rerender } = renderHook(
      ({ edits }: { edits: ProjectEdits }) =>
        useAutoSaveProject(
          PREVIEW_LICENSE_KEY_PRO_PLUS,
          client,
          "prj_abc",
          edits,
          { debounceMs: 50 }
        ),
      { wrapper: Wrapper, initialProps: { edits: editsA } }
    )
    rerender({ edits: editsB })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(client.patchProjectV2).not.toHaveBeenCalled()
  })
})
