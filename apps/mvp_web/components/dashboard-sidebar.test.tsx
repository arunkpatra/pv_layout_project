import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { SidebarProvider } from "@solarlayout/ui/components/sidebar"
import { TooltipProvider } from "@solarlayout/ui/components/tooltip"
import { DashboardSidebar } from "./dashboard-sidebar"

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      fullName: "Test User",
      primaryEmailAddress: { emailAddress: "test@example.com" },
      imageUrl: undefined,
    },
  }),
  useClerk: () => ({ signOut: vi.fn() }),
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>{children}</SidebarProvider>
    </TooltipProvider>
  )
}

describe("DashboardSidebar", () => {
  it("renders all nav items", () => {
    render(<DashboardSidebar />, { wrapper: Wrapper })
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Plans")).toBeInTheDocument()
    expect(screen.getByText("Usage")).toBeInTheDocument()
  })

  it("renders user name and email in footer", () => {
    render(<DashboardSidebar />, { wrapper: Wrapper })
    expect(screen.getAllByText("Test User").length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByText("test@example.com").length,
    ).toBeGreaterThanOrEqual(1)
  })
})
