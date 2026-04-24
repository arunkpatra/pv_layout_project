/**
 * Conditional wrapper that renders `children` only when the current
 * session's entitlements include `feature`. If not entitled, renders
 * `fallback` (default: nothing).
 *
 * Visual-only gate — the authoritative enforcement lives in the sidecar's
 * `require_feature` dependency. Defense in depth: shell hides, sidecar
 * enforces.
 *
 * The `feature` prop is narrowed to `FeatureKey` — the typed registry
 * defined in `@solarlayout/entitlements-client`. String literals fail
 * typecheck; this is the structural guard that prevents the S7 invented-
 * key failure mode from recurring (see ADR-0005).
 *
 * Usage:
 *   import { FEATURE_KEYS } from "@solarlayout/entitlements-client"
 *   <FeatureGate feature={FEATURE_KEYS.CABLE_ROUTING} fallback={<UpgradeBadge />}>
 *     <Button>Show AC cables</Button>
 *   </FeatureGate>
 */
import type { ReactNode } from "react"
import type { FeatureKey } from "@solarlayout/entitlements-client"
import { useEntitlementsContext } from "./EntitlementsProvider"

export interface FeatureGateProps {
  feature: FeatureKey
  children: ReactNode
  /** Rendered when not entitled. Default: null. */
  fallback?: ReactNode
}

export function FeatureGate({
  feature,
  children,
  fallback = null,
}: FeatureGateProps) {
  const { entitlements } = useEntitlementsContext()
  const allowed = entitlements?.availableFeatures.includes(feature) ?? false
  return <>{allowed ? children : fallback}</>
}

export function useHasFeature(feature: FeatureKey): boolean {
  const { entitlements } = useEntitlementsContext()
  return entitlements?.availableFeatures.includes(feature) ?? false
}
