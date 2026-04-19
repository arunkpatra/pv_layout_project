import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryProvider } from "./query-provider"

describe("QueryProvider", () => {
  it("renders children", () => {
    render(
      <QueryProvider>
        <span>hello</span>
      </QueryProvider>,
    )
    expect(screen.getByText("hello")).toBeInTheDocument()
  })
})
