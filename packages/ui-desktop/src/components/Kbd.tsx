import { forwardRef, type HTMLAttributes } from "react"
import { cn } from "../lib/cn"

/** Monospaced keyboard affordance — renders ⌘K, G, etc. */
export const Kbd = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[var(--text-secondary)] font-mono text-[11px] leading-none",
        className
      )}
      {...props}
    />
  )
)
Kbd.displayName = "Kbd"
