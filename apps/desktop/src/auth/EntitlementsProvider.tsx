/**
 * Thin context that makes the current entitlements available to
 * descendants without prop-drilling. Populated by App.tsx once the
 * entitlements query resolves.
 *
 * Consumers:
 *   - <FeatureGate>      checks `availableFeatures` membership
 *   - useHasFeature()    same, as a hook
 *   - <TopBar>           reads `plans[0].planName` for the chip
 *
 * The entitlements object is shaped per the mvp_api /entitlements contract
 * (see @solarlayout/entitlements-client).
 */
import { createContext, useContext, type ReactNode } from "react"
import type { Entitlements } from "@solarlayout/entitlements-client"

interface EntitlementsContextValue {
  entitlements: Entitlements | null
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
