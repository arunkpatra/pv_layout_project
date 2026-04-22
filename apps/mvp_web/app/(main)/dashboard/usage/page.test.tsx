import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import UsagePage from "./page"

describe("Usage page", () => {
  it("renders Usage heading", () => {
    render(<UsagePage />)
    expect(screen.getByRole("heading", { name: /Usage/i })).toBeInTheDocument()
  })

  it("renders coming-soon content", () => {
    render(<UsagePage />)
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
