/**
 * RTL component tests for <CreateProjectModal>.
 *
 * The modal renders nothing when stage=idle; otherwise mounts a Radix
 * Dialog (via @solarlayout/ui-desktop) with three stage rows
 * (uploading → creating → parsing) and per-row status (pending /
 * active / done / error). On `done` it auto-dismisses after 300ms; on
 * `error` it surfaces a generic message + a "Try again" button.
 */
import { describe, test, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  CreateProjectModal,
  type CreateProjectStage,
} from "./CreateProjectModal"

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

const noop = () => {}

function renderWith(stage: CreateProjectStage) {
  return render(
    <CreateProjectModal
      stage={stage}
      onCancel={noop}
      onTryAgain={noop}
      onAutoDismiss={noop}
    />
  )
}

describe("<CreateProjectModal>", () => {
  test("renders nothing when stage is idle", () => {
    renderWith({ kind: "idle" })
    expect(screen.queryByText(/Setting up your project/)).toBeNull()
  })

  test("shows three stage rows when in flight", () => {
    renderWith({ kind: "uploading" })
    expect(screen.getByText(/Uploading boundary file/)).toBeInTheDocument()
    expect(screen.getByText(/Creating your project/)).toBeInTheDocument()
    expect(screen.getByText(/Reading boundaries/)).toBeInTheDocument()
  })

  test("marks earlier stages done when later stage active", () => {
    renderWith({ kind: "parsing" })
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveAttribute("data-status", "done")
    expect(items[1]).toHaveAttribute("data-status", "done")
    expect(items[2]).toHaveAttribute("data-status", "active")
  })

  test("first-stage active leaves later stages pending", () => {
    renderWith({ kind: "uploading" })
    const items = screen.getAllByRole("listitem")
    expect(items[0]).toHaveAttribute("data-status", "active")
    expect(items[1]).toHaveAttribute("data-status", "pending")
    expect(items[2]).toHaveAttribute("data-status", "pending")
  })

  test("error state shows generic message + Try again button", () => {
    renderWith({ kind: "error", failedAt: "parsing" })
    expect(
      screen.getByText(/Something went wrong setting up your project/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeInTheDocument()
    // The failed stage row is marked error; earlier stages are done.
    const items = screen.getAllByRole("listitem")
    expect(items[0]).toHaveAttribute("data-status", "done")
    expect(items[1]).toHaveAttribute("data-status", "done")
    expect(items[2]).toHaveAttribute("data-status", "error")
  })

  test("done stage triggers onAutoDismiss after 300ms", () => {
    const onAutoDismiss = vi.fn()
    render(
      <CreateProjectModal
        stage={{ kind: "done" }}
        onCancel={noop}
        onTryAgain={noop}
        onAutoDismiss={onAutoDismiss}
      />
    )
    expect(onAutoDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(onAutoDismiss).toHaveBeenCalledOnce()
  })

  // Regression for C4 critical bug: parent re-renders during the 300ms
  // window must NOT reset the auto-dismiss timer. The auto-dismiss
  // useEffect lists `onAutoDismiss` in its deps; if the parent passes a
  // fresh function identity per render (inline lambda), the timer is
  // cleared and re-armed every render — combined with post-success
  // invalidateQueries refetches, the modal hangs in "done" state.
  // Stable identity (useCallback) is the fix; this test asserts the
  // contract from the modal side.
  test("auto-dismiss timer survives parent re-renders with stable handler", () => {
    const onAutoDismiss = vi.fn()
    const { rerender } = render(
      <CreateProjectModal
        stage={{ kind: "done" }}
        onCancel={noop}
        onTryAgain={noop}
        onAutoDismiss={onAutoDismiss}
      />
    )
    // Three re-renders inside the 300ms window — same stable handler
    // identity, so the effect's dep array is unchanged and the timer
    // is NOT cleared.
    vi.advanceTimersByTime(100)
    rerender(
      <CreateProjectModal
        stage={{ kind: "done" }}
        onCancel={noop}
        onTryAgain={noop}
        onAutoDismiss={onAutoDismiss}
      />
    )
    vi.advanceTimersByTime(100)
    rerender(
      <CreateProjectModal
        stage={{ kind: "done" }}
        onCancel={noop}
        onTryAgain={noop}
        onAutoDismiss={onAutoDismiss}
      />
    )
    expect(onAutoDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(onAutoDismiss).toHaveBeenCalledOnce()
  })

  test("Cancel button calls onCancel", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onCancel = vi.fn()
    render(
      <CreateProjectModal
        stage={{ kind: "uploading" }}
        onCancel={onCancel}
        onTryAgain={noop}
        onAutoDismiss={noop}
      />
    )
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  test("Try again calls onTryAgain", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onTryAgain = vi.fn()
    render(
      <CreateProjectModal
        stage={{ kind: "error", failedAt: "creating" }}
        onCancel={noop}
        onTryAgain={onTryAgain}
        onAutoDismiss={noop}
      />
    )
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(onTryAgain).toHaveBeenCalledOnce()
  })
})
