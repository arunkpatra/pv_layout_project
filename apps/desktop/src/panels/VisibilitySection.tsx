/**
 * VisibilitySection — canvas layer toggles in the Layout inspector tab.
 *
 * Shown only when a layout exists (hides before Generate; reappears
 * after each regenerate). Two toggles:
 *
 *   - Show AC cables — default off, gated on `CABLE_ROUTING` (Pro-tier).
 *     Disabled + "Pro" chip for Basic users.
 *   - Show lightning arresters — default off, **ungated**. LA placement
 *     is part of `plant_layout` (Basic-tier) per the renewable_energy
 *     seed label "Plant Layout (MMS, Inverter, LA)". Any user with a
 *     layout sees LAs in the data; the toggle is a UX refinement that
 *     doesn't need monetization (see ADR-0005 §9 "Ungated features").
 */
import { Chip, InspectorSection, Switch } from "@solarlayout/ui-desktop"
import { FEATURE_KEYS } from "@solarlayout/entitlements-client"
import { useHasFeature } from "../auth/FeatureGate"
import { useLayerVisibilityStore } from "../state/layerVisibility"

export function VisibilitySection() {
  const showAcCables = useLayerVisibilityStore((s) => s.showAcCables)
  const showLas = useLayerVisibilityStore((s) => s.showLas)
  const setShowAcCables = useLayerVisibilityStore((s) => s.setShowAcCables)
  const setShowLas = useLayerVisibilityStore((s) => s.setShowLas)

  const hasCableRouting = useHasFeature(FEATURE_KEYS.CABLE_ROUTING)

  return (
    <InspectorSection
      title="Layer visibility"
      collapsible
      persistKey="layout-panel.section.visibility"
    >
      <ToggleRow
        label="Show AC cable trench"
        entitled={hasCableRouting}
        checked={showAcCables}
        onCheckedChange={setShowAcCables}
      />
      <ToggleRow
        label="Show lightning arresters"
        entitled={true}
        checked={showLas}
        onCheckedChange={setShowLas}
      />
    </InspectorSection>
  )
}

function ToggleRow({
  label,
  entitled,
  checked,
  onCheckedChange,
}: {
  label: string
  entitled: boolean
  checked: boolean
  onCheckedChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-[12px] py-[6px]">
      <div className="flex items-center gap-[8px] min-w-0">
        <span className="text-[13px] text-[var(--text-primary)] truncate">
          {label}
        </span>
        {!entitled && (
          <Chip tone="accent" aria-label={`${label} requires Pro`}>
            Pro
          </Chip>
        )}
      </div>
      <Switch
        checked={entitled ? checked : false}
        disabled={!entitled}
        onCheckedChange={(next) => {
          if (entitled) onCheckedChange(next)
        }}
        aria-label={label}
      />
    </div>
  )
}
