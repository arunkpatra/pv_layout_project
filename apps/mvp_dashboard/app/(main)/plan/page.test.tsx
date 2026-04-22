import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import PlanPage from "./page"

describe("Plan page", () => {
  it("renders Plan heading", () => {
    render(<PlanPage />)
    expect(screen.getByRole("heading", { name: /Plan/i })).toBeInTheDocument()
  })

  it("renders coming-soon content", () => {
    render(<PlanPage />)
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
