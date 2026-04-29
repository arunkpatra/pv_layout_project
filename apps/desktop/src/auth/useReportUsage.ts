/**
 * useReportUsageMutation — TanStack Query wrapper around
 * `entitlementsClient.reportUsageV2` with the F3 idempotency-and-retry
 * policy baked in.
 *
 * Behaviour:
 *   - On `mutate({ feature })` the hook generates a fresh UUID v4
 *     idempotency key and reuses it across retries (server is idempotent
 *     per `(userId, idempotencyKey)`).
 *   - Transient failures (network, 409 race, 5xx) retry up to 3 times
 *     with exponential backoff. Permanent failures (401, 402, 400, 404,
 *     schema mismatches) fail fast so the UI can react immediately.
 *   - On success, refreshed `remainingCalculations` + `availableFeatures`
 *     are pushed into the entitlements query cache so the desktop's UI
 *     gating + quota chip update without a separate `/v2/entitlements`
 *     round-trip. (V1 entitlement fields like `usedCalculations` are
 *     derived locally; deeper state — `projectsActive` etc. — refreshes
 *     on the next `useEntitlementsQuery` invalidation.)
 *
 * The hook does NOT generate the idempotency key for preview-license-key
 * flows; preview entitlements skip the V2 client entirely (see
 * `useEntitlementsQuery`'s preview short-circuit). Calling reportUsage
 * while on a preview key resolves with a stubbed result so the desktop's
 * design-preview rendering never accidentally hits the network.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { UseMutationResult } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type EntitlementSummaryV2,
  type FeatureKey,
  type UsageReportV2Result,
} from "@solarlayout/entitlements-client"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"
import {
  generateIdempotencyKey,
  withIdempotentRetry,
  type RetryOptions,
} from "./idempotency"

/** Variables passed to `mutate(...)`. */
export interface ReportUsageVars {
  feature: FeatureKey
  /**
   * Optional override — primarily for tests / debugging. In normal flows
   * the hook generates the key itself so a "Generate Layout" intent
   * naturally gets a fresh key.
   */
  idempotencyKey?: string
}

export interface UseReportUsageMutationOptions {
  /** Override the retry policy (tests pass a no-op sleep). */
  retry?: RetryOptions
}

const PREVIEW_KEYS = new Set<string>([
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
])

function isPreviewKey(licenseKey: string): boolean {
  return PREVIEW_KEYS.has(licenseKey)
}

const ENTITLEMENTS_QUERY_KEY = "entitlements" as const

export function useReportUsageMutation(
  licenseKey: string | null,
  client: EntitlementsClient,
  options: UseReportUsageMutationOptions = {}
): UseMutationResult<UsageReportV2Result, EntitlementsError, ReportUsageVars> {
  const queryClient = useQueryClient()

  return useMutation<UsageReportV2Result, EntitlementsError, ReportUsageVars>({
    mutationFn: async (vars) => {
      if (!licenseKey) {
        throw new EntitlementsError(0, "missing license key")
      }

      // Preview-license-key short-circuit — desktop should never hit the
      // network during a design-preview run. Returns a plausible stub
      // matching the V2 result shape; the cache hydration in `onSuccess`
      // is still exercised so consumers can rely on cache-update behaviour
      // regardless of mode.
      if (isPreviewKey(licenseKey)) {
        return previewResult(queryClient, licenseKey)
      }

      const key = vars.idempotencyKey ?? generateIdempotencyKey()
      return withIdempotentRetry(
        () => client.reportUsageV2(licenseKey, vars.feature, key),
        options.retry
      )
    },
    onSuccess: (data) => {
      if (!licenseKey) return
      queryClient.setQueryData<EntitlementSummaryV2>(
        [ENTITLEMENTS_QUERY_KEY, licenseKey],
        (prev) => {
          if (!prev) return prev
          // V2 response gives us the two fields the UI gating depends on;
          // bump usedCalculations correspondingly so chips stay accurate
          // until the next full /v2/entitlements refetch.
          return {
            ...prev,
            availableFeatures: data.availableFeatures,
            remainingCalculations: data.remainingCalculations,
            usedCalculations: Math.max(
              0,
              prev.totalCalculations - data.remainingCalculations
            ),
          }
        }
      )
    },
  })
}

/**
 * Preview-mode stub: read the cached preview entitlements, decrement
 * `remainingCalculations` by 1 (clamped at 0), and return a V2-shaped
 * result that keeps preview rendering self-consistent.
 */
function previewResult(
  queryClient: ReturnType<typeof useQueryClient>,
  licenseKey: string
): UsageReportV2Result {
  const cached = queryClient.getQueryData<EntitlementSummaryV2>([
    ENTITLEMENTS_QUERY_KEY,
    licenseKey,
  ])
  const remaining = Math.max(0, (cached?.remainingCalculations ?? 1) - 1)
  return {
    recorded: true,
    remainingCalculations: remaining,
    availableFeatures: cached?.availableFeatures ?? [],
  }
}
