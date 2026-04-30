# Spike 6 — Artifact Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KMZ, DXF, and SVG download buttons below the SVG preview on the version detail page.

**Architecture:** Add three new pre-signed URL fields to `VersionDetail` (shared type → API → web). Add `getPresignedDownloadUrl` helper in `s3.ts` that forces `Content-Disposition: attachment`. Render a download toolbar in `CompleteState` using shadcn `Button asChild` + `<a>` tags.

**Tech Stack:** TypeScript, Hono API, AWS S3 SDK (`@aws-sdk/s3-request-presigner`), Next.js 16, shadcn/ui, lucide-react, Vitest.

---

## File Map

| File | Change |
|---|---|
| `packages/shared/src/types/project.ts` | Add `kmzPresignedUrl`, `dxfPresignedUrl`, `svgDownloadUrl` to `VersionDetail` |
| `apps/api/src/lib/s3.ts` | Add `getPresignedDownloadUrl(key, filename)` |
| `apps/api/src/modules/projects/projects.service.ts` | Update `ShapedVersion`, generate download URLs in `getVersion`, null-fill in `listVersions` and `createVersion` |
| `apps/web/components/version-detail.tsx` | Add download toolbar in `CompleteState` |
| `apps/api/src/modules/projects/projects.test.ts` | Add `getPresignedDownloadUrl` to s3 mock; add `getVersion` tests for new URLs |
| `apps/web/components/version-detail.test.tsx` | Add new fields to fixtures; add toolbar render tests |

---

## Task 1: Add new fields to `VersionDetail` shared type

**Files:**
- Modify: `packages/shared/src/types/project.ts`

- [ ] **Step 1: Add the three new fields to `VersionDetail`**

Open `packages/shared/src/types/project.ts`. The current `VersionDetail` ends with `svgPresignedUrl: string | null`. Add three fields after it:

```ts
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
  svgPresignedUrl: string | null
  kmzPresignedUrl: string | null
  dxfPresignedUrl: string | null
  svgDownloadUrl: string | null
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
bunx turbo typecheck --filter=@renewable-energy/shared
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/project.ts
git commit -m "feat: add kmzPresignedUrl, dxfPresignedUrl, svgDownloadUrl to VersionDetail"
```

---

## Task 2: Add `getPresignedDownloadUrl` to s3.ts

**Files:**
- Modify: `apps/api/src/lib/s3.ts`

This is a new helper that generates a pre-signed URL with `ResponseContentDisposition: attachment; filename="<filename>"` so the browser saves the file rather than opening it.

- [ ] **Step 1: Add `getPresignedDownloadUrl` to `apps/api/src/lib/s3.ts`**

Add this function after `getPresignedUrl`:

```ts
export async function getPresignedDownloadUrl(
  key: string,
  filename: string,
  expiresIn = 3600,
): Promise<string | null> {
  const client = getS3()
  if (!client || !env.S3_ARTIFACTS_BUCKET) return null

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.S3_ARTIFACTS_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn },
  )
}
```

No new imports needed — `GetObjectCommand` and `getSignedUrl` are already imported.

- [ ] **Step 2: Verify typecheck passes**

```bash
bunx turbo typecheck --filter=@renewable-energy/api
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/s3.ts
git commit -m "feat: add getPresignedDownloadUrl helper with Content-Disposition attachment"
```

---

## Task 3: Update projects.service.ts + tests

**Files:**
- Modify: `apps/api/src/modules/projects/projects.service.ts`
- Modify: `apps/api/src/modules/projects/projects.test.ts`

### 3a: Update the service

- [ ] **Step 1: Update the import in `projects.service.ts`**

Line 2 currently reads:
```ts
import { uploadToS3, getPresignedUrl } from "../../lib/s3.js"
```

Change to:
```ts
import { uploadToS3, getPresignedUrl, getPresignedDownloadUrl } from "../../lib/s3.js"
```

- [ ] **Step 2: Update `ShapedVersion` type**

Line 20 currently reads:
```ts
type ShapedVersion = Omit<VersionDetail, "svgPresignedUrl">
```

Change to:
```ts
type ShapedVersion = Omit<VersionDetail, "svgPresignedUrl" | "kmzPresignedUrl" | "dxfPresignedUrl" | "svgDownloadUrl">
```

- [ ] **Step 3: Update `listVersions` to null-fill new fields**

Find the block in `listVersions` that maps versions (around line 209). Currently:
```ts
items: (versions as Parameters<typeof shapeVersion>[0][]).map((v) => ({
  ...shapeVersion(v),
  svgPresignedUrl: null,
})),
```

Change to:
```ts
items: (versions as Parameters<typeof shapeVersion>[0][]).map((v) => ({
  ...shapeVersion(v),
  svgPresignedUrl: null,
  kmzPresignedUrl: null,
  dxfPresignedUrl: null,
  svgDownloadUrl: null,
})),
```

- [ ] **Step 4: Update `createVersion` to null-fill new fields**

Find the return at the end of `createVersion` (around line 296). Currently:
```ts
return { ...shapeVersion({ ...version, kmzS3Key, layoutJob, energyJob }), svgPresignedUrl: null }
```

Change to:
```ts
return {
  ...shapeVersion({ ...version, kmzS3Key, layoutJob, energyJob }),
  svgPresignedUrl: null,
  kmzPresignedUrl: null,
  dxfPresignedUrl: null,
  svgDownloadUrl: null,
}
```

- [ ] **Step 5: Update `getVersion` to generate all download URLs**

Find `getVersion` (around line 299). Currently the return is:
```ts
const shaped = shapeVersion(version)
return {
  ...shaped,
  svgPresignedUrl: version.layoutJob?.svgArtifactS3Key
    ? await getPresignedUrl(version.layoutJob.svgArtifactS3Key)
    : null,
}
```

Replace with:
```ts
const shaped = shapeVersion(version)
const svgKey = version.layoutJob?.svgArtifactS3Key ?? null
const kmzKey = version.layoutJob?.kmzArtifactS3Key ?? null
const dxfKey = version.layoutJob?.dxfArtifactS3Key ?? null
return {
  ...shaped,
  svgPresignedUrl: svgKey ? await getPresignedUrl(svgKey) : null,
  svgDownloadUrl: svgKey ? await getPresignedDownloadUrl(svgKey, "layout.svg") : null,
  kmzPresignedUrl: kmzKey ? await getPresignedDownloadUrl(kmzKey, "layout.kmz") : null,
  dxfPresignedUrl: dxfKey ? await getPresignedDownloadUrl(dxfKey, "layout.dxf") : null,
}
```

- [ ] **Step 6: Run typecheck**

```bash
bunx turbo typecheck --filter=@renewable-energy/api
```

Expected: 0 errors.

### 3b: Update the tests

- [ ] **Step 7: Add `getPresignedDownloadUrl` to the s3 mock in `projects.test.ts`**

In `apps/api/src/modules/projects/projects.test.ts`, find the mock setup (around line 138):
```ts
const mockGetPresignedUrl = mock(() =>
  Promise.resolve("https://s3.example.com/presigned-url"),
)
mock.module("../../lib/s3.js", () => ({
  uploadToS3: mock(() => Promise.resolve()),
  getPresignedUrl: mockGetPresignedUrl,
}))
```

Add `mockGetPresignedDownloadUrl` and include it in the mock:
```ts
const mockGetPresignedUrl = mock(() =>
  Promise.resolve("https://s3.example.com/presigned-url"),
)
const mockGetPresignedDownloadUrl = mock(() =>
  Promise.resolve("https://s3.example.com/download-url"),
)
mock.module("../../lib/s3.js", () => ({
  uploadToS3: mock(() => Promise.resolve()),
  getPresignedUrl: mockGetPresignedUrl,
  getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
}))
```

- [ ] **Step 8: Add `mockGetPresignedDownloadUrl.mockClear()` to the `getVersion` `beforeEach`**

In the `describe("getVersion")` block, find the `beforeEach` (around line 372):
```ts
beforeEach(() => {
  mockProjectFindUnique.mockClear()
  mockVersionFindUnique.mockClear()
  mockGetPresignedUrl.mockClear()
})
```

Add the new mock clear:
```ts
beforeEach(() => {
  mockProjectFindUnique.mockClear()
  mockVersionFindUnique.mockClear()
  mockGetPresignedUrl.mockClear()
  mockGetPresignedDownloadUrl.mockClear()
})
```

- [ ] **Step 9: Add tests for the new download URL fields**

At the end of the `describe("getVersion")` block, add these tests after the existing `svgPresignedUrl` tests:

```ts
test("getVersion includes null download URLs when all artifact keys are null", async () => {
  // mockVersionFindUnique default returns layoutJob: null
  const result = await getVersion(mockDbVersion.id, mockDbProject.userId)
  expect(result.kmzPresignedUrl).toBeNull()
  expect(result.dxfPresignedUrl).toBeNull()
  expect(result.svgDownloadUrl).toBeNull()
})

test("getVersion generates kmzPresignedUrl, dxfPresignedUrl, svgDownloadUrl when artifact keys are set", async () => {
  mockGetPresignedUrl.mockResolvedValueOnce("https://s3.example.com/svg-preview-url")
  mockGetPresignedDownloadUrl
    .mockResolvedValueOnce("https://s3.example.com/svg-download-url")
    .mockResolvedValueOnce("https://s3.example.com/kmz-download-url")
    .mockResolvedValueOnce("https://s3.example.com/dxf-download-url")
  mockVersionFindUnique.mockResolvedValueOnce({
    ...mockDbVersion,
    project: { userId: mockDbProject.userId },
    layoutJob: {
      id: "ljo_testLayoutJob000000000000000000000000",
      status: "COMPLETE",
      kmzArtifactS3Key: "output/layout.kmz",
      svgArtifactS3Key: "output/layout.svg",
      dxfArtifactS3Key: "output/layout.dxf",
      statsJson: null,
      errorDetail: null,
      startedAt: null,
      completedAt: null,
    },
    energyJob: null,
  } as any)
  const result = await getVersion(mockDbVersion.id, mockDbProject.userId)
  expect(result.svgPresignedUrl).toBe("https://s3.example.com/svg-preview-url")
  expect(result.svgDownloadUrl).toBe("https://s3.example.com/svg-download-url")
  expect(result.kmzPresignedUrl).toBe("https://s3.example.com/kmz-download-url")
  expect(result.dxfPresignedUrl).toBe("https://s3.example.com/dxf-download-url")
  expect(mockGetPresignedUrl).toHaveBeenCalledWith("output/layout.svg")
  expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith("output/layout.svg", "layout.svg")
  expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith("output/layout.kmz", "layout.kmz")
  expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith("output/layout.dxf", "layout.dxf")
})
```

- [ ] **Step 10: Run the API tests**

```bash
bunx turbo test --filter=@renewable-energy/api
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/projects/projects.service.ts apps/api/src/modules/projects/projects.test.ts
git commit -m "feat: generate kmz/dxf/svg download URLs in getVersion"
```

---

## Task 4: Add download toolbar to version-detail.tsx + tests

**Files:**
- Modify: `apps/web/components/version-detail.tsx`
- Modify: `apps/web/components/version-detail.test.tsx`

### 4a: Update the component

- [ ] **Step 1: Add `Download` to the lucide-react import in `version-detail.tsx`**

Find the lucide-react import at the top of `apps/web/components/version-detail.tsx`. It currently imports various icons. Add `Download`:

```ts
import { Download, /* ...existing icons... */ } from "lucide-react"
```

(Keep all existing icons — just add `Download` to the list.)

- [ ] **Step 2: Add the download toolbar in `CompleteState`**

In `CompleteState`, find the block that renders `<SvgPreview>`:
```tsx
{version.svgPresignedUrl && (
  <SvgPreview svgUrl={version.svgPresignedUrl} />
)}
```

Add the download toolbar immediately after it (still inside the `{stats ? (<>...</>) }` branch):
```tsx
{version.svgPresignedUrl && (
  <SvgPreview svgUrl={version.svgPresignedUrl} />
)}
{(version.kmzPresignedUrl || version.dxfPresignedUrl || version.svgDownloadUrl) && (
  <div className="flex gap-2">
    {version.kmzPresignedUrl && (
      <Button asChild variant="outline" size="sm">
        <a href={version.kmzPresignedUrl} download="layout.kmz">
          <Download className="mr-2 h-4 w-4" />
          KMZ
        </a>
      </Button>
    )}
    {version.dxfPresignedUrl && (
      <Button asChild variant="outline" size="sm">
        <a href={version.dxfPresignedUrl} download="layout.dxf">
          <Download className="mr-2 h-4 w-4" />
          DXF
        </a>
      </Button>
    )}
    {version.svgDownloadUrl && (
      <Button asChild variant="outline" size="sm">
        <a href={version.svgDownloadUrl} download="layout.svg">
          <Download className="mr-2 h-4 w-4" />
          SVG
        </a>
      </Button>
    )}
  </div>
)}
```

- [ ] **Step 3: Run typecheck**

```bash
bunx turbo typecheck --filter=@renewable-energy/web
```

Expected: 0 errors.

### 4b: Update the tests

- [ ] **Step 4: Add new URL fields to fixtures in `version-detail.test.tsx`**

In `apps/web/components/version-detail.test.tsx`, find `BASE_VERSION`. It currently ends with `svgPresignedUrl: null`. Add the three new fields:

```ts
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
  svgPresignedUrl: null,
  kmzPresignedUrl: null,
  dxfPresignedUrl: null,
  svgDownloadUrl: null,
}
```

(`COMPLETE_VERSION`, `ENERGY_COMPLETE_VERSION`, and `SVG_VERSION` spread from `BASE_VERSION` so they inherit the new null fields automatically.)

- [ ] **Step 5: Add a fixture with all download URLs set**

After the existing `SVG_VERSION` constant, add:

```ts
const DOWNLOAD_VERSION: VersionDetailType = {
  ...COMPLETE_VERSION,
  kmzPresignedUrl: "https://s3.example.com/layout.kmz?X-Amz-Expires=3600",
  dxfPresignedUrl: "https://s3.example.com/layout.dxf?X-Amz-Expires=3600",
  svgDownloadUrl: "https://s3.example.com/layout.svg?download=1&X-Amz-Expires=3600",
}
```

- [ ] **Step 6: Add tests for the download toolbar**

Add these tests at the end of the test file:

```ts
test("renders all three download buttons when all download URLs are set", () => {
  mockUseVersion.mockReturnValue({
    data: DOWNLOAD_VERSION,
    isLoading: false,
    error: null,
  } as any)
  render(
    <VersionDetail projectId="prj_123" versionId="ver_1" />,
    { wrapper: createWrapper() },
  )
  expect(screen.getByRole("link", { name: /kmz/i })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: /dxf/i })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: /svg/i })).toBeInTheDocument()
})

test("KMZ download link has correct href and download attribute", () => {
  mockUseVersion.mockReturnValue({
    data: DOWNLOAD_VERSION,
    isLoading: false,
    error: null,
  } as any)
  render(
    <VersionDetail projectId="prj_123" versionId="ver_1" />,
    { wrapper: createWrapper() },
  )
  const kmzLink = screen.getByRole("link", { name: /kmz/i })
  expect(kmzLink).toHaveAttribute("href", DOWNLOAD_VERSION.kmzPresignedUrl)
  expect(kmzLink).toHaveAttribute("download", "layout.kmz")
})

test("download toolbar not rendered when all download URLs are null", () => {
  mockUseVersion.mockReturnValue({
    data: COMPLETE_VERSION,
    isLoading: false,
    error: null,
  } as any)
  render(
    <VersionDetail projectId="prj_123" versionId="ver_1" />,
    { wrapper: createWrapper() },
  )
  expect(screen.queryByRole("link", { name: /kmz/i })).not.toBeInTheDocument()
  expect(screen.queryByRole("link", { name: /dxf/i })).not.toBeInTheDocument()
  expect(screen.queryByRole("link", { name: /svg/i })).not.toBeInTheDocument()
})

test("only renders buttons for non-null download URLs", () => {
  mockUseVersion.mockReturnValue({
    data: { ...DOWNLOAD_VERSION, dxfPresignedUrl: null },
    isLoading: false,
    error: null,
  } as any)
  render(
    <VersionDetail projectId="prj_123" versionId="ver_1" />,
    { wrapper: createWrapper() },
  )
  expect(screen.getByRole("link", { name: /kmz/i })).toBeInTheDocument()
  expect(screen.queryByRole("link", { name: /dxf/i })).not.toBeInTheDocument()
  expect(screen.getByRole("link", { name: /svg/i })).toBeInTheDocument()
})
```

- [ ] **Step 7: Run the web tests**

```bash
bunx turbo test --filter=@renewable-energy/web
```

Expected: all tests pass.

- [ ] **Step 8: Run the full gate**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/version-detail.tsx apps/web/components/version-detail.test.tsx
git commit -m "feat: add KMZ/DXF/SVG download toolbar to version detail CompleteState"
```
