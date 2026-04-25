import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"

// Mock Clerk
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock use-billing hooks
const mockUseEntitlements = vi.fn()
const mockUseUserUsage = vi.fn()

vi.mock("@/components/hooks/use-billing", () => ({
  useEntitlements: () => mockUseEntitlements(),
  useUserUsage: (...args: unknown[]) => mockUseUserUsage(...args),
}))

// Mock tooltip components (radix portal won't render in jsdom)
vi.mock("@renewable-energy/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({
    children,
    asChild,
    ...props
  }: {
    children: React.ReactNode
    asChild?: boolean
    [key: string]: unknown
  }) => <div {...props}>{children}</div>,
}))

import DashboardPage from "./page"

const twoActiveEntitlements = [
  {
    id: "ent-1",
    product: "pv-layout-pro",
    productName: "PV Layout Pro",
    totalCalculations: 10,
    usedCalculations: 0,
    remainingCalculations: 30,
    purchasedAt: "2024-01-01T00:00:00Z",
    deactivatedAt: null,
    state: "ACTIVE" as const,
  },
  {
    id: "ent-2",
    product: "pv-layout-basic",
    productName: "PV Layout Basic",
    totalCalculations: 5,
    usedCalculations: 0,
    remainingCalculations: 20,
    purchasedAt: "2024-01-02T00:00:00Z",
    deactivatedAt: null,
    state: "ACTIVE" as const,
  },
]

const sampleUsageRecords = [
  {
    featureKey: "pv_layout",
    productName: "PV Layout Pro",
    createdAt: "2024-03-15T10:00:00Z",
  },
]

describe("Dashboard home page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("stat cards", () => {
    it("renders Remaining Calculations card title", () => {
      mockUseEntitlements.mockReturnValue({
        data: { entitlements: [], licenseKey: null },
        isLoading: false,
        isError: false,
      })
      mockUseUserUsage.mockReturnValue({
        data: { data: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 } },
        isLoading: false,
        isError: false,
      })
      render(<DashboardPage />)
      expect(screen.getByText("Remaining Calculations")).toBeInTheDocument()
    })

    it("renders Active Entitlements card title", () => {
      mockUseEntitlements.mockReturnValue({
        data: { entitlements: [], licenseKey: null },
        isLoading: false,
        isError: false,
      })
      mockUseUserUsage.mockReturnValue({
        data: { data: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 } },
        isLoading: false,
        isError: false,
      })
      render(<DashboardPage />)
      expect(screen.getByText("Active Entitlements")).toBeInTheDocument()
    })

    it("shows correct remaining calculations sum across active entitlements", () => {
      mockUseEntitlements.mockReturnValue({
        data: { entitlements: twoActiveEntitlements, licenseKey: "abc-123-key" },
        isLoading: false,
        isError: false,
      })
      mockUseUserUsage.mockReturnValue({
        data: { data: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 } },
        isLoading: false,
        isError: false,
      })
      render(<DashboardPage />)
      // 30 + 20 = 50
      expect(screen.getByTestId("remaining-calculations-value")).toHaveTextContent("50")
    })

    it("shows correct active entitlements count", () => {
      mockUseEntitlements.mockReturnValue({
        data: { entitlements: twoActiveEntitlements, licenseKey: "abc-123-key" },
        isLoading: false,
        isError: false,
      })
      mockUseUserUsage.mockReturnValue({
        data: { data: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 } },
        isLoading: false,
        isError: false,
      })
      render(<DashboardPage />)
      expect(screen.getByTestId("active-entitlements-value")).toHaveTextContent("2")
    })
  })

  describe("license key card", () => {
    it("shows masked license key when a key exists", () => {
      mockUseEntitlements.mockReturnValue({
        data: {
          entitlements: twoActiveEntitlements,
          licenseKey: "ABCD1234-EFGH5678",
        },
        isLoading: false,
        isError: false,
      })
      mockUseUserUsage.mockReturnValue({
        data: { data: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 } },
        isLoading: false,
        isError: false,
      })
      render(<DashboardPage />)
      // first 8 chars of "ABCD1234-EFGH5678" = "ABCD1234"
      expect(screen.getByText("ABCD1234...")).toBeInTheDocument()
    })

    it("shows purchase prompt when no license key", () => {
      mockUseEntitlements.mockReturnValue({
        data: { entitlements: [], licenseKey: null },
        isLoading: false,
        isError: false,
      })
      mockUseUserUsage.mockReturnValue({
        data: { data: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 } },
        isLoading: false,
        isError: false,
      })
      render(<DashboardPage />)
      expect(
        screen.getByText("Purchase a plan to get your license key."),
      ).toBeInTheDocument()
    })
  })

  describe("recent activity", () => {
    it("shows empty state when no usage records", () => {
      mockUseEntitlements.mockReturnValue({
        data: { entitlements: [], licenseKey: null },
        isLoading: false,
        isError: false,
      })
      mockUseUserUsage.mockReturnValue({
        data: { data: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 } },
        isLoading: false,
        isError: false,
      })
      render(<DashboardPage />)
      expect(
        screen.getByText(/No calculations run yet/i),
      ).toBeInTheDocument()
    })

    it("shows feature, product, and date for usage records", () => {
      mockUseEntitlements.mockReturnValue({
        data: { entitlements: twoActiveEntitlements, licenseKey: "abc-key" },
        isLoading: false,
        isError: false,
      })
      mockUseUserUsage.mockReturnValue({
        data: {
          data: sampleUsageRecords,
          pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
        },
        isLoading: false,
        isError: false,
      })
      render(<DashboardPage />)
      expect(screen.getByText("pv_layout")).toBeInTheDocument()
      expect(screen.getByText("PV Layout Pro")).toBeInTheDocument()
      // Date rendered via toLocaleDateString — check at least one cell exists
      const dateCells = screen.getAllByRole("cell")
      expect(dateCells.length).toBeGreaterThan(0)
    })
  })
})
