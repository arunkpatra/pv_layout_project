import { FileUp } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../components/Button"
import { Kbd } from "../components/Kbd"

/**
 * Empty state card — the canvas-centered "Drop a KMZ file to begin" prompt
 * shown when no project is loaded.
 *
 * Matches docs/design/light/empty.html.
 */
export function EmptyStateCard({
  title = "Drop a KMZ file to begin",
  body = "Load a plant boundary as a Google-Earth KMZ. Obstacle polygons and TL corridors inside it are detected automatically.",
  action = (
    <Button variant="subtle" size="md">
      <FileUp className="w-[14px] h-[14px]" />
      Open KMZ
      <Kbd className="ml-[4px]">⌘O</Kbd>
    </Button>
  ),
}: {
  title?: ReactNode
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="max-w-[360px] bg-[var(--surface-panel)] rounded-[var(--radius-lg)] shadow-[var(--shadow-xs)] border border-[var(--border-subtle)] p-[28px] flex flex-col items-center gap-[12px] text-center">
      <div className="w-[42px] h-[42px] rounded-[var(--radius-lg)] bg-[var(--accent-muted)] text-[var(--accent-default)] flex items-center justify-center">
        <FileUp className="w-[18px] h-[18px]" />
      </div>
      <h2 className="text-[14px] font-semibold text-[var(--text-primary)] leading-tight">{title}</h2>
      <p className="text-[12px] text-[var(--text-secondary)] leading-normal">{body}</p>
      <div className="mt-[6px]">{action}</div>
    </div>
  )
}
