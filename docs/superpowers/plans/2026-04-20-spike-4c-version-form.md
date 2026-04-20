# Spike 4c — Version Submission Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 27-parameter version submission form at `/dashboard/projects/[projectId]/new-version` with KMZ file upload, auto-override fields for tilt/pitch/GCR, and a sticky section-nav layout.

**Architecture:** `react-hook-form` + `zod` manage 27 typed fields with pre-filled defaults; three nullable layout fields use a Switch-to-enable pattern; KMZ upload is held in `useState<File | null>` outside the schema; submit calls `useCreateVersion` mutation then redirects to version detail. Desktop shows sticky left-nav (200px); mobile shows horizontal chip nav.

**Tech Stack:** Next.js 16 App Router, React 19, react-hook-form, @hookform/resolvers, zod, TanStack Query v5, Clerk v7, shadcn/ui, Tailwind v4.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `apps/web/package.json` | Add react-hook-form, @hookform/resolvers, zod |
| Create | `apps/web/hooks/use-create-version.ts` | TanStack mutation — calls api.createVersion, invalidates versions cache |
| Create | `apps/web/hooks/use-create-version.test.tsx` | Tests: mutate called, cache invalidated |
| Create | `apps/web/components/new-version-form.tsx` | Full form: schema, layout, all sections, submit handler |
| Create | `apps/web/components/new-version-form.test.tsx` | Tests: sections render, KMZ required, defaults, auto-override, submit |
| Create | `apps/web/app/(main)/dashboard/projects/[projectId]/new-version/page.tsx` | Route page: breadcrumbs + renders NewVersionForm |

---

## Context You Must Know

**Existing patterns (read before writing code):**

- Hook test pattern: `apps/web/hooks/use-create-project.test.tsx` — mock `@clerk/nextjs` and `./use-api` before importing the hook under test
- Component test pattern: `apps/web/components/create-project-dialog.test.tsx` — `afterEach(() => cleanup())`, mock hooks by path
- `createWrapper()`: `apps/web/tests/test-utils.tsx` — provides QueryClientProvider only
- `queryKeys.projects.versions.all(projectId)`: `apps/web/lib/query-keys.ts` — use this for cache invalidation
- `CreateVersionParams`: exported from `@renewable-energy/api-client` — `{ projectId, label?, inputSnapshot: Record<string, unknown>, kmzFile?: File }`
- `ApiError`: exported from `@renewable-energy/api-client` — `{ code: string, name: "ApiError" }`
- `VersionDetail`: `@renewable-energy/shared` — `{ id, projectId, number, label, status, kmzS3Key, inputSnapshot, layoutJob, energyJob, createdAt, updatedAt }`
- `cn` utility: `import { cn } from "@renewable-energy/ui/lib/utils"`
- shadcn imports: all from `@renewable-energy/ui/components/<name>` (e.g. `@renewable-energy/ui/components/button`)
- Tooltip: `TooltipProvider` is already in root layout — do NOT add another one; just use `Tooltip`, `TooltipTrigger`, `TooltipContent`
- Breadcrumbs: `import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"` + `setBreadcrumbs([{ label: "Projects", href: "/dashboard/projects" }, { label: projectName, href: ... }, { label: "New run" }])`
- `useProject(projectId)`: `apps/web/hooks/use-project.ts` — returns `{ data: Project | undefined }`

---

## Task 1: Install react-hook-form, @hookform/resolvers, zod

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Check what's already installed**

```bash
grep -E "react-hook-form|hookform|\"zod\"" apps/web/package.json
```

Expected: no output (none installed yet).

- [ ] **Step 2: Install the three packages**

```bash
cd apps/web && bun add react-hook-form @hookform/resolvers zod
```

Expected: packages added to `apps/web/package.json` dependencies.

- [ ] **Step 3: Verify build still passes**

```bash
cd /path/to/repo/root && bunx turbo build --filter=web
```

Expected: `Tasks: 1 successful`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/bun.lock
git commit -m "chore: add react-hook-form, @hookform/resolvers, zod to web"
```

---

## Task 2: useCreateVersion Hook

**Files:**
- Create: `apps/web/hooks/use-create-version.test.tsx`
- Create: `apps/web/hooks/use-create-version.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/hooks/use-create-version.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx turbo test --filter=web -- --reporter=verbose use-create-version
```

Expected: FAIL with "Cannot find module './use-create-version'"

- [ ] **Step 3: Implement the hook**

Create `apps/web/hooks/use-create-version.ts`:

```ts
"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useApi } from "./use-api"
import { queryKeys } from "@/lib/query-keys"
import type { CreateVersionParams } from "@renewable-energy/api-client"

export function useCreateVersion() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: CreateVersionParams) => api.createVersion(params),
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.versions.all(params.projectId),
      })
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx turbo test --filter=web -- --reporter=verbose use-create-version
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/use-create-version.ts apps/web/hooks/use-create-version.test.tsx
git commit -m "feat: add useCreateVersion mutation hook"
```

---

## Task 3: NewVersionForm — Schema + Layout Skeleton

**Files:**
- Create: `apps/web/components/new-version-form.test.tsx` (partial — section headings only)
- Create: `apps/web/components/new-version-form.tsx` (skeleton — schema + layout + section headings, no fields yet)

- [ ] **Step 1: Write the failing test for section headings**

Create `apps/web/components/new-version-form.test.tsx`:

```tsx
import { test, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"
import { NewVersionForm } from "./new-version-form"

afterEach(() => cleanup())

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}))

vi.mock("@/hooks/use-create-version", () => ({
  useCreateVersion: () => ({
    mutateAsync: vi.fn().mockResolvedValue({
      id: "ver_1",
      projectId: "prj_1",
    }),
    isPending: false,
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

beforeEach(() => vi.clearAllMocks())

test("renders all 6 section headings", () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  expect(screen.getByText("Run setup")).toBeDefined()
  expect(screen.getByText("Module")).toBeDefined()
  expect(screen.getByText("Table config")).toBeDefined()
  expect(screen.getByText("Layout")).toBeDefined()
  expect(screen.getByText("Inverter")).toBeDefined()
  expect(screen.getByText("Energy losses")).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: FAIL with "Cannot find module './new-version-form'"

- [ ] **Step 3: Create the form skeleton with schema and layout**

Create `apps/web/components/new-version-form.tsx`:

```tsx
"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { useCreateVersion } from "@/hooks/use-create-version"
import { ApiError } from "@renewable-energy/api-client"
import { Button } from "@renewable-energy/ui/components/button"
import { Alert, AlertDescription } from "@renewable-energy/ui/components/alert"
import { Spinner } from "@renewable-energy/ui/components/spinner"
import { cn } from "@renewable-energy/ui/lib/utils"

// ─── Zod schema ──────────────────────────────────────────────────────────────

export const newVersionSchema = z.object({
  label: z.string().optional(),
  // Module
  module_length: z.number().min(0.5).max(5.0),
  module_width: z.number().min(0.5).max(3.0),
  module_wattage: z.number().min(100).max(1000),
  // Table config
  orientation: z.enum(["portrait", "landscape"]),
  modules_in_row: z.number().int().min(1).max(100),
  rows_per_table: z.number().int().min(1).max(10),
  table_gap_ew: z.number().min(0).max(20),
  // Layout
  tilt_angle: z.number().min(5).max(40).nullable(),
  row_spacing: z.number().min(1).max(50).nullable(),
  gcr: z.number().min(0.1).max(0.9).nullable(),
  perimeter_road_width: z.number().min(0).max(50),
  // Inverter
  max_strings_per_inverter: z.number().int().min(1).max(500),
  // Energy
  ghi_kwh_m2_yr: z.number().min(0).max(3000),
  gti_kwh_m2_yr: z.number().min(0).max(3500),
  inverter_efficiency_pct: z.number().min(50).max(100),
  dc_cable_loss_pct: z.number().min(0).max(20),
  ac_cable_loss_pct: z.number().min(0).max(20),
  soiling_loss_pct: z.number().min(0).max(20),
  temperature_loss_pct: z.number().min(0).max(20),
  mismatch_loss_pct: z.number().min(0).max(10),
  shading_loss_pct: z.number().min(0).max(20),
  availability_pct: z.number().min(50).max(100),
  transformer_loss_pct: z.number().min(0).max(10),
  other_loss_pct: z.number().min(0).max(10),
  first_year_degradation_pct: z.number().min(0).max(10),
  annual_degradation_pct: z.number().min(0).max(5),
  plant_lifetime_years: z.number().int().min(1).max(50),
})

export type NewVersionFormValues = z.infer<typeof newVersionSchema>

export const FORM_DEFAULTS: NewVersionFormValues = {
  label: "",
  module_length: 2.38,
  module_width: 1.13,
  module_wattage: 580,
  orientation: "portrait",
  modules_in_row: 28,
  rows_per_table: 2,
  table_gap_ew: 1.0,
  tilt_angle: null,
  row_spacing: null,
  gcr: null,
  perimeter_road_width: 6.0,
  max_strings_per_inverter: 20,
  ghi_kwh_m2_yr: 0,
  gti_kwh_m2_yr: 0,
  inverter_efficiency_pct: 97.0,
  dc_cable_loss_pct: 2.0,
  ac_cable_loss_pct: 1.0,
  soiling_loss_pct: 4.0,
  temperature_loss_pct: 6.0,
  mismatch_loss_pct: 2.0,
  shading_loss_pct: 2.0,
  availability_pct: 98.0,
  transformer_loss_pct: 1.0,
  other_loss_pct: 1.0,
  first_year_degradation_pct: 2.0,
  annual_degradation_pct: 0.5,
  plant_lifetime_years: 25,
}

// ─── Section config ───────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "run-setup",      label: "Run setup" },
  { id: "module",         label: "Module" },
  { id: "table-config",   label: "Table config" },
  { id: "layout",         label: "Layout" },
  { id: "inverter",       label: "Inverter" },
  { id: "energy-losses",  label: "Energy losses" },
] as const

// ─── Component ────────────────────────────────────────────────────────────────

export function NewVersionForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const { mutateAsync, isPending } = useCreateVersion()

  const [kmzFile, setKmzFile] = React.useState<File | null>(null)
  const [kmzError, setKmzError] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [activeSection, setActiveSection] = React.useState<string>(SECTIONS[0].id)

  const { handleSubmit, register, control, setValue, formState: { errors } } =
    useForm<NewVersionFormValues>({
      resolver: zodResolver(newVersionSchema),
      defaultValues: FORM_DEFAULTS,
    })

  // Auto-override switch state for the three nullable layout fields
  const [tiltOverride, setTiltOverride] = React.useState(false)
  const [rowSpacingOverride, setRowSpacingOverride] = React.useState(false)
  const [gcrOverride, setGcrOverride] = React.useState(false)

  // IntersectionObserver: highlight active section in nav
  React.useEffect(() => {
    const observers: IntersectionObserver[] = []
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id) },
        { threshold: 0.3 },
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  }

  async function onSubmit(data: NewVersionFormValues) {
    if (!kmzFile) {
      setKmzError("KMZ file is required.")
      return
    }
    setKmzError(null)
    setSubmitError(null)
    try {
      const inputSnapshot: Record<string, unknown> = {
        module_length: data.module_length,
        module_width: data.module_width,
        module_wattage: data.module_wattage,
        orientation: data.orientation,
        modules_in_row: data.modules_in_row,
        rows_per_table: data.rows_per_table,
        table_gap_ew: data.table_gap_ew,
        tilt_angle: tiltOverride ? data.tilt_angle : null,
        row_spacing: rowSpacingOverride ? data.row_spacing : null,
        gcr: gcrOverride ? data.gcr : null,
        perimeter_road_width: data.perimeter_road_width,
        max_strings_per_inverter: data.max_strings_per_inverter,
        ghi_kwh_m2_yr: data.ghi_kwh_m2_yr,
        gti_kwh_m2_yr: data.gti_kwh_m2_yr,
        inverter_efficiency_pct: data.inverter_efficiency_pct,
        dc_cable_loss_pct: data.dc_cable_loss_pct,
        ac_cable_loss_pct: data.ac_cable_loss_pct,
        soiling_loss_pct: data.soiling_loss_pct,
        temperature_loss_pct: data.temperature_loss_pct,
        mismatch_loss_pct: data.mismatch_loss_pct,
        shading_loss_pct: data.shading_loss_pct,
        availability_pct: data.availability_pct,
        transformer_loss_pct: data.transformer_loss_pct,
        other_loss_pct: data.other_loss_pct,
        first_year_degradation_pct: data.first_year_degradation_pct,
        annual_degradation_pct: data.annual_degradation_pct,
        plant_lifetime_years: data.plant_lifetime_years,
      }
      const version = await mutateAsync({
        projectId,
        label: data.label?.trim() || undefined,
        inputSnapshot,
        kmzFile,
      })
      router.push(`/dashboard/projects/${projectId}/versions/${version.id}`)
    } catch (err) {
      const e = err as ApiError
      if (e.code === "NETWORK_ERROR") {
        setSubmitError(
          "Layout submission failed. Could not reach the server. Check your connection and try again.",
        )
      } else if (e.code === "HTTP_ERROR" || e.code === "PARSE_ERROR") {
        setSubmitError(
          "Layout submission failed. The server rejected the request. Check your inputs and try again.",
        )
      } else {
        setSubmitError(
          "Layout submission failed. An unexpected error occurred. Try again or contact support.",
        )
      }
    }
  }

  const submitButton = (
    <Button
      type="submit"
      form="new-version-form"
      disabled={isPending}
      className="w-full"
    >
      {isPending ? (
        <><Spinner className="mr-2 h-4 w-4" /> Running…</>
      ) : (
        "Run layout"
      )}
    </Button>
  )

  return (
    <div className="flex gap-8">
      {/* Desktop sticky left-nav */}
      <aside className="hidden lg:flex flex-col w-[200px] shrink-0">
        <nav className="sticky top-6 flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              className={cn(
                "text-left text-sm px-3 py-1.5 rounded-md transition-colors",
                activeSection === s.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
            >
              {s.label}
            </button>
          ))}
          <div className="mt-4">{submitButton}</div>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile chip nav */}
        <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-6">
          {SECTIONS.map((s) => (
            <Button
              key={s.id}
              type="button"
              variant={activeSection === s.id ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => scrollTo(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <form id="new-version-form" onSubmit={handleSubmit(onSubmit)} className="space-y-10">
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* Sections — filled in subsequent tasks */}
          <section id="run-setup">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Run setup</h2>
          </section>
          <section id="module">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Module</h2>
          </section>
          <section id="table-config">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Table config</h2>
          </section>
          <section id="layout">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Layout</h2>
          </section>
          <section id="inverter">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Inverter</h2>
          </section>
          <section id="energy-losses">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Energy losses</h2>
          </section>
        </form>

        {/* Mobile submit button */}
        <div className="lg:hidden mt-6">{submitButton}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: PASS (1 test).

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/new-version-form.tsx apps/web/components/new-version-form.test.tsx
git commit -m "feat: add NewVersionForm skeleton with Zod schema and section layout"
```

---

## Task 4: Run Setup Section — KMZ Upload + Label

**Files:**
- Modify: `apps/web/components/new-version-form.tsx` — fill in run-setup section
- Modify: `apps/web/components/new-version-form.test.tsx` — add KMZ tests

- [ ] **Step 1: Add KMZ tests to the test file**

Add to `apps/web/components/new-version-form.test.tsx` (append after existing test):

```tsx
import { fireEvent, waitFor, act } from "@testing-library/react"

test("shows KMZ required error when submitting without a file", async () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const form = document.querySelector("form")!
  await act(async () => { fireEvent.submit(form) })
  await waitFor(() =>
    expect(screen.getByText("KMZ file is required.")).toBeDefined(),
  )
})

test("displays filename after KMZ file is selected", async () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(["x"], "site.kmz", { type: "application/vnd.google-earth.kmz" })
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [file] } })
  })
  expect(screen.getByText(/site\.kmz/)).toBeDefined()
})
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: 2 new FAILs (no file input, no KMZ error text).

- [ ] **Step 3: Implement the run-setup section**

In `apps/web/components/new-version-form.tsx`, add the following imports at the top:

```tsx
import { Input } from "@renewable-energy/ui/components/input"
import { Label } from "@renewable-energy/ui/components/label"
import { Upload, X } from "lucide-react"
```

Replace the `<section id="run-setup">` block:

```tsx
<section id="run-setup">
  <h2 className="text-base font-semibold mb-4 pb-2 border-b">Run setup</h2>
  <div className="space-y-4">

    {/* KMZ upload */}
    <div className="space-y-1.5">
      <Label>KMZ boundary file</Label>
      {kmzFile ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">{kmzFile.name}</span>
          <span className="text-muted-foreground shrink-0">
            {(kmzFile.size / 1024).toFixed(0)} KB
          </span>
          <button
            type="button"
            onClick={() => { setKmzFile(null); setKmzError(null) }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-8 text-center cursor-pointer transition-colors hover:bg-muted/20",
            kmzError && "border-destructive",
          )}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Drop KMZ file here or click to browse
          </span>
          <input
            type="file"
            accept=".kmz"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setKmzFile(f)
              if (f) setKmzError(null)
            }}
          />
        </label>
      )}
      {kmzError && (
        <p className="text-xs text-destructive">{kmzError}</p>
      )}
    </div>

    {/* Run label */}
    <div className="space-y-1.5">
      <Label htmlFor="run-label">Run label <span className="text-muted-foreground">(optional)</span></Label>
      <Input
        id="run-label"
        placeholder="e.g. Phase 1 baseline"
        {...register("label")}
      />
    </div>

  </div>
</section>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: PASS (3 tests).

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/new-version-form.tsx apps/web/components/new-version-form.test.tsx
git commit -m "feat: add KMZ drag-and-drop upload and run label to version form"
```

---

## Task 5: Module, Table Config, and Inverter Sections

**Files:**
- Modify: `apps/web/components/new-version-form.tsx`
- Modify: `apps/web/components/new-version-form.test.tsx`

**Note on numeric inputs:** Use `type="number"` + `valueAsNumber: true` in `register()` for all plain number fields so react-hook-form stores numbers not strings. Use `Controller` only for `orientation` (Select component).

- [ ] **Step 1: Add default values test**

Add to `apps/web/components/new-version-form.test.tsx`:

```tsx
test("pre-fills module defaults", () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const moduleLengthInput = screen.getByLabelText(/module length/i) as HTMLInputElement
  expect(moduleLengthInput.value).toBe("2.38")
  const wattageInput = screen.getByLabelText(/wattage/i) as HTMLInputElement
  expect(wattageInput.value).toBe("580")
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: FAIL (no inputs with those labels yet).

- [ ] **Step 3: Add imports to new-version-form.tsx**

Add to the existing imports block in `apps/web/components/new-version-form.tsx`:

```tsx
import { Controller } from "react-hook-form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renewable-energy/ui/components/select"
```

- [ ] **Step 4: Implement a reusable NumericField helper (top of file, before the component)**

Add above the `NewVersionForm` component in `new-version-form.tsx`:

```tsx
function NumericField({
  id,
  label,
  unit,
  register: reg,
  error,
}: {
  id: string
  label: string
  unit?: string
  register: ReturnType<typeof useForm<NewVersionFormValues>["register"]>
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          step="any"
          className="flex-1"
          {...reg}
        />
        {unit && <span className="text-sm text-muted-foreground shrink-0">{unit}</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
```

**Note:** `NumericField` accepts the result of `register("fieldName", { valueAsNumber: true })`. Pass it as `register={register("module_length", { valueAsNumber: true })}` at each call site.

- [ ] **Step 5: Replace the module section in the form JSX**

Replace `<section id="module">` block:

```tsx
<section id="module">
  <h2 className="text-base font-semibold mb-4 pb-2 border-b">Module</h2>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <NumericField
      id="module-length"
      label="Module length"
      unit="m"
      register={register("module_length", { valueAsNumber: true })}
      error={errors.module_length?.message}
    />
    <NumericField
      id="module-width"
      label="Module width"
      unit="m"
      register={register("module_width", { valueAsNumber: true })}
      error={errors.module_width?.message}
    />
    <NumericField
      id="module-wattage"
      label="Wattage"
      unit="Wp"
      register={register("module_wattage", { valueAsNumber: true })}
      error={errors.module_wattage?.message}
    />
  </div>
</section>
```

- [ ] **Step 6: Replace the table-config section**

Replace `<section id="table-config">` block:

```tsx
<section id="table-config">
  <h2 className="text-base font-semibold mb-4 pb-2 border-b">Table config</h2>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="space-y-1.5">
      <Label htmlFor="orientation">Orientation</Label>
      <Controller
        control={control}
        name="orientation"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id="orientation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="landscape">Landscape</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
    </div>
    <NumericField
      id="modules-in-row"
      label="Modules per row"
      register={register("modules_in_row", { valueAsNumber: true })}
      error={errors.modules_in_row?.message}
    />
    <NumericField
      id="rows-per-table"
      label="Rows per table"
      register={register("rows_per_table", { valueAsNumber: true })}
      error={errors.rows_per_table?.message}
    />
    <NumericField
      id="table-gap-ew"
      label="East–west gap"
      unit="m"
      register={register("table_gap_ew", { valueAsNumber: true })}
      error={errors.table_gap_ew?.message}
    />
  </div>
</section>
```

- [ ] **Step 7: Replace the inverter section**

Replace `<section id="inverter">` block:

```tsx
<section id="inverter">
  <h2 className="text-base font-semibold mb-4 pb-2 border-b">Inverter</h2>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <NumericField
      id="max-strings"
      label="Max strings per inverter"
      register={register("max_strings_per_inverter", { valueAsNumber: true })}
      error={errors.max_strings_per_inverter?.message}
    />
  </div>
</section>
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: PASS (4 tests).

- [ ] **Step 9: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/new-version-form.tsx apps/web/components/new-version-form.test.tsx
git commit -m "feat: add module, table config, and inverter form sections"
```

---

## Task 6: Layout Section — Auto-Override Fields

**Files:**
- Modify: `apps/web/components/new-version-form.tsx`
- Modify: `apps/web/components/new-version-form.test.tsx`

- [ ] **Step 1: Add auto-override tests**

Add to `apps/web/components/new-version-form.test.tsx`:

```tsx
import { within } from "@testing-library/react"

test("tilt_angle is null in payload when override switch is off (default)", async () => {
  const mockMutate = vi.fn().mockResolvedValue({ id: "ver_1", projectId: "prj_1" })
  vi.mocked(
    (await import("@/hooks/use-create-version")).useCreateVersion,
  )
  // Re-mock for this test to capture the call
  vi.doMock("@/hooks/use-create-version", () => ({
    useCreateVersion: () => ({ mutateAsync: mockMutate, isPending: false }),
  }))

  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(["x"], "site.kmz", { type: "application/vnd.google-earth.kmz" })
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [file] } })
  })
  const form = document.querySelector("form")!
  await act(async () => { fireEvent.submit(form) })
  await waitFor(() => expect(mockMutate).toHaveBeenCalled())
  const call = mockMutate.mock.calls[0][0]
  expect(call.inputSnapshot.tilt_angle).toBeNull()
  expect(call.inputSnapshot.row_spacing).toBeNull()
  expect(call.inputSnapshot.gcr).toBeNull()
})
```

**Note:** This test uses the module-level `mockMutateAsync` mock. Rewrite the test more simply:

```tsx
test("tilt_angle, row_spacing, gcr are null when auto-override switches are off", async () => {
  const mockMutate = vi.fn().mockResolvedValue({ id: "ver_1", projectId: "prj_1" })
  vi.mock("@/hooks/use-create-version", () => ({
    useCreateVersion: () => ({ mutateAsync: mockMutate, isPending: false }),
  }))

  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const file = new File(["x"], "site.kmz", {})
  await act(async () => {
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [file] } },
    )
  })
  await act(async () => { fireEvent.submit(document.querySelector("form")!) })
  await waitFor(() => expect(mockMutate).toHaveBeenCalled())
  const { inputSnapshot } = mockMutate.mock.calls[0][0]
  expect(inputSnapshot.tilt_angle).toBeNull()
  expect(inputSnapshot.row_spacing).toBeNull()
  expect(inputSnapshot.gcr).toBeNull()
})
```

**Note:** The `vi.mock` call in a test body is hoisted by Vitest but may not override a top-level mock correctly. Use the existing module-level `useCreateVersion` mock instead and check `mockMutateAsync`:

```tsx
test("tilt_angle, row_spacing, gcr are null when auto-override switches are off", async () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const file = new File(["x"], "site.kmz", {})
  await act(async () => {
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [file] } },
    )
  })
  const form = document.querySelector("form")!
  await act(async () => { fireEvent.submit(form) })
  // mockMutateAsync is the vi.fn() from the top-level useCreateVersion mock
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
  const { inputSnapshot } = mockMutateAsync.mock.calls[0][0]
  expect(inputSnapshot.tilt_angle).toBeNull()
  expect(inputSnapshot.row_spacing).toBeNull()
  expect(inputSnapshot.gcr).toBeNull()
})
```

**Important:** Extract `mockMutateAsync` at the top of the test file so all tests can reference it:

```tsx
// At the top of new-version-form.test.tsx, after the existing vi.mock calls, add:
const mockMutateAsync = vi.fn().mockResolvedValue({ id: "ver_1", projectId: "prj_1" })

vi.mock("@/hooks/use-create-version", () => ({
  useCreateVersion: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}))
```

Update the existing `useCreateVersion` mock in the test file to use this shared `mockMutateAsync` (remove the inline `vi.fn()` from the earlier mock). The mock definition at the top should be the only one.

- [ ] **Step 2: Run new test to verify it fails**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: FAIL (no form submission working yet with fields, or Layout section has no fields).

- [ ] **Step 3: Add OverrideField helper and implement layout section**

Add above `NewVersionForm` component in `new-version-form.tsx`:

```tsx
import { Switch } from "@renewable-energy/ui/components/switch"

function OverrideField({
  id,
  label,
  unit,
  enabled,
  onToggle,
  field,
  error,
}: {
  id: string
  label: string
  unit?: string
  enabled: boolean
  onToggle: (on: boolean) => void
  field: {
    value: number | null
    onChange: (v: number | null) => void
  }
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Switch
          id={`${id}-switch`}
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`Override ${label}`}
        />
        <Label htmlFor={id} className={enabled ? "" : "text-muted-foreground"}>
          {label}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          step="any"
          disabled={!enabled}
          placeholder="Auto"
          value={field.value ?? ""}
          onChange={(e) =>
            field.onChange(e.target.value ? Number(e.target.value) : null)
          }
          className="flex-1"
        />
        {unit && (
          <span className="text-sm text-muted-foreground shrink-0">{unit}</span>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
```

Replace `<section id="layout">` block:

```tsx
<section id="layout">
  <h2 className="text-base font-semibold mb-4 pb-2 border-b">Layout</h2>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <Controller
      control={control}
      name="tilt_angle"
      render={({ field }) => (
        <OverrideField
          id="tilt-angle"
          label="Tilt angle"
          unit="°"
          enabled={tiltOverride}
          onToggle={(on) => {
            setTiltOverride(on)
            setValue("tilt_angle", on ? 20 : null)
          }}
          field={field}
          error={errors.tilt_angle?.message}
        />
      )}
    />
    <Controller
      control={control}
      name="row_spacing"
      render={({ field }) => (
        <OverrideField
          id="row-spacing"
          label="Row pitch"
          unit="m"
          enabled={rowSpacingOverride}
          onToggle={(on) => {
            setRowSpacingOverride(on)
            setValue("row_spacing", on ? 7.0 : null)
          }}
          field={field}
          error={errors.row_spacing?.message}
        />
      )}
    />
    <Controller
      control={control}
      name="gcr"
      render={({ field }) => (
        <OverrideField
          id="gcr"
          label="GCR"
          enabled={gcrOverride}
          onToggle={(on) => {
            setGcrOverride(on)
            setValue("gcr", on ? 0.40 : null)
          }}
          field={field}
          error={errors.gcr?.message}
        />
      )}
    />
    <NumericField
      id="road-width"
      label="Perimeter road width"
      unit="m"
      register={register("perimeter_road_width", { valueAsNumber: true })}
      error={errors.perimeter_road_width?.message}
    />
  </div>
</section>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: PASS (5 tests).

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/new-version-form.tsx apps/web/components/new-version-form.test.tsx
git commit -m "feat: add layout section with auto-override toggle for tilt/pitch/GCR"
```

---

## Task 7: Energy Losses Section

**Files:**
- Modify: `apps/web/components/new-version-form.tsx`
- Modify: `apps/web/components/new-version-form.test.tsx`

- [ ] **Step 1: Add energy defaults test**

Add to `apps/web/components/new-version-form.test.tsx`:

```tsx
test("pre-fills energy loss defaults", () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const invEff = screen.getByLabelText(/inverter efficiency/i) as HTMLInputElement
  expect(invEff.value).toBe("97")
  const soiling = screen.getByLabelText(/soiling/i) as HTMLInputElement
  expect(soiling.value).toBe("4")
  const lifetime = screen.getByLabelText(/plant lifetime/i) as HTMLInputElement
  expect(lifetime.value).toBe("25")
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: FAIL (no energy fields yet).

- [ ] **Step 3: Implement energy losses section**

Replace `<section id="energy-losses">` block:

```tsx
<section id="energy-losses">
  <h2 className="text-base font-semibold mb-4 pb-2 border-b">Energy losses</h2>

  {/* Irradiance */}
  <div className="mb-6">
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
      Irradiance
    </p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <NumericField
        id="ghi"
        label="GHI"
        unit="kWh/m²/yr"
        register={register("ghi_kwh_m2_yr", { valueAsNumber: true })}
        error={errors.ghi_kwh_m2_yr?.message}
      />
      <NumericField
        id="gti"
        label="GTI (in-plane)"
        unit="kWh/m²/yr"
        register={register("gti_kwh_m2_yr", { valueAsNumber: true })}
        error={errors.gti_kwh_m2_yr?.message}
      />
    </div>
    <p className="mt-2 text-xs text-muted-foreground">
      Enter site irradiance values. Leave 0 to skip energy calculation.
    </p>
  </div>

  {/* Performance ratio breakdown */}
  <div className="mb-6">
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
      Performance ratio breakdown
    </p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <NumericField
        id="inverter-efficiency"
        label="Inverter efficiency"
        unit="%"
        register={register("inverter_efficiency_pct", { valueAsNumber: true })}
        error={errors.inverter_efficiency_pct?.message}
      />
      <NumericField
        id="dc-cable-loss"
        label="DC cable losses"
        unit="%"
        register={register("dc_cable_loss_pct", { valueAsNumber: true })}
        error={errors.dc_cable_loss_pct?.message}
      />
      <NumericField
        id="ac-cable-loss"
        label="AC cable losses"
        unit="%"
        register={register("ac_cable_loss_pct", { valueAsNumber: true })}
        error={errors.ac_cable_loss_pct?.message}
      />
      <NumericField
        id="soiling-loss"
        label="Soiling losses"
        unit="%"
        register={register("soiling_loss_pct", { valueAsNumber: true })}
        error={errors.soiling_loss_pct?.message}
      />
      <NumericField
        id="temperature-loss"
        label="Temperature losses"
        unit="%"
        register={register("temperature_loss_pct", { valueAsNumber: true })}
        error={errors.temperature_loss_pct?.message}
      />
      <NumericField
        id="mismatch-loss"
        label="Module mismatch"
        unit="%"
        register={register("mismatch_loss_pct", { valueAsNumber: true })}
        error={errors.mismatch_loss_pct?.message}
      />
      <NumericField
        id="shading-loss"
        label="Shading losses"
        unit="%"
        register={register("shading_loss_pct", { valueAsNumber: true })}
        error={errors.shading_loss_pct?.message}
      />
      <NumericField
        id="availability"
        label="Availability"
        unit="%"
        register={register("availability_pct", { valueAsNumber: true })}
        error={errors.availability_pct?.message}
      />
      <NumericField
        id="transformer-loss"
        label="Transformer losses"
        unit="%"
        register={register("transformer_loss_pct", { valueAsNumber: true })}
        error={errors.transformer_loss_pct?.message}
      />
      <NumericField
        id="other-loss"
        label="Other losses"
        unit="%"
        register={register("other_loss_pct", { valueAsNumber: true })}
        error={errors.other_loss_pct?.message}
      />
    </div>
  </div>

  {/* Degradation */}
  <div>
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
      Degradation
    </p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <NumericField
        id="first-year-deg"
        label="1st year degradation"
        unit="%"
        register={register("first_year_degradation_pct", { valueAsNumber: true })}
        error={errors.first_year_degradation_pct?.message}
      />
      <NumericField
        id="annual-deg"
        label="Annual degradation"
        unit="%/yr"
        register={register("annual_degradation_pct", { valueAsNumber: true })}
        error={errors.annual_degradation_pct?.message}
      />
      <NumericField
        id="plant-lifetime"
        label="Plant lifetime"
        unit="years"
        register={register("plant_lifetime_years", { valueAsNumber: true })}
        error={errors.plant_lifetime_years?.message}
      />
    </div>
  </div>
</section>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: PASS (6 tests).

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/new-version-form.tsx apps/web/components/new-version-form.test.tsx
git commit -m "feat: add energy losses section with all 15 fields"
```

---

## Task 8: Submit Flow + Error Handling

**Files:**
- Modify: `apps/web/components/new-version-form.test.tsx`

The `onSubmit` logic is already implemented in Task 3 (the skeleton). This task adds tests that exercise the full submit path and verifies the correct payload shape and error display.

- [ ] **Step 1: Add submit + error tests**

Add to `apps/web/components/new-version-form.test.tsx`:

```tsx
import { ApiError } from "@renewable-energy/api-client"

test("calls mutateAsync with correct inputSnapshot and redirects on success", async () => {
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const file = new File(["x"], "boundary.kmz", {})
  await act(async () => {
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [file] } },
    )
  })
  await act(async () => { fireEvent.submit(document.querySelector("form")!) })
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: "prj_1",
      kmzFile: file,
      inputSnapshot: expect.objectContaining({
        module_length: 2.38,
        module_width: 1.13,
        module_wattage: 580,
        orientation: "portrait",
        tilt_angle: null,
        row_spacing: null,
        gcr: null,
        perimeter_road_width: 6.0,
        max_strings_per_inverter: 20,
        inverter_efficiency_pct: 97.0,
      }),
    }),
  ))
  expect(mockPush).toHaveBeenCalledWith("/dashboard/projects/prj_1/versions/ver_1")
})

test("shows network error alert when API call fails with NETWORK_ERROR", async () => {
  mockMutateAsync.mockRejectedValueOnce(
    Object.assign(new Error("fail"), { code: "NETWORK_ERROR", name: "ApiError" }),
  )
  render(<NewVersionForm projectId="prj_1" />, { wrapper: createWrapper() })
  const file = new File(["x"], "boundary.kmz", {})
  await act(async () => {
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [file] } },
    )
  })
  await act(async () => { fireEvent.submit(document.querySelector("form")!) })
  await waitFor(() =>
    expect(
      screen.getByText(/Layout submission failed.*Could not reach/i),
    ).toBeDefined(),
  )
})
```

Add `mockPush` to the top-level mock declarations in the test file:

```tsx
const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))
```

And add `mockPush` to `beforeEach`:

```tsx
beforeEach(() => {
  vi.clearAllMocks()
  mockMutateAsync.mockResolvedValue({ id: "ver_1", projectId: "prj_1" })
})
```

- [ ] **Step 2: Run new tests to verify they pass (logic is already in place)**

```bash
bunx turbo test --filter=web -- --reporter=verbose new-version-form
```

Expected: PASS (8 tests).

- [ ] **Step 3: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/new-version-form.test.tsx
git commit -m "test: add submit payload and error handling tests for NewVersionForm"
```

---

## Task 9: Page Component

**Files:**
- Create: `apps/web/app/(main)/dashboard/projects/[projectId]/new-version/page.tsx`

No unit test needed — it's a thin wrapper. The build step verifies it.

- [ ] **Step 1: Create the page**

Create `apps/web/app/(main)/dashboard/projects/[projectId]/new-version/page.tsx`:

```tsx
"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
import { useProject } from "@/hooks/use-project"
import { NewVersionForm } from "@/components/new-version-form"

export default function NewVersionPage() {
  const params = useParams()
  const projectId = params["projectId"] as string
  const { setBreadcrumbs } = useBreadcrumbs()
  const { data: project } = useProject(projectId)

  React.useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/dashboard/projects" },
      {
        label: project?.name ?? "Project",
        href: `/dashboard/projects/${projectId}`,
      },
      { label: "New run" },
    ])
  }, [setBreadcrumbs, project?.name, projectId])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">New run</h1>
      <NewVersionForm projectId={projectId} />
    </div>
  )
}
```

- [ ] **Step 2: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass. Verify `/dashboard/projects/[projectId]/new-version` appears in the build output route list.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(main)/dashboard/projects/[projectId]/new-version/page.tsx"
git commit -m "feat: add new-version page with breadcrumbs"
```

---

## Task 10: Tooltips

**Files:**
- Modify: `apps/web/components/new-version-form.tsx`

No unit test — tooltip markup is verified by visual acceptance criterion.

Tooltip source: desktop app `input_panel.py` tooltip strings, adapted to web context.

- [ ] **Step 1: Add tooltip imports**

Add to the imports in `new-version-form.tsx`:

```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renewable-energy/ui/components/tooltip"
import { Info } from "lucide-react"
```

- [ ] **Step 2: Update NumericField to accept an optional tooltip**

Replace the existing `NumericField` function with:

```tsx
function NumericField({
  id,
  label,
  unit,
  tooltip,
  register: reg,
  error,
}: {
  id: string
  label: string
  unit?: string
  tooltip?: string
  register: ReturnType<typeof useForm<NewVersionFormValues>["register"]>
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-xs">{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" step="any" className="flex-1" {...reg} />
        {unit && <span className="text-sm text-muted-foreground shrink-0">{unit}</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Update OverrideField to accept tooltip**

Replace `OverrideField` with:

```tsx
function OverrideField({
  id, label, unit, tooltip, enabled, onToggle, field, error,
}: {
  id: string
  label: string
  unit?: string
  tooltip?: string
  enabled: boolean
  onToggle: (on: boolean) => void
  field: { value: number | null; onChange: (v: number | null) => void }
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Switch
          id={`${id}-switch`}
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`Override ${label}`}
        />
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id} className={enabled ? "" : "text-muted-foreground"}>
            {label}
          </Label>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          step="any"
          disabled={!enabled}
          placeholder="Auto"
          value={field.value ?? ""}
          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
          className="flex-1"
        />
        {unit && <span className="text-sm text-muted-foreground shrink-0">{unit}</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Add tooltip strings to all field call sites**

In the **Module section**, update call sites:

```tsx
<NumericField
  id="module-length"
  label="Module length"
  unit="m"
  tooltip="Length of the module along the long side (2-up portrait). Typical: 2.3–2.5 m for 72-cell modules."
  register={register("module_length", { valueAsNumber: true })}
  error={errors.module_length?.message}
/>
<NumericField
  id="module-width"
  label="Module width"
  unit="m"
  tooltip="Width of the module along the short side. Typical: 1.0–1.2 m."
  register={register("module_width", { valueAsNumber: true })}
  error={errors.module_width?.message}
/>
<NumericField
  id="module-wattage"
  label="Wattage"
  unit="Wp"
  tooltip="Module peak wattage under standard test conditions (STC). Used for capacity and energy calculations."
  register={register("module_wattage", { valueAsNumber: true })}
  error={errors.module_wattage?.message}
/>
```

In the **Table config section**:

```tsx
<NumericField
  id="modules-in-row"
  label="Modules per row"
  tooltip="Number of modules connected in series within a single string (one row of a table)."
  register={register("modules_in_row", { valueAsNumber: true })}
  error={errors.modules_in_row?.message}
/>
<NumericField
  id="rows-per-table"
  label="Rows per table"
  tooltip="Number of parallel strings stacked in a table. 2 rows = 2-portrait, 1 row = 1-portrait."
  register={register("rows_per_table", { valueAsNumber: true })}
  error={errors.rows_per_table?.message}
/>
<NumericField
  id="table-gap-ew"
  label="East–west gap"
  unit="m"
  tooltip="Horizontal gap between adjacent tables in the east–west direction. Allows maintenance access."
  register={register("table_gap_ew", { valueAsNumber: true })}
  error={errors.table_gap_ew?.message}
/>
```

In the **Layout section**, update OverrideField calls:

```tsx
<OverrideField
  id="tilt-angle"
  label="Tilt angle"
  unit="°"
  tooltip="Panel tilt from horizontal. Auto-computes the optimal tilt from site latitude using 0.76 × |lat| + 3.1°, clipped to 5–40°. Override only if project specs require a fixed tilt."
  ...
/>
<OverrideField
  id="row-spacing"
  label="Row pitch"
  unit="m"
  tooltip="Centre-to-centre distance between table rows. Auto-computes from shadow geometry at winter solstice. Override to match a specific GCR or spacing constraint."
  ...
/>
<OverrideField
  id="gcr"
  label="GCR"
  tooltip="Ground Coverage Ratio: table height ÷ row pitch. If set, overrides the auto-computed row pitch. Higher GCR = denser layout; typical range 0.3–0.5."
  ...
/>
<NumericField
  id="road-width"
  label="Perimeter road width"
  unit="m"
  tooltip="Width of the perimeter road inset from the site boundary. The engine excludes this band from panel placement."
  register={register("perimeter_road_width", { valueAsNumber: true })}
  error={errors.perimeter_road_width?.message}
/>
```

In the **Inverter section**:

```tsx
<NumericField
  id="max-strings"
  label="Max strings per inverter"
  tooltip="Maximum number of solar strings connectable to a single inverter. 1 string = 1 row of modules in a table. Check your inverter datasheet."
  register={register("max_strings_per_inverter", { valueAsNumber: true })}
  error={errors.max_strings_per_inverter?.message}
/>
```

In the **Energy losses section**, add tooltip prop to each `NumericField`:

```tsx
// Irradiance
<NumericField id="ghi" label="GHI" unit="kWh/m²/yr"
  tooltip="Global Horizontal Irradiance — annual solar energy on a horizontal surface. Obtain from PVGIS or NASA POWER for the site location."
  ... />
<NumericField id="gti" label="GTI (in-plane)" unit="kWh/m²/yr"
  tooltip="Global Tilted Irradiance — annual in-plane irradiance at the panel tilt. Higher than GHI for optimally tilted surfaces. Obtain from PVGIS or enter manually."
  ... />
// PR breakdown
<NumericField id="inverter-efficiency" label="Inverter efficiency" unit="%"
  tooltip="Inverter DC→AC conversion efficiency. Typical: 96–98 % for modern string inverters."
  ... />
<NumericField id="dc-cable-loss" label="DC cable losses" unit="%"
  tooltip="DC wiring losses from module terminals to inverter input. Typical: 1.5–2.5 %."
  ... />
<NumericField id="ac-cable-loss" label="AC cable losses" unit="%"
  tooltip="AC wiring losses from inverter output to metering point. Typical: 0.5–1.5 %."
  ... />
<NumericField id="soiling-loss" label="Soiling losses" unit="%"
  tooltip="Losses from dust, bird droppings, and surface contamination. Typical: 2–6 % in Indian conditions."
  ... />
<NumericField id="temperature-loss" label="Temperature losses" unit="%"
  tooltip="Module power derating at elevated cell temperature. Typical: 5–8 % in hot climates. Depends on NOCT and temperature coefficient."
  ... />
<NumericField id="mismatch-loss" label="Module mismatch" unit="%"
  tooltip="Power loss from mismatch between modules in a string. Typical: 1–3 %."
  ... />
<NumericField id="shading-loss" label="Shading losses" unit="%"
  tooltip="Near-shading losses from obstructions and horizon profile. Typical: 1–3 % in open sites."
  ... />
<NumericField id="availability" label="Availability" unit="%"
  tooltip="Plant availability factor accounting for scheduled and unscheduled downtime. Typical: 97–99 %."
  ... />
<NumericField id="transformer-loss" label="Transformer losses" unit="%"
  tooltip="MV transformer losses. Typical: 0.5–1.5 %."
  ... />
<NumericField id="other-loss" label="Other losses" unit="%"
  tooltip="Monitoring, auxiliary consumption, and miscellaneous losses. Typical: 0.5–1 %."
  ... />
// Degradation
<NumericField id="first-year-deg" label="1st year degradation" unit="%"
  tooltip="First-year LID (Light Induced Degradation). Typical: 1.5–3 % for mono-PERC and HJT modules."
  ... />
<NumericField id="annual-deg" label="Annual degradation" unit="%/yr"
  tooltip="Annual power degradation from Year 2 onwards. Typical: 0.4–0.7 %/year for premium modules."
  ... />
<NumericField id="plant-lifetime" label="Plant lifetime" unit="years"
  tooltip="Design lifetime for energy yield forecasting. Standard: 25 years. Use 30 for bankability projections."
  ... />
```

- [ ] **Step 5: Run full gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/new-version-form.tsx
git commit -m "feat: add tooltips to all 27 form fields"
```

---

## Task 11: Final Gate Check + Push

- [ ] **Step 1: Run full gate suite from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 2: Verify route in build output**

Check that the build output includes:
```
├ ○ /dashboard/projects/[projectId]/new-version
```
(Static or dynamic — either is acceptable.)

- [ ] **Step 3: Push branch**

```bash
git push -u origin spike-4c
```

---

## Acceptance Criteria Checklist (Human Verification)

These must be verified by a human in a running environment:

- [ ] All 27 parameters visible with correct defaults on page load
- [ ] Every parameter tooltip visible on hover/click
- [ ] Auto-override fields show "Auto" placeholder when switch is off; input activates when switch is on
- [ ] KMZ drag-and-drop: drop a `.kmz` file → filename and size displayed
- [ ] Submit without KMZ → "KMZ file is required." inline error
- [ ] Submit with defaults → version created → redirected to version detail page
- [ ] Desktop (≥1024px): sticky left-nav visible; clicking section links scrolls to section; active section highlighted
- [ ] Mobile (≤768px): chip nav visible; left-nav hidden; "Run layout" button at bottom
- [ ] API error → domain-specific alert above submit button
- [ ] Verified in local dev and production
