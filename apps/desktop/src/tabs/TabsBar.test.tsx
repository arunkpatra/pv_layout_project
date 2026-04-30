/**
 * Tests for `TabsBar` — S2 multi-tab UI.
 *
 * Covers the click → handler contracts; the slice itself is tested in
 * `state/tabs.test.ts`. These tests verify the wiring + the active
 * highlight + the close-button on hover/active.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { TabsBar } from "./TabsBar"
import { useTabsStore } from "../state/tabs"

beforeEach(() => {
  useTabsStore.getState().reset()
})

describe("TabsBar", () => {
  it("renders one button per open tab + the new-project tile", () => {
    useTabsStore.getState().openTab("prj_a", "Site A")
    useTabsStore.getState().openTab("prj_b", "Site B")
    render(
      <TabsBar
        onSwitch={vi.fn()}
        onClose={vi.fn()}
        onNewProject={vi.fn()}
      />
    )
    expect(screen.getByText("Site A")).toBeInTheDocument()
    expect(screen.getByText("Site B")).toBeInTheDocument()
    expect(screen.getByLabelText("New project")).toBeInTheDocument()
  })

  it("marks the active tab via aria-selected", () => {
    const idA = useTabsStore.getState().openTab("prj_a", "A")
    const idB = useTabsStore.getState().openTab("prj_b", "B")
    render(
      <TabsBar onSwitch={vi.fn()} onClose={vi.fn()} onNewProject={vi.fn()} />
    )
    // B was opened most-recently → active.
    const tabA = screen.getByText("A").closest("[role='tab']")!
    const tabB = screen.getByText("B").closest("[role='tab']")!
    expect(tabA.getAttribute("aria-selected")).toBe("false")
    expect(tabB.getAttribute("aria-selected")).toBe("true")
    void idA
    void idB
  })

  it("fires onSwitch with the right id when a tab is clicked", () => {
    const onSwitch = vi.fn()
    const idA = useTabsStore.getState().openTab("prj_a", "A")
    useTabsStore.getState().openTab("prj_b", "B")
    render(
      <TabsBar onSwitch={onSwitch} onClose={vi.fn()} onNewProject={vi.fn()} />
    )
    fireEvent.click(screen.getByText("A").closest("[role='tab']")!)
    expect(onSwitch).toHaveBeenCalledWith(idA)
  })

  it("fires onClose with the right id when the X button is clicked, and does NOT fire onSwitch", () => {
    const onClose = vi.fn()
    const onSwitch = vi.fn()
    useTabsStore.getState().openTab("prj_a", "Site A")
    render(
      <TabsBar onSwitch={onSwitch} onClose={onClose} onNewProject={vi.fn()} />
    )
    const tab = screen.getByText("Site A").closest("[role='tab']")!
    const closeBtn = within(tab as HTMLElement).getByLabelText(
      "Close Site A"
    )
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSwitch).not.toHaveBeenCalled()
  })

  it("middle-click on a tab fires onClose (standard browser-tab UX)", () => {
    const onClose = vi.fn()
    const idA = useTabsStore.getState().openTab("prj_a", "A")
    render(
      <TabsBar onSwitch={vi.fn()} onClose={onClose} onNewProject={vi.fn()} />
    )
    const tab = screen.getByText("A").closest("[role='tab']")!
    // happy-dom doesn't ship fireEvent.auxClick; dispatch the native
    // event to invoke the same React onAuxClick handler.
    const evt = new MouseEvent("auxclick", { bubbles: true, button: 1 })
    tab.dispatchEvent(evt)
    expect(onClose).toHaveBeenCalledWith(idA)
  })

  it("fires onNewProject when the + tile is clicked", () => {
    const onNewProject = vi.fn()
    render(
      <TabsBar
        onSwitch={vi.fn()}
        onClose={vi.fn()}
        onNewProject={onNewProject}
      />
    )
    fireEvent.click(screen.getByLabelText("New project"))
    expect(onNewProject).toHaveBeenCalledTimes(1)
  })

  it("renders the + tile even with zero open tabs", () => {
    // Empty state — recents view is the canvas content; the + tile in
    // the bar is still a valid affordance.
    render(
      <TabsBar onSwitch={vi.fn()} onClose={vi.fn()} onNewProject={vi.fn()} />
    )
    expect(screen.getByLabelText("New project")).toBeInTheDocument()
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
  })

  describe("Home tab (S1-10)", () => {
    it("renders the Home tab when onHome is provided", () => {
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onHome={vi.fn()}
        />
      )
      expect(
        screen.getByLabelText("Home — Recent projects")
      ).toBeInTheDocument()
    })

    it("hides the Home tab when onHome is not provided", () => {
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
        />
      )
      expect(
        screen.queryByLabelText("Home — Recent projects")
      ).toBeNull()
    })

    it("Home tab is active (aria-selected=true) when activeTabId is null", () => {
      // Default state: no tabs opened → activeTabId already null.
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onHome={vi.fn()}
        />
      )
      const home = screen.getByLabelText("Home — Recent projects")
      expect(home.getAttribute("aria-selected")).toBe("true")
    })

    it("Home tab is inactive when a project tab is active", () => {
      useTabsStore.getState().openTab("prj_a", "A")
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onHome={vi.fn()}
        />
      )
      const home = screen.getByLabelText("Home — Recent projects")
      expect(home.getAttribute("aria-selected")).toBe("false")
    })

    it("clicking Home tab fires onHome", () => {
      const onHome = vi.fn()
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onHome={onHome}
        />
      )
      fireEvent.click(screen.getByLabelText("Home — Recent projects"))
      expect(onHome).toHaveBeenCalledTimes(1)
    })

    it("Home tab has no close button (visual + a11y guarantee)", () => {
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onHome={vi.fn()}
        />
      )
      // No `Close Home` or similar accessible name.
      expect(
        screen.queryByLabelText(/^Close Home/i)
      ).toBeNull()
    })
  })

  // ── SP3 — right-click context menu (Rename / Delete) ─────────────────

  describe("SP3 — right-click context menu", () => {
    const noopRename = () => Promise.resolve()
    const noopDelete = () => Promise.resolve()

    it("right-click on a project tab opens the context menu with Rename + Delete", async () => {
      useTabsStore.getState().openTab("prj_a", "Site A")
      const user = (await import("@testing-library/user-event")).default.setup()
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onRename={noopRename}
          onDelete={noopDelete}
        />
      )
      const tab = screen.getByText("Site A").closest("[role='tab']")!
      // Radix ContextMenu listens for the native `contextmenu` event.
      fireEvent.contextMenu(tab)
      // Menu item names use ellipsis to match the Recents card menu.
      expect(
        await screen.findByRole("menuitem", { name: /Rename/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("menuitem", { name: /Delete/i })
      ).toBeInTheDocument()
      void user
    })

    it("Rename menu item opens RenameProjectDialog pre-filled with the tab's projectName", async () => {
      useTabsStore.getState().openTab("prj_a", "Site A")
      const user = (await import("@testing-library/user-event")).default.setup()
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onRename={noopRename}
          onDelete={noopDelete}
        />
      )
      const tab = screen.getByText("Site A").closest("[role='tab']")!
      fireEvent.contextMenu(tab)
      const renameItem = await screen.findByRole("menuitem", {
        name: /Rename/i,
      })
      await user.click(renameItem)
      expect(screen.getByText("Rename project")).toBeInTheDocument()
      expect(
        (screen.getByLabelText("New name") as HTMLInputElement).value
      ).toBe("Site A")
    })

    it("Rename Save invokes onRename with the right (projectId, name) tuple", async () => {
      const onRename = vi.fn().mockResolvedValue(undefined)
      useTabsStore.getState().openTab("prj_a", "Site A")
      const user = (await import("@testing-library/user-event")).default.setup()
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onRename={onRename}
          onDelete={noopDelete}
        />
      )
      const tab = screen.getByText("Site A").closest("[role='tab']")!
      fireEvent.contextMenu(tab)
      await user.click(
        await screen.findByRole("menuitem", { name: /Rename/i })
      )
      const input = screen.getByLabelText("New name")
      await user.clear(input)
      await user.type(input, "Renamed Site A")
      await user.click(screen.getByRole("button", { name: "Save" }))
      expect(onRename).toHaveBeenCalledWith("prj_a", "Renamed Site A")
    })

    it("Delete menu item opens DeleteProjectConfirmDialog; confirm invokes onDelete (after type-to-confirm)", async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined)
      useTabsStore.getState().openTab("prj_a", "Site A")
      const user = (await import("@testing-library/user-event")).default.setup()
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onRename={noopRename}
          onDelete={onDelete}
        />
      )
      const tab = screen.getByText("Site A").closest("[role='tab']")!
      fireEvent.contextMenu(tab)
      await user.click(
        await screen.findByRole("menuitem", { name: /Delete/i })
      )
      expect(screen.getByText("Delete project")).toBeInTheDocument()
      await user.type(screen.getByLabelText(/Type/), "delete")
      await user.click(screen.getByRole("button", { name: "Delete" }))
      expect(onDelete).toHaveBeenCalledWith("prj_a")
    })

    it("Rename error surfaces inline + dialog stays open", async () => {
      const onRename = vi
        .fn()
        .mockRejectedValue(new Error("VALIDATION_ERROR: name in use"))
      useTabsStore.getState().openTab("prj_a", "Site A")
      const user = (await import("@testing-library/user-event")).default.setup()
      render(
        <TabsBar
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onNewProject={vi.fn()}
          onRename={onRename}
          onDelete={noopDelete}
        />
      )
      const tab = screen.getByText("Site A").closest("[role='tab']")!
      fireEvent.contextMenu(tab)
      await user.click(
        await screen.findByRole("menuitem", { name: /Rename/i })
      )
      const input = screen.getByLabelText("New name")
      await user.clear(input)
      await user.type(input, "another name")
      await user.click(screen.getByRole("button", { name: "Save" }))
      expect(
        screen.getByText(/VALIDATION_ERROR: name in use/)
      ).toBeInTheDocument()
      expect(screen.getByText("Rename project")).toBeInTheDocument()
    })

    it("when neither onRename nor onDelete is supplied, right-click does NOT open a menu (preview/test contexts)", () => {
      useTabsStore.getState().openTab("prj_a", "Site A")
      render(
        <TabsBar onSwitch={vi.fn()} onClose={vi.fn()} onNewProject={vi.fn()} />
      )
      const tab = screen.getByText("Site A").closest("[role='tab']")!
      fireEvent.contextMenu(tab)
      // No menu items rendered.
      expect(
        screen.queryByRole("menuitem", { name: /Rename/i })
      ).toBeNull()
      expect(
        screen.queryByRole("menuitem", { name: /Delete/i })
      ).toBeNull()
    })
  })
})
