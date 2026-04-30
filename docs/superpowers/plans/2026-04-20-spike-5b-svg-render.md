# Spike 5b — SVG Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an SVG layout preview to the version detail `CompleteState` — fetched client-side from a pre-signed S3 URL, sanitized with DOMPurify, rendered inline with 90° rotation support.

**Architecture:** Four file changes. No new API endpoint. `VersionDetail` shared type gains `svgPresignedUrl: string | null`. `getVersion` in `projects.service.ts` appends the pre-signed URL after calling the synchronous `shapeVersion()`. A new `SvgPreview` component handles fetch/sanitize/render/rotate. `version-detail.tsx` mounts `SvgPreview` above the stats grid when the URL is present.

**Tech Stack:** Next.js 16 App Router, React 19, DOMPurify, lucide-react, Vitest + React Testing Library, Bun test (API side), shadcn Button from `@renewable-energy/ui`

---

## File Map

| Action | File |
|---|---|
| Modify | `packages/shared/src/types/project.ts` |
| Modify | `apps/api/src/modules/projects/projects.service.ts` |
| Modify | `apps/api/src/modules/projects/projects.test.ts` |
| Create | `apps/web/components/svg-preview.tsx` |
| Create | `apps/web/components/svg-preview.test.tsx` |
| Modify | `apps/web/components/version-detail.tsx` |
| Modify | `apps/web/components/version-detail.test.tsx` |

---

## Task 1: Shared type + API layer

**Files:**
- Modify: `packages/shared/src/types/project.ts`
- Modify: `apps/api/src/modules/projects/projects.service.ts`
- Modify: `apps/api/src/modules/projects/projects.test.ts`

- [ ] **Step 1: Write the failing API test**

Open `apps/api/src/modules/projects/projects.test.ts`. The file currently mocks `../../lib/s3.js` anonymously. Refactor the mock to expose a named handle, then add a new test for `getVersion` returning `svgPresignedUrl`.

Find the existing `mock.module("../../lib/s3.js", ...)` call and replace it:

```ts
// At the top of the file, alongside other mock.module calls:
const mockGetPresignedUrl = mock.fn(() =>
  Promise.resolve("https://s3.example.com/presigned-url"),
)
mock.module("../../lib/s3.js", () => ({
  getPresignedUrl: mockGetPresignedUrl,
}))
```

In the `describe("getVersion", ...)` block, add `beforeEach(() => mockGetPresignedUrl.mockClear())` if one doesn't exist, then add these two new tests:

```ts
test("getVersion includes svgPresignedUrl: null when svgArtifactS3Key is null", async () => {
  // Use an existing version fixture that has layoutJob.svgArtifactS3Key = null
  // (the existing COMPLETE_VERSION fixture already has svgArtifactS3Key set —
  //  create a variant without it for this test, or check the existing fixture)
  const result = await getVersion("ver_1", "usr_1")
  expect(result.svgPresignedUrl).toBeNull()
})

test("getVersion includes svgPresignedUrl when svgArtifactS3Key is set", async () => {
  mockGetPresignedUrl.mockResolvedValueOnce(
    "https://s3.example.com/presigned-url",
  )
  // Use a version fixture where layoutJob.svgArtifactS3Key is set
  const result = await getVersion("ver_with_svg", "usr_1")
  expect(result.svgPresignedUrl).toBe("https://s3.example.com/presigned-url")
  expect(mockGetPresignedUrl).toHaveBeenCalledWith("output/layout.svg")
})
```

Note: Adjust fixture DB mocks as needed to match the actual test setup in the file (read the file first to see what mock DB setup is used for `getVersion`).

- [ ] **Step 2: Run API tests — confirm new tests fail**

```bash
bunx turbo test --filter=api
```

Expected: the two new tests fail (type error or `svgPresignedUrl` undefined).

- [ ] **Step 3: Add `svgPresignedUrl` to shared `VersionDetail` type**

In `packages/shared/src/types/project.ts`, add one field to the `VersionDetail` interface:

```ts
export interface VersionDetail {
  // ... existing fields unchanged ...
  svgPresignedUrl: string | null   // pre-signed S3 URL for SVG layout preview; null if not available
}
```

Re-export is already handled by `packages/shared/src/index.ts` — no change needed there.

- [ ] **Step 4: Rebuild shared and api-client**

```bash
cd packages/shared && bun run build
cd ../api-client && bun run build
```

(or from repo root: `bunx turbo build --filter=@renewable-energy/shared --filter=@renewable-energy/api-client`)

- [ ] **Step 5: Update `getVersion` in `projects.service.ts`**

In `apps/api/src/modules/projects/projects.service.ts`:

1. Add `getPresignedUrl` to the import from `../../lib/s3.js` (line near top of file):

```ts
import { getPresignedUrl } from "../../lib/s3.js"
```

2. In the `getVersion` function, replace the final `return shapeVersion(version)` (or equivalent) with:

```ts
const shaped = shapeVersion(version)
return {
  ...shaped,
  svgPresignedUrl: version.layoutJob?.svgArtifactS3Key
    ? await getPresignedUrl(version.layoutJob.svgArtifactS3Key)
    : null,
}
```

The function signature stays `async` (it was already async for the DB call). `shapeVersion` stays synchronous — do not change it.

- [ ] **Step 6: Run API tests — confirm they pass**

```bash
bunx turbo test --filter=api
```

Expected: all tests pass including the two new `svgPresignedUrl` tests.

- [ ] **Step 7: Run gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types/project.ts \
        apps/api/src/modules/projects/projects.service.ts \
        apps/api/src/modules/projects/projects.test.ts
git commit -m "feat(5b): add svgPresignedUrl to VersionDetail type and getVersion response"
```

---

## Task 2: SvgPreview component

**Files:**
- Create: `apps/web/components/svg-preview.tsx`
- Create: `apps/web/components/svg-preview.test.tsx`

**Pre-requisite:** Install DOMPurify in `apps/web`:

```bash
cd apps/web && bun add dompurify && bun add -d @types/dompurify
```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/svg-preview.test.tsx`:

```tsx
import { test, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { createWrapper } from "@/tests/test-utils"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

vi.mock("dompurify", () => ({
  default: {
    sanitize: vi.fn((raw: string) => raw),
  },
}))

import DOMPurify from "dompurify"
const mockSanitize = vi.mocked(DOMPurify.sanitize)

const SVG_TEXT = `<svg viewBox="0 0 800 600" width="800" height="600"><rect x="0" y="0" width="800" height="600"/></svg>`
const WIDE_SVG_TEXT = `<svg viewBox="0 0 1200 400" width="1200" height="400"><rect x="0" y="0" width="1200" height="400"/></svg>`

function makeFetch(body: string, ok = true) {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 404,
      text: () => Promise.resolve(body),
    } as Response),
  )
}

// Import AFTER mocks are set up
import { SvgPreview } from "./svg-preview"

test("shows spinner and loading text while fetching", async () => {
  let resolve!: (value: Response) => void
  const pending = new Promise<Response>((r) => { resolve = r })
  vi.stubGlobal("fetch", vi.fn(() => pending))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  expect(screen.getByText(/loading preview/i)).toBeInTheDocument()
  expect(document.querySelector(".animate-spin")).toBeInTheDocument()
})

test("renders sanitized SVG when fetch succeeds", async () => {
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => {
    expect(screen.getByTestId("svg-wrapper")).toBeInTheDocument()
  })
  expect(screen.queryByText(/loading preview/i)).not.toBeInTheDocument()
})

test("shows error state when fetch fails (network error)", async () => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network error"))))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => {
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument()
  })
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
})

test("shows error state when fetch returns non-ok response", async () => {
  vi.stubGlobal("fetch", makeFetch("Not Found", false))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => {
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument()
  })
})

test("shows error state when DOMPurify returns empty string", async () => {
  mockSanitize.mockReturnValue("")
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => {
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument()
  })
})

test("retry button re-triggers fetch", async () => {
  const fetchMock = vi.fn()
    .mockRejectedValueOnce(new Error("fail"))
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(SVG_TEXT),
    } as Response)
  vi.stubGlobal("fetch", fetchMock)
  mockSanitize.mockReturnValue(SVG_TEXT)

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => screen.getByRole("button", { name: /retry/i }))
  fireEvent.click(screen.getByRole("button", { name: /retry/i }))

  await waitFor(() => {
    expect(screen.getByTestId("svg-wrapper")).toBeInTheDocument()
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test("rotate button cycles rotation: 0 → 90 → 180 → 270 → 0", async () => {
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })

  await waitFor(() => screen.getByTestId("svg-wrapper"))

  const wrapper = screen.getByTestId("svg-wrapper")
  const rotateBtn = screen.getByRole("button", { name: /rotate/i })

  expect(wrapper).toHaveStyle("transform: rotate(0deg)")

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(90deg)")

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(180deg)")

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(270deg)")

  fireEvent.click(rotateBtn)
  expect(wrapper).toHaveStyle("transform: rotate(0deg)")
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
bunx turbo test --filter=web
```

Expected: all 7 tests fail (`SvgPreview` not found).

- [ ] **Step 3: Create `svg-preview.tsx`**

Create `apps/web/components/svg-preview.tsx`:

```tsx
"use client"

import * as React from "react"
import DOMPurify from "dompurify"
import { Loader2, ImageOff, RotateCw } from "lucide-react"
import { Button } from "@renewable-energy/ui/components/button"

type Rotation = 0 | 90 | 180 | 270

function parseViewBox(svg: string): { w: number; h: number } | null {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  if (!match || !match[1] || !match[2]) return null
  return { w: parseFloat(match[1]), h: parseFloat(match[2]) }
}

function prepareSvg(sanitized: string): string {
  return sanitized.replace(/<svg([^>]*)>/, (_: string, attrs: string) => {
    const stripped = attrs
      .replace(/\s+width="[^"]*"/, "")
      .replace(/\s+height="[^"]*"/, "")
    return `<svg${stripped} width="100%" height="100%">`
  })
}

interface SvgPreviewProps {
  svgUrl: string
}

export function SvgPreview({ svgUrl }: SvgPreviewProps) {
  const [status, setStatus] = React.useState<"loading" | "loaded" | "error">(
    "loading",
  )
  const [svgContent, setSvgContent] = React.useState("")
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null)
  const [rotation, setRotation] = React.useState<Rotation>(0)
  const [retryCount, setRetryCount] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setSvgContent("")
    setDims(null)

    fetch(svgUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then((raw) => {
        if (cancelled) return
        const sanitized = DOMPurify.sanitize(raw, {
          USE_PROFILES: { svg: true, svgFilters: true },
        })
        if (!sanitized) {
          setStatus("error")
          return
        }
        const viewBox = parseViewBox(sanitized)
        const prepared = prepareSvg(sanitized)
        setSvgContent(prepared)
        setDims(viewBox)
        setStatus("loaded")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [svgUrl, retryCount])

  const isTransposed = rotation === 90 || rotation === 270
  const containerAspect =
    status === "loaded" && dims
      ? isTransposed
        ? dims.h / dims.w
        : dims.w / dims.h
      : 4 / 3

  const rotate = () => setRotation((r) => (((r + 90) % 360) as Rotation))

  const wrapperStyle: React.CSSProperties =
    isTransposed && dims
      ? {
          position: "absolute",
          width: `${(dims.w / dims.h) * 100}%`,
          height: `${(dims.h / dims.w) * 100}%`,
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          transition: "transform 300ms ease",
        }
      : {
          position: "absolute",
          inset: 0,
          transform: `rotate(${rotation}deg)`,
          transition: "transform 300ms ease",
        }

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border bg-muted"
      style={{ aspectRatio: String(containerAspect) }}
    >
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading preview…</p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <ImageOff className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Preview unavailable</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRetryCount((c) => c + 1)}
          >
            Retry
          </Button>
        </div>
      )}
      {status === "loaded" && (
        <>
          <div
            data-testid="svg-wrapper"
            style={wrapperStyle}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
          <button
            onClick={rotate}
            className="absolute right-2 top-2 z-10 rounded-md border bg-background/80 p-1.5 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground"
            aria-label="Rotate preview"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run web tests — confirm they pass**

```bash
bunx turbo test --filter=web
```

Expected: all 7 new `svg-preview` tests pass. No regressions.

- [ ] **Step 5: Run gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/svg-preview.tsx \
        apps/web/components/svg-preview.test.tsx \
        apps/web/package.json \
        bun.lock
git commit -m "feat(5b): add SvgPreview component with DOMPurify sanitization and rotation"
```

---

## Task 3: Wire SvgPreview into version-detail

**Files:**
- Modify: `apps/web/components/version-detail.tsx`
- Modify: `apps/web/components/version-detail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Open `apps/web/components/version-detail.test.tsx` and make the following changes:

1. Add `svgPresignedUrl: null` to `BASE_VERSION`:

```ts
const BASE_VERSION: VersionDetailType = {
  // ... existing fields ...
  svgPresignedUrl: null,   // add this line
}
```

2. Add a new `SVG_VERSION` fixture after `ENERGY_COMPLETE_VERSION`:

```ts
const SVG_VERSION: VersionDetailType = {
  ...COMPLETE_VERSION,
  svgPresignedUrl: "https://s3.example.com/layout.svg?X-Amz-Expires=3600",
}
```

3. Add the mock for `SvgPreview` — place it with the other `vi.mock` calls (before the imports):

```ts
vi.mock("./svg-preview", () => ({
  SvgPreview: () => <div data-testid="svg-preview" />,
}))
```

4. Add two new tests at the bottom of the file:

```ts
test("renders SvgPreview when svgPresignedUrl is set", () => {
  mockUseVersion.mockReturnValue({
    data: SVG_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByTestId("svg-preview")).toBeInTheDocument()
})

test("does not render SvgPreview when svgPresignedUrl is null", () => {
  mockUseVersion.mockReturnValue({
    data: COMPLETE_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.queryByTestId("svg-preview")).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run web tests — confirm new tests fail**

```bash
bunx turbo test --filter=web
```

Expected: the 2 new version-detail tests fail (type error on `BASE_VERSION` missing `svgPresignedUrl`, and `svg-preview` testid not found).

- [ ] **Step 3: Update `version-detail.tsx`**

In `apps/web/components/version-detail.tsx`:

1. Add the import at the top (with other component imports):

```ts
import { SvgPreview } from "./svg-preview"
```

2. In `CompleteState`, inside the `{stats ? (<>...</>) }` branch, add `SvgPreview` above the stats grid:

```tsx
{version.svgPresignedUrl && (
  <SvgPreview svgUrl={version.svgPresignedUrl} />
)}
```

No other changes to `version-detail.tsx`.

- [ ] **Step 4: Run web tests — confirm all pass**

```bash
bunx turbo test --filter=web
```

Expected: all tests pass including the 2 new version-detail tests and all 7 svg-preview tests.

- [ ] **Step 5: Run gates**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/version-detail.tsx \
        apps/web/components/version-detail.test.tsx
git commit -m "feat(5b): mount SvgPreview in CompleteState above stats grid"
```

---

## Task 4: Final verification gate

**Files:** None (verification only)

- [ ] **Step 1: Run full gate from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all four pass with zero errors.

- [ ] **Step 2: Verify test counts**

```bash
bunx turbo test --filter=web
bunx turbo test --filter=api
```

Confirm:
- `svg-preview.test.tsx`: 7 tests pass
- `version-detail.test.tsx`: 2 new tests pass (total +2 from before this spike)
- `projects.test.ts`: 2 new tests pass (total +2 from before this spike)

- [ ] **Step 3: Commit if any stray files remain uncommitted**

```bash
git status
```

If clean: no commit needed. If any files remain: stage and commit with message `chore(5b): cleanup after final gate`.
