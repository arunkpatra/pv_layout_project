import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue("mock-clerk-token"),
  }),
}))

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
    name: "PV Layout",
    price: "From $1.99",
    calculations: "Plans from 5 to 50 calculations",
    apiBaseUrl: "https://api.example.com",
  }

  it("renders product name, price, and calculations", () => {
    render(<DownloadCard {...defaultProps} />)
    expect(screen.getByText("PV Layout")).toBeInTheDocument()
    expect(screen.getByText("From $1.99")).toBeInTheDocument()
    expect(screen.getByText("Plans from 5 to 50 calculations")).toBeInTheDocument()
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

    render(<DownloadCard {...defaultProps} />)

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
        "https://api.example.com/dashboard/download",
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
