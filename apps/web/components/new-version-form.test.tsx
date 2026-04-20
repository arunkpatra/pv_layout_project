import { test, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import { NewVersionForm } from "./new-version-form"

afterEach(() => cleanup())

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

const mockMutateAsync = vi.fn().mockResolvedValue({ id: "ver_1", projectId: "prj_1" })
const mockPush = vi.fn()

vi.mock("@/hooks/use-create-version", () => ({
  useCreateVersion: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockMutateAsync.mockResolvedValue({ id: "ver_1", projectId: "prj_1" })
})

test("renders all 6 section headings", () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  expect(screen.getAllByText("Run setup").length).toBeGreaterThan(0)
  expect(screen.getAllByText("Module").length).toBeGreaterThan(0)
  expect(screen.getAllByText("Table config").length).toBeGreaterThan(0)
  expect(screen.getAllByText("Layout").length).toBeGreaterThan(0)
  expect(screen.getAllByText("Inverter").length).toBeGreaterThan(0)
  expect(screen.getAllByText("Energy losses").length).toBeGreaterThan(0)
})
