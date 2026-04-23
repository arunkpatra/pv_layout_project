import type { ReactNode } from "react"
import { cn } from "../lib/cn"

/**
 * MapCanvas placeholder — dot-grid background surface.
 *
 * In S8, this gets replaced by an actual MapLibre instance styled with
 * pv-light.json / pv-dark.json. For now it renders an empty-state surface
 * with children (e.g. the "Drop a KMZ file to begin" card) floating above
 * the dot grid.
 */
export function MapCanvas({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative w-full h-full flex items-center justify-center overflow-hidden",
        className
      )}
      style={{
        backgroundImage:
          "radial-gradient(circle, var(--canvas-grid-dot) 1px, transparent 1px)",
        backgroundSize: "12px 12px",
      }}
    >
      {children}
    </div>
  )
}

export function CommandBarHint({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-[16px] left-[16px] inline-flex items-center gap-[8px] h-[28px] pl-[10px] pr-[6px] rounded-[var(--radius-md)] bg-[var(--surface-panel)] border border-[var(--border-subtle)] shadow-[var(--shadow-xs)] text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors duration-[120ms]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-[13px] h-[13px]"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      Press
      <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[var(--text-secondary)] font-mono text-[11px] leading-none">
        ⌘K
      </kbd>
      for commands
    </button>
  )
}
