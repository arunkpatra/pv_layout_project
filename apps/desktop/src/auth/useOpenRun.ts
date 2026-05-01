/**
 * useOpenRunMutation — P7 hook to load an older run onto the canvas.
 *
 *   B17 GET /v2/projects/:id/runs/:runId  → RunDetail
 *      → fetch(detail.layoutResultBlobUrl) → JSON bytes
 *      → JSON.parse → LayoutResult[]
 *      → setLayoutResultStore.setResult(layoutResult, runId)
 *
 * Mirrors the structural shape of P2's `useOpenProject` (B12 → S3 GET):
 *   - Single-attempt — a 403 EXPIRED_URL on the layout blob means
 *     re-mutate to mint a fresh URL via B17 (just like B12's
 *     kmzDownloadUrl); auto-retry on a stale URL would just fail again.
 *   - Null `layoutResultBlobUrl` (S3 unset on backend OR blob not yet
 *     uploaded — race during P6 mid-flight) surfaces as a
 *     `S3DownloadError("UNEXPECTED")` with a meaningful message.
 *   - 404 from B17 propagates with `EntitlementsError.code = "NOT_FOUND"`.
 *   - Preview-license-key short-circuits — design preview never has
 *     real runs to load.
 *
 * onSuccess: hydrates `useLayoutResultStore.setResult(layoutResult,
 * runId)`. The runId is captured into `resultRunId` so App.tsx's
 * selectedRunId-driven auto-fetch effect dedupes (no re-fetch for the
 * run that's already displayed).
 *
 * Does NOT touch the project slice — `selectedRunId` is the App.tsx
 * caller's responsibility (P5's RunsList sets it on tile click; P6's
 * generate flow sets it on success). The mutation just reflects whatever
 * runId the caller asked for into the layout result.
 */
import { useMutation } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type RunDetailV2Wire,
} from "@solarlayout/entitlements-client"
import type { LayoutResult } from "@solarlayout/sidecar-client"
import {
  downloadBytesFromS3GetUrl,
  S3DownloadError,
  type FetchLike,
} from "./s3upload"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"
import { useLayoutResultStore } from "../state/layoutResult"
import {
  layoutParametersSchema,
  useLayoutParamsStore,
} from "../state/layoutParams"
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

export interface OpenRunVars {
  projectId: string
  runId: string
}

export interface OpenRunResult {
  detail: RunDetailV2Wire
  layoutResult: LayoutResult[]
}

export interface UseOpenRunMutationOptions {
  fetchImpl?: FetchLike
}

export function useOpenRunMutation(
  licenseKey: string | null,
  client: EntitlementsClient,
  options: UseOpenRunMutationOptions = {}
): UseMutationResult<OpenRunResult, Error, OpenRunVars> {
  const setResult = useLayoutResultStore((s) => s.setResult)
  const setAllParams = useLayoutParamsStore((s) => s.setAll)

  return useMutation<OpenRunResult, Error, OpenRunVars>({
    mutationFn: async (vars) => {
      if (!licenseKey) {
        throw new EntitlementsError(0, "missing license key")
      }
      if (isPreviewKey(licenseKey)) {
        throw new Error(
          "Open-run is unsupported in preview mode (no real backend)."
        )
      }

      const detail = await client.getRunV2(
        licenseKey,
        vars.projectId,
        vars.runId
      )
      if (detail.layoutResultBlobUrl === null) {
        throw new S3DownloadError(
          "UNEXPECTED",
          0,
          "Run result is not available for download (S3 not configured on backend, or the result blob hasn't been uploaded yet)."
        )
      }
      const bytes = await downloadBytesFromS3GetUrl({
        url: detail.layoutResultBlobUrl,
        fetchImpl: options.fetchImpl,
      })
      // Trust the JSON shape — we wrote it, the upload was content-
      // addressed by sha256 in P6's flow, so corruption is essentially
      // impossible. JSON.parse throws on malformed bytes; mutation
      // surfaces the parse error as-is.
      const text = new TextDecoder().decode(bytes)
      const layoutResult = JSON.parse(text) as LayoutResult[]
      return { detail, layoutResult }
    },
    onSuccess: (data, vars) => {
      // S1-13 — guard against a stale-resolve race. If the user navigated
      // to a different project (e.g. created a new one via P1's
      // handleOpenKmz, or switched tabs to a runs-empty project) while
      // this B17 was in flight, the late onSuccess must NOT poison the
      // global layoutResult slice with the wrong project's data.
      // S1-08's auto-select-most-recent-run made this race reachable
      // by firing P7's effect (and thus this mutation) on every project
      // open with runs.
      const currentProjectId = useProjectStore.getState().currentProject?.id
      if (currentProjectId !== vars.projectId) return
      // Hydrate the form-params slice from the run's stored params
      // BEFORE flipping resultRunId. App.tsx watches resultRunId and
      // bumps layoutFormKey on change, which remounts LayoutPanel —
      // RHF's `defaultValues` are captured at mount, so the slice
      // must be populated first or the form would re-mount against
      // stale defaults. Schema is `z.unknown()` on the wire (engine
      // params are opaque); validate locally and skip on failure
      // (defensive against future schema drift — the form just stays
      // at its current values rather than crashing).
      const parsed = layoutParametersSchema.safeParse(data.detail.params)
      if (parsed.success) {
        setAllParams(parsed.data)
      } else {
        console.warn(
          "[useOpenRun] run.params failed schema validation; skipping form hydration",
          parsed.error.format()
        )
      }
      // Capture both the result AND the runId so the App's auto-fetch
      // effect (keyed on selectedRunId vs resultRunId) skips redundant
      // re-fetches.
      setResult(data.layoutResult, vars.runId)
    },
  })
}
