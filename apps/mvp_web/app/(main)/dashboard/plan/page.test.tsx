import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("mock-token") }),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import PlanPage from "./page"

describe("Plan page", () => {
  it("renders Plan heading", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { products: [], entitlements: [], licenseKey: null } }),
    })
    render(<PlanPage />)
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Plan/i })).toBeInTheDocument()
    )
  })
})
