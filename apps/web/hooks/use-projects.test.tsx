import { test, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type { ProjectSummary } from "@renewable-energy/shared"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: () => Promise.resolve("tok"),
  }),
}))

const mockListProjects = vi.fn().mockResolvedValue({
  items: [
    {
      id: "prj_1",
      name: "Alpha Site",
      userId: "usr_1",
      versionCount: 3,
      latestVersionStatus: "COMPLETE",
      createdAt: "2026-04-01T00:00:00Z",
      updatedAt: "2026-04-01T00:00:00Z",
    } satisfies ProjectSummary,
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
})

vi.mock("./use-api", () => ({
  useApi: () => ({ listProjects: mockListProjects }),
}))

import { useProjects } from "./use-projects"

test("returns paginated project list", async () => {
  const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.items).toHaveLength(1)
  expect(result.current.data?.items[0].name).toBe("Alpha Site")
})
