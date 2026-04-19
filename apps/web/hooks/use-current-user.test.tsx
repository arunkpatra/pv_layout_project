import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { User } from "@renewable-energy/shared"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetMe = vi.fn()

vi.mock("@clerk/nextjs", () => ({
  useAuth: vi.fn(),
}))

vi.mock("./use-api", () => ({
  useApi: () => ({ getMe: mockGetMe }),
}))

import { useAuth } from "@clerk/nextjs"
import { useCurrentUser } from "./use-current-user"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const mockUser: User = {
  id: "usr_abc",
  clerkId: "clerk_123",
  email: "test@example.com",
  name: "Test User",
  avatarUrl: null,
  status: "ACTIVE",
  createdAt: "2026-04-19T00:00:00.000Z",
  updatedAt: "2026-04-19T00:00:00.000Z",
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useCurrentUser", () => {
  beforeEach(() => {
    mockGetMe.mockClear()
  })

  it("does not fetch when Clerk auth is not loaded", () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      getToken: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    expect(result.current.fetchStatus).toBe("idle")
    expect(mockGetMe).not.toHaveBeenCalled()
  })

  it("does not fetch when user is not signed in", () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      getToken: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    expect(result.current.fetchStatus).toBe("idle")
    expect(mockGetMe).not.toHaveBeenCalled()
  })

  it("fetches and returns user when signed in", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      getToken: vi.fn().mockResolvedValue("tok"),
    } as unknown as ReturnType<typeof useAuth>)
    mockGetMe.mockResolvedValue(mockUser)

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockUser)
    expect(mockGetMe).toHaveBeenCalledTimes(1)
  })
})
