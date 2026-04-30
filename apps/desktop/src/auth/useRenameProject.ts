/**
 * useRenameProjectMutation — P3 rename hook.
 *
 *   client.patchProjectV2(key, projectId, { name })
 *     → returns updated ProjectV2Wire (lighter shape — no kmzDownloadUrl)
 *     → onSuccess: spread into currentProject (preserve kmzDownloadUrl
 *       and any other B12-only fields by spreading on top of the
 *       existing slice value)
 *
 * Single-attempt: PATCH is body-deterministic so retries would be safe,
 * but with no idempotency key in the wire there's no advantage to
 * automatic retry. The user-facing rename UX is the retry surface.
 *
 * Stale-rename guard: if `currentProject.id !== vars.projectId` by the
 * time the response lands (e.g. user switched tabs mid-flight), skip
 * the slice update — the response is for a project that's no longer
 * in focus.
 *
 * Preview keys: rename in-memory only (mirror the same UX without a
 * backend round-trip; design previews can exercise rename without S3).
 */
import { useMutation } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type ProjectV2Wire,
} from "@solarlayout/entitlements-client"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"
import { useProjectStore } from "../state/project"

const PREVIEW_KEYS = new Set<string>([
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
])

function isPreviewKey(licenseKey: string): boolean {
  return PREVIEW_KEYS.has(licenseKey)
}

export interface RenameProjectVars {
  projectId: string
  /** New name. Backend caps at 200 chars; the client schema rejects
   *  empty + over-cap so the wire never sees malformed values. */
  name: string
}

export function useRenameProjectMutation(
  licenseKey: string | null,
  client: EntitlementsClient
): UseMutationResult<ProjectV2Wire, Error, RenameProjectVars> {
  return useMutation<ProjectV2Wire, Error, RenameProjectVars>({
    mutationFn: async (vars) => {
      if (!licenseKey) {
        throw new EntitlementsError(0, "missing license key")
      }

      if (isPreviewKey(licenseKey)) {
        // In-memory preview rename — synthesise a wire row from the
        // current slice value so onSuccess's spread still does the
        // right thing.
        const cur = useProjectStore.getState().currentProject
        const now = new Date().toISOString()
        return {
          id: vars.projectId,
          userId: cur?.userId ?? "usr_preview",
          name: vars.name,
          kmzBlobUrl: cur?.kmzBlobUrl ?? "s3://preview/k",
          kmzSha256: cur?.kmzSha256 ?? "0".repeat(64),
          edits: cur?.edits ?? {},
          createdAt: cur?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        }
      }

      return client.patchProjectV2(licenseKey, vars.projectId, {
        name: vars.name,
      })
    },
    onSuccess: (updated, vars) => {
      const cur = useProjectStore.getState().currentProject
      // Stale-rename guard: only update if the response is for the
      // project still in focus. Mid-flight tab switches happen.
      if (cur?.id !== vars.projectId) return
      // Spread on top of the existing slice value so any B12-only fields
      // (kmzDownloadUrl, runs[]) survive the lighter PATCH response.
      useProjectStore.getState().setCurrentProject({ ...cur, ...updated })
    },
  })
}
