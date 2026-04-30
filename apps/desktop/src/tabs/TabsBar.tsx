/**
 * TabsBar — S2 horizontal tab strip above the main canvas.
 *
 * Each tab carries the project name + a close button. Clicking a tab
 * sets it active (parent re-loads project state via the existing P2
 * open flow). Clicking the trailing "+" tile fires the new-project
 * KMZ picker (P1's flow). Active tab is highlighted with a subtle
 * underline + accent border.
 *
 * **SP3** — right-click on a project tab opens a ContextMenu with
 * Rename + Delete actions (same Dialog modals as the Recents card ⋯
 * menu). HomeTab is excluded — it isn't a real project, just a
 * navigation primitive.
 *
 * Scroll: when there are too many tabs to fit, the strip overflows
 * horizontally with token-driven scrollbars. No fancy "scroll buttons"
 * yet — the OS-native horizontal scroll (trackpad / shift+wheel) is
 * sufficient for the v1 ceiling of 15 projects.
 */
import { useState, type JSX } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@solarlayout/ui"
import { useTabsStore, type Tab } from "../state/tabs"
import { RenameProjectDialog } from "../dialogs/RenameProjectDialog"
import { DeleteProjectConfirmDialog } from "../dialogs/DeleteProjectConfirmDialog"

export interface TabsBarProps {
  /**
   * Click handler for switching tabs. Wires to App.tsx's tab-switch
   * effect, which performs the necessary B12 + S3 GET re-load + sidecar
   * parse to swap project state.
   */
  onSwitch: (tabId: string) => void
  /**
   * Click handler for closing a tab. App.tsx checks for unsaved-edits
   * (auto-save's "saving" status) and prompts before invoking.
   */
  onClose: (tabId: string) => void
  /** Click handler for the "+" tile. Fires P1's new-project flow. */
  onNewProject: () => void
  /**
   * S1-10 — click handler for the leading Home tab. Fires the tabs
   * slice's `goHome()` which sets `activeTabId = null`, sending the
   * user back to RecentsView. Tabs are preserved (not removed). When
   * undefined, the Home tab is hidden — keeps the component reusable
   * for tests / contexts that don't have the home navigation flow.
   */
  onHome?: () => void
  /**
   * SP3 — fire B13 PATCH for the given project (right-click → Rename).
   * Resolves on success (closes dialog), rejects with a string-coerced
   * error message that the dialog surfaces inline. When undefined, the
   * tab's right-click context menu is suppressed entirely (test /
   * preview-only contexts don't need rename / delete affordances).
   */
  onRename?: (projectId: string, newName: string) => Promise<void>
  /**
   * SP3 — fire B14 DELETE for the given project (right-click → Delete).
   * Same Promise contract as onRename. When undefined, the context
   * menu is suppressed.
   */
  onDelete?: (projectId: string) => Promise<void>
}

export function TabsBar({
  onSwitch,
  onClose,
  onNewProject,
  onHome,
  onRename,
  onDelete,
}: TabsBarProps): JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)

  return (
    <div
      data-tauri-drag-region
      className="
        h-full flex items-stretch gap-[2px] pl-[16px] pr-[8px]
        overflow-x-auto overflow-y-hidden
        bg-[var(--surface-ground)]
      "
      role="tablist"
      aria-label="Open projects"
    >
      {onHome && (
        <HomeTab
          active={activeTabId === null}
          onClick={onHome}
        />
      )}
      {tabs.map((t) => (
        <TabButton
          key={t.id}
          tab={t}
          active={t.id === activeTabId}
          onSwitch={onSwitch}
          onClose={onClose}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
      <NewProjectTile onClick={onNewProject} />
    </div>
  )
}

/**
 * Home tab — leading, fixed, no close button, persistent. Active when
 * `activeTabId === null` (no project workspace selected; canvas shows
 * RecentsView). Visually separated from project tabs by a thin trailing
 * divider so users don't expect a `×` on it.
 */
function HomeTab({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        aria-label="Home — Recent projects"
        onClick={onClick}
        className={`
          inline-flex items-center gap-[6px]
          px-[10px] my-[4px]
          rounded-[var(--radius-sm)]
          text-[12px]
          cursor-pointer
          transition-colors duration-[120ms]
          ${
            active
              ? "bg-[var(--surface-panel)] text-[var(--text-primary)] border border-[var(--border-default)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] border border-transparent"
          }
        `}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-[12px] h-[12px] shrink-0"
          aria-hidden="true"
        >
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>Projects</span>
      </button>
      <div
        aria-hidden="true"
        className="self-center w-px h-[16px] mx-[4px] bg-[var(--border-subtle)]"
      />
    </>
  )
}

function TabButton({
  tab,
  active,
  onSwitch,
  onClose,
  onRename,
  onDelete,
}: {
  tab: Tab
  active: boolean
  onSwitch: (id: string) => void
  onClose: (id: string) => void
  onRename?: (projectId: string, newName: string) => Promise<void>
  onDelete?: (projectId: string) => Promise<void>
}): JSX.Element {
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRenameSubmit = async (newName: string) => {
    if (!onRename) return
    setBusy(true)
    setError(null)
    try {
      await onRename(tab.projectId, newName)
      setRenameOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!onDelete) return
    setBusy(true)
    setError(null)
    try {
      await onDelete(tab.projectId)
      setDeleteOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

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

  const tabBody = (
    <div
      role="tab"
      aria-selected={active}
      data-active={active}
      className={`
        group inline-flex items-center gap-[6px]
        px-[10px] my-[4px]
        rounded-[var(--radius-sm)]
        text-[12px]
        cursor-pointer
        transition-colors duration-[120ms]
        max-w-[200px]
        ${
          active
            ? "bg-[var(--surface-panel)] text-[var(--text-primary)] border border-[var(--border-default)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] border border-transparent"
        }
      `}
      onClick={() => onSwitch(tab.id)}
      onAuxClick={(e) => {
        // Middle-click closes — standard browser-tab UX.
        if (e.button === 1) {
          e.preventDefault()
          onClose(tab.id)
        }
      }}
    >
      <span
        className="truncate min-w-0 flex-1"
        title={tab.projectName}
      >
        {tab.projectName}
      </span>
      <button
        type="button"
        aria-label={`Close ${tab.projectName}`}
        onClick={(e) => {
          e.stopPropagation()
          onClose(tab.id)
        }}
        className="
          shrink-0 inline-flex items-center justify-center
          w-[14px] h-[14px] rounded-[2px]
          text-[var(--text-muted)]
          opacity-0 group-hover:opacity-100
          data-[active=true]:opacity-100
          hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]
          transition-opacity duration-[120ms]
        "
        data-active={active}
      >
        <span aria-hidden="true" className="text-[10px] leading-none">
          ×
        </span>
      </button>
    </div>
  )

  // When neither rename nor delete is wired (test / preview contexts),
  // skip the ContextMenu wrapper — saves a Radix portal mount per tab.
  if (!onRename && !onDelete) return tabBody

  const project = { id: tab.projectId, name: tab.projectName }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{tabBody}</ContextMenuTrigger>
        <ContextMenuContent>
          {onRename && (
            <ContextMenuItem onSelect={() => setRenameOpen(true)}>
              Rename…
            </ContextMenuItem>
          )}
          {onDelete && (
            <ContextMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-[var(--error-default)] data-[highlighted]:bg-[var(--error-subtle)] data-[highlighted]:text-[var(--error-default)]"
            >
              Delete…
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {onRename && (
        <RenameProjectDialog
          open={renameOpen}
          onOpenChange={handleRenameOpenChange}
          project={project}
          onSubmit={handleRenameSubmit}
          busy={busy}
          error={error}
        />
      )}
      {onDelete && (
        <DeleteProjectConfirmDialog
          open={deleteOpen}
          onOpenChange={handleDeleteOpenChange}
          project={project}
          onConfirm={handleDeleteConfirm}
          busy={busy}
          error={error}
        />
      )}
    </>
  )
}

function NewProjectTile({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="New project"
      className="
        inline-flex items-center justify-center
        w-[26px] h-[26px] my-[4px]
        rounded-[var(--radius-sm)]
        text-[var(--text-muted)]
        hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]
        transition-colors duration-[120ms]
        cursor-pointer
      "
    >
      <span aria-hidden="true" className="text-[16px] leading-none">
        +
      </span>
    </button>
  )
}
