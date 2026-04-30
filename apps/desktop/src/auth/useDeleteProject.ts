/**
 * useDeleteProjectMutation — P3 soft-delete hook.
 *
 *   client.deleteProjectV2(key, projectId)        → 204 No Content
 *     → onSuccess: clearAll() the project slice (both currentProject
 *       and the parity-era project), invalidate ["entitlements", key]
 *       (frees a quota slot server-side; the chip refreshes).
 *
 * Single-attempt: a successful first-then-failed-second retry would
 * surface 404 for an already-deleted project — worst-case UX. The
 * Delete confirm modal is the retry surface; the hook propagates as-is.
 *
 * Stale-delete guard: only resets the slice if `currentProject.id` ===
 * `vars.projectId` at completion. Mid-flight tab switches don't wipe
 * an unrelated project's state.
 *
 * Preview keys: clears in-memory state only (no backend call). Lets
 * design-review flows exercise the delete UX without a real backend.
 *
 * NOTE on canvas reset: deleting drops the canvas back to the empty
 * state. The parity-era `useLayoutResultStore` / `useLayoutParamsStore`
 * resets are App.tsx's responsibility (it owns the form-key bump and
 * other transient panel state); this hook only touches the project
 * slice + entitlements query. Callers who need a full canvas reset
 * should hook those resets via the mutation's `onSuccess` callback at
 * the call site.
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

const ENTITLEMENTS_QUERY_KEY = "entitlements" as const

const PREVIEW_KEYS = new Set<string>([
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
])

function isPreviewKey(licenseKey: string): boolean {
  return PREVIEW_KEYS.has(licenseKey)
}

export interface DeleteProjectVars {
  projectId: string
}

export function useDeleteProjectMutation(
  licenseKey: string | null,
  client: EntitlementsClient
): UseMutationResult<void, Error, DeleteProjectVars> {
  const queryClient = useQueryClient()

  return useMutation<void, Error, DeleteProjectVars>({
    mutationFn: async (vars) => {
      if (!licenseKey) {
        throw new EntitlementsError(0, "missing license key")
      }
      if (isPreviewKey(licenseKey)) {
        // No backend call — returns immediately, onSuccess does the
        // in-memory state reset same as the real path.
        return
      }
      await client.deleteProjectV2(licenseKey, vars.projectId)
    },
    onSuccess: (_, vars) => {
      const cur = useProjectStore.getState().currentProject
      // Stale-delete guard: only reset if the response matches the
      // project still in focus.
      if (cur?.id === vars.projectId) {
        useProjectStore.getState().clearAll()
      }
      if (licenseKey) {
        void queryClient.invalidateQueries({
          queryKey: [ENTITLEMENTS_QUERY_KEY, licenseKey],
        })
      }
    },
  })
}
