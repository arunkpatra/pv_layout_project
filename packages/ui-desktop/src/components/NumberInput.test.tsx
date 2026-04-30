import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NumberInput } from "./NumberInput"

describe("NumberInput", () => {
  it("renders an input of type=number with decimal inputMode", () => {
    render(<NumberInput defaultValue={5} />)
    const input = screen.getByRole("spinbutton") as HTMLInputElement
    expect(input.type).toBe("number")
    expect(input.inputMode).toBe("decimal")
  })

  it("calls onChange with each keystroke", async () => {
    const onChange = vi.fn()
    render(<NumberInput onChange={onChange} />)
    const input = screen.getByRole("spinbutton")
    await userEvent.type(input, "12")
    // userEvent fires onChange per keystroke (2 here).
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it("renders the suffix when provided", () => {
    render(<NumberInput defaultValue={6} suffix="m" />)
    expect(screen.getByText("m")).toBeInTheDocument()
  })

  it("sets aria-invalid when invalid is true", () => {
    render(<NumberInput defaultValue={5} invalid />)
    const input = screen.getByRole("spinbutton")
    expect(input).toHaveAttribute("aria-invalid", "true")
  })

  it("disables the input when disabled is set", () => {
    render(<NumberInput defaultValue={5} disabled />)
    expect(screen.getByRole("spinbutton")).toBeDisabled()
  })
})
