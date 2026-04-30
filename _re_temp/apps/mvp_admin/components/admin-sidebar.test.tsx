import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { AdminSidebar } from "./admin-sidebar"

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      fullName: "Alice Admin",
      primaryEmailAddress: { emailAddress: "alice@test.com" },
      imageUrl: undefined,
    },
  }),
  useClerk: () => ({ signOut: vi.fn() }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}))

vi.mock("@renewable-energy/ui/components/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar">{children}</div>
  ),
  SidebarContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <ul>{children}</ul>
  ),
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <li>{children}</li>
  ),
  SidebarRail: () => <div />,
  useSidebar: () => ({ isMobile: false }),
}))

vi.mock("@renewable-energy/ui/components/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarImage: () => null,
}))

vi.mock("@renewable-energy/ui/components/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => <button onClick={onClick}>{children}</button>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@renewable-energy/ui/components/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}))

vi.mock("@renewable-energy/ui/components/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

describe("AdminSidebar", () => {
  it("renders Dashboard link for OPS role", () => {
    render(<AdminSidebar role="OPS" />)
    expect(screen.getByText("Dashboard")).toBeInTheDocument()
  })

  it("renders Users link for ADMIN role", () => {
    render(<AdminSidebar role="ADMIN" />)
    expect(screen.getByText("Users")).toBeInTheDocument()
  })

  it("does NOT render Users link for OPS role", () => {
    render(<AdminSidebar role="OPS" />)
    expect(screen.queryByText("Users")).not.toBeInTheDocument()
  })

  it("shows ADMIN role badge for ADMIN user", () => {
    render(<AdminSidebar role="ADMIN" />)
    expect(screen.getByText("ADMIN")).toBeInTheDocument()
  })

  it("shows OPS role badge for OPS user", () => {
    render(<AdminSidebar role="OPS" />)
    expect(screen.getByText("OPS")).toBeInTheDocument()
  })

  it("shows Transactions nav item for both ADMIN and OPS", () => {
    for (const role of ["ADMIN", "OPS"] as const) {
      const { unmount } = render(<AdminSidebar role={role} />)
      expect(screen.getByText("Transactions")).toBeInTheDocument()
      unmount()
    }
  })
})
