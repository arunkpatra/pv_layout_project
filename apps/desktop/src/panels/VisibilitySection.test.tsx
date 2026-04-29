/**
 * VisibilitySection RTL tests.
 *
 * Covers the two behaviour axes S10.2 settled per ADR-0005:
 *
 *   1. AC cables toggle — gated on `CABLE_ROUTING` (Pro-tier). Pro /
 *      Pro Plus users see it enabled; Basic users see it disabled with
 *      a "Pro" chip.
 *   2. LA toggle — ungated. Every licensed user sees it enabled
 *      regardless of plan, because LA placement is part of
 *      `plant_layout` (Basic-tier label: "Plant Layout (MMS, Inverter, LA)").
 */
import { describe, it, expect, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  FEATURE_KEYS,
  type EntitlementSummaryV2,
  type FeatureKey,
} from "@solarlayout/entitlements-client"
import { EntitlementsProvider } from "../auth/EntitlementsProvider"
import { useLayerVisibilityStore } from "../state/layerVisibility"
import { VisibilitySection } from "./VisibilitySection"

const BASE_ENT: EntitlementSummaryV2 = {
  user: { name: "Test User", email: "test@example.com" },
  plans: [
    {
      planName: "Test",
      features: [],
      totalCalculations: 100,
      usedCalculations: 0,
      remainingCalculations: 100,
    },
  ],
  licensed: true,
  availableFeatures: [],
  totalCalculations: 100,
  usedCalculations: 0,
  remainingCalculations: 100,
  projectQuota: 3,
  projectsActive: 0,
  projectsRemaining: 3,
}

const BASIC_FEATURES: FeatureKey[] = [
  FEATURE_KEYS.PLANT_LAYOUT,
  FEATURE_KEYS.OBSTRUCTION_EXCLUSION,
]
const PRO_FEATURES: FeatureKey[] = [
  ...BASIC_FEATURES,
  FEATURE_KEYS.CABLE_ROUTING,
  FEATURE_KEYS.CABLE_MEASUREMENTS,
]

function withEnt(features: FeatureKey[]) {
  return {
    entitlements: { ...BASE_ENT, availableFeatures: features },
    licenseKey: "sl_live_test",
    onClearLicense: () => {},
    onOpenLicenseInfo: () => {},
  }
}

function renderSection(features: FeatureKey[]) {
  return render(
    <EntitlementsProvider value={withEnt(features)}>
      <VisibilitySection />
    </EntitlementsProvider>
  )
}

describe("VisibilitySection", () => {
  beforeEach(() => {
    useLayerVisibilityStore.getState().resetToDefaults()
  })

  it("renders both toggle rows with the expected labels", () => {
    renderSection(PRO_FEATURES)
    expect(screen.getByText("Show AC cables")).toBeInTheDocument()
    expect(screen.getByText("Show lightning arresters")).toBeInTheDocument()
  })

  it("Pro user: clicking 'Show AC cables' dispatches to the store", async () => {
    const user = userEvent.setup()
    renderSection(PRO_FEATURES)

    expect(useLayerVisibilityStore.getState().showAcCables).toBe(false)

    const sw = screen.getByRole("switch", { name: /Show AC cables/i })
    await user.click(sw)

    expect(useLayerVisibilityStore.getState().showAcCables).toBe(true)
  })

  it("Basic user: clicking 'Show lightning arresters' still dispatches (ungated)", async () => {
    const user = userEvent.setup()
    renderSection(BASIC_FEATURES)

    expect(useLayerVisibilityStore.getState().showLas).toBe(false)

    const sw = screen.getByRole("switch", { name: /Show lightning arresters/i })
    await user.click(sw)

    expect(useLayerVisibilityStore.getState().showLas).toBe(true)
  })

  it("Basic user: AC cables toggle disabled with 'Pro' chip; LA toggle remains enabled", () => {
    renderSection(BASIC_FEATURES)

    const acSwitch = screen.getByRole("switch", { name: /Show AC cables/i })
    const laSwitch = screen.getByRole("switch", { name: /Show lightning arresters/i })
    expect(acSwitch).toBeDisabled()
    expect(laSwitch).not.toBeDisabled()

    // Exactly one Pro chip — on the AC cables row only.
    expect(screen.getAllByText("Pro")).toHaveLength(1)
  })

  it("Basic user: clicking the locked AC cables toggle does NOT mutate the store", async () => {
    const user = userEvent.setup()
    renderSection(BASIC_FEATURES)

    const sw = screen.getByRole("switch", { name: /Show AC cables/i })
    await user.click(sw)

    expect(useLayerVisibilityStore.getState().showAcCables).toBe(false)
  })

  it("Pro user: no 'Pro' chip in the DOM (both toggles entitled)", () => {
    renderSection(PRO_FEATURES)
    expect(screen.queryByText("Pro")).not.toBeInTheDocument()
  })
})
