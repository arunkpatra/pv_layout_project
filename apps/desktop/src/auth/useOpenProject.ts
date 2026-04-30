/**
 * useOpenProjectMutation — TanStack Query wrapper around the P2 open-
 * existing-project flow:
 *
 *   B12 GET /v2/projects/:id → ProjectDetail
 *      → fetch(detail.kmzDownloadUrl)        → bytes
 *      → returns { detail, bytes }
 *
 * Why a hook (not just a function call):
 *   The flow is asynchronous + has multiple failure surfaces (B12 404
 *   vs S3 403 vs S3 5xx vs null kmzDownloadUrl), so wrapping it in a
 *   TanStack Query mutation gives the caller standard {isPending,
 *   isSuccess, isError, error} branches without hand-rolling state.
 *
 * Why no retry:
 *   B12 is a read; S3 GET is a presigned read. A 403 EXPIRED_URL means
 *   the URL aged past TTL (~1h) — the right recovery is to re-call the
 *   hook (which will mint a fresh URL via B12), not to bang on the
 *   stale URL. A network 5xx is rare on S3; the caller can retry the
 *   user-facing button. Fail-fast keeps the hook's behaviour predictable.
 *
 * Why split orchestration with App.tsx:
 *   Mirrors P1's split. The hook handles the network round-trips; the
 *   App orchestrates sidecar /parse-kmz + state hydration (setProject /
 *   setCurrentProject / setRuns / etc.). Keeps the hook testable
 *   without dragging the sidecar client into the test surface.
 *
 * Preview license keys:
 *   The desktop's preview mode has no real backend, so opening an
 *   existing-on-server project doesn't make sense. The hook throws
 *   loudly on preview keys rather than synthesising fake state — design
 *   review will only ever exercise the new-project flow (P1) which has
 *   a synthetic preview branch.
 */
import { useMutation } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type ProjectDetailV2Wire,
} from "@solarlayout/entitlements-client"
import {
  downloadKmzFromS3,
  S3DownloadError,
  type FetchLike,
} from "./s3upload"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"

const PREVIEW_KEYS = new Set<string>([
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
])

function isPreviewKey(licenseKey: string): boolean {
  return PREVIEW_KEYS.has(licenseKey)
}

export interface OpenProjectVars {
  projectId: string
}

export interface OpenProjectResult {
  detail: ProjectDetailV2Wire
  /** Raw KMZ bytes ready for the sidecar /parse-kmz step. */
  bytes: Uint8Array
}

export interface UseOpenProjectMutationOptions {
  /** Fetch implementation override for the S3 GET step (tests, Tauri). */
  fetchImpl?: FetchLike
}

export function useOpenProjectMutation(
  licenseKey: string | null,
  client: EntitlementsClient,
  options: UseOpenProjectMutationOptions = {}
): UseMutationResult<OpenProjectResult, Error, OpenProjectVars> {
  return useMutation<OpenProjectResult, Error, OpenProjectVars>({
    mutationFn: async (vars) => {
      if (!licenseKey) {
        throw new EntitlementsError(0, "missing license key")
      }
      if (isPreviewKey(licenseKey)) {
        throw new Error(
          "Open-existing-project is unsupported in preview mode (no backend)."
        )
      }

      const detail = await client.getProjectV2(licenseKey, vars.projectId)
      if (detail.kmzDownloadUrl === null) {
        throw new S3DownloadError(
          "UNEXPECTED",
          0,
          "Project KMZ is not available for download (S3 not configured on backend)."
        )
      }
      const bytes = await downloadKmzFromS3({
        url: detail.kmzDownloadUrl,
        fetchImpl: options.fetchImpl,
      })
      return { detail, bytes }
    },
    // Open doesn't change quota or remaining state; no entitlements
    // refresh needed. Future P-rows that invoke open from a context
    // that DID change state (e.g. P3 delete-then-re-open) can add
    // queryClient.invalidateQueries inline here when they land.
  })
}
