/**
 * Entitlements fetch + sidecar push, as a TanStack Query hook.
 *
 *   useEntitlementsQuery(licenseKey)         → fetches /entitlements
 *   useSyncEntitlementsToSidecar(entitlements, sidecar)
 *                                            → POST /session/entitlements
 *
 * Online-required per ADR 0001. No persistent cache; TanStack Query's
 * in-memory cache dedupes within a session. On mount we always attempt
 * a fresh fetch if a key is available.
 */
import { useEffect } from "react"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import {
  createEntitlementsClient,
  EntitlementsError,
  FEATURE_KEYS,
  type EntitlementSummaryV2,
  type FeatureKey,
} from "@solarlayout/entitlements-client"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"

const inTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

// The Tauri plugin-http fetch bypasses CSP / mixed-content rules the
// WebView would otherwise apply; outside Tauri we fall back to the global
// fetch so the design-preview mode can stub a happy-path response.
const pickFetch = () => (inTauri() ? (tauriFetch as typeof fetch) : undefined)

// API base URL — defaults to production; can be overridden at build time
// via `VITE_SOLARLAYOUT_API_URL` (see `apps/desktop/src/vite-env.d.ts`
// and `apps/desktop/.env.example`). Local dev points this at
// `http://localhost:3003` (mvp_api default port from
// `renewable_energy/apps/mvp_api/src/env.ts`).
const apiBaseUrl = import.meta.env.VITE_SOLARLAYOUT_API_URL

/**
 * Module-singleton client. Exported so V2 mutation hooks
 * (`useReportUsageMutation`, `useCreateProjectMutation`) bind to the same
 * instance the entitlements query uses — one base URL, one fetch impl,
 * one place to swap.
 */
export const entitlementsClient = createEntitlementsClient({
  fetchImpl: pickFetch(),
  baseUrl: apiBaseUrl,
})

const KEY_QUERY_KEY = "entitlements" as const

/**
 * Preview entitlements — three tier-accurate variants mirroring the
 * renewable_energy seed (packages/mvp_db/prisma/seed-products.ts) and the
 * 2026-04-29 V2 quota-per-tier decision (Free=3, Basic=5, Pro=10,
 * Pro Plus=15, concurrent). Each variant's `availableFeatures` and project-
 * quota fields match exactly what the V2 backend returns for a real user
 * on that plan.
 *
 * Used in non-Tauri preview runs (vite dev / headless screenshot rig).
 * In Tauri dev/production, entitlements come from `GET /v2/entitlements`
 * via a user-entered license key. See ADR-0005.
 *
 * Picking between variants: the preview license key selects the tier.
 * `PREVIEW_LICENSE_KEY_BASIC` → Basic, etc. The legacy `PREVIEW_LICENSE_KEY`
 * resolves to Pro Plus (richest surface for design review) and is kept
 * for backward compatibility with any existing preview flows.
 */

function previewEntitlements(
  planName: string,
  features: readonly FeatureKey[],
  planFeatureLabels: string[],
  projectQuota: number
): EntitlementSummaryV2 {
  return {
    user: { name: "Design Reviewer", email: "design@solarlayout.in" },
    plans: [
      {
        planName,
        features: planFeatureLabels,
        totalCalculations: 100,
        usedCalculations: 5,
        remainingCalculations: 95,
      },
    ],
    licensed: true,
    availableFeatures: [...features],
    totalCalculations: 100,
    usedCalculations: 5,
    remainingCalculations: 95,
    projectQuota,
    projectsActive: 0,
    projectsRemaining: projectQuota,
    // Preview entitlements always represent a healthy paying-customer
    // surface — no deactivated path through the design preview rig.
    entitlementsActive: true,
  }
}

export const PREVIEW_ENTITLEMENTS_BASIC: EntitlementSummaryV2 =
  previewEntitlements(
    "PV Layout Basic",
    [FEATURE_KEYS.PLANT_LAYOUT, FEATURE_KEYS.OBSTRUCTION_EXCLUSION],
    ["Plant Layout (MMS, Inverter, LA)", "Obstruction Exclusion"],
    5
  )

export const PREVIEW_ENTITLEMENTS_PRO: EntitlementSummaryV2 =
  previewEntitlements(
    "PV Layout Pro",
    [
      FEATURE_KEYS.PLANT_LAYOUT,
      FEATURE_KEYS.OBSTRUCTION_EXCLUSION,
      FEATURE_KEYS.CABLE_ROUTING,
      FEATURE_KEYS.CABLE_MEASUREMENTS,
    ],
    [
      "Plant Layout (MMS, Inverter, LA)",
      "Obstruction Exclusion",
      "AC & DC Cable Routing",
      "Cable Quantity Measurements",
    ],
    10
  )

export const PREVIEW_ENTITLEMENTS_PRO_PLUS: EntitlementSummaryV2 =
  previewEntitlements(
    "PV Layout Pro Plus",
    [
      FEATURE_KEYS.PLANT_LAYOUT,
      FEATURE_KEYS.OBSTRUCTION_EXCLUSION,
      FEATURE_KEYS.CABLE_ROUTING,
      FEATURE_KEYS.CABLE_MEASUREMENTS,
      FEATURE_KEYS.ENERGY_YIELD,
      FEATURE_KEYS.GENERATION_ESTIMATES,
    ],
    [
      "Plant Layout (MMS, Inverter, LA)",
      "Obstruction Exclusion",
      "AC & DC Cable Routing",
      "Cable Quantity Measurements",
      "Energy Yield Analysis",
      "Plant Generation Estimates",
    ],
    15
  )

function entitlementsForPreviewKey(
  key: string
): EntitlementSummaryV2 | null {
  switch (key) {
    case PREVIEW_LICENSE_KEY_BASIC:
      return PREVIEW_ENTITLEMENTS_BASIC
    case PREVIEW_LICENSE_KEY_PRO:
      return PREVIEW_ENTITLEMENTS_PRO
    case PREVIEW_LICENSE_KEY_PRO_PLUS:
    case PREVIEW_LICENSE_KEY:
      return PREVIEW_ENTITLEMENTS_PRO_PLUS
    default:
      return null
  }
}

export function useEntitlementsQuery(
  licenseKey: string | null
): UseQueryResult<EntitlementSummaryV2, EntitlementsError> {
  return useQuery<EntitlementSummaryV2, EntitlementsError>({
    queryKey: [KEY_QUERY_KEY, licenseKey],
    queryFn: async () => {
      if (!licenseKey) {
        // Unreachable — caller guards with `enabled` — but belt-and-braces.
        throw new EntitlementsError(0, "missing license key")
      }
      const preview = entitlementsForPreviewKey(licenseKey)
      if (preview) return preview
      return entitlementsClient.getEntitlementsV2(licenseKey)
    },
    enabled: Boolean(licenseKey),
    retry: false, // Online-required: surface the failure, user clicks retry.
    staleTime: Infinity, // Cache for the full session; no background refetch.
    gcTime: Infinity,
  })
}

/**
 * Post the current entitlements to the sidecar's /session/entitlements
 * whenever they change. Fire-and-forget: if the sidecar isn't up yet or
 * rejects, the shell logs but doesn't block — the query itself already
 * succeeded, and the sidecar's feature-gate dependencies will 503 until
 * the push lands.
 */
export function useSyncEntitlementsToSidecar(
  entitlements: EntitlementSummaryV2 | undefined,
  sidecar: { host: string; port: number; token: string } | null
): void {
  useEffect(() => {
    if (!entitlements || !sidecar) return
    // Preview / non-Tauri runs pass port=0 — no real sidecar to talk to.
    if (sidecar.port === 0) return
    const controller = new AbortController()
    const fetcher = inTauri() ? (tauriFetch as typeof fetch) : globalThis.fetch
    void (async () => {
      try {
        const res = await fetcher(
          `http://${sidecar.host}:${sidecar.port}/session/entitlements`,
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${sidecar.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              available_features: entitlements.availableFeatures,
              plan_name: entitlements.plans[0]?.planName ?? null,
            }),
          }
        )
        if (!res.ok) {
          console.error(
            `sidecar /session/entitlements rejected ${res.status}: ${await res.text()}`
          )
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("sidecar /session/entitlements push failed:", err)
        }
      }
    })()
    return () => controller.abort()
  }, [
    entitlements,
    sidecar?.host,
    sidecar?.port,
    sidecar?.token,
  ])
}
