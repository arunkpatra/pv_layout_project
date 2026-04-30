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
}

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
