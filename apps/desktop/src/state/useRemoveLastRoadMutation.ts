/**
 * useRemoveLastRoadMutation — TanStack Query mutation for POST
 * /remove-road (S11).
 *
 * Pops `placed_roads[-1]` (legacy "Undo Last" button semantics) and
 * reruns LA + inverter placement. Returns the updated LayoutResult
 * which replaces `layoutResult[boundaryIndex]` in the Zustand slice.
 *
 * The caller (App.tsx's Undo Last handler) also pops the corresponding
 * entry from `editingState.undoStack` after success so the client's
 * stack stays in sync with the sidecar's `placed_roads`.
 *
 * The sidecar 422s if `placed_roads` is empty; the caller should guard
 * this before calling (button disabled when undoStack empty). Keeping
 * the 422 is belt-and-braces for stack desync.
 */
import { useMutation, type UseMutationResult } from "@tanstack/react-query"
import type {
  LayoutParameters,
  LayoutResult,
  SidecarClient,
  SidecarError,
} from "@solarlayout/sidecar-client"
import { _replaceBoundaryResultForS11 as replaceBoundaryResult } from "./useRefreshInvertersMutation"
import { makeProbe } from "../canvas/debug"

const log = makeProbe("sidecar")

export interface RemoveLastRoadVariables {
  boundaryIndex: number
  result: LayoutResult
  params: LayoutParameters
}

export function useRemoveLastRoadMutation(
  sidecar: SidecarClient | null
): UseMutationResult<LayoutResult, SidecarError, RemoveLastRoadVariables> {
  return useMutation<LayoutResult, SidecarError, RemoveLastRoadVariables>({
    mutationFn: async ({ result, params }) => {
      if (!sidecar) throw new Error("Sidecar not ready") as SidecarError
      log("sidecar", "POST /remove-road start")
      const t = performance.now()
      const response = await sidecar.removeLastRoad({ result, params })
      log("sidecar", "POST /remove-road end", {
        ms: Math.round(performance.now() - t),
      })
      return response
    },
    onSuccess: (newResult, { boundaryIndex }) => {
      replaceBoundaryResult(boundaryIndex, newResult)
    },
  })
}
