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
 * SP4 — RecentsView project card thumbnail surface.
 *
 * Renders the most-recent run's thumbnail when `project.most
 * RecentRunThumbnailBlobUrl` is non-null and the `<img>` loads
 * successfully. Falls back to a token-driven muted placeholder for
 * three cases: (a) project has zero runs (backend returns null),
 * (b) project's most-recent run has no thumbnail (pre-SP1 run or
 * PUT-failed run — backend always-signs the URL but S3 GET 404s),
 * (c) any rare network / decoding error during load.
 *
 * Memo v3 §14: same 400×300 WebP asset for both Run gallery cards
 * and RecentsView project cards. Card width is ~260px in the auto-fill
 * grid; `aspect-[4/3]` slot at full card width yields ~195px tall
 * preview that crops nothing (matches source aspect).
 */
function ProjectCardThumbnail({
  project,
}: {
  project: ProjectSummaryListRowV2
}): JSX.Element {
  const [errored, setErrored] = useState(false)
  const url = project.mostRecentRunThumbnailBlobUrl
  if (!url || errored) {
    return (
      <div
        aria-hidden="true"
        className="aspect-[4/3] w-full bg-[var(--surface-muted)] border-b border-[var(--border-subtle)]"
      />
    )
  }
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
