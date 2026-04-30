/**
 * useDeleteRunMutation — P9 soft-delete a run (B18).
 *
 *   client.deleteRunV2(key, projectId, runId)  → 204 No Content
 *      → onSuccess: removeRun(runId) from the project slice
 *      → if selectedRunId === runId: clear selection + clear layoutResult
 *      → entitlements NOT invalidated (calc count is preserved per
 *        backend's contract — soft-delete doesn't refund the original
 *        UsageRecord)
 *
 * Single-attempt — same reasoning as P3's useDeleteProject. Re-deleting
 * a soft-deleted run returns 404; auto-retry would surface that as a
 * spurious error after a successful first call. The user-facing button
 * (delete-selected from the gallery header) is the retry surface.
 *
 * Preview-license-key short-circuit removes from the slice in-memory
 * only, no network call.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
} from "@solarlayout/entitlements-client"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"
import { useProjectStore } from "../state/project"
import { useLayoutResultStore } from "../state/layoutResult"

const PREVIEW_KEYS = new Set<string>([
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
])

function isPreviewKey(licenseKey: string): boolean {
  return PREVIEW_KEYS.has(licenseKey)
}

export interface DeleteRunVars {
  projectId: string
  runId: string
}

export function useDeleteRunMutation(
  licenseKey: string | null,
  client: EntitlementsClient
): UseMutationResult<void, Error, DeleteRunVars> {
  const queryClient = useQueryClient()

  return useMutation<void, Error, DeleteRunVars>({
    mutationFn: async (vars) => {
      if (!licenseKey) {
        throw new EntitlementsError(0, "missing license key")
      }
      if (isPreviewKey(licenseKey)) {
        return // in-memory only; onSuccess does the slice update
      }
      await client.deleteRunV2(licenseKey, vars.projectId, vars.runId)
    },
    onSuccess: (_, vars) => {
      const projectStore = useProjectStore.getState()
      projectStore.removeRun(vars.runId)
      // If the deleted run was the active one (driving the canvas's
      // current layout), clear both the selection AND the layout
      // result. The user lands on a "no run selected" canvas; clicking
      // a different run picks up from there.
      const layoutStore = useLayoutResultStore.getState()
      if (layoutStore.resultRunId === vars.runId) {
        layoutStore.clearResult()
      }
      // `removeRun` already nulls selectedRunId if the removed run was
      // the selected one (slice invariant), so no extra work needed
      // for selection bookkeeping.
      // RecentsView's B10 listing carries `runsCount` and (when the
      // deleted run was the most-recent) `lastRunAt` +
      // `mostRecentRunThumbnailBlobUrl`. Invalidate so the next Home
      // visit reflects the soft-delete. Entitlements stays untouched
      // — backend preserves the UsageRecord, no calc refund.
      if (licenseKey) {
        void queryClient.invalidateQueries({
          queryKey: ["projects", licenseKey],
        })
      }
    },
  })
}
