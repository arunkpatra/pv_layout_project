/**
 * Conditional wrapper that renders `children` only when the current
 * session's entitlements include `feature`. If not entitled, renders
 * `fallback` (default: nothing).
 *
 * Visual-only gate — the authoritative enforcement lives in the sidecar's
 * `require_feature` dependency. Defense in depth: shell hides, sidecar
 * enforces.
 *
 * Usage:
 *   <FeatureGate feature="dxf" fallback={<UpgradeBadge />}>
 *     <Button>Export DXF</Button>
 *   </FeatureGate>
 */
import type { ReactNode } from "react"
import { useEntitlementsContext } from "./EntitlementsProvider"

export interface FeatureGateProps {
  feature: string
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

export function useHasFeature(feature: string): boolean {
  const { entitlements } = useEntitlementsContext()
  return entitlements?.availableFeatures.includes(feature) ?? false
}
