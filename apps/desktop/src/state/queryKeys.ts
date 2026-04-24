/**
 * TanStack Query key builders.
 *
 * Centralised so the keys can't drift between callers and so a future
 * refactor (e.g. adding a versioning prefix to invalidate all caches at
 * once) is one-line.
 *
 * Each builder returns an `as const` tuple so TanStack Query's exact-
 * match dedup works on literal types, not generic `string[]`.
 */

export const queryKeys = {
  /** GET /entitlements on api.solarlayout.in for a given license key. */
  entitlements: (licenseKey: string | null) =>
    ["entitlements", licenseKey] as const,

  /**
   * POST /layout on the local sidecar. Cached per (project identity, hash
   * of LayoutParameters). S9 lands the actual mutation; this builder is
   * scaffolded here so the slice + query layers come up together.
   */
  layout: (projectId: string, paramsHash: string) =>
    ["layout", projectId, paramsHash] as const,

  /** POST /usage/report on api.solarlayout.in for a given feature key. */
  usageReport: (featureKey: string) => ["usage", featureKey] as const,
} as const
