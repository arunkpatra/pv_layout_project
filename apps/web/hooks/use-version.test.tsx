import { test, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type { VersionDetail, VersionStatus } from "@renewable-energy/shared"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

const mockGetVersion = vi.fn()

vi.mock("./use-api", () => ({
  useApi: () => ({ getVersion: mockGetVersion }),
}))

import { useVersion, getVersionRefetchInterval } from "./use-version"

beforeEach(() => vi.clearAllMocks())

function makeVersion(status: VersionStatus): VersionDetail {
  return {
    id: "ver_1",
    projectId: "prj_1",
    number: 1,
    label: null,
    status,
    kmzS3Key: null,
    inputSnapshot: {},
    layoutJob: null,
    energyJob: null,
    createdAt: "2026-04-20T00:00:00Z",
    updatedAt: "2026-04-20T00:00:00Z",
    svgPresignedUrl: null,
  }
}

// refetchInterval logic tests — no timers needed, pure function
test("getVersionRefetchInterval returns 3000 for QUEUED", () => {
  expect(getVersionRefetchInterval("QUEUED")).toBe(3000)
})

test("getVersionRefetchInterval returns 3000 for PROCESSING", () => {
  expect(getVersionRefetchInterval("PROCESSING")).toBe(3000)
})

test("getVersionRefetchInterval returns false for COMPLETE", () => {
  expect(getVersionRefetchInterval("COMPLETE")).toBe(false)
})

test("getVersionRefetchInterval returns false for FAILED", () => {
  expect(getVersionRefetchInterval("FAILED")).toBe(false)
})

test("getVersionRefetchInterval returns false for undefined", () => {
  expect(getVersionRefetchInterval(undefined)).toBe(false)
})

// hook integration tests
test("fetches version by id", async () => {
  mockGetVersion.mockResolvedValue(makeVersion("COMPLETE"))
  const { result } = renderHook(() => useVersion("prj_1", "ver_1"), {
    wrapper: createWrapper(),
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.id).toBe("ver_1")
  expect(mockGetVersion).toHaveBeenCalledWith("prj_1", "ver_1")
})

test("does not fetch when versionId is empty", () => {
  const { result } = renderHook(() => useVersion("prj_1", ""), {
    wrapper: createWrapper(),
  })
  expect(result.current.fetchStatus).toBe("idle")
  expect(mockGetVersion).not.toHaveBeenCalled()
})

test("does not fetch when projectId is empty", () => {
  const { result } = renderHook(() => useVersion("", "ver_1"), {
    wrapper: createWrapper(),
  })
  expect(result.current.fetchStatus).toBe("idle")
  expect(mockGetVersion).not.toHaveBeenCalled()
})
