import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Mock useAuth for Clerk token
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue("mock-clerk-token"),
  }),
}))

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

import { DownloadCard } from "./download-card"

describe("DownloadCard", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    mockFetch.mockReset()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  const defaultProps = {
    name: "PV Layout Basic",
    price: "$1.99",
    calculations: "5 layout calculations",
    productSlug: "pv-layout-basic" as const,
    apiBaseUrl: "https://api.example.com",
  }

  it("renders product name, price, and calculations", () => {
    render(<DownloadCard {...defaultProps} />)
    expect(screen.getByText("PV Layout Basic")).toBeInTheDocument()
    expect(screen.getByText("$1.99")).toBeInTheDocument()
    expect(screen.getByText("5 layout calculations")).toBeInTheDocument()
  })

  it("renders Download button", () => {
    render(<DownloadCard {...defaultProps} />)
    expect(
      screen.getByRole("button", { name: /download/i }),
    ).toBeInTheDocument()
  })

  it("calls API and triggers download on button click", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { url: "https://s3.example.com/file.exe" },
      }),
    })

    // Render first so React can mount before we intercept DOM calls
    render(<DownloadCard {...defaultProps} />)

    // Mock createElement/click for download trigger — after render so React
    // root mounting is not intercepted
    const mockClick = vi.fn()
    const mockAnchor = {
      href: "",
      download: "",
      click: mockClick,
      remove: vi.fn(),
    }
    vi.spyOn(document, "createElement").mockReturnValueOnce(
      mockAnchor as unknown as HTMLAnchorElement,
    )
    vi.spyOn(document.body, "appendChild").mockImplementationOnce(
      () => mockAnchor as unknown as HTMLElement,
    )

    await userEvent.click(screen.getByRole("button", { name: /download/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/dashboard/download/pv-layout-basic",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mock-clerk-token",
          }),
        }),
      )
    })
  })

  it("shows error state when API call fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: { message: "S3 error" } }),
    })

    render(<DownloadCard {...defaultProps} />)
    await userEvent.click(screen.getByRole("button", { name: /download/i }))

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /download/i }),
      ).not.toBeDisabled()
    })
  })
})
