import { test, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type { VersionDetail } from "@renewable-energy/shared"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

const mockVersion: VersionDetail = {
  id: "ver_1",
  projectId: "prj_1",
  number: 1,
  label: null,
  status: "QUEUED",
  kmzS3Key: null,
  inputSnapshot: {},
  layoutJob: null,
  energyJob: null,
  createdAt: "2026-04-20T00:00:00Z",
  updatedAt: "2026-04-20T00:00:00Z",
  svgPresignedUrl: null,
  kmzDownloadUrl: null,
  dxfDownloadUrl: null,
  svgDownloadUrl: null,
}

const mockCreateVersion = vi.fn().mockResolvedValue(mockVersion)

vi.mock("./use-api", () => ({
  useApi: () => ({ createVersion: mockCreateVersion }),
}))

import { useCreateVersion } from "./use-create-version"

beforeEach(() => vi.clearAllMocks())

test("calls createVersion and returns new version", async () => {
  const { result } = renderHook(() => useCreateVersion(), {
    wrapper: createWrapper(),
  })
  const params = {
    projectId: "prj_1",
    inputSnapshot: { module_length: 2.38 },
  }
  await act(async () => {
    await result.current.mutateAsync(params)
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(mockCreateVersion).toHaveBeenCalledWith(params)
  expect(result.current.data?.id).toBe("ver_1")
})
