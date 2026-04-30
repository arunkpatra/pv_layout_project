/**
 * Tests for `QuotaIndicator` — P10 state-aware quota chip.
 *
 * Three render branches, one click contract per branch:
 *   - Normal (licensed=true): renders plan name + numbers.
 *   - Exhausted (licensed=false, entActive=true): renders "Out of
 *     credits — Buy more".
 *   - Deactivated (licensed=false, entActive=false): renders
 *     "Subscription deactivated — Contact support".
 *
 * The click handler delegates to `onClick` if provided (tests use this
 * to assert without mocking @tauri-apps/plugin-shell). The default
 * shell-or-window.open behaviour is exercised at the Tauri runtime
 * level via the fixture session indirectly (the mutation hook tests
 * already cover the @tauri-apps/plugin-http variant of the same
 * pattern).
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { EntitlementSummaryV2 } from "@solarlayout/entitlements-client"
import { QuotaIndicator } from "./QuotaIndicator"

const baseEntitlements: EntitlementSummaryV2 = {
  user: { name: "Test", email: "test@example.com" },
  plans: [
    {
      planName: "Pro",
      features: [],
      totalCalculations: 50,
      usedCalculations: 8,
      remainingCalculations: 42,
    },
  ],
  licensed: true,
  availableFeatures: [],
  totalCalculations: 50,
  usedCalculations: 8,
  remainingCalculations: 42,
  projectQuota: 10,
  projectsActive: 3,
  projectsRemaining: 7,
  entitlementsActive: true,
}

describe("QuotaIndicator — normal state", () => {
  it("renders plan name + calc counts + project counts", () => {
    render(<QuotaIndicator entitlements={baseEntitlements} />)
    expect(screen.getByText("Pro")).toBeInTheDocument()
    expect(
      screen.getByText(/42\/50 calcs · 3\/10 projects/)
    ).toBeInTheDocument()
  })

  it("falls back to 'Free' if no plans are present", () => {
    render(
      <QuotaIndicator
        entitlements={{ ...baseEntitlements, plans: [] }}
      />
    )
    expect(screen.getByText("Free")).toBeInTheDocument()
  })

  it("calls onClick when the chip is clicked (normal-mode upgrade route)", () => {
    const onClick = vi.fn()
    render(
      <QuotaIndicator entitlements={baseEntitlements} onClick={onClick} />
    )
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe("QuotaIndicator — exhausted state (licensed=false, entActive=true)", () => {
  const exhausted: EntitlementSummaryV2 = {
    ...baseEntitlements,
    licensed: false,
    entitlementsActive: true,
    totalCalculations: 0,
    usedCalculations: 0,
    remainingCalculations: 0,
  }

  it("renders the 'Out of credits — Buy more' label", () => {
    render(<QuotaIndicator entitlements={exhausted} />)
    expect(screen.getByText(/Out of credits/)).toBeInTheDocument()
    expect(screen.getByText(/Buy more/)).toBeInTheDocument()
  })

  it("does NOT render the calc-count numbers (the message is the message)", () => {
    render(<QuotaIndicator entitlements={exhausted} />)
    expect(screen.queryByText(/0\/0 calcs/)).not.toBeInTheDocument()
  })

  it("calls onClick when the upgrade chip is clicked", () => {
    const onClick = vi.fn()
    render(<QuotaIndicator entitlements={exhausted} onClick={onClick} />)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe("QuotaIndicator — deactivated state (licensed=false, entActive=false)", () => {
  const deactivated: EntitlementSummaryV2 = {
    ...baseEntitlements,
    licensed: false,
    entitlementsActive: false,
    totalCalculations: 0,
    usedCalculations: 0,
    remainingCalculations: 0,
    projectQuota: 0,
    projectsRemaining: 0,
  }

  it("renders the 'Subscription deactivated — Contact support' label", () => {
    render(<QuotaIndicator entitlements={deactivated} />)
    expect(screen.getByText(/Subscription deactivated/)).toBeInTheDocument()
    expect(screen.getByText(/Contact support/)).toBeInTheDocument()
  })

  it("calls onClick when the support chip is clicked", () => {
    const onClick = vi.fn()
    render(<QuotaIndicator entitlements={deactivated} onClick={onClick} />)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
