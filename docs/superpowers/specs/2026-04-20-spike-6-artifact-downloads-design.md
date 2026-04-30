# Spike 6 — Artifact Downloads Design

## Goal

Add a download toolbar to the version detail page that lets users download all three layout artifacts — KMZ, DXF, and SVG — with a single click each. Scope expanded from KMZ-only to all three formats produced by the layout engine.

## Architecture

Four file changes. No new API endpoints. No changes to `packages/api-client` — new fields are picked up automatically via the shared type.

| File | Change |
|---|---|
| `packages/shared/src/types/project.ts` | Add `kmzPresignedUrl: string \| null`, `dxfPresignedUrl: string \| null`, `svgDownloadUrl: string \| null` to `VersionDetail` |
| `apps/api/src/lib/s3.ts` | Add `getPresignedDownloadUrl(key, filename)` — generates a pre-signed URL with `ResponseContentDisposition: attachment; filename="<filename>"` |
| `apps/api/src/modules/projects/projects.service.ts` | Generate all three download URLs in `getVersion()`; `listVersions` and `createVersion` set all three to `null` |
| `apps/web/components/version-detail.tsx` | Add download toolbar in `CompleteState` below `SvgPreview` |

## Shared Type — `VersionDetail`

```ts
export interface VersionDetail {
  // ... existing fields unchanged ...
  svgPresignedUrl: string | null      // existing — inline preview fetch, no Content-Disposition
  kmzPresignedUrl: string | null      // new — download URL with Content-Disposition: attachment
  dxfPresignedUrl: string | null      // new — download URL with Content-Disposition: attachment
  svgDownloadUrl: string | null       // new — download URL with Content-Disposition: attachment
}
```

`svgPresignedUrl` (existing) is kept unchanged — `SvgPreview` fetches the SVG text directly and needs a plain URL. `svgDownloadUrl` is a separate pre-signed URL for the same S3 key but with `Content-Disposition: attachment` so the browser saves the file.

## API Layer — `s3.ts`

New helper alongside the existing `getPresignedUrl`:

```ts
export async function getPresignedDownloadUrl(
  key: string,
  filename: string,
): Promise<string> {
  // GetObjectCommand with ResponseContentDisposition: `attachment; filename="${filename}"`
  // Same 1-hour expiry as getPresignedUrl
}
```

## API Layer — `getVersion` changes

```ts
export async function getVersion(versionId: string, userId: string): Promise<VersionDetail> {
  // ... existing DB fetch unchanged ...
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
}
```

`listVersions` and `createVersion` set all four URL fields to `null` (unchanged behaviour — they don't generate pre-signed URLs).

## Web Component — Download Toolbar

Rendered in `CompleteState` in `version-detail.tsx`, below `<SvgPreview>`. Only rendered when `layoutJob?.status === "COMPLETE"` (already the condition for the whole `CompleteState`). Each button only rendered when its URL is non-null.

```tsx
<div className="flex gap-2">
  {version.kmzPresignedUrl && (
    <Button asChild variant="outline" size="sm">
      <a href={version.kmzPresignedUrl} download="layout.kmz">
        <Download className="mr-2 h-4 w-4" /> KMZ
      </a>
    </Button>
  )}
  {version.dxfPresignedUrl && (
    <Button asChild variant="outline" size="sm">
      <a href={version.dxfPresignedUrl} download="layout.dxf">
        <Download className="mr-2 h-4 w-4" /> DXF
      </a>
    </Button>
  )}
  {version.svgDownloadUrl && (
    <Button asChild variant="outline" size="sm">
      <a href={version.svgDownloadUrl} download="layout.svg">
        <Download className="mr-2 h-4 w-4" /> SVG
      </a>
    </Button>
  )}
</div>
```

`Download` icon from `lucide-react`. Uses shadcn `Button asChild` + `<a>` so right-click → Save As works. The `download` attribute hints the filename; the `Content-Disposition: attachment` header on the pre-signed URL is the actual enforcement for cross-origin downloads.

The toolbar is not a separate file — it is a small inline section in `CompleteState`. It is only used in one place.

## Error Handling

| Scenario | Behaviour |
|---|---|
| Pre-signed URL expired (>1hr on page) | S3 returns 403 — browser shows error page for that download tab. Acceptable for v1; same behaviour as SVG preview expiry. |
| Artifact S3 key missing on layoutJob | `*PresignedUrl` is `null` — button not rendered. No broken links. |

## Testing

### `projects.test.ts` updates

- Mock `getPresignedDownloadUrl` from `lib/s3`
- `getVersion` with `kmzArtifactS3Key` set → response includes non-null `kmzPresignedUrl`
- `getVersion` with `dxfArtifactS3Key` set → response includes non-null `dxfPresignedUrl`
- `getVersion` with `svgArtifactS3Key` set → response includes non-null `svgDownloadUrl`
- `getVersion` with all keys null → all three download URLs are `null`

### `version-detail.test.tsx` updates

- Add `kmzPresignedUrl`, `dxfPresignedUrl`, `svgDownloadUrl` to `COMPLETE_VERSION` fixture
- Test: all three download buttons render when layout job is complete and all URLs are set
- Test: a button is not rendered when its URL is `null` (test each independently)

## Out of Scope

- PDF download (Spike 8 — after energy job in Spike 7)
- Download count tracking / analytics
- Zip of all artifacts in one click
- Pre-signed URL refresh after expiry
