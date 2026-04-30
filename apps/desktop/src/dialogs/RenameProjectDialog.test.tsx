/**
 * RTL component tests for <RenameProjectDialog>.
 *
 * SP3 surface-agnostic Dialog (mounted by RecentsView + TabsBar).
 *
 * Behaviours covered:
 *   1. open=false → not rendered.
 *   2. open=true → title, description, input pre-filled with project.name.
 *   3. Empty name → Save disabled.
 *   4. Unchanged name (===project.name after trim) → Save disabled.
 *   5. Too-long name (>200 chars) → Save disabled + inline error.
 *   6. Valid new name → Save enabled; click invokes onSubmit(trimmed).
 *   7. Form submit (Enter) invokes onSubmit(trimmed).
 *   8. Cancel button calls onOpenChange(false).
 *   9. busy=true → input disabled + Save shows "Renaming…".
 *  10. error prop shown inline when set + tooLong error supersedes it.
 *  11. Re-priming on open: opening for a different project resets the
 *      input to the new project's name (not the previous one).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { RenameProjectDialog } from "./RenameProjectDialog"

const PROJECT = { id: "prj_abc", name: "phaseboundary2" }

describe("<RenameProjectDialog>", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not render when open=false", () => {
    render(
      <RenameProjectDialog
        open={false}
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={vi.fn()}
      />
    )
    expect(screen.queryByText("Rename project")).toBeNull()
  })

  it("renders title, description and pre-fills the input with project.name", () => {
    render(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={vi.fn()}
      />
    )
    expect(screen.getByText("Rename project")).toBeInTheDocument()
    expect(screen.getByText(/phaseboundary2/)).toBeInTheDocument()
    const input = screen.getByLabelText("New name") as HTMLInputElement
    expect(input.value).toBe("phaseboundary2")
  })

  it("disables Save when the input is empty", async () => {
    const user = userEvent.setup()
    render(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={vi.fn()}
      />
    )
    const input = screen.getByLabelText("New name")
    await user.clear(input)
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("disables Save when the trimmed value equals the current name", async () => {
    const user = userEvent.setup()
    render(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={vi.fn()}
      />
    )
    const input = screen.getByLabelText("New name")
    await user.clear(input)
    await user.type(input, "  phaseboundary2  ")
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("shows tooLong error and disables Save when name exceeds 200 chars", async () => {
    const user = userEvent.setup()
    render(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={vi.fn()}
      />
    )
    const input = screen.getByLabelText("New name")
    await user.clear(input)
    await user.type(input, "x".repeat(201))
    expect(
      screen.getByText(/200 characters or fewer/i)
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("enables Save and invokes onSubmit(trimmed) on click for a valid new name", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={onSubmit}
      />
    )
    const input = screen.getByLabelText("New name")
    await user.clear(input)
    await user.type(input, "  new name  ")
    const save = screen.getByRole("button", { name: "Save" })
    expect(save).toBeEnabled()
    await user.click(save)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith("new name")
  })

  it("submits via Enter key on the form", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={onSubmit}
      />
    )
    const input = screen.getByLabelText("New name")
    await user.clear(input)
    await user.type(input, "another name{Enter}")
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith("another name")
  })

  it("Cancel button calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <RenameProjectDialog
        open
        onOpenChange={onOpenChange}
        project={PROJECT}
        onSubmit={vi.fn()}
      />
    )
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("busy=true disables input + Save shows 'Renaming…'", () => {
    render(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={vi.fn()}
        busy
      />
    )
    expect(screen.getByLabelText("New name")).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Renaming…" })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  })

  it("shows external error inline when set", () => {
    render(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={vi.fn()}
        error="VALIDATION_ERROR: name already in use"
      />
    )
    expect(
      screen.getByText(/VALIDATION_ERROR: name already in use/)
    ).toBeInTheDocument()
  })

  it("re-primes the input when opened for a different project", () => {
    const { rerender } = render(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={vi.fn()}
      />
    )
    expect(
      (screen.getByLabelText("New name") as HTMLInputElement).value
    ).toBe("phaseboundary2")

    // Close, then reopen for a different project.
    rerender(
      <RenameProjectDialog
        open={false}
        onOpenChange={vi.fn()}
        project={PROJECT}
        onSubmit={vi.fn()}
      />
    )
    rerender(
      <RenameProjectDialog
        open
        onOpenChange={vi.fn()}
        project={{ id: "prj_other", name: "complex-site" }}
        onSubmit={vi.fn()}
      />
    )
    expect(
      (screen.getByLabelText("New name") as HTMLInputElement).value
    ).toBe("complex-site")
  })
})
