import { test, expect, vi } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type { Project } from "@renewable-energy/shared"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

const mockProject: Project = {
  id: "prj_2",
  name: "Beta Site",
  userId: "usr_1",
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
}

const mockCreateProject = vi.fn().mockResolvedValue(mockProject)

vi.mock("./use-api", () => ({
  useApi: () => ({ createProject: mockCreateProject }),
}))

import { useCreateProject } from "./use-create-project"

test("calls createProject and returns new project", async () => {
  const { result } = renderHook(() => useCreateProject(), {
    wrapper: createWrapper(),
  })
  await act(async () => {
    await result.current.mutateAsync("Beta Site")
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(mockCreateProject).toHaveBeenCalledWith({ name: "Beta Site" })
  expect(result.current.data?.name).toBe("Beta Site")
})
