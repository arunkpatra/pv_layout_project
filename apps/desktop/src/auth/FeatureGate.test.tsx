/**
 * Tests for <FeatureGate> + useHasFeature.
 *
 * The component is small (~10 lines of logic) but high-consequence: this
 * is the visual half of the per-ADR-0005 double-sided enforcement. The
 * sidecar's `require_feature` dependency is the authoritative gate; the
 * shell hides UI controls based on the same `availableFeatures` set so
 * the user never sees a button they can't use.
 *
 * Behaviours covered:
 *   1. Renders children when the feature is in availableFeatures.
 *   2. Renders fallback when the feature is absent.
 *   3. Renders fallback when entitlements are null (loading / no license).
 *   4. Default fallback is null (renders nothing) when not entitled.
 *   5. useHasFeature returns true / false matching availableFeatures
 *      membership.
 *   6. Throws when used outside an <EntitlementsProvider> — the same
 *      guard the context exposes; documents the failure-mode for future
 *      callers who forget to wrap.
 */
import { describe, it, expect, vi } from "vitest"
import type { ReactNode } from "react"
import { render, screen, renderHook } from "@testing-library/react"
import {
  FEATURE_KEYS,
  type EntitlementSummaryV2,
} from "@solarlayout/entitlements-client"
import { EntitlementsProvider } from "./EntitlementsProvider"
import { FeatureGate, useHasFeature } from "./FeatureGate"

function entitlementsWith(...features: string[]): EntitlementSummaryV2 {
  return {
    user: { name: "Test", email: "test@example.com" },
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
    availableFeatures: features,
    totalCalculations: 100,
    usedCalculations: 0,
    remainingCalculations: 100,
    projectQuota: 3,
    projectsActive: 0,
    projectsRemaining: 3,
    entitlementsActive: true,
  }
}

function withProvider(
  entitlements: EntitlementSummaryV2 | null
): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return (
      <EntitlementsProvider
        value={{
          entitlements,
          licenseKey: entitlements?.licensed ? "sl_live_test" : null,
          onClearLicense: vi.fn(),
          onOpenLicenseInfo: vi.fn(),
        }}
      >
        {children}
      </EntitlementsProvider>
    )
  }
}

describe("<FeatureGate>", () => {
  it("renders children when the feature is in availableFeatures", () => {
    const Wrap = withProvider(entitlementsWith(FEATURE_KEYS.CABLE_ROUTING))
    render(
      <Wrap>
        <FeatureGate feature={FEATURE_KEYS.CABLE_ROUTING}>
          <span>Cable button</span>
        </FeatureGate>
      </Wrap>
    )
    expect(screen.getByText("Cable button")).toBeInTheDocument()
  })

  it("renders the fallback when the feature is absent", () => {
    const Wrap = withProvider(entitlementsWith(FEATURE_KEYS.PLANT_LAYOUT))
    render(
      <Wrap>
        <FeatureGate
          feature={FEATURE_KEYS.CABLE_ROUTING}
          fallback={<span>Locked</span>}
        >
          <span>Cable button</span>
        </FeatureGate>
      </Wrap>
    )
    expect(screen.queryByText("Cable button")).toBeNull()
    expect(screen.getByText("Locked")).toBeInTheDocument()
  })

  it("renders the fallback when entitlements are null (no license / loading)", () => {
    const Wrap = withProvider(null)
    render(
      <Wrap>
        <FeatureGate
          feature={FEATURE_KEYS.PLANT_LAYOUT}
          fallback={<span>Sign in</span>}
        >
          <span>Layout button</span>
        </FeatureGate>
      </Wrap>
    )
    expect(screen.queryByText("Layout button")).toBeNull()
    expect(screen.getByText("Sign in")).toBeInTheDocument()
  })

  it("default fallback is nothing — children are simply absent when not entitled", () => {
    const Wrap = withProvider(entitlementsWith(FEATURE_KEYS.PLANT_LAYOUT))
    const { container } = render(
      <Wrap>
        <FeatureGate feature={FEATURE_KEYS.ENERGY_YIELD}>
          <span>Energy yield button</span>
        </FeatureGate>
      </Wrap>
    )
    expect(screen.queryByText("Energy yield button")).toBeNull()
    // No fallback supplied → empty render. The only DOM child is the
    // EntitlementsProvider wrapper which renders no markup of its own.
    expect(container.textContent).toBe("")
  })

  it("multi-feature entitlements: each feature gates independently", () => {
    const Wrap = withProvider(
      entitlementsWith(
        FEATURE_KEYS.PLANT_LAYOUT,
        FEATURE_KEYS.CABLE_ROUTING
      )
    )
    render(
      <Wrap>
        <FeatureGate feature={FEATURE_KEYS.PLANT_LAYOUT}>
          <span>A</span>
        </FeatureGate>
        <FeatureGate feature={FEATURE_KEYS.CABLE_ROUTING}>
          <span>B</span>
        </FeatureGate>
        <FeatureGate
          feature={FEATURE_KEYS.ENERGY_YIELD}
          fallback={<span>C-locked</span>}
        >
          <span>C</span>
        </FeatureGate>
      </Wrap>
    )
    expect(screen.getByText("A")).toBeInTheDocument()
    expect(screen.getByText("B")).toBeInTheDocument()
    expect(screen.queryByText("C")).toBeNull()
    expect(screen.getByText("C-locked")).toBeInTheDocument()
  })
})

describe("useHasFeature", () => {
  it("returns true when the feature is in availableFeatures", () => {
    const { result } = renderHook(
      () => useHasFeature(FEATURE_KEYS.CABLE_ROUTING),
      {
        wrapper: withProvider(
          entitlementsWith(FEATURE_KEYS.CABLE_ROUTING)
        ),
      }
    )
    expect(result.current).toBe(true)
  })

  it("returns false when the feature is absent", () => {
    const { result } = renderHook(
      () => useHasFeature(FEATURE_KEYS.ENERGY_YIELD),
      {
        wrapper: withProvider(entitlementsWith(FEATURE_KEYS.PLANT_LAYOUT)),
      }
    )
    expect(result.current).toBe(false)
  })

  it("returns false when entitlements are null", () => {
    const { result } = renderHook(
      () => useHasFeature(FEATURE_KEYS.PLANT_LAYOUT),
      { wrapper: withProvider(null) }
    )
    expect(result.current).toBe(false)
  })
})

describe("EntitlementsProvider guard", () => {
  it("FeatureGate throws a clear error when used outside <EntitlementsProvider>", () => {
    // Suppress React's expected error log for this assertion.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {})
    try {
      expect(() =>
        render(
          <FeatureGate feature={FEATURE_KEYS.PLANT_LAYOUT}>
            <span>x</span>
          </FeatureGate>
        )
      ).toThrow(/useEntitlementsContext must be used inside <EntitlementsProvider>/)
    } finally {
      consoleError.mockRestore()
    }
  })
})
