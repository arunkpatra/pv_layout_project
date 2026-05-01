import { cva, type VariantProps } from "class-variance-authority"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react"
import { forwardRef, type HTMLAttributes } from "react"
import { cn } from "../lib/cn"

/**
 * Alert — multi-line, wrap-friendly notice with a tone-aware leading icon.
 *
 * Use this (not `Chip`) when the message is a sentence or longer, or when
 * the surrounding container width can vary (e.g., the Inspector panel).
 * Chip is `whitespace-nowrap` by design and is for short labels only.
 *
 * Tones reuse the existing semantic surface tokens (matches Chip + Badge):
 *   - info:    surface-muted   + text-primary       (default)
 *   - warning: warning-muted   + warning-default
 *   - error:   error-muted     + error-default
 *   - success: success-muted   + success-default
 *
 * The default icon is chosen per tone (Info / AlertTriangle / AlertCircle /
 * CheckCircle2). Pass `icon={SomeLucideIcon}` to override, or `icon={null}`
 * to omit the icon entirely.
 */
const alertVariants = cva(
  "flex items-start gap-[8px] rounded-[var(--radius-md)] px-[10px] py-[8px] text-[12px] leading-[1.45]",
  {
    variants: {
      tone: {
        info: "bg-[var(--surface-muted)] text-[var(--text-primary)]",
        warning: "bg-[var(--warning-muted)] text-[var(--warning-default)]",
        error: "bg-[var(--error-muted)] text-[var(--error-default)]",
        success: "bg-[var(--success-muted)] text-[var(--success-default)]",
      },
    },
    defaultVariants: { tone: "info" },
  }
)

type AlertTone = "info" | "warning" | "error" | "success"

const defaultIcons: Record<AlertTone, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle2,
}

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "role">,
    VariantProps<typeof alertVariants> {
  /** Override the default icon for the tone. Pass `null` to omit. */
  icon?: LucideIcon | null
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, tone, icon, children, ...props }, ref) => {
    const resolvedTone: AlertTone = tone ?? "info"
    const Icon = icon === null ? null : (icon ?? defaultIcons[resolvedTone])
    return (
      <div
        ref={ref}
        className={cn(alertVariants({ tone: resolvedTone }), className)}
        role="alert"
        {...props}
      >
        {Icon && (
          <Icon className="size-[14px] shrink-0 mt-[2px]" aria-hidden />
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    )
  }
)
Alert.displayName = "Alert"
