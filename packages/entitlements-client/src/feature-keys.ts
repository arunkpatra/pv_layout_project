/**
 * Typed registry of feature-key names that cross the boundary between the
 * desktop client and the mvp_api entitlements endpoint.
 *
 * Source of truth: the product seed in the renewable_energy repo —
 *   packages/mvp_db/prisma/seed-products.ts
 *
 * Every value here MUST match a `featureKey` in that seed file. The
 * `feature-keys.contract.test.ts` sibling test enforces this at CI time.
 *
 * Per plan (as of 2026-04-24 seed):
 *   - Free / Basic: PLANT_LAYOUT, OBSTRUCTION_EXCLUSION
 *   - Pro:          + CABLE_ROUTING, CABLE_MEASUREMENTS
 *   - Pro Plus:     + ENERGY_YIELD, GENERATION_ESTIMATES
 *
 * Policy (ADR-0005): callers import `FEATURE_KEYS.FOO` rather than passing
 * a string literal. `FeatureGate` and `useHasFeature` are narrowed to
 * `FeatureKey` so typos and invented names fail at compile time. New keys
 * require a seed change in renewable_energy first, then this registry
 * mirrors — never the other way around.
 */

export const FEATURE_KEYS = {
  PLANT_LAYOUT: "plant_layout",
  OBSTRUCTION_EXCLUSION: "obstruction_exclusion",
  CABLE_ROUTING: "cable_routing",
  CABLE_MEASUREMENTS: "cable_measurements",
  ENERGY_YIELD: "energy_yield",
  GENERATION_ESTIMATES: "generation_estimates",
} as const

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS]

/**
 * All feature-key string values, in a stable order (registry insertion
 * order). Consumed by the contract test and any UI that needs to iterate
 * the full set (plan-summary dialog, admin debug tools).
 */
export const ALL_FEATURE_KEYS: readonly FeatureKey[] = Object.freeze(
  Object.values(FEATURE_KEYS)
)

/**
 * Type guard — narrows an unknown string to `FeatureKey`. Useful at the
 * entitlements-response boundary when parsing `availableFeatures` back
 * into a typed set.
 */
export function isFeatureKey(candidate: unknown): candidate is FeatureKey {
  return (
    typeof candidate === "string" &&
    (ALL_FEATURE_KEYS as readonly string[]).includes(candidate)
  )
}
