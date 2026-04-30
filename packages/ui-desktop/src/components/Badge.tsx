import { forwardRef, type HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

/**
 * Badge — like Chip but smaller and non-interactive, for entitlement edition
 * markers ("Pro"), counts, and inline status indicators.
 *
 * Chip is larger, supports a dot, and is the default for "status that a user
 * might click" (e.g. filters). Badge is compact static labeling.
 */
const badgeVariants = cva(
  "inline-flex items-center h-[18px] px-[6px] rounded-[var(--radius-sm)] text-[10px] font-semibold tracking-[0.04em] uppercase whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
        accent: "bg-[var(--accent-muted)] text-[var(--accent-ink)]",
        success: "bg-[var(--success-muted)] text-[var(--success-default)]",
        warning: "bg-[var(--warning-muted)] text-[var(--warning-default)]",
        error: "bg-[var(--error-muted)] text-[var(--error-default)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />
  )
)
Badge.displayName = "Badge"
