# Spike 4d — Version Detail Page with Polling

## Goal

Build the version detail page (`/dashboard/projects/[projectId]/versions/[versionId]`) that shows run status while polling and displays layout results when complete.

## Architecture

Four new files:

| File | Role |
|---|---|
| `apps/web/hooks/use-version.ts` | TanStack Query v5 hook with `refetchInterval` polling; stops on terminal state |
| `apps/web/components/version-status-badge.tsx` | Reusable status badge; also used in project detail version list (Spike 4e) |
| `apps/web/components/version-detail.tsx` | Progressive-disclosure page body |
| `apps/web/app/(main)/dashboard/projects/[projectId]/versions/[versionId]/page.tsx` | Route entry — sets breadcrumbs, renders `VersionDetail` |

No API changes. No query-key changes. `queryKeys.projects.versions.detail(projectId, versionId)` and `api.getVersion(projectId, versionId)` both already exist.

## Polling Strategy

`use-version.ts` uses TanStack Query v5's callback forms:

```ts
refetchInterval: (query) => {
  const status = query.state.data?.status
  if (!status || status === "COMPLETE" || status === "FAILED") return false
  return 3000
},
staleTime: (query) => {
  const status = query.state.data?.status
  return (status === "COMPLETE" || status === "FAILED") ? 120_000 : 1_000
},
enabled: isLoaded && !!isSignedIn,
```

- 3 s cadence while QUEUED or PROCESSING
- Stops automatically on COMPLETE or FAILED
- `staleTime` 2 min for terminal state (avoids re-fetch on back-navigation), 1 s while active

## Components

### `VersionStatusBadge`

Maps `VersionStatus` to a shadcn `Badge`:

| Status | Label | Variant / Style |
|---|---|---|
| QUEUED | Queued | `secondary` |
| PROCESSING | Processing | `default` + `animate-pulse` |
| COMPLETE | Complete | green (custom className override) |
| FAILED | Failed | `destructive` |

Standalone component — reusable in version list rows (Spike 4e).

### `VersionDetail` — progressive disclosure

Three render states driven by `version.status`:

**QUEUED / PROCESSING:**
- `VersionStatusBadge` + status message ("Your run is queued…" / "Calculating layout…")
- `Loader2` spinner
- Elapsed time since `version.createdAt` (e.g. "2m 14s")

**FAILED:**
- shadcn `Alert` variant `destructive`
- Error message: `layoutJob?.errorDetail ?? energyJob?.errorDetail ?? "An unexpected error occurred"`
- "Start new run" `Link` → `/dashboard/projects/${projectId}/new-version`

**COMPLETE:**
- `VersionStatusBadge`
- Results grid — 2 cols on mobile, 3 cols on desktop
- 9 metrics from `layoutJob.statsJson`:
  - Total capacity (MWp)
  - Total modules
  - Total tables
  - Total area (acres)
  - String inverters
  - ICRs
  - Lightning arresters
  - DC cable (m)
  - AC cable (m)
- Note: `energyJob.statsJson` is always `null` in current implementation (energy processing not yet built). Energy results added in a future spike.

### Page (`[versionId]/page.tsx`)

- Client component
- Reads `projectId` and `versionId` from `useParams()`
- Sets breadcrumbs: Projects → [Project Name] → Run #N
  - Project name from `useProject(projectId)` (already exists)
  - Version number from `useVersion` result (`version.number`)
- Renders `<VersionDetail projectId={projectId} versionId={versionId} />`

## Data Shape

`layoutJob.statsJson` (from Lambda `_build_stats`):
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

Type-narrowed locally in `version-detail.tsx` (shared type remains `unknown | null`).

## Error Handling

- Query loading (`data` undefined): skeleton placeholder
- Query error (network failure): generic "Failed to load run details" message
- Version FAILED: destructive Alert with raw error detail + "Start new run" button

## Testing

| File | What it tests |
|---|---|
| `use-version.test.ts` | `refetchInterval` returns 3000 for QUEUED/PROCESSING, `false` for COMPLETE/FAILED/undefined |
| `version-status-badge.test.tsx` | Correct label for each status; PROCESSING has `animate-pulse` |
| `version-detail.test.tsx` | Queued state renders spinner; FAILED renders error + link; COMPLETE renders metrics grid; null errorDetail shows generic message |

## Out of Scope

- Energy results display (energy processing not yet implemented)
- Artifact downloads (KMZ/SVG/DXF/PDF) — no presigned URL endpoints exist yet
- Per-job status breakdown in the badge (single `version.status` only)
