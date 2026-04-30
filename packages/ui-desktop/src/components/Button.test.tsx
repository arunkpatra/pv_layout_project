import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button } from "./Button"

describe("Button", () => {
  it("renders children inside a real <button>", () => {
    render(<Button>Generate</Button>)
    const btn = screen.getByRole("button", { name: "Generate" })
    expect(btn.tagName).toBe("BUTTON")
  })

  it("dispatches onClick when clicked", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Hit me</Button>)
    await userEvent.click(screen.getByRole("button", { name: "Hit me" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("does not dispatch onClick when disabled", async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Locked
      </Button>
    )
    await userEvent.click(screen.getByRole("button", { name: "Locked" }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("applies the primary variant class when variant=primary", () => {
    render(<Button variant="primary">Primary</Button>)
    const btn = screen.getByRole("button", { name: "Primary" })
    expect(btn.className).toMatch(/bg-\[var\(--accent-default\)\]/)
  })

  it("renders as the child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/dashboard">Dashboard</a>
      </Button>
    )
    const link = screen.getByRole("link", { name: "Dashboard" })
    expect(link.tagName).toBe("A")
    expect(link).toHaveAttribute("href", "/dashboard")
  })
})
