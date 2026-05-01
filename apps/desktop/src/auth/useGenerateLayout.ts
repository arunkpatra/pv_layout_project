/**
 * useGenerateLayoutMutation — TanStack Query wrapper around the P6
 * Generate-Layout flow:
 *
 *   B16 createRunV2  → atomic debit + Run row + presigned upload URL
 *     → sidecar /layout            → LayoutResult[]
 *     → S3 PUT result.json         → blob lands at upload.blobUrl
 *     → setLayoutResultStore       → canvas renders new layout
 *     → addRun(slice)              → runs[] gallery picks it up
 *     → invalidate ["entitlements", key] → quota chip refreshes
 *
 * Why the chain runs through the hook (vs split across App.tsx):
 *   The three stages share one idempotency key — backend's contract is
 *   "same key → same Run + fresh URL". Wrapping the whole thing keeps
 *   that key threaded coherently across retries; splitting would force
 *   App.tsx to track the key + replay from the right stage. Backend's
 *   B16 design is intentionally idempotent so retries are cheap; we lean
 *   on that rather than re-deriving retry safety client-side.
 *
 * Retry policy:
 *   B16 — wrapped in F3's withIdempotentRetry. Transient (network, 409
 *         CONFLICT race, 5xx) retries with the same key; permanent
 *         (402, 401, 400, 404) fail fast.
 *   Sidecar /layout — single-shot. The sidecar is local; retrying its
 *         expensive solver work without an exponential backoff would
 *         hammer it. The user retries via the Generate button.
 *   S3 PUT — single-shot. On 403 EXPIRED_URL the caller should retry
 *         the whole mutation (which re-calls B16, gets a fresh URL).
 *
 * Idempotency key lifecycle:
 *   - One fresh UUID v4 per `mutate()` invocation by default.
 *   - Caller can override via `vars.idempotencyKey` for "same intent,
 *     fresh attempt" UX (e.g. P6's manual Retry button).
 *   - Same key threads through any internal retry attempts.
 *
 * Preview license keys:
 *   No real backend in preview mode → throws loudly. Design-preview
 *   rendering (vite preview, headless screenshots) doesn't exercise
 *   Generate Layout; if a future preview surface needs a sidecar-only
 *   layout flow without backend debit, add a synthetic preview branch
 *   here that calls sidecar.runLayout directly and skips B16 + S3 PUT.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import {
  EntitlementsError,
  FEATURE_KEYS,
  type CreateRunV2Result,
  type EntitlementsClient,
  type RunWireV2,
} from "@solarlayout/entitlements-client"
import type {
  LayoutParameters,
  LayoutResult,
  ParsedKMZ,
  SidecarClient,
} from "@solarlayout/sidecar-client"
import {
  generateIdempotencyKey,
  withIdempotentRetry,
  type RetryOptions,
} from "./idempotency"
import { putToS3, type FetchLike } from "./s3upload"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"
import { useCurrentLayoutJobStore } from "../state/currentLayoutJob"
import { useLayoutResultStore } from "../state/layoutResult"
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

/** Variables passed to `mutate(...)`. */
export interface GenerateLayoutVars {
  /** Backend project ID (from `currentProject.id`). */
  projectId: string
  /** Parsed KMZ from the sidecar (already in scope on Generate Layout). */
  parsedKmz: ParsedKMZ
  /** LayoutParameters from the input panel. */
  params: LayoutParameters
  /**
   * Optional idempotency-key override — primarily for "Retry" UX where
   * the caller wants the same Run row honored. Default: a fresh UUID
   * minted per mutate() so each user-initiated Generate is its own intent.
   */
  idempotencyKey?: string
}

export interface GenerateLayoutResult {
  run: RunWireV2
  layoutResult: LayoutResult[]
  /** s3:// URI of the layout-result blob. The presigned PUT has already
   *  succeeded by the time the hook resolves — the URL is recorded for
   *  consumers (e.g. P5 thumbnail fetchers) to derive download URLs from. */
  blobUrl: string
}

export interface UseGenerateLayoutMutationOptions {
  /** Fetch implementation override for the S3 PUT step. */
  fetchImpl?: FetchLike
  /** Retry policy override (tests pass a no-op sleep). */
  retry?: RetryOptions
  /**
   * Polling cadence (ms) for the async layout-job loop. Defaults to
   * 2000 ms — same value Spike 2's cloud-poll uses, so the desktop
   * polling code is identical for local and cloud paths. Tests pass
   * a smaller number to avoid sleeping in CI.
   */
  pollIntervalMs?: number
}

export function useGenerateLayoutMutation(
  licenseKey: string | null,
  client: EntitlementsClient,
  sidecar: SidecarClient | null,
  options: UseGenerateLayoutMutationOptions = {}
): UseMutationResult<GenerateLayoutResult, Error, GenerateLayoutVars> {
  const queryClient = useQueryClient()
  const setResult = useLayoutResultStore((s) => s.setResult)
  const addRun = useProjectStore((s) => s.addRun)
  const selectRun = useProjectStore((s) => s.selectRun)
  const setJobState = useCurrentLayoutJobStore((s) => s.setJobState)
  const pollIntervalMs = options.pollIntervalMs ?? 2000

  return useMutation<GenerateLayoutResult, Error, GenerateLayoutVars>({
    mutationFn: async (vars) => {
      if (!licenseKey) {
        throw new EntitlementsError(0, "missing license key")
      }
      if (isPreviewKey(licenseKey)) {
        throw new Error(
          "Generate Layout is unsupported in preview mode (no real backend)."
        )
      }
      if (!sidecar) {
        throw new Error("Sidecar not ready — try again in a moment.")
      }

      const idempKey = vars.idempotencyKey ?? generateIdempotencyKey()

      // Stage 1: B16 atomic debit + Run row + uploadUrl.
      // Wrapped in withIdempotentRetry so transient 409 / 5xx / network
      // retry with the SAME key (backend dedupes on @@unique). Permanent
      // errors (402, 401, 400, 404) bypass the retry.
      const b16: CreateRunV2Result = await withIdempotentRetry(
        () =>
          client.createRunV2(licenseKey, vars.projectId, {
            // Run name auto-derived from timestamp; P5/P3 will allow
            // user-rename via PATCH (B13 covers project-level patch; a
            // per-run patch endpoint isn't shipped yet — covered by a
            // future row when needed).
            name: `Layout @ ${new Date().toISOString()}`,
            params: vars.params,
            // For v1, snapshot == params. The backend stores both as
            // separate columns so future rows can diff "what was billed"
            // (snapshot) vs "what the engine ran with" (params) once the
            // desktop introduces param-tweaking that doesn't re-debit.
            inputsSnapshot: vars.params,
            billedFeatureKey: FEATURE_KEYS.PLANT_LAYOUT,
            idempotencyKey: idempKey,
          }),
        options.retry
      )

      // Stage 2: async /layout/jobs — start the job, then poll until
      // terminal. Same compute as the legacy blocking /layout, but the
      // request returns immediately with a job_id and the work runs in
      // a sidecar background thread. The polling loop publishes the
      // live JobState to the `currentLayoutJob` Zustand slice so the
      // pinned area in LayoutPanel can render the per-plot progress
      // list and Cancel button. Single-shot at the mutation level —
      // sidecar errors propagate to the user-facing button. The user
      // retries via Generate (same idempotency-key path).
      const { job_id } = await sidecar.startLayoutJob(
        vars.parsedKmz,
        vars.params
      )
      let jobState = await sidecar.getLayoutJob(job_id)
      setJobState(jobState)
      while (jobState.status === "queued" || jobState.status === "running") {
        await sleep(pollIntervalMs)
        jobState = await sidecar.getLayoutJob(job_id)
        setJobState(jobState)
      }
      if (jobState.status === "cancelled") {
        // User-initiated abort. Throw a stable error that onError /
        // mutationState consumers can recognise; the panel keeps the
        // (cancelled) JobState in the slice as the post-run summary.
        throw new LayoutJobCancelledError()
      }
      if (jobState.status === "failed" || !jobState.result) {
        throw new Error(
          "Sidecar layout job failed. See sidecar logs for details."
        )
      }
      const layoutResult = jobState.result.results

      // Stage 3: S3 PUT result JSON. Single-shot — on 403 EXPIRED_URL the
      // caller should re-mutate (which mints a fresh URL via B16's
      // idempotent replay).
      const json = JSON.stringify(layoutResult)
      const bytes = new TextEncoder().encode(json)
      await putToS3({
        url: b16.upload.uploadUrl,
        bytes,
        contentType: "application/json",
        contentLength: bytes.byteLength,
        fetchImpl: options.fetchImpl,
      })

      // Stage 4 (SP1 / B23 — best-effort): sidecar render → B7 thumb
      // mint → S3 PUT. Failure of ANY step here MUST NOT fail the
      // mutation — the layout already landed, the thumbnail is polish,
      // and `<img onError>` handles the 404 fallback at render time.
      // Per memo v3 §6 + Q3, the thumbnail render path has no
      // idempotency key (sidecar produces deterministic bytes; backend
      // PUT is content-addressed by deterministic key — replays
      // overwrite cleanly).
      //
      // Multi-boundary projects: take layoutResult[0] (first valid
      // boundary). Composition across plots is deferred polish — when a
      // user has a multi-plot project, the first plot's thumbnail is a
      // reasonable representative for the gallery card.
      void renderAndUploadThumbnail({
        layoutResult: layoutResult[0],
        projectId: vars.projectId,
        runId: b16.run.id,
        licenseKey,
        client,
        sidecar,
        fetchImpl: options.fetchImpl,
      })

      return {
        run: b16.run,
        layoutResult,
        blobUrl: b16.upload.blobUrl,
      }
    },
    onSuccess: (data) => {
      // Hydrate canvas state mirroring the parity-era useLayoutMutation
      // pattern, plus the post-parity additions: run row added to the
      // project's runs[] gallery, entitlements invalidated so the quota
      // chip + remainingCalculations refresh on the next render. P7's
      // selectedRunId-driven auto-fetch skips its B17 round-trip when
      // `selectedRunId === resultRunId` — so passing the run id into
      // setResult here makes the just-generated run "active" without
      // triggering a redundant fetch loop.
      setResult(data.layoutResult, data.run.id)
      addRun({
        id: data.run.id,
        name: data.run.name,
        params: data.run.params,
        billedFeatureKey: data.run.billedFeatureKey,
        createdAt: data.run.createdAt,
      })
      // Make the new run the "active" one in the gallery — drives P5's
      // active-row indicator + makes P7's auto-fetch a no-op (resultRunId
      // already matches).
      selectRun(data.run.id)
      if (licenseKey) {
        void queryClient.invalidateQueries({
          queryKey: [ENTITLEMENTS_QUERY_KEY, licenseKey],
        })
        // RecentsView's B10 listing carries `runsCount`, `lastRunAt`,
        // `mostRecentRunThumbnailBlobUrl`, and `updatedAt` — all four
        // shift when a run is generated. Without this invalidation,
        // navigating Home within `useProjectsListQuery`'s 30s
        // staleTime serves stale data ("No runs yet" + placeholder
        // thumbnail) — observed live during SP1 verification.
        void queryClient.invalidateQueries({
          queryKey: ["projects", licenseKey],
        })
      }
    },
  })
}

// ---------------------------------------------------------------------------
// SP1 / B23 — best-effort thumbnail upload helper.
// ---------------------------------------------------------------------------
//
// Deliberately fire-and-forget from the mutation's perspective: the parent
// `mutationFn` calls this with `void` and returns immediately after the
// layout-result PUT lands. If the user's network is slow or the sidecar
// chokes on render, the layout still appears on canvas + in the gallery
// without delay — the thumbnail just doesn't show until a future Generate
// (or backfill) PUTs the blob, at which point B17's always-signed URL
// stops 404'ing and the next RecentsView / RunsList render picks it up.

interface RenderAndUploadThumbnailArgs {
  layoutResult: LayoutResult | undefined
  projectId: string
  runId: string
  licenseKey: string
  client: EntitlementsClient
  sidecar: SidecarClient
  fetchImpl?: FetchLike
}

async function renderAndUploadThumbnail(
  args: RenderAndUploadThumbnailArgs
): Promise<void> {
  const {
    layoutResult,
    projectId,
    runId,
    licenseKey,
    client,
    sidecar,
    fetchImpl,
  } = args
  if (!layoutResult) {
    // Multi-boundary input that produced an empty array — extremely
    // rare (would mean the solver ran but found no valid boundaries).
    // No bytes to upload; bail silently.
    return
  }
  try {
    const bytes = await sidecar.renderLayoutThumbnail(layoutResult)
    if (bytes.byteLength > THUMBNAIL_MAX_BYTES) {
      // Sidecar produced a blob over the B7 ceiling — backend would
      // 400 the PUT anyway. Surfaces as a sidecar-side regression
      // rather than a transient hiccup; log + bail.
      console.warn(
        `[SP1] sidecar produced thumbnail of ${bytes.byteLength} bytes (>${THUMBNAIL_MAX_BYTES}); skipping upload`
      )
      return
    }
    const upload = await client.getRunResultUploadUrl(licenseKey, {
      type: "thumbnail",
      projectId,
      runId,
      size: bytes.byteLength,
    })
    await putToS3({
      url: upload.uploadUrl,
      bytes,
      contentType: "image/webp",
      contentLength: bytes.byteLength,
      fetchImpl,
    })
  } catch (err) {
    // Best-effort: the layout already landed; thumbnail is polish.
    // Log for diagnostic discoverability + carry on.
    console.warn("[SP1] thumbnail upload failed (best-effort):", err)
  }
}

/** B7 RUN_RESULT_SPEC.thumbnail.maxBytes — kept in sync with backend. */
const THUMBNAIL_MAX_BYTES = 50_000

/**
 * Marker error for user-initiated cancellation. Distinct subclass so
 * the UI can show the "Cancelled" surface instead of the generic
 * "Layout failed" toast. Caught by the mutation's `onError` (when one
 * is wired) or surfaced via `mutation.error` for the panel to inspect.
 */
export class LayoutJobCancelledError extends Error {
  constructor() {
    super("Layout job cancelled by user")
    this.name = "LayoutJobCancelledError"
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
