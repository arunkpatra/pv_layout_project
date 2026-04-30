/**
 * V2 wire shapes for the desktop's project + run primitives.
 *
 * Kept separate from `project.ts` because the legacy web-port types
 * (Project, ProjectSummary, VersionDetail, …) live there with different
 * meanings — namespace collisions would force renames across `apps/web`
 * (currently dormant). New consumers should import from here.
 */

export interface RunSummary {
  id: string
  name: string
  /** Engine-specific run params (rows, cols, etc.) — opaque to the wire. */
  params: unknown
  /** The feature key billed for this run (e.g. "plant_layout"). */
  billedFeatureKey: string
  createdAt: string
  /** Presigned-GET URL for `thumbnail.webp` (Path A — deterministic key,
   *  always-sign). Pre-SP1 runs return a valid URL that 404s on read; the
   *  desktop's `<img onError>` falls back. Null only when the bucket env
   *  is unset (local dev without S3). Mirrors `RunDetailWire.thumbnailBlobUrl`
   *  on B17 and `mostRecentRunThumbnailBlobUrl` on B10's ProjectSummary. */
  thumbnailBlobUrl: string | null
}

/** GeoJSON `Polygon` or `MultiPolygon` carrying just the boundary outline
 *  parsed from the KMZ at create-time. Used by the desktop's RecentsView
 *  to render an SVG fallback when no thumbnail exists. Loose type so the
 *  wire stays compatible with the GeoJSON spec without pulling a runtime
 *  dependency. */
export interface BoundaryGeojsonPolygon {
  type: "Polygon"
  /** Linear rings of [longitude, latitude] pairs. */
  coordinates: number[][][]
}
export interface BoundaryGeojsonMultiPolygon {
  type: "MultiPolygon"
  coordinates: number[][][][]
}
export type BoundaryGeojson =
  | BoundaryGeojsonPolygon
  | BoundaryGeojsonMultiPolygon

export interface ProjectWire {
  id: string
  userId: string
  name: string
  /** Canonical s3:// URI of the KMZ — content-addressed at the user level
   *  (`projects/<userId>/kmz/<sha256>.kmz`). Immutable post-create. */
  kmzBlobUrl: string
  /** SHA-256 of the KMZ bytes; doubles as the storage key suffix. */
  kmzSha256: string
  /** Free-form auto-save state owned by the desktop (canvas mutations,
   *  view state, etc.). Schema is desktop-side. */
  edits: unknown
  /** Parsed KMZ boundary outline; null for projects created before B26
   *  (the desktop's SVG fallback degrades to the existing muted
   *  placeholder when null). */
  boundaryGeojson: BoundaryGeojson | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ProjectDetail extends ProjectWire {
  /** Presigned-GET URL for the KMZ blob, ~1h TTL, signed at request time
   *  against `MVP_S3_PROJECTS_BUCKET`. Null when the bucket is unset (local
   *  dev without S3). The desktop fetches this directly to hydrate the
   *  canvas — no second round-trip needed. Mirrors the B17 pattern for
   *  run-result blobs. */
  kmzDownloadUrl: string | null
  /** Non-soft-deleted runs in `createdAt DESC` order. Heavy run fields
   *  (inputsSnapshot, blob URLs, exports) live on B17; this is the list-
   *  row summary. */
  runs: RunSummary[]
}
