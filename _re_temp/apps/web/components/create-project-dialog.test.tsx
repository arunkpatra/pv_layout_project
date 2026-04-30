import { test, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import { CreateProjectDialog } from "./create-project-dialog"

afterEach(() => cleanup())

vi.mock("@/hooks/use-create-project", () => ({
  useCreateProject: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: "prj_1", name: "Alpha Site" }),
    isPending: false,
  }),
}))

test("renders trigger button and opens dialog on click", () => {
  render(<CreateProjectDialog onCreated={() => {}} />, { wrapper: createWrapper() })
  expect(screen.getByRole("button", { name: /new project/i })).toBeDefined()
  fireEvent.click(screen.getByRole("button", { name: /new project/i }))
  expect(screen.getByRole("dialog")).toBeDefined()
  expect(screen.getByLabelText(/project name/i)).toBeDefined()
})

test("calls onCreated with new project after submission", async () => {
  const onCreated = vi.fn()
  render(<CreateProjectDialog onCreated={onCreated} />, { wrapper: createWrapper() })
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /new project/i }))
  })
  const input = screen.getByLabelText(/project name/i)
  await act(async () => {
    fireEvent.change(input, { target: { value: "Alpha Site" } })
  })
  const form = input.closest("form")!
  await act(async () => {
    fireEvent.submit(form)
  })
  await waitFor(() =>
    expect(onCreated).toHaveBeenCalledWith({ id: "prj_1", name: "Alpha Site" }),
  )
})
