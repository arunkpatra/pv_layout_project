/**
 * TabsBar — S2 horizontal tab strip above the main canvas.
 *
 * Each tab carries the project name + a close button. Clicking a tab
 * sets it active (parent re-loads project state via the existing P2
 * open flow). Clicking the trailing "+" tile fires the new-project
 * KMZ picker (P1's flow). Active tab is highlighted with a subtle
 * underline + accent border.
 *
 * Scroll: when there are too many tabs to fit, the strip overflows
 * horizontally with token-driven scrollbars. No fancy "scroll buttons"
 * yet — the OS-native horizontal scroll (trackpad / shift+wheel) is
 * sufficient for the v1 ceiling of 15 projects.
 */
import { type JSX } from "react"
import { useTabsStore, type Tab } from "../state/tabs"

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
}

export function TabsBar({
  onSwitch,
  onClose,
  onNewProject,
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
      {tabs.map((t) => (
        <TabButton
          key={t.id}
          tab={t}
          active={t.id === activeTabId}
          onSwitch={onSwitch}
          onClose={onClose}
        />
      ))}
      <NewProjectTile onClick={onNewProject} />
    </div>
  )
}

function TabButton({
  tab,
  active,
  onSwitch,
  onClose,
}: {
  tab: Tab
  active: boolean
  onSwitch: (id: string) => void
  onClose: (id: string) => void
}): JSX.Element {
  return (
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
