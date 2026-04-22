import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import LicensePage from "./page"

describe("License page", () => {
  it("renders License heading", () => {
    render(<LicensePage />)
    expect(screen.getByRole("heading", { name: /License/i })).toBeInTheDocument()
  })

  it("renders coming-soon content", () => {
    render(<LicensePage />)
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
