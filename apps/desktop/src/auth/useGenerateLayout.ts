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

      // Stage 2: sidecar /layout. Single-shot — sidecar errors propagate
      // to the user-facing button. Calc has already been debited at this
      // point; retry with the same idempotency key returns the same Run
      // (no double-debit) when the user clicks Generate again.
      const layoutResult = await sidecar.runLayout(vars.parsedKmz, vars.params)

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
      }
    },
  })
}
