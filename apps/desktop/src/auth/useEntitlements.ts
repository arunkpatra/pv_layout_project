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
  type Entitlements,
} from "@solarlayout/entitlements-client"
import { PREVIEW_LICENSE_KEY } from "./licenseKey"

const inTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

// The Tauri plugin-http fetch bypasses CSP / mixed-content rules the
// WebView would otherwise apply; outside Tauri we fall back to the global
// fetch so the design-preview mode can stub a happy-path response.
const pickFetch = () => (inTauri() ? (tauriFetch as typeof fetch) : undefined)

const entitlementsClient = createEntitlementsClient({ fetchImpl: pickFetch() })

const KEY_QUERY_KEY = "entitlements" as const

const PREVIEW_ENTITLEMENTS: Entitlements = {
  user: { name: "Design Reviewer", email: "design@solarlayout.in" },
  plans: [
    {
      planName: "Free",
      features: ["Layout generation", "Cable routing"],
      totalCalculations: 100,
      usedCalculations: 5,
      remainingCalculations: 95,
    },
  ],
  licensed: true,
  availableFeatures: [
    "plant_layout",
    "cables",
    "icr_drag",
    "obstructions",
    "dxf",
    "energy",
  ],
  totalCalculations: 100,
  usedCalculations: 5,
  remainingCalculations: 95,
}

export function useEntitlementsQuery(
  licenseKey: string | null
): UseQueryResult<Entitlements, EntitlementsError> {
  return useQuery<Entitlements, EntitlementsError>({
    queryKey: [KEY_QUERY_KEY, licenseKey],
    queryFn: async () => {
      if (!licenseKey) {
        // Unreachable — caller guards with `enabled` — but belt-and-braces.
        throw new EntitlementsError(0, "missing license key")
      }
      if (licenseKey === PREVIEW_LICENSE_KEY) {
        return PREVIEW_ENTITLEMENTS
      }
      return entitlementsClient.getEntitlements(licenseKey)
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
  entitlements: Entitlements | undefined,
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
