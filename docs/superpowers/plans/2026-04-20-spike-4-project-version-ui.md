# Spike 4 — Project and Version UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the full web UI for creating projects, submitting versions with a 27-parameter form, and tracking job status with live polling — giving the solar engineer a complete browser-based replacement for the Python desktop GUI.

**Architecture:** Sub-spikes follow strict dependency order: 4a (API + api-client data layer) → 4b (projects list + create) → 4c (version submission form) → 4d (version detail + polling) → 4e (pagination UI). Each sub-spike is independently deployable and human-verifiable in running environments. TDD throughout: failing test first, then implementation, then gate check.

**Tech Stack:** Hono v4 (Bun), Prisma v7, `bun:test`, Next.js 16 App Router, React 19, TanStack Query v5, shadcn/ui, Tailwind v4, Vitest + RTL, `@renewable-energy/shared`, `@renewable-energy/api-client`

---

## Pre-flight: Read Before Starting Any Task

- `apps/api/CLAUDE.md` — Hono conventions, error types, response helpers
- `packages/db/CLAUDE.md` — ID extension system, client exports
- `packages/shared/CLAUDE.md` — type contracts, build requirement
- `packages/api-client/CLAUDE.md` — NodeNext imports, `createWebClient` spread pattern
- `apps/web/CLAUDE.md` — query key rules, `enabled` guard, provider stack
- `docs/initiatives/pv-layout-cloud.md` Section 7 — full `inputSnapshot` key reference table

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `packages/shared/src/types/project.ts` | Add `ProjectSummary`, `LayoutInputSnapshot` types |
| `apps/api/src/lib/paginate.ts` | `paginationArgs()` + `paginationMeta()` utilities |
| `packages/api-client/src/projects.ts` | Add `buildUrl()`, `listVersions()`, update `listProjects()` signature |
| `apps/web/hooks/use-projects.ts` | `useProjects()` hook — paginated project list |
| `apps/web/hooks/use-project.ts` | `useProject()` hook — single project detail |
| `apps/web/hooks/use-versions.ts` | `useVersions()` hook — paginated version list for a project |
| `apps/web/hooks/use-version.ts` | `useVersion()` hook — single version with polling |
| `apps/web/hooks/use-create-project.ts` | `useCreateProject()` mutation hook |
| `apps/web/hooks/use-create-version.ts` | `useCreateVersion()` mutation hook |
| `apps/web/lib/polling-utils.ts` | ADR-003 polling strategy: `createVersionPollingStrategy()` |
| `apps/web/contexts/breadcrumbs-context.tsx` | `BreadcrumbsProvider` + `useBreadcrumbs()` context |
| `apps/web/components/create-project-dialog.tsx` | Modal for project creation with name input |
| `apps/web/components/version-status-badge.tsx` | Colour-coded status badge (queued/processing/complete/failed) |
| `apps/web/components/version-status-banner.tsx` | Contextual status banner for version detail page |
| `apps/web/app/(main)/dashboard/projects/page.tsx` | Projects list page |
| `apps/web/app/(main)/dashboard/projects/[projectId]/page.tsx` | Project detail page + version list |
| `apps/web/app/(main)/dashboard/projects/[projectId]/new-version/page.tsx` | Version submission page |
| `apps/web/app/(main)/dashboard/projects/[projectId]/versions/[versionId]/page.tsx` | Version detail + polling page |

### Modified files

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Export new types |
| `apps/api/src/modules/projects/projects.service.ts` | `listProjects` returns `PaginatedResponse<ProjectSummary>`; add `listVersions` |
| `apps/api/src/modules/projects/projects.routes.ts` | `GET /projects` accepts `page`/`pageSize`; add `GET /projects/:projectId/versions` |
| `apps/api/src/modules/projects/projects.test.ts` | Tests for updated `listProjects` + new `listVersions` |
| `packages/api-client/src/projects.ts` | Update `listProjects`, add `listVersions` |
| `packages/api-client/src/index.ts` | Export new types |
| `apps/web/lib/query-keys.ts` | Add `versions.list()` with pagination params |
| `apps/web/app/(main)/layout.tsx` | Dynamic breadcrumbs via `BreadcrumbsProvider` |
| `apps/web/app/(main)/dashboard/page.tsx` | Redirect to `/dashboard/projects` |
| `apps/web/components/app-sidebar.tsx` | Wire `NavProjects` to real projects via `useProjects()` |
| `apps/web/components/nav-projects.tsx` | Accept `isLoading` prop, add skeleton state and link to `/dashboard/projects/:id` |

---

## Sub-spike 4a — API + api-client Data Layer

**Goal:** All API and client changes needed by 4b–4e. No UI. Verified by tests and a curl smoke-test.

---

### Task 1: Add `ProjectSummary` and `LayoutInputSnapshot` types to `packages/shared`

**Files:**
- Modify: `packages/shared/src/types/project.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing typecheck**

  The typecheck currently passes. We will add types that consumers will reference. First confirm the current state:

  ```bash
  cd /path/to/repo && bun run typecheck
  ```

  Expected: passes.

- [ ] **Step 2: Add `ProjectSummary` and `LayoutInputSnapshot` to `packages/shared/src/types/project.ts`**

  Add after the existing `Project` interface:

  ```typescript
  export interface ProjectSummary extends Project {
    versionCount: number
    latestVersionStatus: VersionStatus | null
  }

  export interface LayoutInputSnapshot {
    // Module specification
    module_long: number           // long side in metres (default 2.38)
    module_short: number          // short side in metres (default 1.13)
    wattage_wp: number            // module wattage in Wp (default 580)
    // Table configuration
    orientation: "portrait" | "landscape"  // (default "portrait")
    modules_in_row: number        // modules per table row (default 28)
    rows_per_table: number        // rows per table / strings per table (default 2)
    table_gap_ew: number          // E-W gap between tables in metres (default 1.0)
    // Layout parameters
    tilt_deg: number | null       // null = auto (latitude-based formula)
    row_pitch_m: number | null    // null = auto (shadow-free formula)
    gcr: number | null            // null = not set; overrides shadow formula when set
    road_width_m: number          // perimeter road setback in metres (default 6.0)
    // Inverter configuration
    max_strings_per_inverter: number  // (default 20)
    // Energy parameters
    ghi_kwh_m2_yr: number         // 0 = auto-fetch from PVGIS (default 0)
    gti_kwh_m2_yr: number         // 0 = auto-fetch from PVGIS (default 0)
    inverter_eff_pct: number      // inverter efficiency % (default 97)
    dc_loss_pct: number           // DC cable losses % (default 2)
    ac_loss_pct: number           // AC cable losses % (default 1)
    soiling_pct: number           // soiling losses % (default 4)
    temp_loss_pct: number         // temperature losses % (default 6)
    mismatch_pct: number          // module mismatch % (default 2)
    shading_pct: number           // shading losses % (default 2)
    availability_pct: number      // plant availability % (default 98)
    transformer_loss_pct: number  // transformer losses % (default 1)
    other_loss_pct: number        // other losses % (default 1)
    first_year_lid_pct: number    // first-year LID degradation % (default 2)
    annual_deg_pct: number        // annual degradation %/yr (default 0.5)
    lifetime_years: number        // plant lifetime in years (default 25)
  }
  ```

- [ ] **Step 3: Export new types from `packages/shared/src/index.ts`**

  Add to the existing project type export:

  ```typescript
  export type {
    Project,
    ProjectSummary,
    VersionDetail,
    LayoutJobSummary,
    EnergyJobSummary,
    VersionStatus,
    JobStatus,
    CreateProjectInput,
    CreateVersionInput,
    LayoutInputSnapshot,
  } from "./types/project.js"
  ```

- [ ] **Step 4: Build shared package**

  ```bash
  cd packages/shared && bun run build
  ```

  Expected: exits 0, `dist/` updated.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/shared/src/types/project.ts packages/shared/src/index.ts
  git commit -m "feat(shared): add ProjectSummary and LayoutInputSnapshot types"
  ```

---

### Task 2: Add `paginate.ts` utility to `apps/api`

**Files:**
- Create: `apps/api/src/lib/paginate.ts`

- [ ] **Step 1: Write failing test first**

  Create `apps/api/src/lib/paginate.test.ts`:

  ```typescript
  import { describe, test, expect } from "bun:test"
  import { paginationArgs, paginationMeta } from "./paginate.js"

  describe("paginationArgs", () => {
    test("defaults to page 1, pageSize 20", () => {
      const args = paginationArgs({})
      expect(args.skip).toBe(0)
      expect(args.take).toBe(20)
    })

    test("calculates skip correctly for page 2", () => {
      const args = paginationArgs({ page: 2, pageSize: 10 })
      expect(args.skip).toBe(10)
      expect(args.take).toBe(10)
    })

    test("clamps pageSize to max 100", () => {
      const args = paginationArgs({ pageSize: 200 })
      expect(args.take).toBe(100)
    })

    test("clamps page minimum to 1", () => {
      const args = paginationArgs({ page: 0 })
      expect(args.skip).toBe(0)
    })
  })

  describe("paginationMeta", () => {
    test("computes totalPages correctly", () => {
      const meta = paginationMeta({ total: 25, page: 1, pageSize: 10 })
      expect(meta.totalPages).toBe(3)
      expect(meta.total).toBe(25)
      expect(meta.page).toBe(1)
      expect(meta.pageSize).toBe(10)
    })

    test("rounds totalPages up", () => {
      const meta = paginationMeta({ total: 21, page: 1, pageSize: 10 })
      expect(meta.totalPages).toBe(3)
    })

    test("totalPages is 0 when total is 0", () => {
      const meta = paginationMeta({ total: 0, page: 1, pageSize: 20 })
      expect(meta.totalPages).toBe(0)
    })
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd apps/api && bun test src/lib/paginate.test.ts
  ```

  Expected: FAIL — "Cannot find module './paginate.js'"

- [ ] **Step 3: Create `apps/api/src/lib/paginate.ts`**

  ```typescript
  export interface PaginationQuery {
    page?: number
    pageSize?: number
  }

  export function paginationArgs(query: PaginationQuery): {
    skip: number
    take: number
  } {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    return { skip: (page - 1) * pageSize, take: pageSize }
  }

  export function paginationMeta(opts: {
    total: number
    page: number
    pageSize: number
  }): { total: number; page: number; pageSize: number; totalPages: number } {
    return {
      total: opts.total,
      page: opts.page,
      pageSize: opts.pageSize,
      totalPages: opts.total === 0 ? 0 : Math.ceil(opts.total / opts.pageSize),
    }
  }
  ```

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  cd apps/api && bun test src/lib/paginate.test.ts
  ```

  Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/lib/paginate.ts apps/api/src/lib/paginate.test.ts
  git commit -m "feat(api): add paginate utility"
  ```

---

### Task 3: Update `projects.service.ts` — `listProjects` returns `PaginatedResponse<ProjectSummary>`, add `listVersions`

**Files:**
- Modify: `apps/api/src/modules/projects/projects.service.ts`
- Modify: `apps/api/src/modules/projects/projects.test.ts`

- [ ] **Step 1: Write failing tests for the new service signatures**

  Open `apps/api/src/modules/projects/projects.test.ts`. Find the existing mock setup and add/update the following at the appropriate locations.

  First, update the mock declarations (find and replace `mockProjectFindMany`):

  ```typescript
  // In the mock setup at the top of the file, replace:
  const mockProjectFindMany = mock(() => Promise.resolve([mockDbProject]))
  // With:
  const mockProjectFindMany = mock(() =>
    Promise.resolve([
      {
        ...mockDbProject,
        _count: { versions: 2 },
        versions: [{ status: "COMPLETE" }],
      },
    ]),
  )
  const mockProjectCount = mock(() => Promise.resolve(1))
  ```

  Add `mockProjectCount` to the mock db object:

  ```typescript
  // In the mock.module("@renewable-energy/db", ...) section,
  // inside the project mock object, add:
  count: mockProjectCount,
  ```

  Add a `mockVersionFindMany` for listVersions (alongside existing version mocks):

  ```typescript
  const mockVersionFindMany = mock(() =>
    Promise.resolve([
      {
        ...mockDbVersion,
        project: { userId: mockDbProject.userId },
        layoutJob: null,
        energyJob: null,
      },
    ]),
  )
  const mockVersionCountForList = mock(() => Promise.resolve(1))
  ```

  Add these to the version mock object in `mock.module`:

  ```typescript
  findMany: mockVersionFindMany,
  count: mockVersionCountForList,
  ```

  Add tests for the updated `listProjects`:

  ```typescript
  describe("listProjects (paginated)", () => {
    test("returns PaginatedResponse with items and pagination meta", async () => {
      const result = await listProjects(mockDbProject.userId, { page: 1, pageSize: 20 })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].versionCount).toBe(2)
      expect(result.items[0].latestVersionStatus).toBe("COMPLETE")
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.totalPages).toBe(1)
    })
  })

  describe("listVersions", () => {
    test("returns PaginatedResponse for a project's versions", async () => {
      const result = await listVersions(
        mockDbProject.id,
        mockDbProject.userId,
        { page: 1, pageSize: 20 },
      )
      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe(mockDbVersion.id)
      expect(result.total).toBe(1)
      expect(result.totalPages).toBe(1)
    })

    test("throws NotFoundError when project does not exist", async () => {
      mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null))
      await expect(
        listVersions("nonexistent", mockDbProject.userId, { page: 1, pageSize: 20 }),
      ).rejects.toMatchObject({ message: expect.stringContaining("Project") })
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/api && bun test src/modules/projects/projects.test.ts
  ```

  Expected: FAIL — listProjects returns array not PaginatedResponse, listVersions not defined.

- [ ] **Step 3: Update `apps/api/src/modules/projects/projects.service.ts`**

  Add imports at the top:

  ```typescript
  import { paginationArgs, paginationMeta } from "../../lib/paginate.js"
  import type { PaginatedResponse } from "@renewable-energy/shared"
  import type { ProjectSummary } from "@renewable-energy/shared"
  ```

  Add `shapeProjectSummary` helper after `shapeProject`:

  ```typescript
  function shapeProjectSummary(p: {
    id: string
    userId: string
    name: string
    createdAt: Date
    updatedAt: Date
    _count: { versions: number }
    versions: Array<{ status: string }>
  }): ProjectSummary {
    return {
      id: p.id,
      userId: p.userId,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      versionCount: p._count.versions,
      latestVersionStatus:
        p.versions[0]?.status != null
          ? (p.versions[0].status as ProjectSummary["latestVersionStatus"])
          : null,
    }
  }
  ```

  Replace the existing `listProjects` function:

  ```typescript
  export async function listProjects(
    userId: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<PaginatedResponse<ProjectSummary>> {
    const { skip, take } = paginationArgs(query)
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))

    const [total, projects] = await db.$transaction([
      db.project.count({ where: { userId } }),
      db.project.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          _count: { select: { versions: true } },
          versions: {
            orderBy: { number: "desc" },
            take: 1,
            select: { status: true },
          },
        },
      }),
    ])

    return {
      items: projects.map(shapeProjectSummary),
      ...paginationMeta({ total, page, pageSize }),
    }
  }
  ```

  Add `listVersions` after `getProject`:

  ```typescript
  export async function listVersions(
    projectId: string,
    userId: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<PaginatedResponse<VersionDetail>> {
    await requireProjectOwnership(projectId, userId)

    const { skip, take } = paginationArgs(query)
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))

    const [total, versions] = await db.$transaction([
      db.version.count({ where: { projectId } }),
      db.version.findMany({
        where: { projectId },
        orderBy: { number: "desc" },
        skip,
        take,
        include: { layoutJob: true, energyJob: true },
      }),
    ])

    return {
      items: versions.map(shapeVersion),
      ...paginationMeta({ total, page, pageSize }),
    }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd apps/api && bun test src/modules/projects/projects.test.ts
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/modules/projects/projects.service.ts \
          apps/api/src/modules/projects/projects.test.ts
  git commit -m "feat(api): listProjects returns PaginatedResponse<ProjectSummary>, add listVersions"
  ```

---

### Task 4: Update `projects.routes.ts` — pagination query params, add `GET /projects/:projectId/versions`

**Files:**
- Modify: `apps/api/src/modules/projects/projects.routes.ts`

- [ ] **Step 1: Update routes**

  In `apps/api/src/modules/projects/projects.routes.ts`:

  Add `listVersions` to the import from `projects.service.js`:

  ```typescript
  import {
    listProjects,
    getProject,
    createProject,
    deleteProject,
    createVersion,
    getVersion,
    listVersions,
  } from "./projects.service.js"
  ```

  Replace the existing `GET /projects` route:

  ```typescript
  projectsRoutes.get("/projects", async (c) => {
    const { id: userId } = c.get("user")
    const page = Number(c.req.query("page") ?? "1")
    const pageSize = Number(c.req.query("pageSize") ?? "20")
    const result = await listProjects(userId, {
      page: isNaN(page) ? 1 : page,
      pageSize: isNaN(pageSize) ? 20 : pageSize,
    })
    return c.json(ok(result))
  })
  ```

  Add the new `GET /projects/:projectId/versions` route (insert before the existing POST versions route):

  ```typescript
  // GET /projects/:projectId/versions — list versions for a project
  projectsRoutes.get("/projects/:projectId/versions", async (c) => {
    const { id: userId } = c.get("user")
    const { projectId } = c.req.param()
    const page = Number(c.req.query("page") ?? "1")
    const pageSize = Number(c.req.query("pageSize") ?? "20")
    const result = await listVersions(projectId, userId, {
      page: isNaN(page) ? 1 : page,
      pageSize: isNaN(pageSize) ? 20 : pageSize,
    })
    return c.json(ok(result))
  })
  ```

- [ ] **Step 2: Run typecheck**

  ```bash
  cd apps/api && bun run typecheck
  ```

  Expected: passes.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/api/src/modules/projects/projects.routes.ts
  git commit -m "feat(api): add pagination to GET /projects, add GET /projects/:id/versions"
  ```

---

### Task 5: Update `packages/api-client/src/projects.ts` — `buildUrl`, `listProjects` paginated, `listVersions`

**Files:**
- Modify: `packages/api-client/src/projects.ts`
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Write failing test**

  In `packages/api-client/src/projects.test.ts`, add new test cases (find the existing test file and add these):

  ```typescript
  describe("listProjects (paginated)", () => {
    test("calls /projects with page and pageSize query params", async () => {
      const mockResponse = {
        success: true,
        data: {
          items: [],
          total: 0,
          page: 2,
          pageSize: 10,
          totalPages: 0,
        },
      }
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 })),
      ) as unknown as typeof fetch

      const client = makeTestClient()
      await client.listProjects({ page: 2, pageSize: 10 })

      const calledUrl = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][0] as string
      expect(calledUrl).toContain("page=2")
      expect(calledUrl).toContain("pageSize=10")
    })
  })

  describe("listVersions", () => {
    test("calls /projects/:projectId/versions with pagination params", async () => {
      const mockResponse = {
        success: true,
        data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
      }
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 })),
      ) as unknown as typeof fetch

      const client = makeTestClient()
      await client.listVersions("prj_123", { page: 1, pageSize: 20 })

      const calledUrl = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][0] as string
      expect(calledUrl).toContain("/projects/prj_123/versions")
      expect(calledUrl).toContain("page=1")
    })
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd packages/api-client && bun test src/projects.test.ts
  ```

  Expected: FAIL — listProjects signature mismatch, listVersions not defined.

- [ ] **Step 3: Update `packages/api-client/src/projects.ts`**

  Add imports at the top:

  ```typescript
  import type {
    Project,
    ProjectSummary,
    VersionDetail,
    CreateProjectInput,
  } from "@renewable-energy/shared"
  import type { PaginatedResponse } from "@renewable-energy/shared"
  import type { ApiClient } from "./client.js"
  ```

  Add `buildUrl` helper inside the module (before `createProjectsClient`):

  ```typescript
  function buildUrl(
    base: string,
    params: Record<string, string | number | undefined>,
  ): string {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value))
    }
    const qs = search.toString()
    return qs ? `${base}?${qs}` : base
  }
  ```

  Export `PaginationParams` interface:

  ```typescript
  export interface PaginationParams {
    page?: number
    pageSize?: number
  }
  ```

  Update `listProjects` and add `listVersions` in `createProjectsClient`:

  ```typescript
  listProjects(
    params?: PaginationParams,
  ): Promise<PaginatedResponse<ProjectSummary>> {
    return request<PaginatedResponse<ProjectSummary>>(
      buildUrl("/projects", { page: params?.page, pageSize: params?.pageSize }),
    )
  },

  listVersions(
    projectId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResponse<VersionDetail>> {
    return request<PaginatedResponse<VersionDetail>>(
      buildUrl(`/projects/${projectId}/versions`, {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    )
  },
  ```

- [ ] **Step 4: Export new types from `packages/api-client/src/index.ts`**

  Add to existing exports:

  ```typescript
  export type { PaginationParams } from "./projects.js"
  ```

- [ ] **Step 5: Build and test**

  ```bash
  cd packages/api-client && bun test src/projects.test.ts && bun run build
  ```

  Expected: tests pass, build succeeds.

- [ ] **Step 6: Run full monorepo gates**

  ```bash
  cd ../.. && bun run lint && bun run typecheck && bun run test && bun run build
  ```

  Expected: all four pass.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/api-client/src/projects.ts packages/api-client/src/index.ts
  git commit -m "feat(api-client): add buildUrl, paginated listProjects, listVersions"
  ```

---

### Task 6: Sub-spike 4a smoke test (human verification)

- [ ] **Step 1: Start dev API server**

  ```bash
  cd apps/api && bun run dev
  ```

- [ ] **Step 2: Smoke-test `GET /projects` with pagination params**

  ```bash
  # Adjust token as needed (dev mode uses no-auth)
  curl -s "http://localhost:3001/projects?page=1&pageSize=5" | jq .
  ```

  Expected: `{ success: true, data: { items: [...], total: N, page: 1, pageSize: 5, totalPages: M } }`

- [ ] **Step 3: Smoke-test `GET /projects/:projectId/versions`**

  ```bash
  # Use a real projectId from Step 2 output
  curl -s "http://localhost:3001/projects/prj_XXXX/versions?page=1&pageSize=20" | jq .
  ```

  Expected: `{ success: true, data: { items: [...], total: N, page: 1, pageSize: 20, totalPages: M } }`

---

## Sub-spike 4b — Projects List + Create Project

**Goal:** A working projects list page at `/dashboard/projects`, a modal to create new projects, a functional sidebar showing live projects, and a redirect from the old `/dashboard` placeholder.

---

### Task 7: Add breadcrumbs context and update `(main)/layout.tsx`

**Files:**
- Create: `apps/web/contexts/breadcrumbs-context.tsx`
- Modify: `apps/web/app/(main)/layout.tsx`

- [ ] **Step 1: Write failing test**

  Create `apps/web/contexts/breadcrumbs-context.test.tsx`:

  ```typescript
  import { describe, test, expect } from "vitest"
  import { render, screen, act } from "@testing-library/react"
  import { BreadcrumbsProvider, useBreadcrumbs } from "./breadcrumbs-context"

  function TestConsumer({ crumbs }: { crumbs: Array<{ label: string; href?: string }> }) {
    const { setBreadcrumbs } = useBreadcrumbs()
    act(() => setBreadcrumbs(crumbs))
    return null
  }

  function TestDisplay() {
    const { breadcrumbs } = useBreadcrumbs()
    return (
      <ul>
        {breadcrumbs.map((c) => (
          <li key={c.label}>{c.label}</li>
        ))}
      </ul>
    )
  }

  test("children can set and read breadcrumbs", () => {
    render(
      <BreadcrumbsProvider>
        <TestConsumer crumbs={[{ label: "Projects", href: "/dashboard/projects" }]} />
        <TestDisplay />
      </BreadcrumbsProvider>,
    )
    expect(screen.getByText("Projects")).toBeDefined()
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd apps/web && bun run test -- contexts/breadcrumbs-context.test.tsx
  ```

  Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `apps/web/contexts/breadcrumbs-context.tsx`**

  ```typescript
  "use client"

  import * as React from "react"

  export interface Breadcrumb {
    label: string
    href?: string
  }

  interface BreadcrumbsContextValue {
    breadcrumbs: Breadcrumb[]
    setBreadcrumbs: (crumbs: Breadcrumb[]) => void
  }

  const BreadcrumbsContext = React.createContext<BreadcrumbsContextValue>({
    breadcrumbs: [],
    setBreadcrumbs: () => {},
  })

  export function BreadcrumbsProvider({ children }: { children: React.ReactNode }) {
    const [breadcrumbs, setBreadcrumbs] = React.useState<Breadcrumb[]>([])
    return (
      <BreadcrumbsContext.Provider value={{ breadcrumbs, setBreadcrumbs }}>
        {children}
      </BreadcrumbsContext.Provider>
    )
  }

  export function useBreadcrumbs() {
    return React.useContext(BreadcrumbsContext)
  }
  ```

- [ ] **Step 4: Update `apps/web/app/(main)/layout.tsx`**

  Replace the entire file content:

  ```typescript
  import { AppSidebar } from "@/components/app-sidebar"
  import { Separator } from "@renewable-energy/ui/components/separator"
  import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
  } from "@renewable-energy/ui/components/sidebar"
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "@renewable-energy/ui/components/breadcrumb"
  import { BreadcrumbsProvider } from "@/contexts/breadcrumbs-context"
  import { DynamicBreadcrumbs } from "@/components/dynamic-breadcrumbs"

  export default function MainLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return (
      <BreadcrumbsProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator
                  orientation="vertical"
                  className="mr-2 data-vertical:h-4 data-vertical:self-auto"
                />
                <DynamicBreadcrumbs />
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </BreadcrumbsProvider>
    )
  }
  ```

- [ ] **Step 5: Create `apps/web/components/dynamic-breadcrumbs.tsx`**

  ```typescript
  "use client"

  import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "@renewable-energy/ui/components/breadcrumb"
  import Link from "next/link"

  export function DynamicBreadcrumbs() {
    const { breadcrumbs } = useBreadcrumbs()

    if (breadcrumbs.length === 0) return null

    return (
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index) => (
            <BreadcrumbItem key={crumb.label}>
              {index < breadcrumbs.length - 1 ? (
                <>
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href ?? "#"}>{crumb.label}</Link>
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    )
  }
  ```

- [ ] **Step 6: Run tests**

  ```bash
  cd apps/web && bun run test -- contexts/breadcrumbs-context.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/contexts/breadcrumbs-context.tsx \
          apps/web/components/dynamic-breadcrumbs.tsx \
          apps/web/app/(main)/layout.tsx
  git commit -m "feat(web): add dynamic breadcrumbs context and update layout"
  ```

---

### Task 8: Add query key `versions.list`, add hooks `useProjects`, `useProject`, `useCreateProject`

**Files:**
- Modify: `apps/web/lib/query-keys.ts`
- Create: `apps/web/hooks/use-projects.ts`
- Create: `apps/web/hooks/use-project.ts`
- Create: `apps/web/hooks/use-create-project.ts`

- [ ] **Step 1: Write failing tests**

  Create `apps/web/hooks/use-projects.test.tsx`:

  ```typescript
  import { describe, test, expect, vi } from "vitest"
  import { renderHook, waitFor } from "@testing-library/react"
  import { createWrapper } from "@/tests/test-utils"
  import { useProjects } from "./use-projects"

  vi.mock("./use-api")
  vi.mock("@clerk/nextjs", () => ({
    useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: () => Promise.resolve("tok") }),
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
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  })

  vi.mock("./use-api", () => ({
    useApi: () => ({ listProjects: mockListProjects }),
  }))

  test("returns paginated project list", async () => {
    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items).toHaveLength(1)
    expect(result.current.data?.items[0].name).toBe("Alpha Site")
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd apps/web && bun run test -- hooks/use-projects.test.tsx
  ```

  Expected: FAIL — use-projects not found.

- [ ] **Step 3: Update `apps/web/lib/query-keys.ts`**

  Replace the `projects.versions` block:

  ```typescript
  versions: {
    all: (projectId: string) => ["projects", projectId, "versions"] as const,
    lists: (projectId: string, params?: { page?: number; pageSize?: number }) =>
      ["projects", projectId, "versions", "list", params] as const,
    detail: (projectId: string, versionId: string) =>
      ["projects", projectId, "versions", versionId] as const,
  },
  ```

  And update `projects.lists` to accept pagination params:

  ```typescript
  lists: (params?: { page?: number; pageSize?: number }) =>
    ["projects", "list", params] as const,
  ```

- [ ] **Step 4: Create `apps/web/hooks/use-projects.ts`**

  ```typescript
  "use client"

  import { useAuth } from "@clerk/nextjs"
  import { useQuery } from "@tanstack/react-query"
  import { useApi } from "./use-api"
  import { queryKeys } from "@/lib/query-keys"

  export function useProjects(params?: { page?: number; pageSize?: number }) {
    const { isLoaded, isSignedIn } = useAuth()
    const api = useApi()
    return useQuery({
      queryKey: queryKeys.projects.lists(params),
      queryFn: () => api.listProjects(params),
      enabled: isLoaded && !!isSignedIn,
    })
  }
  ```

- [ ] **Step 5: Create `apps/web/hooks/use-project.ts`**

  ```typescript
  "use client"

  import { useAuth } from "@clerk/nextjs"
  import { useQuery } from "@tanstack/react-query"
  import { useApi } from "./use-api"
  import { queryKeys } from "@/lib/query-keys"

  export function useProject(projectId: string) {
    const { isLoaded, isSignedIn } = useAuth()
    const api = useApi()
    return useQuery({
      queryKey: queryKeys.projects.detail(projectId),
      queryFn: () => api.getProject(projectId),
      enabled: isLoaded && !!isSignedIn && !!projectId,
    })
  }
  ```

- [ ] **Step 6: Create `apps/web/hooks/use-create-project.ts`**

  ```typescript
  "use client"

  import { useMutation, useQueryClient } from "@tanstack/react-query"
  import { useApi } from "./use-api"
  import { queryKeys } from "@/lib/query-keys"

  export function useCreateProject() {
    const api = useApi()
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: (name: string) => api.createProject({ name }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() })
      },
    })
  }
  ```

- [ ] **Step 7: Run tests**

  ```bash
  cd apps/web && bun run test -- hooks/use-projects.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 8: Commit**

  ```bash
  git add apps/web/lib/query-keys.ts \
          apps/web/hooks/use-projects.ts \
          apps/web/hooks/use-project.ts \
          apps/web/hooks/use-create-project.ts \
          apps/web/hooks/use-projects.test.tsx
  git commit -m "feat(web): add useProjects, useProject, useCreateProject hooks"
  ```

---

### Task 9: Create `CreateProjectDialog` component

**Files:**
- Create: `apps/web/components/create-project-dialog.tsx`

- [ ] **Step 1: Write failing test**

  Create `apps/web/components/create-project-dialog.test.tsx`:

  ```typescript
  import { describe, test, expect, vi } from "vitest"
  import { render, screen, fireEvent, waitFor } from "@testing-library/react"
  import { createWrapper } from "@/tests/test-utils"
  import { CreateProjectDialog } from "./create-project-dialog"

  vi.mock("@/hooks/use-create-project", () => ({
    useCreateProject: () => ({
      mutateAsync: vi.fn().mockResolvedValue({ id: "prj_1", name: "Alpha Site" }),
      isPending: false,
    }),
  }))

  test("renders trigger button and opens dialog on click", () => {
    render(
      <CreateProjectDialog onCreated={() => {}} />,
      { wrapper: createWrapper() },
    )
    expect(screen.getByRole("button", { name: /new project/i })).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: /new project/i }))
    expect(screen.getByRole("dialog")).toBeDefined()
    expect(screen.getByLabelText(/project name/i)).toBeDefined()
  })

  test("calls onCreated with new project after submission", async () => {
    const onCreated = vi.fn()
    render(
      <CreateProjectDialog onCreated={onCreated} />,
      { wrapper: createWrapper() },
    )
    fireEvent.click(screen.getByRole("button", { name: /new project/i }))
    fireEvent.change(screen.getByLabelText(/project name/i), {
      target: { value: "Alpha Site" },
    })
    fireEvent.click(screen.getByRole("button", { name: /create/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "prj_1", name: "Alpha Site" }))
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd apps/web && bun run test -- components/create-project-dialog.test.tsx
  ```

  Expected: FAIL.

- [ ] **Step 3: Create `apps/web/components/create-project-dialog.tsx`**

  ```typescript
  "use client"

  import * as React from "react"
  import { Button } from "@renewable-energy/ui/components/button"
  import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
  } from "@renewable-energy/ui/components/dialog"
  import { Input } from "@renewable-energy/ui/components/input"
  import { Label } from "@renewable-energy/ui/components/label"
  import { Plus } from "lucide-react"
  import { useCreateProject } from "@/hooks/use-create-project"
  import type { Project } from "@renewable-energy/shared"

  export function CreateProjectDialog({
    onCreated,
  }: {
    onCreated: (project: Project) => void
  }) {
    const [open, setOpen] = React.useState(false)
    const [name, setName] = React.useState("")
    const { mutateAsync, isPending } = useCreateProject()

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      if (!name.trim()) return
      const project = await mutateAsync(name.trim())
      setOpen(false)
      setName("")
      onCreated(project)
    }

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            New project
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                placeholder="e.g. Rajasthan Site — Phase 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || isPending}>
                {isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    )
  }
  ```

- [ ] **Step 4: Run tests**

  ```bash
  cd apps/web && bun run test -- components/create-project-dialog.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/components/create-project-dialog.tsx \
          apps/web/components/create-project-dialog.test.tsx
  git commit -m "feat(web): add CreateProjectDialog component"
  ```

---

### Task 10: Create projects list page, update dashboard redirect, wire sidebar

**Files:**
- Create: `apps/web/app/(main)/dashboard/projects/page.tsx`
- Modify: `apps/web/app/(main)/dashboard/page.tsx`
- Modify: `apps/web/components/app-sidebar.tsx`
- Modify: `apps/web/components/nav-projects.tsx`

- [ ] **Step 1: Create `apps/web/app/(main)/dashboard/projects/page.tsx`**

  ```typescript
  "use client"

  import * as React from "react"
  import { useRouter } from "next/navigation"
  import { useProjects } from "@/hooks/use-projects"
  import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
  import { CreateProjectDialog } from "@/components/create-project-dialog"
  import { Badge } from "@renewable-energy/ui/components/badge"
  import { Skeleton } from "@renewable-energy/ui/components/skeleton"
  import { LayoutGrid } from "lucide-react"
  import type { Project } from "@renewable-energy/shared"

  function StatusBadge({ status }: { status: string | null }) {
    if (!status) return null
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      QUEUED: { label: "Queued", variant: "secondary" },
      PROCESSING: { label: "Processing", variant: "default" },
      COMPLETE: { label: "Complete", variant: "default" },
      FAILED: { label: "Failed", variant: "destructive" },
    }
    const cfg = map[status] ?? { label: status, variant: "outline" }
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>
  }

  export default function ProjectsPage() {
    const router = useRouter()
    const { setBreadcrumbs } = useBreadcrumbs()
    const { data, isLoading } = useProjects()

    React.useEffect(() => {
      setBreadcrumbs([{ label: "Projects" }])
    }, [setBreadcrumbs])

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
            <p className="text-sm">No projects yet. Create your first project to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {data.items.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                className="flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {project.versionCount} {project.versionCount === 1 ? "version" : "versions"}
                  </span>
                </div>
                <StatusBadge status={project.latestVersionStatus} />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Update `apps/web/app/(main)/dashboard/page.tsx`**

  Replace the file content with a server-side redirect:

  ```typescript
  import { redirect } from "next/navigation"

  export default function DashboardPage() {
    redirect("/dashboard/projects")
  }
  ```

- [ ] **Step 3: Update `apps/web/components/nav-projects.tsx`**

  Replace the props type and rendering to accept `isLoading` and real data:

  ```typescript
  "use client"

  import Link from "next/link"
  import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSkeleton,
  } from "@renewable-energy/ui/components/sidebar"
  import { LayoutGrid, Plus } from "lucide-react"
  import type { ProjectSummary } from "@renewable-energy/shared"

  export function NavProjects({
    projects,
    isLoading,
  }: {
    projects: ProjectSummary[]
    isLoading: boolean
  }) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
        <SidebarMenu>
          {isLoading ? (
            <>
              <SidebarMenuSkeleton />
              <SidebarMenuSkeleton />
            </>
          ) : (
            projects.slice(0, 5).map((project) => (
              <SidebarMenuItem key={project.id}>
                <SidebarMenuButton asChild>
                  <Link href={`/dashboard/projects/${project.id}`}>
                    <LayoutGrid />
                    <span>{project.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/dashboard/projects">
                <Plus />
                <span>All projects</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    )
  }
  ```

- [ ] **Step 4: Update `apps/web/components/app-sidebar.tsx`**

  Add `useProjects` and pass live data to `NavProjects`. Remove the static `data.projects` array.

  Replace the file content:

  ```typescript
  "use client"

  import * as React from "react"
  import { NavMain } from "@/components/nav-main"
  import { NavProjects } from "@/components/nav-projects"
  import { NavUser } from "@/components/nav-user"
  import { TeamSwitcher } from "@/components/team-switcher"
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
  } from "@renewable-energy/ui/components/sidebar"
  import {
    Sun,
    Map,
    BatteryCharging,
    Wind,
    TrendingUp,
    Settings,
    Home,
  } from "lucide-react"
  import { useUser } from "@clerk/nextjs"
  import { useProjects } from "@/hooks/use-projects"

  const navMain = [
    {
      title: "Overview",
      url: "/dashboard/projects",
      icon: <Home />,
      isActive: true,
      items: [],
    },
    {
      title: "Solar Layout",
      url: "#",
      icon: <Map />,
      items: [
        { title: "Site Setup", url: "#" },
        { title: "KMZ Upload", url: "#" },
        { title: "Panel Placement", url: "#" },
      ],
    },
    {
      title: "System Design",
      url: "#",
      icon: <Sun />,
      items: [
        { title: "Capacity Planning", url: "#" },
        { title: "Orientation & Tilt", url: "#" },
        { title: "Shading Analysis", url: "#" },
      ],
    },
    {
      title: "Battery Storage",
      url: "#",
      icon: <BatteryCharging />,
      items: [
        { title: "Storage Config", url: "#" },
        { title: "Load Profiles", url: "#" },
      ],
    },
    {
      title: "Wind Analysis",
      url: "#",
      icon: <Wind />,
      items: [
        { title: "Wind Resource", url: "#" },
        { title: "Turbine Layout", url: "#" },
      ],
    },
    {
      title: "Reports",
      url: "#",
      icon: <TrendingUp />,
      items: [
        { title: "Generation Estimate", url: "#" },
        { title: "Export Data", url: "#" },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: <Settings />,
      items: [
        { title: "Project Settings", url: "#" },
        { title: "Units & Locale", url: "#" },
      ],
    },
  ]

  export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const { user } = useUser()
    const { data, isLoading } = useProjects()
    const clerkUser = {
      name: user?.fullName ?? user?.username ?? "User",
      email: user?.primaryEmailAddress?.emailAddress ?? "",
      avatar: user?.imageUrl || undefined,
    }

    return (
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          <TeamSwitcher teams={[{ name: "SolarDesign Pro", logo: <Sun />, plan: "Workspace" }]} />
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={navMain} />
          <NavProjects
            projects={data?.items ?? []}
            isLoading={isLoading}
          />
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={clerkUser} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    )
  }
  ```

- [ ] **Step 5: Run typecheck**

  ```bash
  cd apps/web && bun run typecheck
  ```

  Expected: passes.

- [ ] **Step 6: Run full monorepo gates**

  ```bash
  cd ../.. && bun run lint && bun run typecheck && bun run test && bun run build
  ```

  Expected: all four pass.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/app/(main)/dashboard/projects/page.tsx \
          apps/web/app/(main)/dashboard/page.tsx \
          apps/web/components/app-sidebar.tsx \
          apps/web/components/nav-projects.tsx
  git commit -m "feat(web): projects list page, sidebar live data, dashboard redirect"
  ```

---

### Task 11: Sub-spike 4b human verification

- [ ] **Step 1:** Start dev servers (`bun run dev` from repo root).
- [ ] **Step 2:** Navigate to `http://localhost:3000` — confirm redirect to `/dashboard/projects`.
- [ ] **Step 3:** Confirm project list loads (real data from API, not placeholder).
- [ ] **Step 4:** Click "New project" → dialog opens → enter a name → click "Create" → confirm project appears in list and sidebar.
- [ ] **Step 5:** Click the new project → confirm redirect to `/dashboard/projects/prj_XXXX` (404 expected — project detail page not built yet; the redirect confirms routing is wired).
- [ ] **Step 6:** Confirm breadcrumb shows "Projects" on the projects list page.
- [ ] **Step 7:** Confirm sidebar "Projects" section shows real project names.

---

## Sub-spike 4c — Version Submission Form

**Goal:** A working 27-parameter form at `/dashboard/projects/[projectId]/new-version` with all defaults pre-filled, tooltips on every field, KMZ file upload, and submission that fires `POST /projects/:id/versions` and redirects to the version detail page.

---

### Task 12: Add `useCreateVersion` and `useVersions` hooks

**Files:**
- Create: `apps/web/hooks/use-create-version.ts`
- Create: `apps/web/hooks/use-versions.ts`

- [ ] **Step 1: Create `apps/web/hooks/use-create-version.ts`**

  ```typescript
  "use client"

  import { useMutation, useQueryClient } from "@tanstack/react-query"
  import { useApi } from "./use-api"
  import { queryKeys } from "@/lib/query-keys"
  import type { LayoutInputSnapshot } from "@renewable-energy/shared"

  export interface CreateVersionParams {
    projectId: string
    label?: string
    inputSnapshot: LayoutInputSnapshot
    kmzFile?: File
  }

  export function useCreateVersion() {
    const api = useApi()
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: (params: CreateVersionParams) =>
        api.createVersion({
          projectId: params.projectId,
          label: params.label,
          inputSnapshot: params.inputSnapshot as Record<string, unknown>,
          kmzFile: params.kmzFile,
        }),
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects.versions.all(variables.projectId),
        })
      },
    })
  }
  ```

- [ ] **Step 2: Create `apps/web/hooks/use-versions.ts`**

  ```typescript
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

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/hooks/use-create-version.ts apps/web/hooks/use-versions.ts
  git commit -m "feat(web): add useCreateVersion and useVersions hooks"
  ```

---

### Task 13: Create the version submission form page

**Files:**
- Create: `apps/web/app/(main)/dashboard/projects/[projectId]/new-version/page.tsx`

This is the central UI deliverable of sub-spike 4c. 27 parameters organized into 5 labelled sections with a sticky left-nav on desktop and chip nav on mobile.

- [ ] **Step 1: Create the page file**

  ```typescript
  "use client"

  import * as React from "react"
  import { useRouter, useParams } from "next/navigation"
  import { useProject } from "@/hooks/use-project"
  import { useCreateVersion } from "@/hooks/use-create-version"
  import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
  import { Button } from "@renewable-energy/ui/components/button"
  import { Input } from "@renewable-energy/ui/components/input"
  import { Label } from "@renewable-energy/ui/components/label"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@renewable-energy/ui/components/select"
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@renewable-energy/ui/components/tooltip"
  import { Info, Upload } from "lucide-react"
  import { cn } from "@renewable-energy/ui/lib/utils"
  import type { LayoutInputSnapshot } from "@renewable-energy/shared"

  // ─── Defaults (matching Python app) ────────────────────────────────────────────

  const DEFAULTS: LayoutInputSnapshot = {
    module_long: 2.38,
    module_short: 1.13,
    wattage_wp: 580,
    orientation: "portrait",
    modules_in_row: 28,
    rows_per_table: 2,
    table_gap_ew: 1.0,
    tilt_deg: null,
    row_pitch_m: null,
    gcr: null,
    road_width_m: 6.0,
    max_strings_per_inverter: 20,
    ghi_kwh_m2_yr: 0,
    gti_kwh_m2_yr: 0,
    inverter_eff_pct: 97,
    dc_loss_pct: 2,
    ac_loss_pct: 1,
    soiling_pct: 4,
    temp_loss_pct: 6,
    mismatch_pct: 2,
    shading_pct: 2,
    availability_pct: 98,
    transformer_loss_pct: 1,
    other_loss_pct: 1,
    first_year_lid_pct: 2,
    annual_deg_pct: 0.5,
    lifetime_years: 25,
  }

  const SECTIONS = [
    { id: "module", label: "Module" },
    { id: "table", label: "Table config" },
    { id: "layout", label: "Layout" },
    { id: "inverter", label: "Inverter" },
    { id: "energy", label: "Energy losses" },
  ]

  // ─── Field tooltip helper ────────────────────────────────────────────────────

  function FieldLabel({
    label,
    tooltip,
    htmlFor,
  }: {
    label: string
    tooltip: string
    htmlFor: string
  }) {
    return (
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64 text-xs">{tooltip}</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  // ─── Number input helper ────────────────────────────────────────────────────

  function NumInput({
    id,
    value,
    onChange,
    step,
    min,
    max,
    placeholder,
    nullable,
  }: {
    id: string
    value: number | null
    onChange: (v: number | null) => void
    step?: number
    min?: number
    max?: number
    placeholder?: string
    nullable?: boolean
  }) {
    return (
      <Input
        id={id}
        type="number"
        step={step ?? 1}
        min={min}
        max={max}
        placeholder={placeholder ?? ""}
        value={value === null ? "" : value}
        onChange={(e) => {
          const raw = e.target.value
          if (nullable && raw === "") {
            onChange(null)
          } else {
            const n = parseFloat(raw)
            onChange(isNaN(n) ? null : n)
          }
        }}
      />
    )
  }

  // ─── KMZ file drop zone ─────────────────────────────────────────────────────

  function KmzDropZone({
    file,
    onChange,
  }: {
    file: File | null
    onChange: (f: File | null) => void
  }) {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const [dragOver, setDragOver] = React.useState(false)

    function handleDrop(e: React.DragEvent) {
      e.preventDefault()
      setDragOver(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped && dropped.name.endsWith(".kmz")) onChange(dropped)
    }

    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".kmz"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onChange(f)
          }}
        />
        <Upload className="h-8 w-8 text-muted-foreground" />
        {file ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB — click or drop to replace
            </span>
          </div>
        ) : (
          <>
            <span className="text-sm font-medium">Drop KMZ file here</span>
            <span className="text-xs text-muted-foreground">or click to browse</span>
          </>
        )}
      </div>
    )
  }

  // ─── Main page ────────────────────────────────────────────────────────────────

  export default function NewVersionPage() {
    const { projectId } = useParams<{ projectId: string }>()
    const router = useRouter()
    const { setBreadcrumbs } = useBreadcrumbs()
    const { data: project } = useProject(projectId)
    const { mutateAsync, isPending, error } = useCreateVersion()

    const [kmzFile, setKmzFile] = React.useState<File | null>(null)
    const [label, setLabel] = React.useState("")
    const [params, setParams] = React.useState<LayoutInputSnapshot>(DEFAULTS)
    const [activeSection, setActiveSection] = React.useState("module")

    React.useEffect(() => {
      if (!project) return
      setBreadcrumbs([
        { label: "Projects", href: "/dashboard/projects" },
        { label: project.name, href: `/dashboard/projects/${projectId}` },
        { label: "New run" },
      ])
    }, [project, projectId, setBreadcrumbs])

    function setParam<K extends keyof LayoutInputSnapshot>(key: K, value: LayoutInputSnapshot[K]) {
      setParams((prev) => ({ ...prev, [key]: value }))
    }

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      const version = await mutateAsync({
        projectId,
        label: label.trim() || undefined,
        inputSnapshot: params,
        kmzFile: kmzFile ?? undefined,
      })
      router.push(`/dashboard/projects/${projectId}/versions/${version.id}`)
    }

    const submitError =
      error instanceof Error ? error.message : error ? "Submission failed. Check your inputs and try again." : null

    return (
      <div className="mx-auto w-full max-w-5xl">
        <form onSubmit={handleSubmit}>
          <div className="flex gap-8">
            {/* ── Sticky left nav (desktop) ── */}
            <aside className="hidden w-48 shrink-0 lg:block">
              <div className="sticky top-4 flex flex-col gap-1">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(s.id)
                      document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }}
                    className={cn(
                      "rounded-md px-3 py-2 text-left text-sm transition-colors",
                      activeSection === s.id
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
                <div className="mt-4 border-t pt-4">
                  <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? "Submitting…" : "Run layout"}
                  </Button>
                </div>
              </div>
            </aside>

            {/* ── Chip nav (tablet / mobile) ── */}
            <div className="lg:hidden">
              <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(s.id)
                      document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                      activeSection === s.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Form sections ── */}
            <div className="flex-1 space-y-10">
              {/* KMZ upload */}
              <div className="space-y-2">
                <FieldLabel
                  label="KMZ file"
                  tooltip="Site boundary file exported from Google Earth. One or more polygons define the usable area. Inner polygons are treated as exclusion zones."
                  htmlFor="kmz-upload"
                />
                <KmzDropZone file={kmzFile} onChange={setKmzFile} />
              </div>

              {/* Optional run label */}
              <div className="space-y-1.5">
                <FieldLabel
                  label="Run label (optional)"
                  tooltip='A short description of what makes this run different, e.g. "with 3m E-W gap" or "GCR 0.4 trial".'
                  htmlFor="run-label"
                />
                <Input
                  id="run-label"
                  placeholder="e.g. with trackers"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>

              {/* ── Section: Module ── */}
              <section id="section-module" className="space-y-4">
                <h2 className="text-base font-semibold">Module specification</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Long side (m)"
                      tooltip="Module long dimension in metres. For a 2.38 m × 1.13 m module, enter 2.38. Default: 2.38 m."
                      htmlFor="module_long"
                    />
                    <NumInput
                      id="module_long"
                      value={params.module_long}
                      onChange={(v) => setParam("module_long", v ?? DEFAULTS.module_long)}
                      step={0.01}
                      min={0.5}
                      max={5}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Short side (m)"
                      tooltip="Module short dimension in metres. For a 2.38 m × 1.13 m module, enter 1.13. Default: 1.13 m."
                      htmlFor="module_short"
                    />
                    <NumInput
                      id="module_short"
                      value={params.module_short}
                      onChange={(v) => setParam("module_short", v ?? DEFAULTS.module_short)}
                      step={0.01}
                      min={0.5}
                      max={3}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Wattage (Wp)"
                      tooltip="Module rated power in watts peak (Wp) at STC. Default: 580 Wp."
                      htmlFor="wattage_wp"
                    />
                    <NumInput
                      id="wattage_wp"
                      value={params.wattage_wp}
                      onChange={(v) => setParam("wattage_wp", v ?? DEFAULTS.wattage_wp)}
                      min={100}
                      max={1000}
                    />
                  </div>
                </div>
              </section>

              {/* ── Section: Table configuration ── */}
              <section id="section-table" className="space-y-4">
                <h2 className="text-base font-semibold">Table configuration</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Orientation"
                      tooltip="Portrait: module long side runs N-S (most common for fixed-tilt). Landscape: long side runs E-W. Default: Portrait."
                      htmlFor="orientation"
                    />
                    <Select
                      value={params.orientation}
                      onValueChange={(v) =>
                        setParam("orientation", v as "portrait" | "landscape")
                      }
                    >
                      <SelectTrigger id="orientation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portrait">Portrait</SelectItem>
                        <SelectItem value="landscape">Landscape</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Modules per row"
                      tooltip="Number of modules along the table width (E-W direction). Determines table width. Default: 28."
                      htmlFor="modules_in_row"
                    />
                    <NumInput
                      id="modules_in_row"
                      value={params.modules_in_row}
                      onChange={(v) => setParam("modules_in_row", v ?? DEFAULTS.modules_in_row)}
                      min={1}
                      max={100}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Rows per table"
                      tooltip="Number of module rows along the table height (N-S). Also equals strings per table. Default: 2."
                      htmlFor="rows_per_table"
                    />
                    <NumInput
                      id="rows_per_table"
                      value={params.rows_per_table}
                      onChange={(v) => setParam("rows_per_table", v ?? DEFAULTS.rows_per_table)}
                      min={1}
                      max={10}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="E-W gap (m)"
                      tooltip="Gap between adjacent tables in the same row, measured E-W. Accounts for structure clearance. Default: 1.0 m."
                      htmlFor="table_gap_ew"
                    />
                    <NumInput
                      id="table_gap_ew"
                      value={params.table_gap_ew}
                      onChange={(v) => setParam("table_gap_ew", v ?? DEFAULTS.table_gap_ew)}
                      step={0.1}
                      min={0}
                      max={20}
                    />
                  </div>
                </div>
              </section>

              {/* ── Section: Layout ── */}
              <section id="section-layout" className="space-y-4">
                <h2 className="text-base font-semibold">Layout parameters</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Tilt angle (°)"
                      tooltip="Module tilt in degrees from horizontal. Leave blank for auto-calculation: tilt = 0.76 × |latitude| + 3.1, clipped to 5°–40°."
                      htmlFor="tilt_deg"
                    />
                    <NumInput
                      id="tilt_deg"
                      value={params.tilt_deg}
                      onChange={(v) => setParam("tilt_deg", v)}
                      step={0.5}
                      min={0}
                      max={90}
                      placeholder="Auto"
                      nullable
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Row pitch (m)"
                      tooltip="Centre-to-centre distance between rows in metres. Leave blank for shadow-free auto-calculation based on tilt and latitude."
                      htmlFor="row_pitch_m"
                    />
                    <NumInput
                      id="row_pitch_m"
                      value={params.row_pitch_m}
                      onChange={(v) => setParam("row_pitch_m", v)}
                      step={0.1}
                      min={0.5}
                      max={50}
                      placeholder="Auto"
                      nullable
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="GCR"
                      tooltip="Ground Coverage Ratio (0–1). Alternative to row pitch. If set, pitch = table height / GCR. Leave blank if specifying pitch directly."
                      htmlFor="gcr"
                    />
                    <NumInput
                      id="gcr"
                      value={params.gcr}
                      onChange={(v) => setParam("gcr", v)}
                      step={0.01}
                      min={0.1}
                      max={0.9}
                      placeholder="None"
                      nullable
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Road width (m)"
                      tooltip="Perimeter road setback applied inward from the site boundary. Clears land for site access and security perimeter. Default: 6.0 m."
                      htmlFor="road_width_m"
                    />
                    <NumInput
                      id="road_width_m"
                      value={params.road_width_m}
                      onChange={(v) => setParam("road_width_m", v ?? DEFAULTS.road_width_m)}
                      step={0.5}
                      min={0}
                      max={50}
                    />
                  </div>
                </div>
              </section>

              {/* ── Section: Inverter ── */}
              <section id="section-inverter" className="space-y-4">
                <h2 className="text-base font-semibold">Inverter configuration</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Max strings per inverter"
                      tooltip="Maximum number of strings a single string inverter can accept. Controls how many tables cluster to one inverter. Default: 20."
                      htmlFor="max_strings_per_inverter"
                    />
                    <NumInput
                      id="max_strings_per_inverter"
                      value={params.max_strings_per_inverter}
                      onChange={(v) =>
                        setParam("max_strings_per_inverter", v ?? DEFAULTS.max_strings_per_inverter)
                      }
                      min={1}
                      max={100}
                    />
                  </div>
                </div>
              </section>

              {/* ── Section: Energy losses ── */}
              <section id="section-energy" className="space-y-4">
                <h2 className="text-base font-semibold">Energy losses</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="GHI (kWh/m²/yr)"
                      tooltip="Global Horizontal Irradiance. Set to 0 to fetch automatically from PVGIS (recommended). Enter a non-zero value only if you have site-measured or external data. Default: 0 (auto-fetch)."
                      htmlFor="ghi_kwh_m2_yr"
                    />
                    <NumInput
                      id="ghi_kwh_m2_yr"
                      value={params.ghi_kwh_m2_yr}
                      onChange={(v) => setParam("ghi_kwh_m2_yr", v ?? 0)}
                      min={0}
                      max={3000}
                      placeholder="0 = auto-fetch"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="GTI (kWh/m²/yr)"
                      tooltip="Global Tilted Irradiance (in-plane). Set to 0 to fetch automatically from PVGIS. Only enter if you have measured in-plane data. Default: 0 (auto-fetch)."
                      htmlFor="gti_kwh_m2_yr"
                    />
                    <NumInput
                      id="gti_kwh_m2_yr"
                      value={params.gti_kwh_m2_yr}
                      onChange={(v) => setParam("gti_kwh_m2_yr", v ?? 0)}
                      min={0}
                      max={3000}
                      placeholder="0 = auto-fetch"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Inverter efficiency (%)"
                      tooltip="Inverter conversion efficiency. Accounts for power electronics losses during DC-to-AC conversion. Default: 97%."
                      htmlFor="inverter_eff_pct"
                    />
                    <NumInput
                      id="inverter_eff_pct"
                      value={params.inverter_eff_pct}
                      onChange={(v) => setParam("inverter_eff_pct", v ?? DEFAULTS.inverter_eff_pct)}
                      step={0.1}
                      min={50}
                      max={100}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="DC cable losses (%)"
                      tooltip="Resistive losses in DC wiring between modules and inverter. Includes string and main DC cable ohmic losses. Default: 2%."
                      htmlFor="dc_loss_pct"
                    />
                    <NumInput
                      id="dc_loss_pct"
                      value={params.dc_loss_pct}
                      onChange={(v) => setParam("dc_loss_pct", v ?? DEFAULTS.dc_loss_pct)}
                      step={0.1}
                      min={0}
                      max={20}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="AC cable losses (%)"
                      tooltip="Resistive losses in AC wiring between inverter and ICR transformer. Default: 1%."
                      htmlFor="ac_loss_pct"
                    />
                    <NumInput
                      id="ac_loss_pct"
                      value={params.ac_loss_pct}
                      onChange={(v) => setParam("ac_loss_pct", v ?? DEFAULTS.ac_loss_pct)}
                      step={0.1}
                      min={0}
                      max={20}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Soiling losses (%)"
                      tooltip="Energy loss due to dust, bird droppings, and other soiling on module surface. Default: 4%. Higher in arid/dusty sites."
                      htmlFor="soiling_pct"
                    />
                    <NumInput
                      id="soiling_pct"
                      value={params.soiling_pct}
                      onChange={(v) => setParam("soiling_pct", v ?? DEFAULTS.soiling_pct)}
                      step={0.1}
                      min={0}
                      max={30}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Temperature losses (%)"
                      tooltip="Power reduction due to module operating above STC temperature (25°C). Higher in hot climates. Default: 6%."
                      htmlFor="temp_loss_pct"
                    />
                    <NumInput
                      id="temp_loss_pct"
                      value={params.temp_loss_pct}
                      onChange={(v) => setParam("temp_loss_pct", v ?? DEFAULTS.temp_loss_pct)}
                      step={0.1}
                      min={0}
                      max={20}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Module mismatch (%)"
                      tooltip="Loss from I-V curve mismatch between series-connected modules due to manufacturing tolerance variation. Default: 2%."
                      htmlFor="mismatch_pct"
                    />
                    <NumInput
                      id="mismatch_pct"
                      value={params.mismatch_pct}
                      onChange={(v) => setParam("mismatch_pct", v ?? DEFAULTS.mismatch_pct)}
                      step={0.1}
                      min={0}
                      max={10}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Shading losses (%)"
                      tooltip="Near-horizon shading from terrain features, trees, and nearby structures at the site boundary. Does not include inter-row shading (handled by pitch calculation). Default: 2%."
                      htmlFor="shading_pct"
                    />
                    <NumInput
                      id="shading_pct"
                      value={params.shading_pct}
                      onChange={(v) => setParam("shading_pct", v ?? DEFAULTS.shading_pct)}
                      step={0.1}
                      min={0}
                      max={30}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Plant availability (%)"
                      tooltip="Fraction of time the plant is available for generation. Accounts for scheduled maintenance, grid curtailment, and forced outages. Default: 98%."
                      htmlFor="availability_pct"
                    />
                    <NumInput
                      id="availability_pct"
                      value={params.availability_pct}
                      onChange={(v) =>
                        setParam("availability_pct", v ?? DEFAULTS.availability_pct)
                      }
                      step={0.1}
                      min={50}
                      max={100}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Transformer losses (%)"
                      tooltip="Losses in the LT/HT transformer at the ICR (no-load + load losses). Default: 1%."
                      htmlFor="transformer_loss_pct"
                    />
                    <NumInput
                      id="transformer_loss_pct"
                      value={params.transformer_loss_pct}
                      onChange={(v) =>
                        setParam("transformer_loss_pct", v ?? DEFAULTS.transformer_loss_pct)
                      }
                      step={0.1}
                      min={0}
                      max={10}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Other losses (%)"
                      tooltip="Catch-all for losses not captured by specific categories: LID after Year 1, wiring quality, tracker downtime (if applicable), etc. Default: 1%."
                      htmlFor="other_loss_pct"
                    />
                    <NumInput
                      id="other_loss_pct"
                      value={params.other_loss_pct}
                      onChange={(v) =>
                        setParam("other_loss_pct", v ?? DEFAULTS.other_loss_pct)
                      }
                      step={0.1}
                      min={0}
                      max={20}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="First-year LID (%)"
                      tooltip="Light-Induced Degradation in Year 1 due to boron-oxygen defects in p-type silicon. Applied to Year 1 generation only. Default: 2%."
                      htmlFor="first_year_lid_pct"
                    />
                    <NumInput
                      id="first_year_lid_pct"
                      value={params.first_year_lid_pct}
                      onChange={(v) =>
                        setParam("first_year_lid_pct", v ?? DEFAULTS.first_year_lid_pct)
                      }
                      step={0.1}
                      min={0}
                      max={10}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Annual degradation (%/yr)"
                      tooltip="Year-on-year power output decline due to module degradation. Compounded from Year 2 onwards. Default: 0.5%/yr."
                      htmlFor="annual_deg_pct"
                    />
                    <NumInput
                      id="annual_deg_pct"
                      value={params.annual_deg_pct}
                      onChange={(v) =>
                        setParam("annual_deg_pct", v ?? DEFAULTS.annual_deg_pct)
                      }
                      step={0.1}
                      min={0}
                      max={5}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Plant lifetime (years)"
                      tooltip="Number of years for the 25-year energy yield forecast. Default: 25 years."
                      htmlFor="lifetime_years"
                    />
                    <NumInput
                      id="lifetime_years"
                      value={params.lifetime_years}
                      onChange={(v) =>
                        setParam("lifetime_years", v ?? DEFAULTS.lifetime_years)
                      }
                      min={1}
                      max={50}
                    />
                  </div>
                </div>
              </section>

              {/* Error display */}
              {submitError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {submitError}
                </div>
              )}

              {/* Mobile submit button */}
              <div className="lg:hidden">
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Submitting…" : "Run layout"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    )
  }
  ```

- [ ] **Step 2: Run typecheck**

  ```bash
  cd apps/web && bun run typecheck
  ```

  Expected: passes.

- [ ] **Step 3: Run full monorepo gates**

  ```bash
  cd ../.. && bun run lint && bun run typecheck && bun run test && bun run build
  ```

  Expected: all four pass.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/app/(main)/dashboard/projects/\[projectId\]/new-version/page.tsx
  git commit -m "feat(web): version submission form with 27 parameters and defaults"
  ```

---

### Task 14: Sub-spike 4c human verification

- [ ] **Step 1:** Navigate to a project detail page (404 still expected — build in 4d) OR directly to `http://localhost:3000/dashboard/projects/prj_XXXX/new-version`.
- [ ] **Step 2:** Confirm all 5 sections render with correct labels and defaults.
- [ ] **Step 3:** Click every tooltip (all 27) — confirm each shows a description.
- [ ] **Step 4:** Test KMZ drag-and-drop — drop a `.kmz` file → filename appears.
- [ ] **Step 5:** Override one parameter (e.g., wattage to 600) → submit → confirm the POST fires in network tab with correct JSON.
- [ ] **Step 6:** Confirm redirect fires to `/dashboard/projects/prj_XXXX/versions/ver_XXXX` after successful submission (404 expected — version detail not built yet).
- [ ] **Step 7:** Desktop: confirm sticky left-nav scrolls to section on click.
- [ ] **Step 8:** Tablet (768px): confirm chip nav appears, works, left-nav hidden.

---

## Sub-spike 4d — Version Detail + Polling

**Goal:** A working version detail page at `/dashboard/projects/[projectId]/versions/[versionId]` with live status polling, a project detail page listing all versions, and the `VersionStatusBadge` component shared across both.

---

### Task 15: Add polling utility and `useVersion` hook

**Files:**
- Create: `apps/web/lib/polling-utils.ts`
- Create: `apps/web/hooks/use-version.ts`

- [ ] **Step 1: Write failing test for polling utils**

  Create `apps/web/lib/polling-utils.test.ts`:

  ```typescript
  import { describe, test, expect } from "vitest"
  import { createVersionPollingInterval } from "./polling-utils"
  import type { VersionDetail } from "@renewable-energy/shared"

  function makeVersion(status: string): VersionDetail {
    return {
      id: "ver_1",
      projectId: "prj_1",
      number: 1,
      label: null,
      status: status as VersionDetail["status"],
      kmzS3Key: null,
      inputSnapshot: {},
      layoutJob: null,
      energyJob: null,
      createdAt: "2026-04-20T00:00:00Z",
      updatedAt: "2026-04-20T00:00:00Z",
    }
  }

  test("returns poll interval for QUEUED", () => {
    const interval = createVersionPollingInterval(makeVersion("QUEUED"))
    expect(typeof interval).toBe("number")
    expect(interval).toBeGreaterThan(0)
  })

  test("returns poll interval for PROCESSING", () => {
    const interval = createVersionPollingInterval(makeVersion("PROCESSING"))
    expect(interval).toBeGreaterThan(0)
  })

  test("returns false for COMPLETE (stops polling)", () => {
    const interval = createVersionPollingInterval(makeVersion("COMPLETE"))
    expect(interval).toBe(false)
  })

  test("returns false for FAILED (stops polling)", () => {
    const interval = createVersionPollingInterval(makeVersion("FAILED"))
    expect(interval).toBe(false)
  })

  test("returns false when data is undefined", () => {
    const interval = createVersionPollingInterval(undefined)
    expect(interval).toBe(false)
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd apps/web && bun run test -- lib/polling-utils.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 3: Create `apps/web/lib/polling-utils.ts`**

  ```typescript
  import type { VersionDetail } from "@renewable-energy/shared"

  // ADR-003: polling interval in ms with 10% jitter
  const BASE_INTERVAL_MS = 3000

  function withJitter(ms: number): number {
    return ms * (1 + (Math.random() - 0.5) * 0.1)
  }

  /**
   * Returns the poll interval in ms, or false to stop polling.
   * Pass as refetchInterval to TanStack Query's useQuery.
   */
  export function createVersionPollingInterval(
    data: VersionDetail | undefined,
  ): number | false {
    if (!data) return false
    if (data.status === "COMPLETE" || data.status === "FAILED") return false
    return withJitter(BASE_INTERVAL_MS)
  }
  ```

- [ ] **Step 4: Run test**

  ```bash
  cd apps/web && bun run test -- lib/polling-utils.test.ts
  ```

  Expected: all tests pass.

- [ ] **Step 5: Create `apps/web/hooks/use-version.ts`**

  ```typescript
  "use client"

  import { useAuth } from "@clerk/nextjs"
  import { useQuery } from "@tanstack/react-query"
  import { useApi } from "./use-api"
  import { queryKeys } from "@/lib/query-keys"
  import { createVersionPollingInterval } from "@/lib/polling-utils"

  export function useVersion(projectId: string, versionId: string) {
    const { isLoaded, isSignedIn } = useAuth()
    const api = useApi()
    return useQuery({
      queryKey: queryKeys.projects.versions.detail(projectId, versionId),
      queryFn: () => api.getVersion(projectId, versionId),
      enabled: isLoaded && !!isSignedIn && !!projectId && !!versionId,
      refetchInterval: (query) => createVersionPollingInterval(query.state.data),
      staleTime: (query) => {
        const status = query.state.data?.status
        if (status === "COMPLETE" || status === "FAILED") return 2 * 60 * 1000 // 2 min
        return 1000 // 1 s during active polling
      },
      retry: (failureCount, error) => {
        // No retry on 4xx (client errors)
        if (
          error instanceof Error &&
          "status" in error &&
          typeof (error as { status: unknown }).status === "number" &&
          (error as { status: number }).status >= 400 &&
          (error as { status: number }).status < 500
        ) {
          return false
        }
        return failureCount < 3
      },
    })
  }
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/lib/polling-utils.ts apps/web/lib/polling-utils.test.ts \
          apps/web/hooks/use-version.ts
  git commit -m "feat(web): polling utils (ADR-003) and useVersion hook"
  ```

---

### Task 16: Create `VersionStatusBadge` and `VersionStatusBanner` components

**Files:**
- Create: `apps/web/components/version-status-badge.tsx`
- Create: `apps/web/components/version-status-banner.tsx`

- [ ] **Step 1: Create `apps/web/components/version-status-badge.tsx`**

  ```typescript
  import { Badge } from "@renewable-energy/ui/components/badge"
  import type { VersionStatus } from "@renewable-energy/shared"

  const config: Record<
    VersionStatus,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    QUEUED: { label: "Queued", variant: "secondary" },
    PROCESSING: { label: "Processing", variant: "default" },
    COMPLETE: { label: "Complete", variant: "default" },
    FAILED: { label: "Failed", variant: "destructive" },
  }

  export function VersionStatusBadge({ status }: { status: VersionStatus }) {
    const { label, variant } = config[status]
    return <Badge variant={variant}>{label}</Badge>
  }
  ```

- [ ] **Step 2: Create `apps/web/components/version-status-banner.tsx`**

  ```typescript
  import type { VersionDetail } from "@renewable-energy/shared"
  import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react"
  import { cn } from "@renewable-energy/ui/lib/utils"

  function bannerConfig(version: VersionDetail): {
    icon: React.ReactNode
    message: string
    className: string
  } {
    switch (version.status) {
      case "QUEUED":
        return {
          icon: <Clock className="h-4 w-4" />,
          message: "Layout run queued. Processing will begin shortly.",
          className: "border-muted bg-muted/30 text-muted-foreground",
        }
      case "PROCESSING":
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          message: "Layout run in progress. Results will appear when complete.",
          className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
        }
      case "COMPLETE":
        return {
          icon: <CheckCircle2 className="h-4 w-4" />,
          message: "Layout run complete.",
          className: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
        }
      case "FAILED": {
        const detail = version.layoutJob?.errorDetail ?? version.energyJob?.errorDetail
        return {
          icon: <XCircle className="h-4 w-4" />,
          message: detail
            ? `Layout run failed: ${detail}`
            : "Layout run failed. Check the input KMZ and parameters, then submit a new run.",
          className: "border-destructive/30 bg-destructive/10 text-destructive",
        }
      }
    }
  }

  export function VersionStatusBanner({ version }: { version: VersionDetail }) {
    const { icon, message, className } = bannerConfig(version)
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm",
          className,
        )}
      >
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span>{message}</span>
      </div>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/components/version-status-badge.tsx \
          apps/web/components/version-status-banner.tsx
  git commit -m "feat(web): VersionStatusBadge and VersionStatusBanner components"
  ```

---

### Task 17: Create version detail page and project detail page

**Files:**
- Create: `apps/web/app/(main)/dashboard/projects/[projectId]/versions/[versionId]/page.tsx`
- Create: `apps/web/app/(main)/dashboard/projects/[projectId]/page.tsx`

- [ ] **Step 1: Create `apps/web/app/(main)/dashboard/projects/[projectId]/versions/[versionId]/page.tsx`**

  ```typescript
  "use client"

  import * as React from "react"
  import { useParams } from "next/navigation"
  import Link from "next/link"
  import { useVersion } from "@/hooks/use-version"
  import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
  import { useProject } from "@/hooks/use-project"
  import { VersionStatusBanner } from "@/components/version-status-banner"
  import { Skeleton } from "@renewable-energy/ui/components/skeleton"
  import { Button } from "@renewable-energy/ui/components/button"
  import { Plus } from "lucide-react"
  import type { LayoutInputSnapshot } from "@renewable-energy/shared"

  function InputSummary({ snapshot }: { snapshot: unknown }) {
    const s = snapshot as Partial<LayoutInputSnapshot>
    return (
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-medium">Input parameters</h3>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {[
            ["Long side", s.module_long != null ? `${s.module_long} m` : "—"],
            ["Short side", s.module_short != null ? `${s.module_short} m` : "—"],
            ["Wattage", s.wattage_wp != null ? `${s.wattage_wp} Wp` : "—"],
            ["Orientation", s.orientation ?? "—"],
            ["Modules/row", s.modules_in_row ?? "—"],
            ["Rows/table", s.rows_per_table ?? "—"],
            ["E-W gap", s.table_gap_ew != null ? `${s.table_gap_ew} m` : "—"],
            ["Tilt", s.tilt_deg != null ? `${s.tilt_deg}°` : "Auto"],
            ["Row pitch", s.row_pitch_m != null ? `${s.row_pitch_m} m` : "Auto"],
            ["GCR", s.gcr ?? "—"],
            ["Road width", s.road_width_m != null ? `${s.road_width_m} m` : "—"],
            ["Max strings", s.max_strings_per_inverter ?? "—"],
            ["Inverter eff.", s.inverter_eff_pct != null ? `${s.inverter_eff_pct}%` : "—"],
            ["DC losses", s.dc_loss_pct != null ? `${s.dc_loss_pct}%` : "—"],
            ["AC losses", s.ac_loss_pct != null ? `${s.ac_loss_pct}%` : "—"],
            ["Soiling", s.soiling_pct != null ? `${s.soiling_pct}%` : "—"],
            ["Temp. losses", s.temp_loss_pct != null ? `${s.temp_loss_pct}%` : "—"],
            ["Mismatch", s.mismatch_pct != null ? `${s.mismatch_pct}%` : "—"],
            ["Shading", s.shading_pct != null ? `${s.shading_pct}%` : "—"],
            ["Availability", s.availability_pct != null ? `${s.availability_pct}%` : "—"],
            ["Transformer", s.transformer_loss_pct != null ? `${s.transformer_loss_pct}%` : "—"],
            ["Other losses", s.other_loss_pct != null ? `${s.other_loss_pct}%` : "—"],
            ["LID Year 1", s.first_year_lid_pct != null ? `${s.first_year_lid_pct}%` : "—"],
            ["Annual deg.", s.annual_deg_pct != null ? `${s.annual_deg_pct}%/yr` : "—"],
            ["Lifetime", s.lifetime_years != null ? `${s.lifetime_years} yr` : "—"],
          ].map(([key, val]) => (
            <div key={key as string} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{key}</span>
              <span className="font-medium">{val}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  export default function VersionDetailPage() {
    const { projectId, versionId } = useParams<{
      projectId: string
      versionId: string
    }>()
    const { data: project } = useProject(projectId)
    const { data: version, isLoading } = useVersion(projectId, versionId)
    const { setBreadcrumbs } = useBreadcrumbs()

    React.useEffect(() => {
      if (!project || !version) return
      setBreadcrumbs([
        { label: "Projects", href: "/dashboard/projects" },
        { label: project.name, href: `/dashboard/projects/${projectId}` },
        { label: `v${version.number}${version.label ? ` — ${version.label}` : ""}` },
      ])
    }, [project, version, projectId, setBreadcrumbs])

    if (isLoading) {
      return (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      )
    }

    if (!version) return null

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">
              v{version.number}
              {version.label && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {version.label}
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">
              Submitted {new Date(version.createdAt).toLocaleString("en-IN")}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/projects/${projectId}/new-version`}>
              <Plus className="mr-1 h-4 w-4" />
              New run
            </Link>
          </Button>
        </div>

        <VersionStatusBanner version={version} />

        {/* Stats section placeholder — Spike 5 fills this in */}
        {version.status === "COMPLETE" && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Layout complete. SVG preview and stats coming in Spike 5.
          </div>
        )}

        <InputSummary snapshot={version.inputSnapshot} />
      </div>
    )
  }
  ```

- [ ] **Step 2: Create `apps/web/app/(main)/dashboard/projects/[projectId]/page.tsx`**

  ```typescript
  "use client"

  import * as React from "react"
  import Link from "next/link"
  import { useParams } from "next/navigation"
  import { useProject } from "@/hooks/use-project"
  import { useVersions } from "@/hooks/use-versions"
  import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
  import { VersionStatusBadge } from "@/components/version-status-badge"
  import { Button } from "@renewable-energy/ui/components/button"
  import { Skeleton } from "@renewable-energy/ui/components/skeleton"
  import { Plus } from "lucide-react"

  export default function ProjectDetailPage() {
    const { projectId } = useParams<{ projectId: string }>()
    const { data: project, isLoading: projectLoading } = useProject(projectId)
    const { data: versions, isLoading: versionsLoading } = useVersions(projectId)
    const { setBreadcrumbs } = useBreadcrumbs()

    React.useEffect(() => {
      if (!project) return
      setBreadcrumbs([
        { label: "Projects", href: "/dashboard/projects" },
        { label: project.name },
      ])
    }, [project, setBreadcrumbs])

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          {projectLoading ? (
            <Skeleton className="h-7 w-48" />
          ) : (
            <h1 className="text-lg font-semibold">{project?.name}</h1>
          )}
          <Button asChild size="sm">
            <Link href={`/dashboard/projects/${projectId}/new-version`}>
              <Plus className="mr-1 h-4 w-4" />
              New run
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Runs</h2>

          {versionsLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : !versions?.items.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No runs yet.{" "}
              <Link
                href={`/dashboard/projects/${projectId}/new-version`}
                className="underline"
              >
                Submit the first run
              </Link>{" "}
              to get started.
            </div>
          ) : (
            versions.items.map((version) => (
              <Link
                key={version.id}
                href={`/dashboard/projects/${projectId}/versions/${version.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    v{version.number}
                    {version.label && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {version.label}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(version.createdAt).toLocaleString("en-IN")}
                  </span>
                </div>
                <VersionStatusBadge status={version.status} />
              </Link>
            ))
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3: Run full monorepo gates**

  ```bash
  cd ../.. && bun run lint && bun run typecheck && bun run test && bun run build
  ```

  Expected: all four pass.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/app/\(main\)/dashboard/projects/\[projectId\]/versions/\[versionId\]/page.tsx \
          apps/web/app/\(main\)/dashboard/projects/\[projectId\]/page.tsx
  git commit -m "feat(web): version detail page with polling, project detail page with version list"
  ```

---

### Task 18: Sub-spike 4d human verification

- [ ] **Step 1:** Navigate to a project → confirm version list loads.
- [ ] **Step 2:** Click a version (or submit a new one) → confirm version detail page loads with status banner.
- [ ] **Step 3:** Submit a new version → watch status transition QUEUED → PROCESSING → COMPLETE in real time (polling working).
- [ ] **Step 4:** Confirm error message is specific on FAILED version (not "Internal error").
- [ ] **Step 5:** Confirm breadcrumbs show Projects › Project name › v1 on version detail page.
- [ ] **Step 6:** Confirm input summary shows all 27 parameters from `inputSnapshot`.
- [ ] **Step 7:** Verify in dev — confirm `refetchInterval` is ~3s for in-progress versions (check network tab).
- [ ] **Step 8:** Confirm polling stops when status reaches COMPLETE or FAILED (no more network requests).
- [ ] **Step 9:** Deploy to Vercel (prod) and repeat Steps 1–8 in prod.

---

## Sub-spike 4e — Pagination UI (Deferred)

**Status:** `planned` — depends on 4d

The API returns paginated data from sub-spike 4a. The UI displays the first page (up to 20 items) until this sub-spike is implemented.

**Scope:**
- Add `<PaginationControls>` component using shadcn `Pagination` primitives
- Wire to `useProjects` on the projects list page
- Wire to `useVersions` on the project detail page
- Update URL with `?page=N` query param so pages are bookmarkable

This is independent of the above — all the data contracts are already in place. Implement in a dedicated future session.

---

## Self-Review Checklist

### Spec coverage

- [x] Projects list page (`/dashboard/projects`) with "New project" button
- [x] Create project modal with name input → redirect to project detail
- [x] Project detail page with version list
- [x] "New run" button on project detail → version form
- [x] Version submission form: all 27 parameters, defaults, tooltips
- [x] KMZ drag-and-drop + click upload
- [x] Version detail page: status banner, polling, input summary
- [x] Polling: 3s interval, stops at terminal state, ADR-003 jitter
- [x] Dynamic breadcrumbs throughout
- [x] Live sidebar projects from API
- [x] Dashboard redirect to projects list
- [x] API: `listProjects` paginated, `listVersions` endpoint
- [x] Pagination UI: deferred to 4e (data structure ready from 4a)
- [x] Brand voice: failure messages in `VersionStatusBanner` are functional/domain-specific
- [x] Responsive: sticky left-nav on desktop, chip nav on mobile/tablet

### Placeholder scan

- No TBD or TODO in implementation tasks
- All code blocks are complete and self-contained
- All type imports match types defined in earlier tasks

### Type consistency

- `ProjectSummary` defined in Task 1, consumed in Task 3 (service), Task 5 (api-client), Task 10 (nav-projects)
- `LayoutInputSnapshot` defined in Task 1, used as form state type in Task 13 and mutation param in Task 12
- `PaginatedResponse<T>` from `packages/shared/src/types/api.ts` uses `items` field — all tasks use `items` consistently
- `PaginationParams` interface exported from api-client, used consistently in hooks
