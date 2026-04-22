import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import LicensePage from "./page"

describe("License page", () => {
  it("renders License heading", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { entitlements: [], licenseKey: null },
      }),
    })
    render(<LicensePage />)
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /License/i }),
      ).toBeInTheDocument()
    )
  })
})
