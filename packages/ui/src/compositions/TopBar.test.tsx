/**
 * RTL component tests for <TopBar>.
 *
 * TopBar is the Claude-Desktop-style window chrome: wordmark + breadcrumb
 * with project name + chip + Cmd+K palette button + Inspector / ToolRail
 * toggles + account dropdown. The component itself is presentational (all
 * data and handlers are props); these tests verify the contract:
 *
 *   1. Wordmark + breadcrumb separator render unconditionally.
 *   2. projectName prop renders the breadcrumb leaf; absence shows the
 *      "No project open" placeholder.
 *   3. chip prop renders alongside the project name.
 *   4. Each toggle (tool-rail, inspector) calls its handler.
 *   5. Cmd+K button calls onCommandPaletteClick + shows the ⌘K kbd.
 *   6. Account button shows initials; dropdown opens; user name + email
 *      surface inside; menu items wire to onSettings / onViewLicense /
 *      onClearLicense.
 *   7. Tool-rail and inspector toggles only render when handlers are
 *      provided (graceful absence).
 *   8. data-tauri-drag-region attribute lands on the root container so
 *      the native window stays draggable from the chrome surface.
 *
 * The visual surface (spacing, colors, fonts) is reviewed against the
 * normative reference screenshots in `reference_screenshots_for_UX_dsktop/`;
 * unit tests cover behavior + structure, not pixels.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TopBar } from "./TopBar"

describe("<TopBar>", () => {
  it("renders the SolarLayout wordmark and breadcrumb separator", () => {
    render(<TopBar />)
    expect(screen.getByText("SolarLayout")).toBeInTheDocument()
    expect(screen.getByText("/")).toBeInTheDocument()
  })

  it("shows 'No project open' when projectName is absent", () => {
    render(<TopBar />)
    expect(screen.getByText("No project open")).toBeInTheDocument()
  })

  it("renders projectName in the breadcrumb leaf when provided", () => {
    render(<TopBar projectName="phaseboundary2.kmz" />)
    expect(screen.getByText("phaseboundary2.kmz")).toBeInTheDocument()
    expect(screen.queryByText("No project open")).toBeNull()
  })

  it("renders the chip slot content", () => {
    render(<TopBar chip={<span>Pro Plus</span>} />)
    expect(screen.getByText("Pro Plus")).toBeInTheDocument()
  })

  it("Cmd+K button calls onCommandPaletteClick and shows the ⌘K shortcut", async () => {
    const onCommandPaletteClick = vi.fn()
    const user = userEvent.setup()
    render(<TopBar onCommandPaletteClick={onCommandPaletteClick} />)

    expect(screen.getByText(/⌘K/)).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Open command palette" })
    )
    expect(onCommandPaletteClick).toHaveBeenCalledTimes(1)
  })

  it("tool-rail toggle calls onToggleToolRail", async () => {
    const onToggleToolRail = vi.fn()
    const user = userEvent.setup()
    render(<TopBar onToggleToolRail={onToggleToolRail} />)
    await user.click(screen.getByRole("button", { name: "Toggle tool rail" }))
    expect(onToggleToolRail).toHaveBeenCalledTimes(1)
  })

  it("inspector toggle calls onToggleInspector", async () => {
    const onToggleInspector = vi.fn()
    const user = userEvent.setup()
    render(<TopBar onToggleInspector={onToggleInspector} />)
    await user.click(screen.getByRole("button", { name: "Toggle inspector" }))
    expect(onToggleInspector).toHaveBeenCalledTimes(1)
  })

  it("hides tool-rail and inspector toggles when handlers are not provided", () => {
    render(<TopBar />)
    expect(
      screen.queryByRole("button", { name: "Toggle tool rail" })
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Toggle inspector" })
    ).toBeNull()
  })

  it("account button shows the supplied initials", () => {
    render(<TopBar userInitials="AP" />)
    expect(
      screen.getByRole("button", { name: "Account menu" })
    ).toHaveTextContent("AP")
  })

  it("account dropdown opens to reveal name, email, and menu items", async () => {
    const user = userEvent.setup()
    render(
      <TopBar
        userInitials="AP"
        userName="Arun Patra"
        userEmail="arun@journium.app"
      />
    )

    // Closed by default — dropdown content not in DOM.
    expect(screen.queryByText("Arun Patra")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Account menu" }))

    expect(screen.getByText("Arun Patra")).toBeInTheDocument()
    expect(screen.getByText("arun@journium.app")).toBeInTheDocument()
    expect(screen.getByText("Settings")).toBeInTheDocument()
    expect(screen.getByText("View license")).toBeInTheDocument()
    expect(screen.getByText("Clear license")).toBeInTheDocument()
    expect(screen.getByText("About SolarLayout")).toBeInTheDocument()
  })

  it("Settings menu item calls onSettings", async () => {
    const onSettings = vi.fn()
    const user = userEvent.setup()
    render(<TopBar onSettings={onSettings} />)
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    await user.click(screen.getByText("Settings"))
    expect(onSettings).toHaveBeenCalledTimes(1)
  })

  it("View license menu item calls onViewLicense", async () => {
    const onViewLicense = vi.fn()
    const user = userEvent.setup()
    render(<TopBar onViewLicense={onViewLicense} />)
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    await user.click(screen.getByText("View license"))
    expect(onViewLicense).toHaveBeenCalledTimes(1)
  })

  it("Clear license menu item calls onClearLicense", async () => {
    const onClearLicense = vi.fn()
    const user = userEvent.setup()
    render(<TopBar onClearLicense={onClearLicense} />)
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    await user.click(screen.getByText("Clear license"))
    expect(onClearLicense).toHaveBeenCalledTimes(1)
  })

  it("renders the masked license key inside the account dropdown when supplied", async () => {
    const user = userEvent.setup()
    render(<TopBar maskedLicenseKey="sl_live_…XYZ4" />)
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    expect(screen.getByText("sl_live_…XYZ4")).toBeInTheDocument()
  })

  it("renders the quota summary node inside the account dropdown when supplied", async () => {
    const user = userEvent.setup()
    render(
      <TopBar quotaSummary={<span>5 calcs · 2 projects remaining</span>} />
    )
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    expect(
      screen.getByText("5 calcs · 2 projects remaining")
    ).toBeInTheDocument()
  })

  it("does not render the Buy more menu item when onBuyMore is absent", async () => {
    const user = userEvent.setup()
    render(<TopBar />)
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    expect(screen.queryByText("Buy more")).toBeNull()
  })

  it("renders the Buy more menu item when onBuyMore is provided", async () => {
    const user = userEvent.setup()
    render(<TopBar onBuyMore={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    expect(screen.getByText("Buy more")).toBeInTheDocument()
  })

  it("Buy more menu item calls onBuyMore", async () => {
    const onBuyMore = vi.fn()
    const user = userEvent.setup()
    render(<TopBar onBuyMore={onBuyMore} />)
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    await user.click(screen.getByText("Buy more"))
    expect(onBuyMore).toHaveBeenCalledTimes(1)
  })

  it("hides the user/license/quota header block when no header props are supplied", async () => {
    const user = userEvent.setup()
    render(<TopBar />)
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    // Account label still renders, but no name / email / key / quota.
    expect(screen.getByText("Account")).toBeInTheDocument()
    expect(screen.queryByText(/sl_live_/)).toBeNull()
  })

  it("root container carries data-tauri-drag-region for native window dragging", () => {
    const { container } = render(<TopBar />)
    const root = container.querySelector("[data-tauri-drag-region]")
    expect(root).not.toBeNull()
    // Wordmark + breadcrumb spans should also be draggable surfaces — pick
    // the wordmark text and walk up to its drag-region ancestor.
    const wordmark = screen.getByText("SolarLayout")
    expect(wordmark.closest("[data-tauri-drag-region]")).not.toBeNull()
  })
})
