/**
 * useRefreshInvertersMutation — TanStack Query mutation for POST
 * /refresh-inverters (S11).
 *
 * Two call patterns:
 *   1. Plain refresh — no icr_override; re-runs LA + inverter placement
 *      for the target boundary. Unused directly by S11 (App.tsx's
 *      /add-road and /remove-road handlers already trigger a full
 *      recompute via their own endpoints), kept for completeness + S12
 *      export flows that might want to ensure freshness.
 *   2. Move-an-ICR — pass `icrOverride` to apply a WGS84 ICR move in
 *      the same round-trip.
 *
 * Single-boundary operation: mutation takes `boundaryIndex` + the
 * relevant LayoutResult + params. On success, replaces
 * `layoutResult[boundaryIndex]` in the Zustand slice. For multi-
 * boundary drags the caller fires multiple mutations in sequence (not
 * a Phase-2 concern — phaseboundary2 is single-boundary).
 */
import { useMutation, type UseMutationResult } from "@tanstack/react-query"
import type {
  IcrOverrideWgs84,
  LayoutParameters,
  LayoutResult,
  SidecarClient,
  SidecarError,
} from "@solarlayout/sidecar-client"
import { useLayoutResultStore } from "./layoutResult"
import { makeProbe } from "../canvas/debug"

const log = makeProbe("sidecar")

export interface RefreshInvertersVariables {
  boundaryIndex: number
  result: LayoutResult
  params: LayoutParameters
  icrOverride?: IcrOverrideWgs84
}

export function useRefreshInvertersMutation(
  sidecar: SidecarClient | null
): UseMutationResult<LayoutResult, SidecarError, RefreshInvertersVariables> {
  return useMutation<LayoutResult, SidecarError, RefreshInvertersVariables>({
    mutationFn: async ({ result, params, icrOverride }) => {
      if (!sidecar) throw new Error("Sidecar not ready") as SidecarError
      log("sidecar", "POST /refresh-inverters start", {
        icrOverride: icrOverride?.icr_index,
      })
      const t = performance.now()
      const response = await sidecar.refreshInverters({
        result,
        params,
        ...(icrOverride ? { icr_override: icrOverride } : {}),
      })
      log("sidecar", "POST /refresh-inverters end", {
        ms: Math.round(performance.now() - t),
      })
      return response
    },
    onSuccess: (newResult, { boundaryIndex }) => {
      replaceBoundaryResult(boundaryIndex, newResult)
    },
  })
}

/**
 * Shared helper across all three S11 mutations: replace
 * `layoutResult[boundaryIndex]` without touching other boundaries.
 *
 * Why not just `setResult([newResult])`? Multi-boundary KMZs: the
 * client may update only one boundary and the others should stay
 * unchanged. The sidecar already operates per-boundary; client
 * preserves that.
 */
function replaceBoundaryResult(
  boundaryIndex: number,
  newResult: LayoutResult
): void {
  const prev = useLayoutResultStore.getState().result
  if (!prev) {
    // No existing result to replace — unusual, log and do a blind set
    // so the UI still moves forward rather than freezing.
    log.error("replaceBoundaryResult: no existing layout result", {
      boundaryIndex,
    })
    useLayoutResultStore.getState().setResult([newResult])
    return
  }
  if (boundaryIndex < 0 || boundaryIndex >= prev.length) {
    log.error("replaceBoundaryResult: boundaryIndex out of range", {
      boundaryIndex,
      have: prev.length,
    })
    return
  }
  const next = [...prev]
  next[boundaryIndex] = newResult
  useLayoutResultStore.getState().setResult(next)
}

export { replaceBoundaryResult as _replaceBoundaryResultForS11 }
