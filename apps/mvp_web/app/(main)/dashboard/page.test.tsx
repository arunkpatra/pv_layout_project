import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import DashboardPage from "./page"

describe("Dashboard home page", () => {
  it("renders welcome heading", () => {
    render(<DashboardPage />)
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
  })

  it("renders three download cards", () => {
    render(<DashboardPage />)
    expect(screen.getByText("PV Layout Basic")).toBeInTheDocument()
    expect(screen.getByText("PV Layout Pro")).toBeInTheDocument()
    expect(screen.getByText("PV Layout Pro Plus")).toBeInTheDocument()
  })
})
