# Spike 5b — SVG Preview

## Goal

Add an SVG layout preview to the version detail `CompleteState` — above the stats grid. The SVG is fetched client-side from a pre-signed S3 URL, sanitized with DOMPurify, and rendered inline. Users can rotate the preview in 90° increments. No zoom/pan (Spike 5c).

## Architecture

Four file changes. No new API endpoint.

| File | Role |
|---|---|
| `packages/shared/src/types/project.ts` | Add `svgPresignedUrl: string \| null` to `VersionDetail` |
| `apps/api/src/modules/projects/projects.service.ts` | Call `getPresignedUrl(svgArtifactS3Key)` in `shapeVersion()` |
| `apps/web/components/svg-preview.tsx` | New component — fetch, sanitize, render, rotate |
| `apps/web/components/version-detail.tsx` | Mount `<SvgPreview>` above stats grid in `CompleteState` |

**Tests:**

| File | Role |
|---|---|
| `apps/web/components/svg-preview.test.tsx` | New — loading, loaded, error, rotate states |
| `apps/api/src/modules/projects/projects.test.ts` | Update — `shapeVersion` async, `svgPresignedUrl` field |
| `apps/web/components/version-detail.test.tsx` | Update — add `svgPresignedUrl` to fixture, mock `SvgPreview` |

## `packages/shared` — `VersionDetail` type change

Add one field to `VersionDetail`:

```ts
export interface VersionDetail {
  // ... existing fields unchanged ...
  svgPresignedUrl: string | null   // new
}
```

## API layer — `getVersion()` change

`shapeVersion()` stays synchronous (it is also used by `listVersions` and `createVersion` — making it async would require `Promise.all` in both callers). Instead, `getVersion` in `projects.service.ts` adds the pre-signed URL after calling `shapeVersion`:

```ts
export async function getVersion(versionId: string, userId: string): Promise<VersionDetail> {
  // ... existing DB fetch (unchanged) ...
  const shaped = shapeVersion(version)
  return {
    ...shaped,
    svgPresignedUrl: version.layoutJob?.svgArtifactS3Key
      ? await getPresignedUrl(version.layoutJob.svgArtifactS3Key)
      : null,
  }
}
```

`getPresignedUrl` is already implemented in `apps/api/src/lib/s3.ts` with 1-hour expiry. `shapeVersion`, `listVersions`, and `createVersion` are unchanged.

No changes to the API client (`packages/api-client`) — it picks up the new field automatically via the shared type.

## `SvgPreview` component

New file: `apps/web/components/svg-preview.tsx`

### Props

```ts
interface SvgPreviewProps {
  svgUrl: string
}
```

### Internal state

| State | Type | Description |
|---|---|---|
| `status` | `"loading" \| "loaded" \| "error"` | Fetch lifecycle |
| `svgContent` | `string` | Sanitized SVG markup |
| `rotation` | `0 \| 90 \| 180 \| 270` | Current rotation in degrees |
| `aspectRatio` | `number` | `naturalWidth / naturalHeight` from viewBox |
| `retryCount` | `number` | Incremented on retry to re-trigger `useEffect` |

### Fetch flow

Triggered by `useEffect` on `[svgUrl, retryCount]`:

1. Set `status: "loading"`
2. `fetch(svgUrl)` → `response.text()`
3. `DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } })`
4. If sanitized string is empty → set `status: "error"`, return
5. Parse `viewBox` from sanitized string (regex on `viewBox="0 0 W H"`) to extract `naturalWidth` and `naturalHeight`
6. Strip `width` and `height` attributes from the `<svg>` root tag; add `width="100%" height="100%"`
7. Set `svgContent`, `aspectRatio = naturalWidth / naturalHeight`, `status: "loaded"`
8. On fetch error → set `status: "error"`

### Container sizing

The outer container div uses a CSS `aspect-ratio` property that changes based on rotation:

- `status: "loading"` or `"error"`: `aspect-ratio: 4 / 3` (fixed fallback)
- `status: "loaded"`, rotation 0°/180°: `aspect-ratio: naturalWidth / naturalHeight`
- `status: "loaded"`, rotation 90°/270°: `aspect-ratio: naturalHeight / naturalWidth`

Container: `w-full rounded-lg border overflow-hidden relative`

### Rotation

- Single rotate button — top-right corner of container, icon-only
- Icon: `RotateCw` from `lucide-react`
- Cycles: 0 → 90 → 180 → 270 → 0 on each click
- Applied as `transform: rotate(Ndeg)` on the inner SVG wrapper div
- `transition: transform 300ms ease`
- When rotated 90°/270°, the inner wrapper is sized to fill the container correctly by translating and scaling to compensate for the rotation offset

### Loading state

Centered in the container (flexbox):
- `Loader2` icon from `lucide-react` with `animate-spin`
- Text: `"Loading preview…"` in `text-sm text-muted-foreground`
- Container uses `aspect-ratio: 4/3` — no layout jump when SVG arrives (opacity fade-in on loaded state)

### Error state

Centered in the container:
- `ImageOff` icon from `lucide-react`
- Text: `"Preview unavailable"` in `text-sm text-muted-foreground`
- `Button` (variant `"outline"`, size `"sm"`): `"Retry"` — increments `retryCount`

### Rotate button visibility

Only rendered when `status === "loaded"`. Hidden during loading and error states.

## `version-detail.tsx` change

In `CompleteState`, inside the `{stats ? (<>...</>) }` branch, above the layout stats grid:

```tsx
{version.svgPresignedUrl && (
  <SvgPreview svgUrl={version.svgPresignedUrl} />
)}
```

No other changes to `version-detail.tsx`.

## Error Handling

| Scenario | Behaviour |
|---|---|
| `svgPresignedUrl` is null | `SvgPreview` not mounted — no SVG section shown |
| `svgArtifactS3Key` absent (old run) | `svgPresignedUrl` is null → section hidden |
| Fetch fails (network / S3 error) | Error state with retry button |
| DOMPurify strips all content | Sanitized string is empty → error state |
| Pre-signed URL expires (>1hr on page) | Retry re-fetches with stale URL → error state. Acceptable for now; Spike 6 can add URL refresh on refetch. |

## Testing

### `svg-preview.test.tsx` (new)

Mock `global.fetch` via `mock.module` (bun:test pattern — but this is a Vitest/web test file, so use `vi.spyOn(global, "fetch")`). Mock `dompurify` module.

Tests:
1. Shows spinner and "Loading preview…" while fetching
2. Renders sanitized SVG content when fetch succeeds
3. Shows "Preview unavailable" and retry button when fetch fails
4. Shows error state when DOMPurify returns empty string
5. Clicking rotate button cycles `rotate(0deg)` → `rotate(90deg)` → `rotate(180deg)` → `rotate(270deg)` → `rotate(0deg)`
6. Retry button re-triggers fetch

### `projects.test.ts` updates

- Mock `getPresignedUrl` from `lib/s3` to return a test URL
- Add assertion: `getVersion` response includes `svgPresignedUrl` when `layoutJob.svgArtifactS3Key` is set
- Add assertion: `getVersion` response has `svgPresignedUrl: null` when `svgArtifactS3Key` is null
- `shapeVersion`, `listVersions`, `createVersion` tests are unchanged

### `version-detail.test.tsx` updates

1. Add `svgPresignedUrl: null` to `COMPLETE_VERSION` fixture (and `ENERGY_COMPLETE_VERSION`)
2. Add `svgPresignedUrl: "https://s3.example.com/layout.svg?..."` to a new `SVG_VERSION` fixture
3. Mock `SvgPreview` component: `vi.mock("./svg-preview", () => ({ SvgPreview: () => <div data-testid="svg-preview" /> }))`
4. Add test: `SvgPreview` is rendered when `svgPresignedUrl` is set
5. Add test: `SvgPreview` is not rendered when `svgPresignedUrl` is null

## Out of Scope

- Layer toggles (Spike 5c)
- Zoom/pan (Spike 5c)
- Pre-signed URL refresh after expiry (deferred)
- Download button for SVG/DXF/KMZ artifacts (deferred)
