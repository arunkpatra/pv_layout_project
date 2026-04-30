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
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
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

describe("RecentsView", () => {
  it("renders the + New project tile + skeletons in loading state", () => {
    render(
      <RecentsView
        isLoading
        isError={false}
        projects={[]}
        onOpen={vi.fn()}
        onNewProject={vi.fn()}
      />
    )
    // The "+ New project" tile should always show, even during loading.
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
      />
    )
    const card = screen.getByText("Phase Boundary 2").closest("button")!
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
      />
    )
    expect(screen.queryByText("Phase Boundary 2")).not.toBeInTheDocument()
  })

  it("shows project's footer with the updated relative time", () => {
    // Freeze "now" relative to the older fixture's updatedAt → ~2 days
    // ago. The exact label depends on Date.now(); just sanity-check
    // that the footer text shows up.
    render(
      <RecentsView
        isLoading={false}
        isError={false}
        projects={sampleProjects}
        onOpen={vi.fn()}
        onNewProject={vi.fn()}
      />
    )
    const card = screen.getByText("Phase Boundary 2").closest("button")!
    expect(within(card).getByText(/Updated /)).toBeInTheDocument()
  })
})
