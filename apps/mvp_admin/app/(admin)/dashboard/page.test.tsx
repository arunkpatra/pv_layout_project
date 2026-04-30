import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("./_components/dashboard-client", () => ({
  DashboardClient: ({ granularity }: { granularity: string }) => (
    <div data-testid="dashboard-client" data-granularity={granularity} />
  ),
}))

import DashboardPage from "./page"

describe("DashboardPage", () => {
  it("renders dashboard heading", async () => {
    const Page = await DashboardPage({
      searchParams: Promise.resolve({}),
    })
    render(Page)
    expect(
      screen.getByRole("heading", { name: /dashboard/i }),
    ).toBeInTheDocument()
  })

  it("defaults granularity to monthly", async () => {
    const Page = await DashboardPage({
      searchParams: Promise.resolve({}),
    })
    render(Page)
    expect(screen.getByTestId("dashboard-client")).toHaveAttribute(
      "data-granularity",
      "monthly",
    )
  })

  it("passes granularity prop from searchParams", async () => {
    const Page = await DashboardPage({
      searchParams: Promise.resolve({ granularity: "daily" }),
    })
    render(Page)
    expect(screen.getByTestId("dashboard-client")).toHaveAttribute(
      "data-granularity",
      "daily",
    )
  })
})
