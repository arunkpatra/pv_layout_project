import { ChevronDown, ChevronRight } from "lucide-react"
import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react"
import { cn } from "../lib/cn"

export function InspectorRoot({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col", className)} {...props}>
      {children}
    </div>
  )
}

/**
 * InspectorSection — titled section with the standard inspector rhythm
 * (20px horizontal padding, 18px vertical, 1px subtle bottom border).
 *
 * By default the section is non-collapsible (preserves all existing
 * call sites unchanged). Pass `collapsible` to make the header a
 * button with a chevron; pass `persistKey` to remember the open/closed
 * state across reloads via `localStorage`. Multi-section panels can
 * each carry their own `persistKey` and collapse independently —
 * not a true accordion (no one-open-at-a-time constraint).
 */
export function InspectorSection({
  title,
  children,
  className,
  collapsible = false,
  defaultExpanded = true,
  persistKey,
}: {
  title: string
  children: ReactNode
  className?: string
  collapsible?: boolean
  defaultExpanded?: boolean
  persistKey?: string
}) {
  const [expanded, setExpanded] = usePersistedExpanded(
    collapsible ? persistKey : undefined,
    defaultExpanded
  )

  if (!collapsible) {
    return (
      <section
        className={cn(
          "border-b border-[var(--border-subtle)] px-[20px] py-[18px]",
          className
        )}
      >
        <h3 className="mb-[12px] text-[11px] font-semibold tracking-[0.04em] text-[var(--text-primary)] uppercase">
          {title}
        </h3>
        {children}
      </section>
    )
  }

  // Collapsible variant. Header becomes a button; chevron flips on
  // toggle. Padding-bottom drops to 18px when collapsed (no children
  // present), giving a tight stack of section titles.
  const ChevronIcon = expanded ? ChevronDown : ChevronRight
  return (
    <section
      className={cn(
        "border-b border-[var(--border-subtle)] px-[20px] py-[12px]",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between",
          expanded ? "mb-[12px]" : "mb-0"
        )}
      >
        <h3 className="m-0 text-[11px] font-semibold tracking-[0.04em] text-[var(--text-primary)] uppercase">
          {title}
        </h3>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "rounded-[4px] p-[3px]",
            "transition-colors hover:bg-[var(--surface-muted)]",
            "focus-visible:ring-2 focus-visible:ring-[var(--accent-default)] focus-visible:outline-none"
          )}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
        >
          <ChevronIcon
            className="size-[14px] shrink-0 text-[var(--text-muted)]"
            aria-hidden
          />
        </button>
      </div>
      {expanded && children}
    </section>
  )
}

/**
 * Sync a boolean toggle to localStorage under `solarlayout.<key>`.
 * Cheap, read-once-on-mount, write-on-change. Unset `key` (i.e.
 * non-collapsible variant) skips persistence entirely and behaves
 * like plain `useState`.
 */
function usePersistedExpanded(
  key: string | undefined,
  initial: boolean
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  // SSR / non-browser fallback — start with the initial value; the
  // localStorage hydration runs once on client mount.
  const [expanded, setExpanded] = useState<boolean>(initial)

  useEffect(() => {
    if (!key || typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(`solarlayout.${key}`)
      if (raw === "true" || raw === "false") {
        setExpanded(raw === "true")
      }
    } catch {
      // localStorage may be unavailable in some Tauri webview configs
      // or under privacy-restricted profiles — fall through to the
      // in-memory default. The user just won't see persistence; the
      // section still toggles.
    }
    // Read-once on mount is intentional. We don't reactively follow
    // localStorage from other sources — there are none.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!key || typeof window === "undefined") return
    try {
      window.localStorage.setItem(
        `solarlayout.${key}`,
        expanded ? "true" : "false"
      )
    } catch {
      // see above
    }
  }, [key, expanded])

  return [expanded, setExpanded]
}

export function PropertyRow({
  label,
  value,
  unit,
}: {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-[12px] py-[5px] text-[13px]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-medium text-[var(--text-primary)] tabular-nums">
        {value}
        {unit && (
          <span className="ml-[5px] font-normal text-[var(--text-muted)]">
            {unit}
          </span>
        )}
      </span>
    </div>
  )
}

export function SummaryStat({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[16px] leading-tight font-semibold text-[var(--text-primary)] tabular-nums">
        {value}
      </span>
    </div>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-x-[12px] gap-y-[14px]">{children}</div>
  )
}
