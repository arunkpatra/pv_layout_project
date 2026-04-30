/**
 * Wire shapes returned by mvp_api's entitlement endpoints.
 *
 * V1 — `GET /entitlements`     — frozen; consumed by legacy desktop install,
 *                                 mvp_web, and mvp_admin. Never mutate.
 * V2 — `GET /v2/entitlements`  — strict superset of V1, adds project quota
 *                                 fields for the post-parity desktop app.
 *
 * Source of truth lives here; mvp_api imports these types so the wire
 * contract cannot drift between backend and desktop.
 */

export interface PlanSummary {
  planName: string
  /** Human-readable labels from ProductFeature.label — for display only */
  features: string[]
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
}

export interface EntitlementSummary {
  user: { name: string | null; email: string }
  plans: PlanSummary[]
  licensed: boolean
  /** Feature keys (e.g. "plant_layout") — used for runtime feature gating */
  availableFeatures: string[]
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
}

export interface ProjectQuotaState {
  /** Max projectQuota across active + non-exhausted entitlements. 0 if none. */
  projectQuota: number
  /** Count of the user's non-deleted Project rows. */
  projectsActive: number
  /** max(0, projectQuota - projectsActive). When 0, the desktop must
   *  enter read-only mode for any over-quota project. */
  projectsRemaining: number
}

export interface EntitlementSummaryV2
  extends EntitlementSummary,
    ProjectQuotaState {
  /** True iff the user has at least one entitlement with `deactivatedAt IS NULL`,
   *  regardless of exhaustion. Lets the desktop split EXHAUSTED (this=true,
   *  remainingCalculations=0 — self-service "Buy more" CTA) from DEACTIVATED
   *  (this=false — "Contact support" CTA). Without this field both states
   *  collapse to identical envelopes (`licensed=false`, `remainingCalculations=0`,
   *  `projectQuota=0`) and the desktop can't disambiguate. */
  entitlementsActive: boolean
}
