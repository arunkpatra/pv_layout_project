/**
 * Thin context that makes the current entitlements available to
 * descendants without prop-drilling. Populated by App.tsx once the
 * entitlements query resolves.
 *
 * Consumers:
 *   - <FeatureGate>      checks `availableFeatures` membership
 *   - useHasFeature()    same, as a hook
 *   - <TopBar>           reads `plans[0].planName` for the chip
 *   - P10 / S4 (later)   read `projectQuota` / `projectsRemaining`
 *
 * The entitlements object is shaped per the mvp_api /v2/entitlements
 * contract (`EntitlementSummaryV2` — V1 EntitlementSummary + the project
 * quota fields). Pre-V2 consumers reading only V1 fields continue to
 * work unchanged via sub-type substitutability.
 */
import { createContext, useContext, type ReactNode } from "react"
import type { EntitlementSummaryV2 } from "@solarlayout/entitlements-client"

interface EntitlementsContextValue {
  entitlements: EntitlementSummaryV2 | null
  licenseKey: string | null
  /** Called from menu items / dialogs. Clears keyring and resets state. */
  onClearLicense: () => void
  /** Opens the license-info dialog. */
  onOpenLicenseInfo: () => void
}

const Ctx = createContext<EntitlementsContextValue | null>(null)

export function EntitlementsProvider({
  value,
  children,
}: {
  value: EntitlementsContextValue
  children: ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEntitlementsContext(): EntitlementsContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error(
      "useEntitlementsContext must be used inside <EntitlementsProvider>"
    )
  }
  return ctx
}
