import { test, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type {
  PaginatedResponse,
  VersionDetail,
  Project,
} from "@renewable-energy/shared"

afterEach(() => cleanup())

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}))

vi.mock("@/hooks/use-project", () => ({
  useProject: vi.fn(),
}))

vi.mock("@/hooks/use-versions", () => ({
  useVersions: vi.fn(),
}))

vi.mock("@/contexts/breadcrumbs-context", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}))

import {
  useParams,
  useSearchParams,
  useRouter,
  usePathname,
} from "next/navigation"
import { useProject } from "@/hooks/use-project"
import { useVersions } from "@/hooks/use-versions"
import ProjectDetailPage from "./page"

const mockUseProject = vi.mocked(useProject)
const mockUseVersions = vi.mocked(useVersions)

const PROJECT: Project = {
  id: "prj_123",
  userId: "user_1",
  name: "Solar Farm A",
  createdAt: "2026-04-20T00:00:00Z",
  updatedAt: "2026-04-20T00:00:00Z",
}

function makeVersion(overrides: Partial<VersionDetail> = {}): VersionDetail {
  return {
    id: "ver_1",
    projectId: "prj_123",
    number: 1,
    label: null,
    status: "COMPLETE",
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
    ...overrides,
  }
}

function makePage(items: VersionDetail[]): PaginatedResponse<VersionDetail> {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 10,
    totalPages: items.length > 0 ? 1 : 0,
  }
}

beforeEach(() => {
  vi.mocked(useParams).mockReturnValue({ projectId: "prj_123" } as any)
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any)
  vi.mocked(useRouter).mockReturnValue({ replace: vi.fn(), push: vi.fn() } as any)
  vi.mocked(usePathname).mockReturnValue("/dashboard/projects/prj_123")
  mockUseProject.mockReturnValue({ data: PROJECT } as ReturnType<typeof useProject>)
  localStorage.clear()
})

test("renders 3 skeleton rows while loading", () => {
  mockUseVersions.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  } as ReturnType<typeof useVersions>)
  render(<ProjectDetailPage />, { wrapper: createWrapper() })
  const skeletons = document.querySelectorAll("[data-slot='skeleton']")
  expect(skeletons.length).toBe(3)
})

test("renders error message on query failure", () => {
  mockUseVersions.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
  } as ReturnType<typeof useVersions>)
  render(<ProjectDetailPage />, { wrapper: createWrapper() })
  expect(screen.getByText(/failed to load runs/i)).toBeInTheDocument()
})

test("renders empty state with start first run link when no versions", () => {
  mockUseVersions.mockReturnValue({
    data: makePage([]),
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersions>)
  render(<ProjectDetailPage />, { wrapper: createWrapper() })
  expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
  const link = screen.getByRole("link", { name: /start first run/i })
  expect(link.getAttribute("href")).toBe(
    "/dashboard/projects/prj_123/new-version",
  )
})

test("renders version rows with correct href and status badge", () => {
  const versions = [
    makeVersion({ id: "ver_1", number: 2, status: "COMPLETE" }),
    makeVersion({ id: "ver_2", number: 1, status: "FAILED" }),
  ]
  mockUseVersions.mockReturnValue({
    data: makePage(versions),
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersions>)
  render(<ProjectDetailPage />, { wrapper: createWrapper() })

  const versionLinks = screen
    .getAllByRole("link")
    .filter((l) => l.getAttribute("href")?.includes("/versions/"))
  expect(versionLinks[0]?.getAttribute("href")).toBe(
    "/dashboard/projects/prj_123/versions/ver_1",
  )
  expect(versionLinks[1]?.getAttribute("href")).toBe(
    "/dashboard/projects/prj_123/versions/ver_2",
  )
  expect(screen.getByText("Complete")).toBeInTheDocument()
  expect(screen.getByText("Failed")).toBeInTheDocument()
})
