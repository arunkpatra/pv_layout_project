/**
 * Tests for `RunsList` — the P5 Inspector tab.
 *
 * Covers:
 *   - Empty-state hint when no runs
 *   - Gallery rendering (grid of tiles, default view)
 *   - List rendering after toggling Segmented control
 *   - Single-click selects run (selectedRunId in slice)
 *   - Multi-select via checkbox accumulates without changing selectedRunId
 *   - Stop-propagation: checkbox click doesn't also fire row select
 *   - Run-type chip renders Layout vs Energy from billedFeatureKey
 *   - "1 run" / "N runs" pluralization in the count header
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { RunsList } from "./RunsList"
import { useProjectStore } from "../state/project"
import type { Run } from "../state/project"

const layoutRun: Run = {
  id: "run_layout_a",
  name: "Layout @ A",
  params: { design_type: "fixed_tilt", design_mode: "string_inverter" },
  billedFeatureKey: "plant_layout",
  createdAt: "2026-04-30T11:30:00.000Z",
}

const energyRun: Run = {
  id: "run_energy_b",
  name: "Energy @ B",
  params: { design_type: "tracker" },
  billedFeatureKey: "energy_yield",
  createdAt: "2026-04-30T11:00:00.000Z",
}

beforeEach(() => {
  useProjectStore.getState().clearAll()
})

describe("RunsList — empty", () => {
  it("renders the empty-state hint when no runs exist", () => {
    render(<RunsList />)
    expect(
      screen.getByText(/Generate a layout to see it here/i)
    ).toBeInTheDocument()
  })
})

describe("RunsList — populated", () => {
  beforeEach(() => {
    useProjectStore.getState().setRuns([layoutRun, energyRun])
  })

  it("shows the count header with correct pluralization", () => {
    render(<RunsList />)
    expect(screen.getByText(/2 runs/)).toBeInTheDocument()
  })

  it("renders both runs as gallery tiles by default", () => {
    render(<RunsList />)
    expect(screen.getByText("Layout @ A")).toBeInTheDocument()
    expect(screen.getByText("Energy @ B")).toBeInTheDocument()
  })

  it("renders the Layout vs Energy type chips per row", () => {
    render(<RunsList />)
    expect(screen.getAllByText("Layout").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Energy").length).toBeGreaterThan(0)
  })

  it("clicking a tile selects the run (selectedRunId in slice)", () => {
    render(<RunsList />)
    fireEvent.click(screen.getByText("Layout @ A").closest("div[role='button']")!)
    expect(useProjectStore.getState().selectedRunId).toBe("run_layout_a")
  })

  it("clicking a checkbox toggles multi-select WITHOUT changing the active selection", () => {
    render(<RunsList />)
    const checkbox = screen.getByLabelText("Select run Layout @ A")
    fireEvent.click(checkbox)
    expect(useProjectStore.getState().selectedRunId).toBeNull() // not bumped
    expect(screen.getByText(/1 selected/)).toBeInTheDocument()

    fireEvent.click(checkbox) // toggle off
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it("toggling Segmented to List re-renders as rows", () => {
    render(<RunsList />)
    fireEvent.click(screen.getByRole("radio", { name: "List" }))
    // List rows still show the names + chips, just denser layout.
    expect(screen.getByText("Layout @ A")).toBeInTheDocument()
    expect(screen.getByText("Energy @ B")).toBeInTheDocument()
  })

  it("renders a thumbnail placeholder per tile (gallery mode)", () => {
    const { container } = render(<RunsList />)
    // Thumbnails are aria-hidden divs; query by attribute.
    const thumbs = container.querySelectorAll("[aria-hidden='true']")
    expect(thumbs.length).toBeGreaterThanOrEqual(2)
  })

  it("exposes the design summary (design_type · design_mode) when params shape matches", () => {
    render(<RunsList />)
    // layoutRun has both design_type and design_mode → both render.
    const tile = screen
      .getByText("Layout @ A")
      .closest("div[role='button']") as HTMLElement
    expect(
      within(tile).getByText(/fixed_tilt · string_inverter/)
    ).toBeInTheDocument()
  })
})

describe("RunsList — single-run pluralization", () => {
  it("uses 'run' (singular) when only one run exists", () => {
    useProjectStore.getState().setRuns([layoutRun])
    render(<RunsList />)
    expect(screen.getByText(/1 run$/)).toBeInTheDocument()
  })
})

describe("RunsList — delete flow (P9)", () => {
  beforeEach(() => {
    useProjectStore.getState().clearAll()
    useProjectStore.getState().setRuns([layoutRun, energyRun])
  })

  it("does not show the Delete button when no rows are selected", () => {
    const onDeleteRuns = vi.fn()
    render(<RunsList onDeleteRuns={onDeleteRuns} />)
    expect(screen.queryByText(/Delete /)).not.toBeInTheDocument()
  })

  it("shows the Delete button when one row is selected", () => {
    const onDeleteRuns = vi.fn()
    render(<RunsList onDeleteRuns={onDeleteRuns} />)
    fireEvent.click(screen.getByLabelText("Select run Layout @ A"))
    expect(screen.getByRole("button", { name: /Delete 1/i })).toBeInTheDocument()
  })

  it("calls onDeleteRuns with selected ids after window.confirm = true", async () => {
    const original = window.confirm
    const confirmFn = vi.fn().mockReturnValue(true)
    window.confirm = confirmFn as unknown as typeof window.confirm
    const onDeleteRuns = vi.fn().mockResolvedValue(undefined)
    try {
      render(<RunsList onDeleteRuns={onDeleteRuns} />)
      fireEvent.click(screen.getByLabelText("Select run Layout @ A"))
      fireEvent.click(screen.getByLabelText("Select run Energy @ B"))
      fireEvent.click(screen.getByRole("button", { name: /Delete 2/i }))

      expect(confirmFn).toHaveBeenCalled()
      await vi.waitFor(() => {
        expect(onDeleteRuns).toHaveBeenCalledWith([
          "run_layout_a",
          "run_energy_b",
        ])
      })
    } finally {
      window.confirm = original
    }
  })

  it("does NOT call onDeleteRuns when the user cancels the confirm", () => {
    const original = window.confirm
    const confirmFn = vi.fn().mockReturnValue(false)
    window.confirm = confirmFn as unknown as typeof window.confirm
    const onDeleteRuns = vi.fn()
    try {
      render(<RunsList onDeleteRuns={onDeleteRuns} />)
      fireEvent.click(screen.getByLabelText("Select run Layout @ A"))
      fireEvent.click(screen.getByRole("button", { name: /Delete 1/i }))
      expect(onDeleteRuns).not.toHaveBeenCalled()
    } finally {
      window.confirm = original
    }
  })
})
