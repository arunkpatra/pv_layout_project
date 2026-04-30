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
 * slice + tabs slice + entitlements query. Callers who need a full
 * canvas reset should hook those resets via the mutation's `onSuccess`
 * callback at the call site.
 *
 * SP3 / S2-02 bug 4 fix — post-delete tab cleanup is folded INTO the
 * onSuccess BEFORE clearAll(). Previously this was App.tsx's
 * responsibility post-mutation, which raced against the tab-switch
 * effect: clearAll() flipped currentProject to null first, the effect
 * re-fired against the stale tab.projectId, B12 returned 404, and the
 * user saw a "project not found" overlay before App.tsx reached its
 * tabsCloseTab call. Closing the tab inside the hook (before clearAll)
 * means by the time currentProject changes, the tab carrying the
 * deleted ID is already gone and the effect either lands on a sibling
 * tab or on null (Recents view) — never on a 404.
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
import { useTabsStore } from "../state/tabs"

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
      // SP3 / S2-02 bug 4 — close any tab pointing at the deleted
      // project BEFORE clearing the project slice. This must run for
      // BOTH the in-focus and stale-delete cases: a delete fired from
      // the Recents card menu may target a project that isn't the
      // active tab (the user may have a different project open while
      // deleting an old one from the Recents grid). Closing only when
      // currentProject matches would leak orphan tabs.
      const tabsState = useTabsStore.getState()
      const orphaned = tabsState.tabs.filter(
        (t) => t.projectId === vars.projectId
      )
      for (const tab of orphaned) tabsState.closeTab(tab.id)

      const cur = useProjectStore.getState().currentProject
      // Stale-delete guard: only reset the project slice if the
      // response matches the project still in focus.
      if (cur?.id === vars.projectId) {
        useProjectStore.getState().clearAll()
      }
      if (licenseKey) {
        void queryClient.invalidateQueries({
          queryKey: [ENTITLEMENTS_QUERY_KEY, licenseKey],
        })
        // S3 recents grid drops the deleted project from the list.
        void queryClient.invalidateQueries({
          queryKey: ["projects", licenseKey],
        })
      }
    },
  })
}
