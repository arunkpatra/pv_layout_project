import { test, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type { PaginatedResponse, ProjectSummary } from "@renewable-energy/shared"

afterEach(() => cleanup())

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}))

vi.mock("@/hooks/use-projects", () => ({
  useProjects: vi.fn(),
}))

vi.mock("@/contexts/breadcrumbs-context", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}))

vi.mock("@/components/create-project-dialog", () => ({
  CreateProjectDialog: () => <button type="button">New Project</button>,
}))

import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useProjects } from "@/hooks/use-projects"
import ProjectsPage from "./page"

const mockUseProjects = vi.mocked(useProjects)

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "prj_1",
    userId: "user_1",
    name: "Test Project",
    createdAt: "2026-04-20T00:00:00Z",
    updatedAt: "2026-04-20T00:00:00Z",
    versionCount: 1,
    latestVersionStatus: "COMPLETE",
    ...overrides,
  }
}

function makePage(
  items: ProjectSummary[],
  totalPages = 1,
): PaginatedResponse<ProjectSummary> {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 10,
    totalPages,
  }
}

beforeEach(() => {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any)
  vi.mocked(useRouter).mockReturnValue({ replace: vi.fn(), push: vi.fn() } as any)
  vi.mocked(usePathname).mockReturnValue("/dashboard/projects")
  localStorage.clear()
})

test("pagination nav visible when totalPages > 1", () => {
  mockUseProjects.mockReturnValue({
    data: makePage([makeProject(), makeProject({ id: "prj_2" })], 3),
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useProjects>)
  render(<ProjectsPage />, { wrapper: createWrapper() })
  expect(
    screen.getByRole("navigation", { name: /pagination/i }),
  ).toBeInTheDocument()
})

test("pagination nav hidden when totalPages === 1", () => {
  mockUseProjects.mockReturnValue({
    data: makePage([makeProject()], 1),
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useProjects>)
  render(<ProjectsPage />, { wrapper: createWrapper() })
  expect(
    screen.queryByRole("navigation", { name: /pagination/i }),
  ).not.toBeInTheDocument()
})

test("page size selector always visible", () => {
  mockUseProjects.mockReturnValue({
    data: makePage([makeProject()], 1),
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useProjects>)
  render(<ProjectsPage />, { wrapper: createWrapper() })
  expect(screen.getByText("Per page:")).toBeInTheDocument()
})
