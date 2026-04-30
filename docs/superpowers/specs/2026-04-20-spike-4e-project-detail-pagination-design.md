# Spike 4e — Project Detail Page + Pagination

## Goal

Build the project detail page (`/dashboard/projects/[projectId]`) showing a paginated versions list, and add URL-based pagination controls to both the projects list and the project detail page.

## Architecture

Four file changes — no API, api-client, or shared type changes needed. All pagination hooks and query keys already exist.

| File | Role |
|---|---|
| `apps/web/hooks/use-versions.ts` | New TanStack Query hook; `listVersions` with page/pageSize params |
| `apps/web/components/pagination-controls.tsx` | New reusable component; adapts happyfeet `DataPagination` pattern using existing shadcn primitives |
| `apps/web/app/(main)/dashboard/projects/[projectId]/page.tsx` | New project detail page — versions list, breadcrumbs, "New run" button |
| `apps/web/app/(main)/dashboard/projects/page.tsx` | Modify existing — add pagination |

**Tech stack:** TanStack Query v5, Next.js App Router `useSearchParams` + `useRouter`, shadcn `Pagination` primitives from `@renewable-energy/ui/components/pagination`, shadcn `Select` for page size.

## Pagination Strategy

URL-based: `?page=N&pageSize=N`. Both params live in the URL so pages are bookmarkable and browser back/forward work correctly.

- `page` parsed from `useSearchParams()`; clamped to `>= 1`; non-numeric defaults to `1`
- `pageSize` parsed from `useSearchParams()`; clamped to `[5, 100]`; defaults to `10`
- On first mount, if `pageSize` is absent from the URL, check `localStorage("re_page_size")` and sync into URL (same pattern as happyfeet ops-dashboard)
- If `page > totalPages` after data loads, `router.replace` to last valid page
- Page navigation (Prev / page numbers / Next) hidden when `totalPages <= 1`; page size selector always visible — consistent with happyfeet pattern

`PaginationLink` renders an `<a>` tag (shadcn default). Navigation is href-based — consistent with happyfeet ops-dashboard which uses the same pattern and is verified working.

## Components

### `use-versions.ts`

TanStack Query hook for the versions list. No polling — the list is a snapshot; live status tracking belongs on the version detail page.

```ts
export function useVersions(projectId: string, params?: { page?: number; pageSize?: number }) {
  const { isLoaded, isSignedIn } = useAuth()
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.projects.versions.lists(projectId, params),
    queryFn: () => api.listVersions(projectId, params),
    enabled: isLoaded && !!isSignedIn && !!projectId,
  })
}
```

### `pagination-controls.tsx`

Adapted from happyfeet `DataPagination`. Two exports:

**`getPageNumbers(page, totalPages): (number | "ellipsis")[]`** — pure exported function. Always includes page 1 and `totalPages`. Always includes `page-1`, `page`, `page+1` (clamped). Inserts `"ellipsis"` token where consecutive shown pages have a gap > 1.

**`PaginationControls`** — wraps `PaginationControlsInner` in `<Suspense>` (required for `useSearchParams` in App Router).

**`PaginationControlsInner`** — uses `useSearchParams`, `usePathname`, `useRouter`:
- `makePageHref(targetPage)` builds URL preserving existing params, sets `page=N`
- Renders shadcn `Pagination` / `PaginationContent` / `PaginationItem` / `PaginationLink` / `PaginationPrevious` / `PaginationNext` / `PaginationEllipsis`
- Previous/Next disabled (pointer-events-none + opacity-50) when at boundary
- Right side: shadcn `Select` for page size; options `[10, 20, 50]`; `localStorage` key `"re_page_size"`; `handlePageSizeChange` stores to localStorage, sets `pageSize` + resets `page=1` in URL
- On first mount: if `pageSize` absent from URL, read localStorage and sync into URL via `router.replace`
- Page navigation (Prev / page numbers / Next) hidden when `totalPages <= 1`; page size selector always visible regardless of page count (consistent with happyfeet)

Props:
```ts
type PaginationControlsProps = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  pageSizeOptions?: number[]  // default: [10, 20, 50]
}
```

### `[projectId]/page.tsx` (new)

Client component. Entry point for the project detail route.

- Reads `projectId` from `useParams()`
- Reads `page` and `pageSize` from `useSearchParams()` — parsed and clamped same as happyfeet
- `useProject(projectId)` → project name for breadcrumbs and heading
- `useVersions(projectId, { page, pageSize })` → versions list data
- Sets breadcrumbs: Projects → [project.name ?? "Project"]
- Guard: if `data` loaded and `page > data.totalPages`, `router.replace` to last valid page

**Header:** `<h1>` with project name + "New run" `<Link>` styled as `Button` → `/dashboard/projects/${projectId}/new-version`

**Loading state:** 3 skeleton rows

**Error state:** Inline message — "Failed to load runs"

**Empty state** (`data.items.length === 0`): dashed border card, `Layers` icon, "No runs yet. Start your first run." with a `Link` to the new-version page

**Version list:** Card-per-row (same pattern as projects list page). Each row:
- Left: `Run #N` (font-medium) + optional label (text-xs text-muted-foreground) + submission timestamp (text-xs text-muted-foreground)
- Right: `VersionStatusBadge`
- Entire row is a `Link` → `/dashboard/projects/${projectId}/versions/${versionId}`
- Sorted newest-first (API returns newest-first by default)

**Footer:** `PaginationControls` with `page`, `pageSize`, `total`, `totalPages` from `data`

### `projects/page.tsx` (modify)

Add URL-based pagination to the existing projects list:

- Read `page` and `pageSize` from `useSearchParams()` (wrap page content in `<Suspense>` if not already)
- Parse + clamp same as above
- Pass `{ page, pageSize }` to `useProjects()`
- Add `PaginationControls` below the project list
- Guard: if `page > totalPages`, redirect to last valid page

## Data Shape

`PaginatedResponse<VersionDetail>` (already defined in `@renewable-energy/shared`):
```ts
{
  items: VersionDetail[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

`VersionDetail` fields used in the list row: `id`, `projectId`, `number`, `label`, `status`, `createdAt`.

## Error Handling

| Scenario | Behaviour |
|---|---|
| Query loading | 3 skeleton rows |
| Query error | "Failed to load runs" inline message |
| Empty list | Dashed empty state with "Start first run" link |
| `page > totalPages` | `router.replace` to `page=totalPages` |
| Invalid `?page` (non-numeric, < 1) | Clamp to 1 |
| Invalid `?pageSize` | Clamp to `[5, 100]`, default 10 |

## Testing

| File | What it tests |
|---|---|
| `pagination-controls.test.tsx` | `getPageNumbers` — first page, last page, middle page, single page, two pages, ellipsis placement on both sides |
| `use-versions.test.tsx` | Disabled when `projectId` is empty string; enabled when auth loaded + signed in + projectId present |
| `[projectId]/page.test.tsx` | Loading renders skeletons; empty state renders "Start first run" link; list renders correct version row hrefs + `VersionStatusBadge`; error state renders error message |
| `projects/page.test.tsx` (extend) | Pagination nav rendered when `totalPages > 1`; pagination nav hidden when `totalPages === 1`; page size selector always present |

## Out of Scope

- Edit / delete project actions — future spike
- Sidebar "current project" nav entry — future spike
- Version row results preview (capacity, etc.) — future spike
- Polling on versions list — not needed; live status is on version detail page
