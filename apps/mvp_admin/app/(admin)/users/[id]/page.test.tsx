import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "u1" }),
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    sessionClaims: { metadata: { roles: ["ADMIN"] } },
  }),
}))

// Mock the heavy client component to avoid Radix UI jsdom hangs
vi.mock("./_components/edit-user-client", () => ({
  EditUserClient: ({ userId }: { userId: string }) => (
    <div data-testid="edit-user-client" data-user-id={userId} />
  ),
}))

import EditUserPage from "./page"

describe("EditUserPage", () => {
  it("renders user name heading after load", async () => {
    const Page = await EditUserPage({
      params: Promise.resolve({ id: "u1" }),
    })
    render(Page)
    expect(screen.getByRole("heading")).toBeInTheDocument()
  })

  it("renders Edit User heading text", async () => {
    const Page = await EditUserPage({
      params: Promise.resolve({ id: "u1" }),
    })
    render(Page)
    expect(
      screen.getByRole("heading", { name: /edit user/i }),
    ).toBeInTheDocument()
  })

  it("renders EditUserClient with correct userId", async () => {
    const Page = await EditUserPage({
      params: Promise.resolve({ id: "u1" }),
    })
    render(Page)
    expect(screen.getByTestId("edit-user-client")).toHaveAttribute(
      "data-user-id",
      "u1",
    )
  })
})
