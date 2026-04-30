# Spike 4e — Project Detail Page + Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project detail page (`/dashboard/projects/[projectId]`) with a paginated versions list, and add URL-based pagination to the projects list page.

**Architecture:** Four file changes — no API, api-client, or shared type changes. `listVersions` already exists in the api-client. `queryKeys.projects.versions.lists` already exists. `PaginatedResponse<T>` has `{ items, total, page, pageSize, totalPages }`.

**Tech Stack:** TanStack Query v5, Next.js App Router `useSearchParams` + `useRouter`, shadcn `Pagination` primitives from `@renewable-energy/ui/components/pagination`, shadcn `Select` from `@renewable-energy/ui/components/select`.

---

## Scene

**Branch:** `spike/4e-project-detail-pagination`  
**Spec:** `docs/superpowers/specs/2026-04-20-spike-4e-project-detail-pagination-design.md`  
**Existing patterns to follow:**
- Hooks: `apps/web/hooks/use-version.ts` — auth guard, queryKey factory, same import style
- Tests: `apps/web/hooks/use-version.test.tsx` — vi.mock pattern, createWrapper, renderHook
- Component tests: `apps/web/components/version-detail.test.tsx` — vi.mocked hooks, render + screen
- Pagination logic: happyfeet `DataPagination` adapted for this stack (see spec)

**All tests run from repo root:**
```bash
bunx vitest run --config apps/web/vitest.config.ts <test-file>
```

**Final gates (from repo root):**
```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

---

## Task 1: `use-versions` hook

**Files:**
- Create: `apps/web/hooks/use-versions.ts`
- Create: `apps/web/hooks/use-versions.test.tsx`

- [ ] **Step 1: Write the test file**

Create `apps/web/hooks/use-versions.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail (import error expected)**

```bash
bunx vitest run --config apps/web/vitest.config.ts apps/web/hooks/use-versions.test.tsx
```

Expected: FAIL — `Cannot find module './use-versions'`

- [ ] **Step 3: Implement the hook**

Create `apps/web/hooks/use-versions.ts`:

```ts
"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"

export function useVersions(
  projectId: string,
  params?: { page?: number; pageSize?: number },
) {
  const { isLoaded, isSignedIn } = useAuth()
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.projects.versions.lists(projectId, params),
    queryFn: () => api.listVersions(projectId, params),
    enabled: isLoaded && !!isSignedIn && !!projectId,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx vitest run --config apps/web/vitest.config.ts apps/web/hooks/use-versions.test.tsx
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/use-versions.ts apps/web/hooks/use-versions.test.tsx
git commit -m "feat: add useVersions hook with pagination params"
```

---

## Task 2: `PaginationControls` component

**Files:**
- Create: `apps/web/components/pagination-controls.tsx`
- Create: `apps/web/components/pagination-controls.test.tsx`

- [ ] **Step 1: Write the test file**

Create `apps/web/components/pagination-controls.test.tsx`:

```tsx
import { test, expect } from "vitest"
import { getPageNumbers } from "./pagination-controls"

test("returns empty array when totalPages is 0", () => {
  expect(getPageNumbers(1, 0)).toEqual([])
})

test("returns [1] for single page", () => {
  expect(getPageNumbers(1, 1)).toEqual([1])
})

test("returns all pages when two pages total", () => {
  expect(getPageNumbers(1, 2)).toEqual([1, 2])
})

test("returns all pages when three pages and no gap", () => {
  expect(getPageNumbers(2, 3)).toEqual([1, 2, 3])
})

test("first page of 20 — ellipsis after page 2", () => {
  expect(getPageNumbers(1, 20)).toEqual([1, 2, "ellipsis", 20])
})

test("middle page of 20 — ellipsis on both sides", () => {
  expect(getPageNumbers(8, 20)).toEqual([1, "ellipsis", 7, 8, 9, "ellipsis", 20])
})

test("last page of 20 — ellipsis before page 19", () => {
  expect(getPageNumbers(20, 20)).toEqual([1, "ellipsis", 19, 20])
})

test("second-to-last page — ellipsis on left only", () => {
  expect(getPageNumbers(19, 20)).toEqual([1, "ellipsis", 18, 19, 20])
})
```

- [ ] **Step 2: Run tests to verify they fail (import error expected)**

```bash
bunx vitest run --config apps/web/vitest.config.ts apps/web/components/pagination-controls.test.tsx
```

Expected: FAIL — `Cannot find module './pagination-controls'`

- [ ] **Step 3: Implement the component**

Create `apps/web/components/pagination-controls.tsx`:

```tsx
"use client"

import * as React from "react"
import { Suspense } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@renewable-energy/ui/components/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renewable-energy/ui/components/select"

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50]
const LOCALSTORAGE_KEY = "re_page_size"

export function getPageNumbers(
  page: number,
  totalPages: number,
): (number | "ellipsis")[] {
  if (totalPages <= 0) return []
  if (totalPages === 1) return [1]

  const shown = new Set<number>()
  shown.add(1)
  shown.add(totalPages)
  for (let i = Math.max(1, page - 1); i <= Math.min(totalPages, page + 1); i++) {
    shown.add(i)
  }

  const sorted = Array.from(shown).sort((a, b) => a - b)
  const result: (number | "ellipsis")[] = []
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]!)
    const next = sorted[i + 1]
    if (next !== undefined && next - sorted[i]! > 1) {
      result.push("ellipsis")
    }
  }
  return result
}

type PaginationControlsProps = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  pageSizeOptions?: number[]
}

function PaginationControlsInner({
  page,
  pageSize,
  total,
  totalPages,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationControlsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // On first mount: sync localStorage page size preference into URL if absent
  React.useEffect(() => {
    if (searchParams.get("pageSize") === null) {
      const stored = localStorage.getItem(LOCALSTORAGE_KEY)
      if (stored !== null && pageSizeOptions.includes(Number(stored))) {
        const params = new URLSearchParams(searchParams.toString())
        params.set("pageSize", stored)
        params.set("page", "1")
        router.replace(`${pathname}?${params.toString()}`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showPageNav = totalPages > 1

  function makePageHref(targetPage: number): string {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(targetPage))
    return `${pathname}?${params.toString()}`
  }

  function handlePageSizeChange(value: string) {
    localStorage.setItem(LOCALSTORAGE_KEY, value)
    const params = new URLSearchParams(searchParams.toString())
    params.set("pageSize", value)
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  const pageNumbers = getPageNumbers(page, totalPages)
  const isPrevDisabled = page <= 1
  const isNextDisabled = page >= totalPages

  return (
    <div className="flex items-center justify-between gap-4 py-4">
      {showPageNav ? (
        <Pagination className="flex-1 justify-start">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={isPrevDisabled ? undefined : makePageHref(page - 1)}
                aria-disabled={isPrevDisabled}
                className={
                  isPrevDisabled ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
            {pageNumbers.map((item, idx) =>
              item === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${idx}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href={makePageHref(item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={isNextDisabled ? undefined : makePageHref(page + 1)}
                aria-disabled={isNextDisabled}
                className={
                  isNextDisabled ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap shrink-0">
        <span>Per page:</span>
        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="w-20 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs">({total} total)</span>
      </div>
    </div>
  )
}

export function PaginationControls(props: PaginationControlsProps) {
  return (
    <Suspense>
      <PaginationControlsInner {...props} />
    </Suspense>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx vitest run --config apps/web/vitest.config.ts apps/web/components/pagination-controls.test.tsx
```

Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/pagination-controls.tsx apps/web/components/pagination-controls.test.tsx
git commit -m "feat: add PaginationControls component with getPageNumbers utility"
```

---

## Task 3: Project detail page

**Files:**
- Create: `apps/web/app/(main)/dashboard/projects/[projectId]/page.tsx`
- Create: `apps/web/app/(main)/dashboard/projects/[projectId]/page.test.tsx`

- [ ] **Step 1: Write the test file**

Create `apps/web/app/(main)/dashboard/projects/[projectId]/page.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail (import error expected)**

```bash
bunx vitest run --config apps/web/vitest.config.ts "apps/web/app/(main)/dashboard/projects/[projectId]/page.test.tsx"
```

Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 3: Implement the project detail page**

Create `apps/web/app/(main)/dashboard/projects/[projectId]/page.tsx`:

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"
import { useProject } from "@/hooks/use-project"
import { useVersions } from "@/hooks/use-versions"
import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
import { VersionStatusBadge } from "@/components/version-status-badge"
import { PaginationControls } from "@/components/pagination-controls"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { Layers } from "lucide-react"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function ProjectDetailInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setBreadcrumbs } = useBreadcrumbs()

  const projectId = params["projectId"] as string

  const rawPage = parseInt(searchParams.get("page") ?? "", 10)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
  const rawPageSize = parseInt(searchParams.get("pageSize") ?? "", 10)
  const pageSize =
    Number.isFinite(rawPageSize) ? Math.min(100, Math.max(5, rawPageSize)) : 10

  const { data: project } = useProject(projectId)
  const { data, isLoading, isError } = useVersions(projectId, { page, pageSize })

  React.useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/dashboard/projects" },
      { label: project?.name ?? "Project" },
    ])
  }, [setBreadcrumbs, project?.name])

  const searchParamsString = searchParams.toString()
  React.useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      const p = new URLSearchParams(searchParamsString)
      p.set("page", String(data.totalPages))
      router.replace(`/dashboard/projects/${projectId}?${p.toString()}`)
    }
  }, [data, page, router, searchParamsString, projectId])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{project?.name ?? "Project"}</h1>
        <Button asChild size="sm">
          <Link href={`/dashboard/projects/${projectId}/new-version`}>
            New run
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load runs</p>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <Layers className="h-8 w-8 opacity-40" />
          <p className="text-sm">No runs yet. Start your first run.</p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/projects/${projectId}/new-version`}>
              Start first run
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {data.items.map((version) => (
              <Link
                key={version.id}
                href={`/dashboard/projects/${projectId}/versions/${version.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    Run #{version.number}
                    {version.label ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {version.label}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(version.createdAt)}
                  </span>
                </div>
                <VersionStatusBadge status={version.status} />
              </Link>
            ))}
          </div>
          <PaginationControls
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
          />
        </>
      )}
    </div>
  )
}

export default function ProjectDetailPage() {
  return (
    <Suspense>
      <ProjectDetailInner />
    </Suspense>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx vitest run --config apps/web/vitest.config.ts "apps/web/app/(main)/dashboard/projects/[projectId]/page.test.tsx"
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(main)/dashboard/projects/[projectId]/page.tsx" "apps/web/app/(main)/dashboard/projects/[projectId]/page.test.tsx"
git commit -m "feat: add project detail page with versions list and pagination"
```

---

## Task 4: Add pagination to the projects list page

**Files:**
- Modify: `apps/web/app/(main)/dashboard/projects/page.tsx`
- Create: `apps/web/app/(main)/dashboard/projects/page.test.tsx`

**Context on the existing file:** The current `apps/web/app/(main)/dashboard/projects/page.tsx` is a single `"use client"` component. Adding `useSearchParams` requires the component to be wrapped in `<Suspense>`. Restructure into `ProjectsPageInner` (uses `useSearchParams`) and a `ProjectsPage` default export that wraps it.

- [ ] **Step 1: Write the test file**

Create `apps/web/app/(main)/dashboard/projects/page.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bunx vitest run --config apps/web/vitest.config.ts "apps/web/app/(main)/dashboard/projects/page.test.tsx"
```

Expected: FAIL — tests error because `useProjects` current mock return doesn't include `page`/`pageSize`/`totalPages`, or import errors from missing exports.

- [ ] **Step 3: Replace the content of `apps/web/app/(main)/dashboard/projects/page.tsx`**

The complete new file (restructured into `ProjectsPageInner` + `ProjectsPage`):

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { useProjects } from "@/hooks/use-projects"
import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
import { CreateProjectDialog } from "@/components/create-project-dialog"
import { PaginationControls } from "@/components/pagination-controls"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { LayoutGrid } from "lucide-react"
import type { Project } from "@renewable-energy/shared"

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const map: Record<
    string,
    {
      label: string
      variant: "default" | "secondary" | "destructive" | "outline"
    }
  > = {
    QUEUED: { label: "Queued", variant: "secondary" },
    PROCESSING: { label: "Processing", variant: "default" },
    COMPLETE: { label: "Complete", variant: "default" },
    FAILED: { label: "Failed", variant: "destructive" },
  }
  const cfg = map[status] ?? { label: status, variant: "outline" as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

function ProjectsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setBreadcrumbs } = useBreadcrumbs()

  const rawPage = parseInt(searchParams.get("page") ?? "", 10)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
  const rawPageSize = parseInt(searchParams.get("pageSize") ?? "", 10)
  const pageSize =
    Number.isFinite(rawPageSize) ? Math.min(100, Math.max(5, rawPageSize)) : 10

  const { data, isLoading } = useProjects({ page, pageSize })

  React.useEffect(() => {
    setBreadcrumbs([{ label: "Projects" }])
  }, [setBreadcrumbs])

  const searchParamsString = searchParams.toString()
  React.useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      const p = new URLSearchParams(searchParamsString)
      p.set("page", String(data.totalPages))
      router.replace(`/dashboard/projects?${p.toString()}`)
    }
  }, [data, page, router, searchParamsString])

  function handleCreated(project: Project) {
    router.push(`/dashboard/projects/${project.id}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Projects</h1>
        <CreateProjectDialog onCreated={handleCreated} />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <LayoutGrid className="h-8 w-8 opacity-40" />
          <p className="text-sm">
            No projects yet. Create your first project to get started.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {data.items.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {project.versionCount}{" "}
                    {project.versionCount === 1 ? "version" : "versions"}
                  </span>
                </div>
                <StatusBadge status={project.latestVersionStatus} />
              </Link>
            ))}
          </div>
          <PaginationControls
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
          />
        </>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsPageInner />
    </Suspense>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx vitest run --config apps/web/vitest.config.ts "apps/web/app/(main)/dashboard/projects/page.test.tsx"
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(main)/dashboard/projects/page.tsx" "apps/web/app/(main)/dashboard/projects/page.test.tsx"
git commit -m "feat: add URL-based pagination to projects list page"
```

---

## Task 5: Final gates

- [ ] **Step 1: Run all gates from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass. If any fail, fix before proceeding.

- [ ] **Step 2: Commit any fixes required by gates (if needed)**

```bash
git add -p
git commit -m "fix: address lint/typecheck issues"
```
