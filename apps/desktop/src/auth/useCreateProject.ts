/**
 * useCreateProjectMutation — TanStack Query wrapper around the P1 new-
 * project flow:
 *
 *   bytes → uploadKmzToS3 (B6 mint + S3 PUT) → createProjectV2 (B11)
 *
 * Why a single hook instead of two:
 *   The two stages are inseparable in the UX — the user clicks "+ New
 *   project" once and expects either "we have a project now" or one
 *   error surface. Splitting into two mutations would force the caller
 *   to coordinate the orphaned-blob case (upload succeeded, create
 *   failed) which the hook already handles cleanly.
 *
 * Why no retry:
 *   Unlike `useReportUsageMutation`, B11 has no idempotency key. A
 *   network blip after the row was created would cause a retry to
 *   create a SECOND row + spend a quota slot. Fail-fast and let the
 *   user retry the user-facing button is the safer default. (S3 PUT
 *   inside `uploadKmzToS3` is content-addressed by sha256 so retrying
 *   the upload is harmless — but the create-project step is what makes
 *   this hook one-shot.)
 *
 * 402 PAYMENT_REQUIRED:
 *   Surfaces with `.code` populated by the F2 V2 error parser. The App
 *   branches on `error.code === "PAYMENT_REQUIRED"` to swap the generic
 *   error overlay for the upsell modal. Importantly, the cache is NOT
 *   invalidated on 402 — the user's quota state didn't change, just
 *   their local intent to add another project hit the ceiling.
 *
 * Preview license keys:
 *   Mirror the F3 hook — never touches the V2 client. Generates a
 *   synthetic `prj_*` ID, returns a plausibly-shaped ProjectV2Wire,
 *   and decrements cached preview entitlements `projectsRemaining`
 *   so design previews stay self-consistent across multiple creates.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import type {
  EntitlementsClient,
  EntitlementSummaryV2,
  ProjectV2Wire,
} from "@solarlayout/entitlements-client"
import { EntitlementsError } from "@solarlayout/entitlements-client"
import { uploadKmzToS3, type FetchLike } from "./s3upload"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"

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

/** Variables passed to `mutate(...)`. */
export interface CreateProjectVars {
  /** Raw KMZ bytes — typically from the F4/P1 file picker. */
  bytes: Uint8Array
  /**
   * Project name. Caller derives this from the KMZ filename (or asks
   * the user). 1..200 chars; backend rejects with VALIDATION_ERROR
   * otherwise.
   */
  name: string
  /**
   * Optional opaque edits payload. Backend defaults to `{}` when omitted;
   * leave blank for fresh projects, populate when restoring user edits
   * during D1–D7's project-state rehydration flow.
   */
  edits?: unknown
}

export interface UseCreateProjectMutationOptions {
  /** Fetch implementation override for the S3 PUT step (tests, Tauri). */
  fetchImpl?: FetchLike
}

export function useCreateProjectMutation(
  licenseKey: string | null,
  client: EntitlementsClient,
  options: UseCreateProjectMutationOptions = {}
): UseMutationResult<ProjectV2Wire, Error, CreateProjectVars> {
  const queryClient = useQueryClient()

  return useMutation<ProjectV2Wire, Error, CreateProjectVars>({
    mutationFn: async (vars) => {
      if (!licenseKey) {
        throw new EntitlementsError(0, "missing license key")
      }

      if (isPreviewKey(licenseKey)) {
        return previewCreate(queryClient, licenseKey, vars)
      }

      const upload = await uploadKmzToS3({
        client,
        licenseKey,
        bytes: vars.bytes,
        fetchImpl: options.fetchImpl,
      })
      return client.createProjectV2(licenseKey, {
        name: vars.name,
        kmzBlobUrl: upload.blobUrl,
        kmzSha256: upload.kmzSha256,
        ...(vars.edits !== undefined ? { edits: vars.edits } : {}),
      })
    },
    onSuccess: () => {
      if (!licenseKey) return
      // Backend's `projectsActive`/`projectsRemaining` advanced by 1.
      // Invalidate so the next render fetches the refreshed state. We
      // could optimistically `setQueryData` like the F3 hook does, but
      // the entitlements endpoint also recomputes the available-features
      // union — re-fetching is cheaper than mirroring that logic.
      void queryClient.invalidateQueries({
        queryKey: [ENTITLEMENTS_QUERY_KEY, licenseKey],
      })
    },
  })
}

/**
 * Preview-mode stub. Synthesises a ProjectV2Wire with a fresh `prj_*`
 * ID, no real S3 round-trip, and decrements the cached preview
 * entitlements quota so the upsell ceiling is reachable through repeat
 * design-review clicks.
 */
function previewCreate(
  queryClient: ReturnType<typeof useQueryClient>,
  licenseKey: string,
  vars: CreateProjectVars
): ProjectV2Wire {
  const cached = queryClient.getQueryData<EntitlementSummaryV2>([
    ENTITLEMENTS_QUERY_KEY,
    licenseKey,
  ])
  const now = new Date().toISOString()
  const id = `prj_${randomSuffix()}`
  // Stable-ish blob URL; preview never reads it back, but we need to
  // populate the field so Inspector / TopBar consumers don't crash on
  // null. sha256 is faked to a valid 64-hex string from the bytes
  // length so multiple preview creates don't collide.
  const fakeSha = `${"0".repeat(63)}${(vars.bytes.byteLength % 16).toString(16)}`
  const fakeBlobUrl = `s3://solarlayout-preview/projects/preview/kmz/${fakeSha}.kmz`

  if (cached) {
    queryClient.setQueryData<EntitlementSummaryV2>(
      [ENTITLEMENTS_QUERY_KEY, licenseKey],
      {
        ...cached,
        projectsActive: cached.projectsActive + 1,
        projectsRemaining: Math.max(0, cached.projectsRemaining - 1),
      }
    )
  }

  return {
    id,
    userId: "usr_preview",
    name: vars.name,
    kmzBlobUrl: fakeBlobUrl,
    kmzSha256: fakeSha,
    edits: vars.edits ?? {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function randomSuffix(): string {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}
