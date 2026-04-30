import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    sessionClaims: { metadata: { roles: ["ADMIN"] } },
  }),
}))

vi.mock("@/lib/hooks/use-admin-users", () => ({
  useAdminUsers: () => ({
    data: {
      data: [
        {
          id: "u1",
          email: "alice@test.com",
          name: "Alice",
          roles: ["ADMIN"],
          status: "ACTIVE",
          createdAt: "2026-01-01",
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
    isLoading: false,
    error: null,
  }),
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}))

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: async () => "token" }),
}))

import UsersPage from "./page"

describe("UsersPage", () => {
  it("renders Users heading", async () => {
    const Page = await UsersPage()
    render(Page)
    expect(screen.getByRole("heading", { name: /users/i })).toBeInTheDocument()
  })
})
