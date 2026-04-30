import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    sessionClaims: { metadata: { roles: ["ADMIN"] } },
  }),
}))

vi.mock("@/lib/hooks/mutations/use-create-admin-user", () => ({
  useCreateAdminUser: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}))

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: async () => "token" }),
}))

vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}))

import NewUserPage from "./page"

describe("NewUserPage", () => {
  it("renders New User heading", async () => {
    const Page = await NewUserPage()
    render(Page)
    expect(screen.getByRole("heading", { name: /new user/i })).toBeInTheDocument()
  })

  it("renders email input field", async () => {
    const Page = await NewUserPage()
    render(Page)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it("renders role checkboxes for ADMIN and OPS", async () => {
    const Page = await NewUserPage()
    render(Page)
    expect(screen.getByLabelText(/admin/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/ops/i)).toBeInTheDocument()
  })
})
