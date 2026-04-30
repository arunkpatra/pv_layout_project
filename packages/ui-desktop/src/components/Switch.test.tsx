import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Switch } from "./Switch"

describe("Switch", () => {
  it("renders a switch in unchecked state by default", () => {
    render(<Switch aria-label="Cable calc" />)
    const sw = screen.getByRole("switch", { name: "Cable calc" })
    expect(sw).toHaveAttribute("data-state", "unchecked")
  })

  it("flips state on click and fires onCheckedChange", async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Toggle" onCheckedChange={onCheckedChange} />)
    const sw = screen.getByRole("switch", { name: "Toggle" })
    await userEvent.click(sw)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(sw).toHaveAttribute("data-state", "checked")
  })

  it("respects controlled `checked` prop", () => {
    const { rerender } = render(<Switch checked={false} aria-label="C" />)
    expect(screen.getByRole("switch", { name: "C" })).toHaveAttribute(
      "data-state",
      "unchecked"
    )
    rerender(<Switch checked={true} aria-label="C" />)
    expect(screen.getByRole("switch", { name: "C" })).toHaveAttribute(
      "data-state",
      "checked"
    )
  })
})
