import { forwardRef, type HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

const chipVariants = cva(
  "inline-flex items-center gap-[5px] h-[20px] px-[7px] rounded-[var(--radius-sm)] text-[11px] font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral:
          "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
        accent:
          "bg-[var(--accent-muted)] text-[var(--accent-ink)]",
        success:
          "bg-[var(--success-muted)] text-[var(--success-default)]",
        warning:
          "bg-[var(--warning-muted)] text-[var(--warning-default)]",
        error:
          "bg-[var(--error-muted)] text-[var(--error-default)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

export interface ChipProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  dot?: boolean
}

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, tone, dot, children, ...props }, ref) => (
    <span ref={ref} className={cn(chipVariants({ tone }), className)} {...props}>
      {dot && <ChipDot tone={tone ?? "neutral"} />}
      {children}
    </span>
  )
)
Chip.displayName = "Chip"

function ChipDot({ tone }: { tone: NonNullable<VariantProps<typeof chipVariants>["tone"]> }) {
  const color = {
    neutral: "var(--text-muted)",
    accent: "var(--accent-default)",
    success: "var(--success-default)",
    warning: "var(--warning-default)",
    error: "var(--error-default)",
  }[tone]
  return (
    <span
      aria-hidden
      className="w-[6px] h-[6px] rounded-full inline-block"
      style={{ background: color }}
    />
  )
}
