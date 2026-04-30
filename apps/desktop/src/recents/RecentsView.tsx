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
 *
 * Click → fires `onOpen(project.id)` which delegates to the parent's
 * P2 open flow. The "+" tile fires `onNewProject()` — same handler the
 * old EmptyStateCard's button used.
 *
 * NOTE on visual scope: matches the Claude-Desktop / Linear quality bar
 * (token-driven, hover surfaces, motion-safe transitions). When S2
 * (multi-tab) lands, the "Open" click will create-or-focus a tab; for
 * v1 it just replaces the current canvas state via the same handler
 * P2's interim window.prompt() flow uses today.
 */
import { useMemo, type JSX } from "react"
import type { ProjectSummaryListRowV2 } from "@solarlayout/entitlements-client"
import { Button } from "@solarlayout/ui"

export interface RecentsViewProps {
  isLoading: boolean
  isError: boolean
  errorMessage?: string
  projects: ProjectSummaryListRowV2[]
  onOpen: (projectId: string) => void
  onNewProject: () => void
  onRetry?: () => void
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
                  <ProjectCard key={p.id} project={p} onClick={onOpen} />
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
  onClick,
}: {
  project: ProjectSummaryListRowV2
  onClick: (id: string) => void
}): JSX.Element {
  const runsLabel = useMemo(() => {
    if (project.runsCount === 0) return "No runs yet"
    if (project.runsCount === 1) return "1 run"
    return `${project.runsCount} runs`
  }, [project.runsCount])

  const lastActivity = useMemo(() => {
    const ts = project.lastRunAt ?? project.updatedAt
    return relativeTimeFrom(ts)
  }, [project.lastRunAt, project.updatedAt])

  return (
    <button
      type="button"
      onClick={() => onClick(project.id)}
      className="
        bg-[var(--surface-panel)]
        border border-[var(--border-subtle)]
        rounded-[var(--radius-lg)]
        px-[20px] py-[16px]
        flex flex-col gap-[8px]
        min-h-[140px]
        text-left
        transition-all duration-150
        hover:border-[var(--border-default)]
        hover:shadow-[var(--shadow-sm)]
        focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]
        cursor-pointer
      "
      title={project.name}
    >
      <div className="flex-1 min-h-0">
        <div className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
          {project.name}
        </div>
        <div className="text-[12px] text-[var(--text-secondary)] mt-[6px]">
          {runsLabel}
          {project.lastRunAt && (
            <span className="text-[var(--text-muted)]"> · {lastActivity}</span>
          )}
        </div>
      </div>
      <div className="text-[11px] text-[var(--text-muted)] pt-[4px] border-t border-[var(--border-subtle)]">
        Updated {relativeTimeFrom(project.updatedAt)}
      </div>
    </button>
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
