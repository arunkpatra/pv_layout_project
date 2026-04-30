/**
 * Tests for `RecentsView` — the S3 default startup grid.
 *
 * Covers:
 *   - Loading state renders skeleton tiles + still surfaces the
 *     "+ New project" tile (so users aren't blocked on slow fetches).
 *   - Empty list renders the "+ New project" tile + first-run helper.
 *   - Populated list renders project cards with name + runs count +
 *     last-run relative time.
 *   - Click on "+ New project" tile fires onNewProject.
 *   - Click on a project card fires onOpen with the right ID.
 *   - Error state renders message + Retry button (fires onRetry).
 *   - **SP3** — bottom-right ⋯ icon opens DropdownMenu with Rename +
 *     Delete; click stops propagation so card body click doesn't fire;
 *     Rename → RenameProjectDialog; Delete → DeleteProjectConfirmDialog;
 *     onRename / onDelete are invoked with the right project id;
 *     errors from the parent surface inline.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ProjectSummaryListRowV2 } from "@solarlayout/entitlements-client"
import { RecentsView } from "./RecentsView"

const sampleProjects: ProjectSummaryListRowV2[] = [
  {
    id: "prj_a",
    name: "Phase Boundary 2",
    kmzBlobUrl: "s3://b/k1",
    kmzSha256: "a".repeat(64),
    createdAt: "2026-04-30T08:00:00.000Z",
    updatedAt: "2026-04-30T11:30:00.000Z",
    runsCount: 3,
    lastRunAt: "2026-04-30T11:30:00.000Z",
  },
  {
    id: "prj_b",
    name: "Kudlugi 89 acres",
    kmzBlobUrl: "s3://b/k2",
    kmzSha256: "b".repeat(64),
    createdAt: "2026-04-29T08:00:00.000Z",
    updatedAt: "2026-04-29T08:00:00.000Z",
    runsCount: 0,
    lastRunAt: null,
  },
]

const noopRename = () => Promise.resolve()
const noopDelete = () => Promise.resolve()

describe("RecentsView", () => {
  it("renders the + New project tile + skeletons in loading state", () => {
    render(
      <RecentsView
        isLoading
        isError={false}
        projects={[]}
        onOpen={vi.fn()}
        onNewProject={vi.fn()}
        onRename={noopRename}
        onDelete={noopDelete}
      />
    )
    expect(screen.getByText("New project")).toBeInTheDocument()
  })

  it("renders an empty-state hint when the list is empty + not loading", () => {
    render(
      <RecentsView
        isLoading={false}
        isError={false}
        projects={[]}
        onOpen={vi.fn()}
        onNewProject={vi.fn()}
        onRename={noopRename}
        onDelete={noopDelete}
      />
    )
    expect(
      screen.getByText(/No projects yet/i)
    ).toBeInTheDocument()
  })

  it("renders project cards with name + runs count", () => {
    render(
      <RecentsView
        isLoading={false}
        isError={false}
        projects={sampleProjects}
        onOpen={vi.fn()}
        onNewProject={vi.fn()}
        onRename={noopRename}
        onDelete={noopDelete}
      />
    )
    expect(screen.getByText("Phase Boundary 2")).toBeInTheDocument()
    expect(screen.getByText("Kudlugi 89 acres")).toBeInTheDocument()
    expect(screen.getByText(/3 runs/)).toBeInTheDocument()
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument()
  })

  it("fires onNewProject when the + tile is clicked", () => {
    const onNewProject = vi.fn()
    render(
      <RecentsView
        isLoading={false}
        isError={false}
        projects={[]}
        onOpen={vi.fn()}
        onNewProject={onNewProject}
        onRename={noopRename}
        onDelete={noopDelete}
      />
    )
    fireEvent.click(screen.getByText("New project"))
    expect(onNewProject).toHaveBeenCalledTimes(1)
  })

  it("fires onOpen with the right projectId when a card is clicked", () => {
    const onOpen = vi.fn()
    render(
      <RecentsView
        isLoading={false}
        isError={false}
        projects={sampleProjects}
        onOpen={onOpen}
        onNewProject={vi.fn()}
        onRename={noopRename}
        onDelete={noopDelete}
      />
    )
    const card = screen.getByRole("button", { name: /Open Phase Boundary 2/i })
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalledWith("prj_a")
  })

  it("renders error block + Retry button", () => {
    const onRetry = vi.fn()
    render(
      <RecentsView
        isLoading={false}
        isError
        errorMessage="Network failed"
        projects={[]}
        onOpen={vi.fn()}
        onNewProject={vi.fn()}
        onRetry={onRetry}
        onRename={noopRename}
        onDelete={noopDelete}
      />
    )
    expect(screen.getByText("Couldn't load your projects")).toBeInTheDocument()
    expect(screen.getByText(/Network failed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("does NOT render the projects grid when in error state", () => {
    render(
      <RecentsView
        isLoading={false}
        isError
        errorMessage="x"
        projects={sampleProjects}
        onOpen={vi.fn()}
        onNewProject={vi.fn()}
        onRename={noopRename}
        onDelete={noopDelete}
      />
    )
    expect(screen.queryByText("Phase Boundary 2")).not.toBeInTheDocument()
  })

  it("shows project's footer with the updated relative time", () => {
    render(
      <RecentsView
        isLoading={false}
        isError={false}
        projects={sampleProjects}
        onOpen={vi.fn()}
        onNewProject={vi.fn()}
        onRename={noopRename}
        onDelete={noopDelete}
      />
    )
    const card = screen.getByRole("button", {
      name: /Open Phase Boundary 2/i,
    })
    expect(within(card).getByText(/Updated /)).toBeInTheDocument()
  })

  // ── SP3: ⋯ menu + Rename / Delete dialogs ────────────────────────────

  describe("SP3 — ⋯ menu + Rename / Delete dialogs", () => {
    it("renders the ⋯ trigger on each project card", () => {
      render(
        <RecentsView
          isLoading={false}
          isError={false}
          projects={sampleProjects}
          onOpen={vi.fn()}
          onNewProject={vi.fn()}
          onRename={noopRename}
          onDelete={noopDelete}
        />
      )
      // One ⋯ trigger per card.
      expect(
        screen.getByRole("button", {
          name: /More actions for Phase Boundary 2/i,
        })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", {
          name: /More actions for Kudlugi 89 acres/i,
        })
      ).toBeInTheDocument()
    })

    it("clicking the ⋯ trigger does NOT fire onOpen (stopPropagation)", async () => {
      const onOpen = vi.fn()
      const user = userEvent.setup()
      render(
        <RecentsView
          isLoading={false}
          isError={false}
          projects={sampleProjects}
          onOpen={onOpen}
          onNewProject={vi.fn()}
          onRename={noopRename}
          onDelete={noopDelete}
        />
      )
      const trigger = screen.getByRole("button", {
        name: /More actions for Phase Boundary 2/i,
      })
      await user.click(trigger)
      expect(onOpen).not.toHaveBeenCalled()
    })

    it("⋯ → Rename… opens the Rename dialog with the current name pre-filled", async () => {
      const user = userEvent.setup()
      render(
        <RecentsView
          isLoading={false}
          isError={false}
          projects={sampleProjects}
          onOpen={vi.fn()}
          onNewProject={vi.fn()}
          onRename={noopRename}
          onDelete={noopDelete}
        />
      )
      await user.click(
        screen.getByRole("button", {
          name: /More actions for Phase Boundary 2/i,
        })
      )
      await user.click(screen.getByRole("menuitem", { name: /Rename/i }))
      expect(screen.getByText("Rename project")).toBeInTheDocument()
      expect(
        (screen.getByLabelText("New name") as HTMLInputElement).value
      ).toBe("Phase Boundary 2")
    })

    it("Rename Save invokes onRename with the right projectId + new name", async () => {
      const onRename = vi.fn().mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(
        <RecentsView
          isLoading={false}
          isError={false}
          projects={sampleProjects}
          onOpen={vi.fn()}
          onNewProject={vi.fn()}
          onRename={onRename}
          onDelete={noopDelete}
        />
      )
      await user.click(
        screen.getByRole("button", {
          name: /More actions for Phase Boundary 2/i,
        })
      )
      await user.click(screen.getByRole("menuitem", { name: /Rename/i }))
      const input = screen.getByLabelText("New name")
      await user.clear(input)
      await user.type(input, "Renamed Site")
      await user.click(screen.getByRole("button", { name: "Save" }))
      expect(onRename).toHaveBeenCalledWith("prj_a", "Renamed Site")
    })

    it("⋯ → Delete… opens the destructive confirm dialog", async () => {
      const user = userEvent.setup()
      render(
        <RecentsView
          isLoading={false}
          isError={false}
          projects={sampleProjects}
          onOpen={vi.fn()}
          onNewProject={vi.fn()}
          onRename={noopRename}
          onDelete={noopDelete}
        />
      )
      await user.click(
        screen.getByRole("button", {
          name: /More actions for Phase Boundary 2/i,
        })
      )
      await user.click(screen.getByRole("menuitem", { name: /Delete/i }))
      expect(screen.getByText("Delete project")).toBeInTheDocument()
      // Project name surfaced in the description.
      expect(
        within(screen.getByRole("dialog")).getByText(/Phase Boundary 2/)
      ).toBeInTheDocument()
    })

    it("Delete confirm invokes onDelete with the right projectId", async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(
        <RecentsView
          isLoading={false}
          isError={false}
          projects={sampleProjects}
          onOpen={vi.fn()}
          onNewProject={vi.fn()}
          onRename={noopRename}
          onDelete={onDelete}
        />
      )
      await user.click(
        screen.getByRole("button", {
          name: /More actions for Phase Boundary 2/i,
        })
      )
      await user.click(screen.getByRole("menuitem", { name: /Delete/i }))
      await user.click(screen.getByRole("button", { name: "Delete" }))
      expect(onDelete).toHaveBeenCalledWith("prj_a")
    })

    it("Rename error (rejected promise) keeps dialog open + surfaces inline", async () => {
      const onRename = vi
        .fn()
        .mockRejectedValue(new Error("VALIDATION_ERROR: name too long"))
      const user = userEvent.setup()
      render(
        <RecentsView
          isLoading={false}
          isError={false}
          projects={sampleProjects}
          onOpen={vi.fn()}
          onNewProject={vi.fn()}
          onRename={onRename}
          onDelete={noopDelete}
        />
      )
      await user.click(
        screen.getByRole("button", {
          name: /More actions for Phase Boundary 2/i,
        })
      )
      await user.click(screen.getByRole("menuitem", { name: /Rename/i }))
      const input = screen.getByLabelText("New name")
      await user.clear(input)
      await user.type(input, "New Name")
      await user.click(screen.getByRole("button", { name: "Save" }))
      // Dialog still open + error surfaced inline.
      expect(screen.getByText("Rename project")).toBeInTheDocument()
      expect(
        screen.getByText(/VALIDATION_ERROR: name too long/)
      ).toBeInTheDocument()
    })

    it("Delete error (rejected promise) keeps dialog open + surfaces inline", async () => {
      const onDelete = vi
        .fn()
        .mockRejectedValue(new Error("NOT_FOUND: already deleted"))
      const user = userEvent.setup()
      render(
        <RecentsView
          isLoading={false}
          isError={false}
          projects={sampleProjects}
          onOpen={vi.fn()}
          onNewProject={vi.fn()}
          onRename={noopRename}
          onDelete={onDelete}
        />
      )
      await user.click(
        screen.getByRole("button", {
          name: /More actions for Phase Boundary 2/i,
        })
      )
      await user.click(screen.getByRole("menuitem", { name: /Delete/i }))
      await user.click(screen.getByRole("button", { name: "Delete" }))
      expect(screen.getByText("Delete project")).toBeInTheDocument()
      expect(
        screen.getByText(/NOT_FOUND: already deleted/)
      ).toBeInTheDocument()
    })
  })
})
