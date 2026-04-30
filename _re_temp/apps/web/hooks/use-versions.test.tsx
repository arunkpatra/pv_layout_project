import { test, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type { PaginatedResponse, VersionDetail } from "@renewable-energy/shared"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

const mockListVersions = vi.fn()

vi.mock("./use-api", () => ({
  useApi: () => ({ listVersions: mockListVersions }),
}))

import { useVersions } from "./use-versions"

beforeEach(() => vi.clearAllMocks())

function makePage(): PaginatedResponse<VersionDetail> {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 0,
  }
}

test("fetches versions for a project", async () => {
  mockListVersions.mockResolvedValue(makePage())
  const { result } = renderHook(() => useVersions("prj_1"), {
    wrapper: createWrapper(),
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(mockListVersions).toHaveBeenCalledWith("prj_1", undefined)
})

test("does not fetch when projectId is empty", () => {
  const { result } = renderHook(() => useVersions(""), {
    wrapper: createWrapper(),
  })
  expect(result.current.fetchStatus).toBe("idle")
  expect(mockListVersions).not.toHaveBeenCalled()
})

test("passes pagination params to listVersions", async () => {
  mockListVersions.mockResolvedValue(makePage())
  const { result } = renderHook(
    () => useVersions("prj_1", { page: 2, pageSize: 20 }),
    { wrapper: createWrapper() },
  )
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(mockListVersions).toHaveBeenCalledWith("prj_1", { page: 2, pageSize: 20 })
})
