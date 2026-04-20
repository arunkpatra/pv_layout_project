import { test, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type { Project } from "@renewable-energy/shared"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

const mockProject: Project = {
  id: "prj_1",
  name: "Alpha Site",
  userId: "usr_1",
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
}

const mockGetProject = vi.fn().mockResolvedValue(mockProject)

vi.mock("./use-api", () => ({
  useApi: () => ({ getProject: mockGetProject }),
}))

import { useProject } from "./use-project"

beforeEach(() => vi.clearAllMocks())

test("fetches project by id", async () => {
  const { result } = renderHook(() => useProject("prj_1"), {
    wrapper: createWrapper(),
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.name).toBe("Alpha Site")
  expect(mockGetProject).toHaveBeenCalledWith("prj_1")
})

test("does not fetch when projectId is empty", () => {
  const { result } = renderHook(() => useProject(""), {
    wrapper: createWrapper(),
  })
  expect(result.current.fetchStatus).toBe("idle")
  expect(mockGetProject).not.toHaveBeenCalled()
})
