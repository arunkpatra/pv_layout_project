import { test, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react"
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

test("shows KMZ required error when submitting without a file", async () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const form = document.querySelector("form")!
  await act(async () => { fireEvent.submit(form) })
  await waitFor(() =>
    expect(screen.getByText("KMZ file is required.")).toBeDefined(),
  )
})

test("displays filename after KMZ file is selected", async () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(["x"], "site.kmz", { type: "application/vnd.google-earth.kmz" })
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [file] } })
  })
  expect(screen.getByText(/site\.kmz/)).toBeDefined()
})

test("pre-fills module defaults", () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const moduleLengthInput = screen.getByLabelText(/module length/i) as HTMLInputElement
  expect(moduleLengthInput.value).toBe("2.38")
  const wattageInput = screen.getByLabelText(/wattage/i) as HTMLInputElement
  expect(wattageInput.value).toBe("580")
})

test("tilt_angle, row_spacing, gcr are null when auto-override switches are off", async () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const file = new File(["x"], "site.kmz", {})
  await act(async () => {
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [file] } },
    )
  })
  const form = document.querySelector("form")!
  await act(async () => { fireEvent.submit(form) })
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
  const call = mockMutateAsync.mock.calls[0]
  expect(call).toBeDefined()
  const { inputSnapshot } = call![0]
  expect(inputSnapshot.tilt_angle).toBeNull()
  expect(inputSnapshot.row_spacing).toBeNull()
  expect(inputSnapshot.gcr).toBeNull()
})
