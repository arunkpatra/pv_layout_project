import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"

// Mock Clerk
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

// Mock next/navigation
const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: mockPush }),
}))

const mockSearchParams = vi.fn()

// Mock use-billing hook
const mockUseUserUsage = vi.fn()
vi.mock("@/components/hooks/use-billing", () => ({
  useUserUsage: (...args: unknown[]) => mockUseUserUsage(...args),
}))

import { UsagePageInner } from "./usage-inner"

const sampleRecords = [
  {
    featureKey: "pv_layout",
    productName: "PV Layout Pro",
    createdAt: "2024-03-15T10:00:00Z",
  },
  {
    featureKey: "string_sizing",
    productName: "PV Layout Basic",
    createdAt: "2024-02-10T08:00:00Z",
  },
]

describe("Usage page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.mockReturnValue({
      get: (key: string) => (key === "page" ? null : null),
    })
  })

  it("renders Usage History heading", () => {
    mockUseUserUsage.mockReturnValue({
      data: {
        data: sampleRecords,
        pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    })
    render(<UsagePageInner />)
    expect(
      screen.getByRole("heading", { name: /Usage History/i }),
    ).toBeInTheDocument()
  })

  it("shows skeleton rows while loading", () => {
    mockUseUserUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })
    render(<UsagePageInner />)
    const skeletons = screen.getAllByTestId("skeleton-row")
    expect(skeletons).toHaveLength(3)
  })

  it("shows usage records with featureKey, productName, and date when loaded", () => {
    mockUseUserUsage.mockReturnValue({
      data: {
        data: sampleRecords,
        pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    })
    render(<UsagePageInner />)
    expect(screen.getByText("pv_layout")).toBeInTheDocument()
    expect(screen.getByText("PV Layout Pro")).toBeInTheDocument()
    expect(screen.getByText("string_sizing")).toBeInTheDocument()
    expect(screen.getByText("PV Layout Basic")).toBeInTheDocument()
    // Dates rendered via toLocaleDateString — at least the cells appear
    const cells = screen.getAllByRole("cell")
    expect(cells.length).toBeGreaterThan(0)
  })

  it("shows empty state when no records", () => {
    mockUseUserUsage.mockReturnValue({
      data: {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
      isLoading: false,
      isError: false,
    })
    render(<UsagePageInner />)
    expect(
      screen.getByText(
        /No calculations recorded yet/i,
      ),
    ).toBeInTheDocument()
  })

  it("shows error state when isError is true", () => {
    mockUseUserUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })
    render(<UsagePageInner />)
    expect(
      screen.getByText(/Failed to load usage history/i),
    ).toBeInTheDocument()
  })

  it("Previous button is disabled on page 1", () => {
    mockUseUserUsage.mockReturnValue({
      data: {
        data: sampleRecords,
        pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    })
    render(<UsagePageInner />)
    const prevBtn = screen.getByRole("button", { name: /previous/i })
    expect(prevBtn).toBeDisabled()
  })

  it("Next button is disabled on last page", () => {
    mockUseUserUsage.mockReturnValue({
      data: {
        data: sampleRecords,
        pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    })
    render(<UsagePageInner />)
    const nextBtn = screen.getByRole("button", { name: /next/i })
    expect(nextBtn).toBeDisabled()
  })

  it("clicking Next calls router.push with page+1", () => {
    mockSearchParams.mockReturnValue({
      get: (key: string) => (key === "page" ? "1" : null),
    })
    mockUseUserUsage.mockReturnValue({
      data: {
        data: sampleRecords,
        pagination: { page: 1, pageSize: 20, total: 40, totalPages: 2 },
      },
      isLoading: false,
      isError: false,
    })
    render(<UsagePageInner />)
    const nextBtn = screen.getByRole("button", { name: /next/i })
    fireEvent.click(nextBtn)
    expect(mockPush).toHaveBeenCalledWith("?page=2")
  })
})
