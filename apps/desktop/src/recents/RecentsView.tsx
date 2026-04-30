/**
 * RecentsView — S3 default startup content. Replaces the parity-era
 * EmptyStateCard when no project is loaded. A grid of project cards
 * sourced from `useProjectsListQuery` (B10), plus a leading "+ New
 * project" tile that triggers the existing P1 new-project flow.
 *
 * Visual states:
 *   loading  → 4 skeleton cards (avoids the layout shift when the
 *              fetch resolves)
 *   error    → token-driven error block + Retry button (re-fetches)
 *   empty    → "+ New project" tile + first-time helper text
 *   list     → "+ New project" tile followed by recent project cards
 *
 * Each card surfaces:
 *   - Project name (truncated to one line; full name on hover via title)
 *   - Runs count + last-run relative time (e.g. "3 runs · 2h ago")
 *   - Updated relative time (footer)
 *   - **SP3 — bottom-right ⋯ icon (always-visible muted, hover-brighten)
 *     opening a Rename / Delete DropdownMenu**
 *
 * Click → fires `onOpen(project.id)` which delegates to the parent's
 * P2 open flow. The "+" tile fires `onNewProject()`. The ⋯ menu calls
 * `onRename(projectId, newName)` / `onDelete(projectId)` — both
 * return Promises so the per-card dialog can track its own busy and
 * error state without sharing a mutation instance across cards.
 *
 * NOTE on card interactivity: the card is `<div role="button">` rather
 * than `<button>` because nesting an interactive ⋯ trigger inside a
 * native button is invalid HTML. The div carries `tabIndex=0`,
 * `onKeyDown` for Enter/Space activation, and the same focus-ring
 * styling so accessibility parity is preserved.
 */
import { useMemo, useState, type JSX, type KeyboardEvent } from "react"
import type { ProjectSummaryListRowV2 } from "@solarlayout/entitlements-client"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "@solarlayout/ui"
import { RenameProjectDialog } from "../dialogs/RenameProjectDialog"
import { DeleteProjectConfirmDialog } from "../dialogs/DeleteProjectConfirmDialog"

export interface RecentsViewProps {
  isLoading: boolean
  isError: boolean
  errorMessage?: string
  projects: ProjectSummaryListRowV2[]
  onOpen: (projectId: string) => void
  onNewProject: () => void
  onRetry?: () => void
  /**
   * Fire B13 PATCH for the given project. Resolves on success (closes
   * the dialog), rejects with a string-coerced error message that the
   * dialog surfaces inline.
   */
  onRename: (projectId: string, newName: string) => Promise<void>
  /**
   * Fire B14 DELETE for the given project. Resolves on success (closes
   * the dialog), rejects with a string-coerced error message that the
   * dialog surfaces inline.
   */
  onDelete: (projectId: string) => Promise<void>
}

const NUM_SKELETONS = 4

export function RecentsView({
  isLoading,
  isError,
  errorMessage,
  projects,
  onOpen,
  onNewProject,
  onRetry,
  onRename,
  onDelete,
}: RecentsViewProps): JSX.Element {
  return (
    <div className="absolute inset-0 overflow-y-auto pointer-events-auto">
      <div className="max-w-[1100px] mx-auto px-[40px] py-[48px]">
        <header className="mb-[24px]">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">
            Recent projects
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-[4px]">
            Pick up where you left off, or start a new project from a KMZ.
          </p>
        </header>

        {isError ? (
          <ErrorBlock message={errorMessage} onRetry={onRetry} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[16px]">
            <NewProjectTile onClick={onNewProject} />
            {isLoading
              ? Array.from({ length: NUM_SKELETONS }, (_, i) => (
                  <SkeletonCard key={i} />
                ))
              : projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onOpen={onOpen}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))}
          </div>
        )}

        {!isLoading && !isError && projects.length === 0 && (
          <p className="text-[12px] text-[var(--text-muted)] mt-[24px] text-center">
            No projects yet — drop a KMZ above to get started.
          </p>
        )}
      </div>
    </div>
  )
}

function NewProjectTile({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        bg-[var(--surface-panel)]
        border border-dashed border-[var(--border-subtle)]
        rounded-[var(--radius-lg)]
        px-[20px] py-[24px]
        flex flex-col items-center justify-center gap-[8px]
        min-h-[140px]
        text-left
        transition-all duration-150
        hover:border-[var(--accent-default)]
        hover:bg-[var(--surface-muted)]
        focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]
        cursor-pointer
      "
    >
      <span className="text-[24px] leading-none text-[var(--text-secondary)]">+</span>
      <span className="text-[13px] font-medium text-[var(--text-primary)]">
        New project
      </span>
      <span className="text-[11px] text-[var(--text-muted)]">
        Open a KMZ to start
      </span>
    </button>
  )
}

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDelete,
}: {
  project: ProjectSummaryListRowV2
  onOpen: (id: string) => void
  onRename: (projectId: string, newName: string) => Promise<void>
  onDelete: (projectId: string) => Promise<void>
}): JSX.Element {
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runsLabel = useMemo(() => {
    if (project.runsCount === 0) return "No runs yet"
    if (project.runsCount === 1) return "1 run"
    return `${project.runsCount} runs`
  }, [project.runsCount])

  const lastActivity = useMemo(() => {
    const ts = project.lastRunAt ?? project.updatedAt
    return relativeTimeFrom(ts)
  }, [project.lastRunAt, project.updatedAt])

  const handleCardActivate = () => {
    onOpen(project.id)
  }

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onOpen(project.id)
    }
  }

  const handleRenameSubmit = async (newName: string) => {
    setBusy(true)
    setError(null)
    try {
      await onRename(project.id, newName)
      setRenameOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteConfirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onDelete(project.id)
      setDeleteOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Reset busy/error when either dialog closes (Esc/Cancel/outside).
  // Lets a re-open of the dialog start from a clean state.
  const handleRenameOpenChange = (next: boolean) => {
    if (!next) {
      setBusy(false)
      setError(null)
    }
    setRenameOpen(next)
  }
  const handleDeleteOpenChange = (next: boolean) => {
    if (!next) {
      setBusy(false)
      setError(null)
    }
    setDeleteOpen(next)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${project.name}`}
        onClick={handleCardActivate}
        onKeyDown={handleCardKeyDown}
        className="
          group
          relative
          bg-[var(--surface-panel)]
          border border-[var(--border-subtle)]
          rounded-[var(--radius-lg)]
          flex flex-col
          min-h-[140px]
          overflow-hidden
          text-left
          transition-all duration-150
          hover:border-[var(--border-default)]
          hover:shadow-[var(--shadow-sm)]
          focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]
          cursor-pointer
        "
        title={project.name}
      >
        <ProjectCardThumbnail project={project} />
        <div className="flex-1 min-h-0 px-[20px] pt-[16px]">
          <div className="text-[14px] font-semibold text-[var(--text-primary)] truncate pr-[24px]">
            {project.name}
          </div>
          <div className="text-[12px] text-[var(--text-secondary)] mt-[6px]">
            {runsLabel}
            {project.lastRunAt && (
              <span className="text-[var(--text-muted)]"> · {lastActivity}</span>
            )}
          </div>
        </div>
        <div className="mt-[8px] px-[20px] py-[6px] flex items-center justify-between text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
          <span>Updated {relativeTimeFrom(project.updatedAt)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`More actions for ${project.name}`}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="
                  inline-flex items-center justify-center
                  w-[20px] h-[20px]
                  rounded-[var(--radius-sm)]
                  text-[var(--text-muted)]
                  opacity-60
                  hover:opacity-100 hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]
                  group-hover:opacity-100
                  focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]
                  transition-opacity duration-150
                  cursor-pointer
                "
              >
                <MoreHorizontal className="w-[14px] h-[14px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                onSelect={() => setRenameOpen(true)}
                className="cursor-pointer"
              >
                <span className="inline-flex items-center gap-[8px]">
                  <Pencil className="w-[12px] h-[12px] text-[var(--text-muted)]" />
                  Rename
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setDeleteOpen(true)}
                className="cursor-pointer text-[var(--error-default)] data-[highlighted]:bg-[var(--error-muted)] data-[highlighted]:text-[var(--error-default)]"
              >
                <span className="inline-flex items-center gap-[8px]">
                  <Trash2 className="w-[12px] h-[12px]" />
                  Delete
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <RenameProjectDialog
        open={renameOpen}
        onOpenChange={handleRenameOpenChange}
        project={project}
        onSubmit={handleRenameSubmit}
        busy={busy}
        error={error}
      />
      <DeleteProjectConfirmDialog
        open={deleteOpen}
        onOpenChange={handleDeleteOpenChange}
        project={project}
        onConfirm={handleDeleteConfirm}
        busy={busy}
        error={error}
      />
    </>
  )
}

/**
 * SP4 + SP6 — RecentsView project card thumbnail surface.
 *
 * Render priority (memo v3 §14 + SP6):
 *   1. `mostRecentRunThumbnailBlobUrl` non-null + `<img>` loads OK
 *      → real run thumbnail (SP4 path).
 *   2. Above failed (404 / network / decode) OR null
 *      AND `boundaryGeojson` non-null
 *      → inline SVG `<polygon>` of the project's boundary (SP6 path).
 *   3. Both above unavailable
 *      → muted-grey placeholder div (legacy fallback).
 *
 * Path 2 covers: zero-run projects (backend returns null thumbnail
 * URL since no run exists), post-SP1 runs whose thumbnail PUT failed
 * (URL signs but S3 GET 404s), and pre-B26 projects with null boundary
 * (skip path 2, fall to path 3). Memo v3 §14 anticipated this exact
 * pattern.
 *
 * Card width is ~260px in the auto-fill grid; `aspect-[4/3]` slot at
 * full card width yields ~195px tall preview.
 */
function ProjectCardThumbnail({
  project,
}: {
  project: ProjectSummaryListRowV2
}): JSX.Element {
  const [errored, setErrored] = useState(false)
  const url = project.mostRecentRunThumbnailBlobUrl
  if (url && !errored) {
    return (
      <img
        src={url}
        alt={`${project.name} most recent layout preview`}
        loading="lazy"
        onError={() => setErrored(true)}
        className="aspect-[4/3] w-full object-cover border-b border-[var(--border-subtle)]"
      />
    )
  }
  if (project.boundaryGeojson) {
    return (
      <BoundarySvg
        boundary={project.boundaryGeojson}
        ariaLabel={`${project.name} boundary outline`}
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className="aspect-[4/3] w-full bg-[var(--surface-muted)] border-b border-[var(--border-subtle)]"
    />
  )
}

/**
 * Inline SVG render of a `BoundaryGeojson` (Polygon | MultiPolygon).
 *
 * Coordinate space: WGS84 (lon, lat) treated as planar. At single-site
 * scale this is fine for a thumbnail; same approach the sidecar's
 * matplotlib renderer takes for SP1 thumbnails. Latitude flips to keep
 * north up (SVG y-axis grows downward; lon/lat grows upward).
 *
 * viewBox is computed from the boundary's bounding box with a 4%
 * margin so the stroke isn't clipped at the edges. `preserveAspectRatio`
 * uses `xMidYMid meet` to letterbox into the 4:3 slot — matches how
 * the SP1 thumbnail handles non-4:3 boundaries (whitespace on the
 * shorter axis rather than cropping).
 */
function BoundarySvg({
  boundary,
  ariaLabel,
}: {
  boundary: NonNullable<ProjectSummaryListRowV2["boundaryGeojson"]>
  ariaLabel: string
}): JSX.Element {
  // Flatten to a list of rings (each ring = list of [lon, lat]).
  const rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>> =
    boundary.type === "Polygon"
      ? boundary.coordinates
      : boundary.coordinates.flat()

  if (rings.length === 0) {
    return (
      <div
        aria-hidden="true"
        className="aspect-[4/3] w-full bg-[var(--surface-muted)] border-b border-[var(--border-subtle)]"
      />
    )
  }

  // Bounding box across all rings. Initialised from the first point so
  // we don't need Infinity sentinels (which Tailwind / safelisting would
  // never touch but are still ugly).
  const first = rings[0]?.[0]
  if (!first) {
    return (
      <div
        aria-hidden="true"
        className="aspect-[4/3] w-full bg-[var(--surface-muted)] border-b border-[var(--border-subtle)]"
      />
    )
  }
  let minLon = first[0]
  let maxLon = first[0]
  let minLat = first[1]
  let maxLat = first[1]
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  const lonSpan = maxLon - minLon || 1e-9
  const latSpan = maxLat - minLat || 1e-9

  // Normalize geographic coords to a 0..VB_RANGE viewBox. Geographic
  // values like lon=81.4866, lat=21.7084 with spans of ~0.002 are below
  // WebKit's reliable SVG-precision threshold; rendering silently fails
  // (mounted SVG, no visible content). Translating to origin + scaling
  // to 0..1000 dodges that entirely.
  //
  // Keep aspect ratio: scale lon and lat by the SAME factor (the larger
  // of the two spans), so square plant boundaries stay square.
  const VB_RANGE = 1000
  const scale = VB_RANGE / Math.max(lonSpan, latSpan)
  const margin = VB_RANGE * 0.04
  const projectedRings = rings.map((ring) =>
    ring.map(([lon, lat]) => {
      // x grows east (+lon), y grows south in SVG so we negate lat.
      const x = (lon - minLon) * scale
      const y = (maxLat - lat) * scale
      return [x, y] as const
    })
  )
  const vbX = -margin
  const vbY = -margin
  const vbW = lonSpan * scale + margin * 2
  const vbH = latSpan * scale + margin * 2

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="aspect-[4/3] w-full bg-[var(--surface-muted)] border-b border-[var(--border-subtle)] relative overflow-hidden"
    >
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
      >
        {projectedRings.map((ring, i) => (
          <polygon
            key={i}
            points={ring.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="#60605d"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  )
}

function SkeletonCard(): JSX.Element {
  return (
    <div
      className="
        bg-[var(--surface-panel)]
        border border-[var(--border-subtle)]
        rounded-[var(--radius-lg)]
        px-[20px] py-[16px]
        min-h-[140px]
        animate-pulse
      "
      aria-hidden="true"
    >
      <div className="h-[14px] w-[60%] rounded-[4px] bg-[var(--surface-muted)] mb-[10px]" />
      <div className="h-[10px] w-[40%] rounded-[4px] bg-[var(--surface-muted)]" />
    </div>
  )
}

function ErrorBlock({
  message,
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col items-start gap-[12px] py-[24px]">
      <h2 className="text-[14px] font-semibold text-[var(--error-default)]">
        Couldn't load your projects
      </h2>
      <p className="text-[12px] text-[var(--text-secondary)] max-w-[480px] leading-normal">
        {message ?? "Something went wrong fetching your project list."}
      </p>
      {onRetry && (
        <Button type="button" variant="primary" size="md" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

/**
 * Compact relative-time formatter — keeps the dependency footprint
 * tiny (no date-fns / dayjs). Granularity matches what the recents
 * grid needs:
 *
 *   < 1 minute    → "just now"
 *   < 1 hour      → "Nm ago"
 *   < 24 hours    → "Nh ago"
 *   < 7 days      → "Nd ago"
 *   otherwise     → ISO date (yyyy-mm-dd)
 *
 * Inputs are ISO timestamps from the wire.
 */
function relativeTimeFrom(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const now = Date.now()
  const deltaMs = now - then
  if (deltaMs < 60_000) return "just now"
  if (deltaMs < 3600_000) {
    return `${Math.floor(deltaMs / 60_000)}m ago`
  }
  if (deltaMs < 86_400_000) {
    return `${Math.floor(deltaMs / 3600_000)}h ago`
  }
  if (deltaMs < 7 * 86_400_000) {
    return `${Math.floor(deltaMs / 86_400_000)}d ago`
  }
  return iso.slice(0, 10)
}
