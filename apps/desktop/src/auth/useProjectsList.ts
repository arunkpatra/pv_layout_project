/**
 * useProjectsListQuery — read-only TanStack Query wrapper around B10
 * (`GET /v2/projects`). Powers the S3 recents grid.
 *
 * Cache key is `["projects", licenseKey]` — distinct namespace from
 * entitlements so create / rename / delete mutations can invalidate it
 * independently. The mutation hooks (useCreateProject, useRename,
 * useDelete) include `["projects", key]` in their `onSuccess`
 * invalidations to keep the recents grid coherent with the active
 * project state.
 *
 * Preview-license-key short-circuit returns an empty list — design
 * preview keys have no real backend, so the recents grid renders as
 * empty (the view shows the "first project" empty state, which is the
 * design we want for first-time users anyway).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import {
  EntitlementsError,
  type EntitlementsClient,
  type ProjectSummaryListRowV2,
} from "@solarlayout/entitlements-client"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"

export const PROJECTS_QUERY_KEY = "projects" as const

const PREVIEW_KEYS = new Set<string>([
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
])

function isPreviewKey(licenseKey: string): boolean {
  return PREVIEW_KEYS.has(licenseKey)
}

export function useProjectsListQuery(
  licenseKey: string | null,
  client: EntitlementsClient
): UseQueryResult<ProjectSummaryListRowV2[], EntitlementsError> {
  return useQuery<ProjectSummaryListRowV2[], EntitlementsError>({
    queryKey: [PROJECTS_QUERY_KEY, licenseKey],
    queryFn: async () => {
      if (!licenseKey) {
        // Unreachable — `enabled` guards — but belt-and-braces.
        throw new EntitlementsError(0, "missing license key")
      }
      if (isPreviewKey(licenseKey)) return []
      return client.listProjectsV2(licenseKey)
    },
    enabled: Boolean(licenseKey),
    // Recents view is the user's natural "back to home" surface; staleTime
    // of 30s keeps it snappy without hammering the backend on every quick
    // open-then-back-to-recents bounce. Mutations explicitly invalidate
    // for fresh data.
    staleTime: 30_000,
  })
}
