/**
 * useAddRoadMutation — TanStack Query mutation for POST /add-road (S11).
 *
 * Appends a user-drawn obstruction (WGS84 ring) to the boundary's
 * placed_roads and reruns LA + inverter placement. Returns the updated
 * LayoutResult which replaces `layoutResult[boundaryIndex]` in the
 * Zustand slice on success.
 *
 * The caller (App.tsx's onRectCommit) also pushes the obstruction onto
 * `editingState.undoStack` when this mutation succeeds, matching
 * ADR-0006's "only server-ack'd obstructions enter undoStack" rule.
 */
import { useMutation, type UseMutationResult } from "@tanstack/react-query"
import type {
  LayoutParameters,
  LayoutResult,
  RoadInput,
  SidecarClient,
  SidecarError,
} from "@solarlayout/sidecar-client"
import { _replaceBoundaryResultForS11 as replaceBoundaryResult } from "./useRefreshInvertersMutation"
import { makeProbe } from "../canvas/debug"

const log = makeProbe("sidecar")

export interface AddRoadVariables {
  boundaryIndex: number
  result: LayoutResult
  params: LayoutParameters
  road: RoadInput
}

export function useAddRoadMutation(
  sidecar: SidecarClient | null
): UseMutationResult<LayoutResult, SidecarError, AddRoadVariables> {
  return useMutation<LayoutResult, SidecarError, AddRoadVariables>({
    mutationFn: async ({ result, params, road }) => {
      if (!sidecar) throw new Error("Sidecar not ready") as SidecarError
      log("sidecar", "POST /add-road start", {
        roadType: road.road_type,
        vertices: road.coords_wgs84.length,
      })
      const t = performance.now()
      const response = await sidecar.addRoad({ result, params, road })
      log("sidecar", "POST /add-road end", {
        ms: Math.round(performance.now() - t),
      })
      return response
    },
    onSuccess: (newResult, { boundaryIndex }) => {
      replaceBoundaryResult(boundaryIndex, newResult)
    },
  })
}
