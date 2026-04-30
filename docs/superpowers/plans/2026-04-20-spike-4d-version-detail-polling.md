# Spike 4d — Version Detail Page with Polling

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/dashboard/projects/[projectId]/versions/[versionId]` — a version detail page that polls until the run is done and shows layout results when complete.

**Architecture:** Four new files: `use-version` hook (TanStack Query v5 polling), `VersionStatusBadge` component (reusable across spikes), `VersionDetail` component (progressive disclosure), and the route page. All data goes through `api.getVersion()` which already exists. No API or query-key changes needed.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, shadcn/ui, Tailwind CSS v4, Vitest + React Testing Library.

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `apps/web/hooks/use-version.ts` | TanStack Query hook with polling |
| Create | `apps/web/hooks/use-version.test.ts` | Hook tests |
| Create | `apps/web/components/version-status-badge.tsx` | Reusable status badge |
| Create | `apps/web/components/version-status-badge.test.tsx` | Badge tests |
| Create | `apps/web/components/version-detail.tsx` | Progressive-disclosure page body |
| Create | `apps/web/components/version-detail.test.tsx` | Component tests |
| Create | `apps/web/app/(main)/dashboard/projects/[projectId]/versions/[versionId]/page.tsx` | Route entry |

---

## Background for Implementer

### Existing query key (do not change)

`apps/web/lib/query-keys.ts` already has:
```ts
versions: {
  detail: (projectId: string, versionId: string) =>
    ["projects", projectId, "versions", versionId] as const,
}
```

### Existing API client method (do not change)

`packages/api-client/src/projects.ts` already has:
```ts
getVersion(projectId: string, versionId: string): Promise<VersionDetail>
```
Calls `GET /projects/${projectId}/versions/${versionId}`.

### Shared types (from `@renewable-energy/shared`)

```ts
export type VersionStatus = "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED"

export interface LayoutJobSummary {
  id: string
  status: JobStatus
  kmzArtifactS3Key: string | null
  svgArtifactS3Key: string | null
  dxfArtifactS3Key: string | null
  statsJson: unknown | null   // ← typed as unknown intentionally; cast locally
  errorDetail: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface EnergyJobSummary {
  id: string
  status: JobStatus
  pdfArtifactS3Key: string | null
  statsJson: unknown | null
  irradianceSource: string | null
  errorDetail: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface VersionDetail {
  id: string
  projectId: string
  number: number
  label: string | null
  status: VersionStatus
  kmzS3Key: string | null
  inputSnapshot: unknown
  layoutJob: LayoutJobSummary | null
  energyJob: EnergyJobSummary | null
  createdAt: string
  updatedAt: string
}
```

### layoutJob.statsJson structure (written by Lambda)

When `status === "COMPLETE"`, `layoutJob.statsJson` contains:
```ts
{
  total_tables: number
  total_modules: number
  total_capacity_mwp: number
  total_area_acres: number
  num_icrs: number
  num_string_inverters: number
  total_dc_cable_m: number
  total_ac_cable_m: number
  num_las: number
}
```
`energyJob.statsJson` is always `null` (energy processing not yet implemented).

### Existing hook pattern to follow (`apps/web/hooks/use-project.ts`)

```ts
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

### Existing test pattern for hooks (`apps/web/hooks/use-project.test.tsx`)

```ts
import { test, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

const mockGetProject = vi.fn().mockResolvedValue(mockProject)
vi.mock("./use-api", () => ({
  useApi: () => ({ getProject: mockGetProject }),
}))

import { useProject } from "./use-project"
```

### Test wrapper (`apps/web/tests/test-utils.tsx`)

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@renewable-energy/ui/components/tooltip"

export function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    )
  }
}
```

### Badge variants available

`@renewable-energy/ui/components/badge` exports `Badge` with variants: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`.

### Alert exports available

`@renewable-energy/ui/components/alert` exports: `Alert`, `AlertTitle`, `AlertDescription`, `AlertAction`. `Alert` accepts `variant="destructive"`.

---

## Task 1: `useVersion` hook

**Files:**
- Create: `apps/web/hooks/use-version.ts`
- Create: `apps/web/hooks/use-version.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/hooks/use-version.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | grep -E "use-version|FAIL|PASS|Error"
```

Expected: FAIL — `use-version` module not found.

- [ ] **Step 3: Implement `use-version.ts`**

Create `apps/web/hooks/use-version.ts`:

```ts
"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"
import type { VersionStatus } from "@renewable-energy/shared"

export function getVersionRefetchInterval(
  status: VersionStatus | undefined,
): number | false {
  if (!status || status === "COMPLETE" || status === "FAILED") return false
  return 3000
}

export function useVersion(projectId: string, versionId: string) {
  const { isLoaded, isSignedIn } = useAuth()
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.projects.versions.detail(projectId, versionId),
    queryFn: () => api.getVersion(projectId, versionId),
    enabled: isLoaded && !!isSignedIn && !!projectId && !!versionId,
    refetchInterval: (query) =>
      getVersionRefetchInterval(query.state.data?.status),
    staleTime: (query) => {
      const s = query.state.data?.status
      return s === "COMPLETE" || s === "FAILED" ? 120_000 : 1_000
    },
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | grep -E "use-version|✓|✗|FAIL|PASS"
```

Expected: 7 tests passing for `use-version.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/use-version.ts apps/web/hooks/use-version.test.ts
git commit -m "feat: add useVersion hook with polling for Spike 4d"
```

---

## Task 2: `VersionStatusBadge` component

**Files:**
- Create: `apps/web/components/version-status-badge.tsx`
- Create: `apps/web/components/version-status-badge.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/version-status-badge.test.tsx`:

```tsx
import { test, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import { VersionStatusBadge } from "./version-status-badge"

afterEach(() => cleanup())

test("renders 'Queued' for QUEUED status", () => {
  render(<VersionStatusBadge status="QUEUED" />, { wrapper: createWrapper() })
  expect(screen.getByText("Queued")).toBeDefined()
})

test("renders 'Processing' for PROCESSING status", () => {
  render(<VersionStatusBadge status="PROCESSING" />, { wrapper: createWrapper() })
  expect(screen.getByText("Processing")).toBeDefined()
})

test("PROCESSING badge has animate-pulse class", () => {
  render(<VersionStatusBadge status="PROCESSING" />, { wrapper: createWrapper() })
  const badge = screen.getByText("Processing")
  expect(badge.className).toContain("animate-pulse")
})

test("renders 'Complete' for COMPLETE status", () => {
  render(<VersionStatusBadge status="COMPLETE" />, { wrapper: createWrapper() })
  expect(screen.getByText("Complete")).toBeDefined()
})

test("renders 'Failed' for FAILED status", () => {
  render(<VersionStatusBadge status="FAILED" />, { wrapper: createWrapper() })
  expect(screen.getByText("Failed")).toBeDefined()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | grep -E "version-status-badge|✓|✗|FAIL|PASS"
```

Expected: FAIL — `version-status-badge` module not found.

- [ ] **Step 3: Implement `version-status-badge.tsx`**

Create `apps/web/components/version-status-badge.tsx`:

```tsx
"use client"

import { Badge } from "@renewable-energy/ui/components/badge"
import { cn } from "@renewable-energy/ui/lib/utils"
import type { VersionStatus } from "@renewable-energy/shared"

interface StatusConfig {
  label: string
  variant: "default" | "secondary" | "destructive" | "outline"
  className?: string
}

const STATUS_CONFIG: Record<VersionStatus, StatusConfig> = {
  QUEUED: { label: "Queued", variant: "secondary" },
  PROCESSING: {
    label: "Processing",
    variant: "default",
    className: "animate-pulse",
  },
  COMPLETE: {
    label: "Complete",
    variant: "outline",
    className:
      "border-green-600 text-green-700 dark:border-green-500 dark:text-green-400",
  },
  FAILED: { label: "Failed", variant: "destructive" },
}

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant={config.variant} className={cn(config.className)}>
      {config.label}
    </Badge>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | grep -E "version-status-badge|✓|✗|FAIL|PASS"
```

Expected: 5 tests passing for `version-status-badge.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/version-status-badge.tsx apps/web/components/version-status-badge.test.tsx
git commit -m "feat: add VersionStatusBadge component for Spike 4d"
```

---

## Task 3: `VersionDetail` component

**Files:**
- Create: `apps/web/components/version-detail.tsx`
- Create: `apps/web/components/version-detail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/version-detail.test.tsx`:

```tsx
import { test, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import type { VersionDetail as VersionDetailType } from "@renewable-energy/shared"

afterEach(() => cleanup())

const BASE_VERSION: VersionDetailType = {
  id: "ver_1",
  projectId: "prj_123",
  number: 1,
  label: null,
  status: "QUEUED",
  kmzS3Key: null,
  inputSnapshot: {},
  layoutJob: null,
  energyJob: null,
  createdAt: new Date(Date.now() - 30_000).toISOString(),
  updatedAt: new Date(Date.now() - 30_000).toISOString(),
}

const COMPLETE_VERSION: VersionDetailType = {
  ...BASE_VERSION,
  status: "COMPLETE",
  layoutJob: {
    id: "lj_1",
    status: "COMPLETE",
    kmzArtifactS3Key: "output/layout.kmz",
    svgArtifactS3Key: "output/layout.svg",
    dxfArtifactS3Key: "output/layout.dxf",
    statsJson: {
      total_tables: 120,
      total_modules: 3360,
      total_capacity_mwp: 1.949,
      total_area_acres: 8.4,
      num_icrs: 6,
      num_string_inverters: 42,
      total_dc_cable_m: 5200.5,
      total_ac_cable_m: 800.2,
      num_las: 12,
    },
    errorDetail: null,
    startedAt: "2026-04-20T00:00:00Z",
    completedAt: "2026-04-20T00:05:00Z",
  },
  energyJob: null,
}

vi.mock("@/hooks/use-version", () => ({
  useVersion: vi.fn(),
}))

import { useVersion } from "@/hooks/use-version"
import { VersionDetail } from "./version-detail"

const mockUseVersion = vi.mocked(useVersion)

test("renders spinner and queued message when status is QUEUED", () => {
  mockUseVersion.mockReturnValue({
    data: { ...BASE_VERSION, status: "QUEUED" },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/your run is queued/i)).toBeDefined()
  expect(document.querySelector(".animate-spin")).toBeDefined()
})

test("renders spinner and processing message when status is PROCESSING", () => {
  mockUseVersion.mockReturnValue({
    data: { ...BASE_VERSION, status: "PROCESSING" },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/calculating layout/i)).toBeDefined()
  expect(document.querySelector(".animate-spin")).toBeDefined()
})

test("renders error alert and start new run link when status is FAILED", () => {
  mockUseVersion.mockReturnValue({
    data: {
      ...BASE_VERSION,
      status: "FAILED",
      layoutJob: {
        id: "lj_1",
        status: "FAILED",
        kmzArtifactS3Key: null,
        svgArtifactS3Key: null,
        dxfArtifactS3Key: null,
        statsJson: null,
        errorDetail: "KMZ parse error: no polygon boundaries found",
        startedAt: "2026-04-20T00:00:00Z",
        completedAt: "2026-04-20T00:01:00Z",
      },
      energyJob: null,
    },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/kmz parse error/i)).toBeDefined()
  const link = screen.getByRole("link", { name: /start new run/i })
  expect(link.getAttribute("href")).toBe(
    "/dashboard/projects/prj_123/new-version",
  )
})

test("renders generic error message when both errorDetails are null", () => {
  mockUseVersion.mockReturnValue({
    data: { ...BASE_VERSION, status: "FAILED" },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/an unexpected error occurred/i)).toBeDefined()
})

test("renders results grid with capacity and modules when COMPLETE", () => {
  mockUseVersion.mockReturnValue({
    data: COMPLETE_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText("Capacity")).toBeDefined()
  expect(screen.getByText("1.949 MWp")).toBeDefined()
  expect(screen.getByText("Modules")).toBeDefined()
  expect(screen.getByText("3360")).toBeDefined()
  expect(screen.getByText("Tables")).toBeDefined()
  expect(screen.getByText("120")).toBeDefined()
})

test("renders loading state", () => {
  mockUseVersion.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/loading/i)).toBeDefined()
})

test("renders error state on query failure", () => {
  mockUseVersion.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText(/failed to load run details/i)).toBeDefined()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | grep -E "version-detail.test|✓|✗|FAIL|PASS"
```

Expected: FAIL — `version-detail` module not found.

- [ ] **Step 3: Implement `version-detail.tsx`**

Create `apps/web/components/version-detail.tsx`:

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@renewable-energy/ui/components/alert"
import { Button } from "@renewable-energy/ui/components/button"
import { VersionStatusBadge } from "./version-status-badge"
import { useVersion } from "@/hooks/use-version"
import type { VersionDetail as VersionDetailType } from "@renewable-energy/shared"

// Local type for layout stats — shared type uses `unknown` intentionally
interface LayoutStats {
  total_tables: number
  total_modules: number
  total_capacity_mwp: number
  total_area_acres: number
  num_icrs: number
  num_string_inverters: number
  total_dc_cable_m: number
  total_ac_cable_m: number
  num_las: number
}

const METRIC_LABELS: {
  key: keyof LayoutStats
  label: string
  unit: string
}[] = [
  { key: "total_capacity_mwp", label: "Capacity", unit: "MWp" },
  { key: "total_modules", label: "Modules", unit: "" },
  { key: "total_tables", label: "Tables", unit: "" },
  { key: "total_area_acres", label: "Area", unit: "acres" },
  { key: "num_string_inverters", label: "String inverters", unit: "" },
  { key: "num_icrs", label: "ICRs", unit: "" },
  { key: "num_las", label: "Lightning arresters", unit: "" },
  { key: "total_dc_cable_m", label: "DC cable", unit: "m" },
  { key: "total_ac_cable_m", label: "AC cable", unit: "m" },
]

function calcElapsed(since: string): string {
  const secs = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / 1000),
  )
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function useElapsed(since: string): string {
  const [elapsed, setElapsed] = React.useState(() => calcElapsed(since))
  React.useEffect(() => {
    const id = setInterval(() => setElapsed(calcElapsed(since)), 1000)
    return () => clearInterval(id)
  }, [since])
  return elapsed
}

function ActiveState({ version }: { version: VersionDetailType }) {
  const elapsed = useElapsed(version.createdAt)
  const message =
    version.status === "QUEUED"
      ? "Your run is queued…"
      : "Calculating layout…"
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <VersionStatusBadge status={version.status} />
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">{elapsed}</p>
    </div>
  )
}

function FailedState({
  version,
  projectId,
}: {
  version: VersionDetailType
  projectId: string
}) {
  const errorMessage =
    version.layoutJob?.errorDetail ??
    version.energyJob?.errorDetail ??
    "An unexpected error occurred"
  return (
    <div className="flex flex-col gap-4">
      <VersionStatusBadge status="FAILED" />
      <Alert variant="destructive">
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
      <Button asChild variant="outline" className="self-start">
        <Link href={`/dashboard/projects/${projectId}/new-version`}>
          Start new run
        </Link>
      </Button>
    </div>
  )
}

function CompleteState({ version }: { version: VersionDetailType }) {
  const stats = version.layoutJob?.statsJson as LayoutStats | null
  return (
    <div className="flex flex-col gap-6">
      <VersionStatusBadge status="COMPLETE" />
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {METRIC_LABELS.map(({ key, label, unit }) => (
            <div key={key} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold">
                {stats[key]}
                {unit ? ` ${unit}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function VersionDetail({
  projectId,
  versionId,
}: {
  projectId: string
  versionId: string
}) {
  const { data: version, isLoading, isError } = useVersion(projectId, versionId)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (isError || !version) {
    return (
      <p className="text-sm text-destructive">Failed to load run details.</p>
    )
  }
  if (version.status === "QUEUED" || version.status === "PROCESSING") {
    return <ActiveState version={version} />
  }
  if (version.status === "FAILED") {
    return <FailedState version={version} projectId={projectId} />
  }
  return <CompleteState version={version} />
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | grep -E "version-detail.test|✓|✗|FAIL|PASS"
```

Expected: 7 tests passing for `version-detail.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/version-detail.tsx apps/web/components/version-detail.test.tsx
git commit -m "feat: add VersionDetail component with progressive disclosure"
```

---

## Task 4: Route page + full gates

**Files:**
- Create: `apps/web/app/(main)/dashboard/projects/[projectId]/versions/[versionId]/page.tsx`

- [ ] **Step 1: Create the route directory and page**

```bash
mkdir -p apps/web/app/\(main\)/dashboard/projects/\[projectId\]/versions/\[versionId\]
```

Create `apps/web/app/(main)/dashboard/projects/[projectId]/versions/[versionId]/page.tsx`:

```tsx
"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
import { useProject } from "@/hooks/use-project"
import { useVersion } from "@/hooks/use-version"
import { VersionDetail } from "@/components/version-detail"

export default function VersionDetailPage() {
  const params = useParams()
  const projectId = params["projectId"] as string
  const versionId = params["versionId"] as string
  const { setBreadcrumbs } = useBreadcrumbs()
  const { data: project } = useProject(projectId)
  const { data: version } = useVersion(projectId, versionId)

  React.useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/dashboard/projects" },
      {
        label: project?.name ?? "Project",
        href: `/dashboard/projects/${projectId}`,
      },
      { label: version ? `Run #${version.number}` : "Run" },
    ])
  }, [setBreadcrumbs, project?.name, projectId, version?.number, version])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">
        {version ? `Run #${version.number}` : "Run"}
      </h1>
      <VersionDetail projectId={projectId} versionId={versionId} />
    </div>
  )
}
```

- [ ] **Step 2: Run the full gate suite**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: All four pass with no errors.

If `typecheck` fails with an error about `staleTime` accepting a function — TanStack Query v5 supports `staleTime` as a function. If the TypeScript types lag behind, cast: `staleTime: ((query: any) => ...) as any`. Only do this if there's a TS error — do not apply speculatively.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(main\)/dashboard/projects/\[projectId\]/versions/\[versionId\]/page.tsx
git commit -m "feat: add version detail route page (Spike 4d)"
```

---

## Post-Implementation

After all tasks complete and all gates pass:

- Use `superpowers:finishing-a-development-branch` to complete the branch.
- The human will verify locally then push to CI.
- Acceptance: navigate to a version URL after form submit — should see QUEUED/PROCESSING state, then results appear automatically when complete.
