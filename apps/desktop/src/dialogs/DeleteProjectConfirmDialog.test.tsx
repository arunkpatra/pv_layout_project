/**
 * RTL component tests for <DeleteProjectConfirmDialog>.
 *
 * SP3 surface-agnostic destructive Dialog (mounted by RecentsView +
 * TabsBar).
 *
 * Behaviours covered:
 *   1. open=false → not rendered.
 *   2. open=true → title, project name surfaced in description, Cancel +
 *      Delete buttons + type-to-confirm input rendered.
 *   3. Delete button DISABLED until the user types `delete` in the
 *      type-to-confirm input (case-insensitive); enabled once matched.
 *   4. Delete button click invokes onConfirm (only when the type-to-
 *      confirm gate has been cleared).
 *   5. Cancel button click invokes onOpenChange(false).
 *   6. busy=true → Delete shows "Deleting…" + both buttons + input
 *      disabled.
 *   7. error prop shown inline.
 *   8. project=null → fallback copy renders without crashing (defensive
 *      against tab-close race where project is closed before the dialog
 *      animation finishes).
 *   9. Re-opening the dialog after a previous open clears the type-to-
 *      confirm input (anti-fat-finger guard mustn't be defeated by
 *      stale state from a prior project).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DeleteProjectConfirmDialog } from "./DeleteProjectConfirmDialog"

const PROJECT = { id: "prj_abc", name: "phaseboundary2" }

describe("<DeleteProjectConfirmDialog>", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not render when open=false", () => {
    render(
      <DeleteProjectConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.queryByText("Delete project")).toBeNull()
  })

  it("renders title, project-name copy, type-to-confirm input + Cancel/Delete buttons", () => {
    render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByText("Delete project")).toBeInTheDocument()
    expect(screen.getByText(/phaseboundary2/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Type/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })

  it("Delete button is DISABLED on open (type-to-confirm gate)", () => {
    render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled()
  })

  it("Delete button stays DISABLED for a partial / wrong match", async () => {
    const user = userEvent.setup()
    render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={vi.fn()}
      />
    )
    const input = screen.getByLabelText(/Type/)
    await user.type(input, "del")
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled()
    await user.clear(input)
    await user.type(input, "remove")
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled()
  })

  it("Delete button ENABLES once the user types 'delete' (case-insensitive)", async () => {
    const user = userEvent.setup()
    render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={vi.fn()}
      />
    )
    const input = screen.getByLabelText(/Type/)
    await user.type(input, "DELETE")
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled()
    // Lowercase variant also matches (case-insensitive contract).
    await user.clear(input)
    await user.type(input, "delete")
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled()
    // Surrounding whitespace tolerated.
    await user.clear(input)
    await user.type(input, "  delete  ")
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled()
  })

  it("Delete button click invokes onConfirm only after the gate clears", async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={onConfirm}
      />
    )
    // Try clicking before typing — no-op (button disabled).
    await user.click(screen.getByRole("button", { name: "Delete" }))
    expect(onConfirm).not.toHaveBeenCalled()

    // Type to clear the gate, then click.
    await user.type(screen.getByLabelText(/Type/), "delete")
    await user.click(screen.getByRole("button", { name: "Delete" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("Cancel button click invokes onOpenChange(false)", async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={onOpenChange}
        project={PROJECT}
        onConfirm={vi.fn()}
      />
    )
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("busy=true → Delete shows 'Deleting…' and Cancel + input disabled", () => {
    render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={vi.fn()}
        busy
      />
    )
    expect(
      screen.getByRole("button", { name: "Deleting…" })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
    expect(screen.getByLabelText(/Type/)).toBeDisabled()
  })

  it("shows external error inline when set", () => {
    render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={vi.fn()}
        error="NOT_FOUND: project already deleted"
      />
    )
    expect(
      screen.getByText(/NOT_FOUND: project already deleted/)
    ).toBeInTheDocument()
  })

  it("renders fallback copy when project is null", () => {
    render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={null}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByText("Delete project")).toBeInTheDocument()
    expect(
      screen.getByText(/soft-deletes the project and all its runs/)
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })

  it("re-opening the dialog clears the type-to-confirm input", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={vi.fn()}
      />
    )
    await user.type(screen.getByLabelText(/Type/), "delete")
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled()

    // Close, then re-open. The input must reset so a stale "delete"
    // doesn't pre-arm the destructive button on the next project.
    rerender(
      <DeleteProjectConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        project={PROJECT}
        onConfirm={vi.fn()}
      />
    )
    rerender(
      <DeleteProjectConfirmDialog
        open
        onOpenChange={vi.fn()}
        project={{ id: "prj_other", name: "another-site" }}
        onConfirm={vi.fn()}
      />
    )
    expect(
      (screen.getByLabelText(/Type/) as HTMLInputElement).value
    ).toBe("")
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled()
  })
})
