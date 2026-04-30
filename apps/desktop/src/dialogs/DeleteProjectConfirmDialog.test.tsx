/**
 * RTL component tests for <DeleteProjectConfirmDialog>.
 *
 * SP3 surface-agnostic destructive Dialog (mounted by RecentsView +
 * TabsBar).
 *
 * Behaviours covered:
 *   1. open=false → not rendered.
 *   2. open=true → title, project name surfaced in description, Cancel +
 *      Delete buttons rendered.
 *   3. Delete button click invokes onConfirm.
 *   4. Cancel button click invokes onOpenChange(false).
 *   5. busy=true → Delete shows "Deleting…" + both buttons disabled.
 *   6. error prop shown inline.
 *   7. project=null → fallback copy renders without crashing (defensive
 *      against tab-close race where project is closed before the dialog
 *      animation finishes).
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

  it("renders title, project-name copy, Cancel and Delete buttons", () => {
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
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })

  it("Delete button click invokes onConfirm", async () => {
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

  it("busy=true → Delete shows 'Deleting…' and both buttons disabled", () => {
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
    // Title still rendered.
    expect(screen.getByText("Delete project")).toBeInTheDocument()
    // No project.name interpolation; fallback copy describes the action.
    expect(
      screen.getByText(/soft-deletes the project and all its runs/)
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })
})
