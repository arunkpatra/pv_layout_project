/**
 * RTL component tests for <LicenseKeyDialog>.
 *
 * Two modes:
 *   - "first-launch" — blocking; no Cancel button; cannot dismiss via Escape /
 *     outside-click. Shown when no key is stored and the app cannot proceed.
 *   - "change"       — dismissible via Cancel / Escape / outside-click. Used
 *     from LicenseInfoDialog when the user wants to enter a different key.
 *
 * Behaviours covered:
 *   1. Render — title, description, input visible; mode-specific Cancel button
 *      presence.
 *   2. Format validation — Save with a key that doesn't start with `sl_live_`
 *      surfaces an inline format error and does not call onSubmit.
 *   3. Happy path — Save with a plausible key calls onSubmit with the trimmed
 *      value.
 *   4. Submitting state — submitting=true disables input + button text shows
 *      "Verifying…".
 *   5. External errorMessage prop — server-side error (e.g. 401 from
 *      /entitlements) shows inline.
 *   6. Mode-specific Cancel — "change" mode wires Cancel to onCancel;
 *      "first-launch" suppresses the Cancel button entirely.
 *
 * The signup-link button calls into @tauri-apps/plugin-shell which is mocked
 * at the import boundary so tests don't open browser tabs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}))

import { LicenseKeyDialog } from "./LicenseKeyDialog"

describe("<LicenseKeyDialog>", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders title, description and the license-key input", () => {
    render(
      <LicenseKeyDialog open mode="first-launch" onSubmit={vi.fn()} />
    )
    expect(
      screen.getByText("Enter your SolarLayout license key")
    ).toBeInTheDocument()
    expect(screen.getByLabelText("License key")).toBeInTheDocument()
    // The dialog also shows the prefix hint.
    expect(screen.getByText(/sl_live_/)).toBeInTheDocument()
  })

  it("first-launch mode hides the Cancel button", () => {
    render(
      <LicenseKeyDialog
        open
        mode="first-launch"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
  })

  it("change mode shows Cancel and wires it to onCancel", async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <LicenseKeyDialog
        open
        mode="change"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    )
    const cancelButton = screen.getByRole("button", { name: "Cancel" })
    await user.click(cancelButton)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("Save with a key missing the sl_live_ prefix shows a format error and does not submit", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <LicenseKeyDialog open mode="first-launch" onSubmit={onSubmit} />
    )

    const input = screen.getByLabelText("License key")
    await user.type(input, "wrongprefix_abc123")
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText(/License keys start with sl_live_/i)
    ).toBeInTheDocument()
  })

  it("Save with a plausible sl_live_ key calls onSubmit with the trimmed value", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <LicenseKeyDialog open mode="first-launch" onSubmit={onSubmit} />
    )

    const input = screen.getByLabelText("License key")
    await user.type(input, "  sl_live_abcdef0123456789  ")
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith("sl_live_abcdef0123456789")
  })

  it("typing after a format error clears it", async () => {
    const user = userEvent.setup()
    render(
      <LicenseKeyDialog open mode="first-launch" onSubmit={vi.fn()} />
    )

    const input = screen.getByLabelText("License key")
    await user.type(input, "bad")
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(
      screen.getByText(/License keys start with sl_live_/i)
    ).toBeInTheDocument()

    // Resume typing; the error should disappear immediately.
    await user.type(input, "x")
    expect(
      screen.queryByText(/License keys start with sl_live_/i)
    ).toBeNull()
  })

  it("submitting=true disables the input and shows Verifying… label", () => {
    render(
      <LicenseKeyDialog
        open
        mode="first-launch"
        onSubmit={vi.fn()}
        submitting
      />
    )
    expect(screen.getByLabelText("License key")).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Verifying…" })
    ).toBeInTheDocument()
  })

  it("renders the externally-supplied errorMessage (server-side 401, etc.)", () => {
    render(
      <LicenseKeyDialog
        open
        mode="first-launch"
        onSubmit={vi.fn()}
        errorMessage="License key not recognised."
      />
    )
    expect(
      screen.getByText("License key not recognised.")
    ).toBeInTheDocument()
  })

  it("Save button is disabled when the input is empty (no whitespace key submitted)", () => {
    render(
      <LicenseKeyDialog open mode="first-launch" onSubmit={vi.fn()} />
    )
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })
})
