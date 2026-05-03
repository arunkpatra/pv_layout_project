/**
 * useCreateProjectMutation — three-stage create flow per C4
 * cloud-offload spec:
 *
 *   1. uploading   → uploadKmzToS3 (B6 mint URL → S3 PUT)
 *   2. creating    → createProjectV2 (B11) — `parsedKmz` is null at
 *                    this point; the Lambda populates it in stage 3
 *   3. parsing     → parseKmzV2 (POST /v2/projects/:id/parse-kmz →
 *                    invokes the parse-kmz Lambda; mvp_api persists
 *                    the result on Project.parsedKmz and returns it
 *                    to the caller)
 *
 * Stage transitions are reported via `onStageChange` so the
 * CreateProjectModal can render per-stage progress + elapsed-time.
 *
 * On success: returns `{project, parsed}` so the caller can hydrate
 * canvas + tab state without an extra round-trip. On error: stage is
 * reported via the callback; mvp_api auto-cleans the orphan project +
 * refunds quota server-side regardless of which stage failed (per spec
 * §Q3 burn-the-boats).
 *
 * Why no retry:
 *   B11 has no idempotency key. A network blip after the row was
 *   created would burn an extra quota slot. Fail-fast and let the user
 *   retry the staged modal's "Try again" button is the safer default.
 *   (S3 PUT inside `uploadKmzToS3` is content-addressed by sha256 so
 *   retrying the upload is harmless — but the create-project step is
 *   what makes this hook one-shot.)
 *
 * 402 PAYMENT_REQUIRED:
 *   Surfaces with `.code === "PAYMENT_REQUIRED"` (V2 envelope). The App
 *   branches on the code to swap the staged modal for the upsell
 *   overlay. Cache is NOT invalidated on 402 — the user's quota state
 *   didn't change, just their local intent to add another project hit
 *   the ceiling.
 *
 * Preview license keys:
 *   Mirror the F3 hook — never touches the V2 client. Generates a
 *   synthetic `prj_*` ID, returns a plausibly-shaped ProjectV2Wire
 *   (with stub `parsedKmz`) and decrements cached preview entitlements
 *   so design previews stay self-consistent across multiple creates.
 *   Stage callbacks fire so the modal animation runs through all three
 *   stages even in preview mode.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import type {
  EntitlementsClient,
  EntitlementSummaryV2,
  ParsedKmz,
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

/** Visible stages of the three-stage create flow. */
export type CreateStage = "uploading" | "creating" | "parsing"

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
  /** Raw KMZ bytes — typically from the C4 file picker. */
  bytes: Uint8Array
  /**
   * Project name. Caller derives this from the KMZ filename (or asks
   * the user). 1..200 chars; backend rejects with VALIDATION_ERROR
   * otherwise.
   */
  name: string
  /**
   * Optional opaque edits payload. Backend defaults to `{}` when omitted;
   * leave blank for fresh projects.
   */
  edits?: unknown
}

/** What the mutation resolves with on success. */
export interface CreateProjectResult {
  project: ProjectV2Wire
  parsed: ParsedKmz
}

export interface UseCreateProjectMutationOptions {
  /** Fetch implementation override for the S3 PUT step (tests, Tauri). */
  fetchImpl?: FetchLike
  /**
   * Stage transition callback — fires once per stage as it begins.
   * Caller drives the staged modal off this; ordering is guaranteed
   * uploading → creating → parsing on the success path.
   */
  onStageChange?: (stage: CreateStage) => void
}

export function useCreateProjectMutation(
  licenseKey: string | null,
  client: EntitlementsClient,
  options: UseCreateProjectMutationOptions = {}
): UseMutationResult<CreateProjectResult, Error, CreateProjectVars> {
  const queryClient = useQueryClient()
  const { onStageChange, fetchImpl } = options

  return useMutation<CreateProjectResult, Error, CreateProjectVars>({
    mutationFn: async (vars) => {
      if (!licenseKey) {
        throw new EntitlementsError(0, "missing license key")
      }

      if (isPreviewKey(licenseKey)) {
        return previewCreate(queryClient, licenseKey, vars, onStageChange)
      }

      // Stage 1 — upload KMZ bytes to S3 via a B6-minted presigned URL.
      onStageChange?.("uploading")
      const upload = await uploadKmzToS3({
        client,
        licenseKey,
        bytes: vars.bytes,
        fetchImpl,
      })

      // Stage 2 — create the Project row. `parsedKmz` is null at this
      // point; the Lambda populates it in stage 3. We do NOT pre-compute
      // boundaryGeojson client-side anymore (the Lambda derives it from
      // the parsed payload server-side).
      onStageChange?.("creating")
      const project = await client.createProjectV2(licenseKey, {
        name: vars.name,
        kmzBlobUrl: upload.blobUrl,
        kmzSha256: upload.kmzSha256,
        ...(vars.edits !== undefined ? { edits: vars.edits } : {}),
      })

      // Stage 3 — invoke the parse-kmz Lambda via mvp_api. mvp_api
      // persists the parsed payload to Project.parsedKmz and returns
      // it. On any failure mvp_api auto-cleans the orphan project +
      // refunds quota; the error surface is uniform.
      onStageChange?.("parsing")
      const parsed = await client.parseKmzV2(licenseKey, project.id)

      return { project, parsed }
    },
    onSuccess: () => {
      if (!licenseKey) return
      // Backend's `projectsActive`/`projectsRemaining` advanced by 1.
      // Invalidate so the next render fetches the refreshed state.
      void queryClient.invalidateQueries({
        queryKey: [ENTITLEMENTS_QUERY_KEY, licenseKey],
      })
      // S3 recents grid: drop cached list so the new project appears
      // when the user navigates back to the recents view.
      void queryClient.invalidateQueries({
        queryKey: ["projects", licenseKey],
      })
    },
  })
}

/**
 * Preview-mode stub. Synthesises a `{project, parsed}` pair with no
 * real S3 round-trip + no real parse-kmz invocation. Decrements the
 * cached preview entitlements quota so the upsell ceiling is reachable
 * through repeat design-review clicks. Emits all three stage
 * callbacks so the modal animation behaves like the real flow.
 */
function previewCreate(
  queryClient: ReturnType<typeof useQueryClient>,
  licenseKey: string,
  vars: CreateProjectVars,
  onStageChange?: (stage: CreateStage) => void
): CreateProjectResult {
  onStageChange?.("uploading")
  onStageChange?.("creating")
  onStageChange?.("parsing")

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

  // Minimal-valid ParsedKmz stub: one degenerate-but-well-formed
  // boundary at (0,0). Real parsed boundaries arrive from the Lambda
  // in non-preview mode; preview canvases that need geometry are
  // exercised with the seeded preview project elsewhere.
  const stubParsed: ParsedKmz = {
    boundaries: [
      {
        name: vars.name,
        coords: [
          [0, 0],
          [0.0001, 0],
          [0.0001, 0.0001],
          [0, 0.0001],
          [0, 0],
        ],
        obstacles: [],
        water_obstacles: [],
        line_obstructions: [],
      },
    ],
    centroid_lat: 0,
    centroid_lon: 0,
  }

  const project: ProjectV2Wire = {
    id,
    userId: "usr_preview",
    name: vars.name,
    kmzBlobUrl: fakeBlobUrl,
    kmzSha256: fakeSha,
    edits: vars.edits ?? {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    parsedKmz: stubParsed,
  }

  return { project, parsed: stubParsed }
}

function randomSuffix(): string {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}
