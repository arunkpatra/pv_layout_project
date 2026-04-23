import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

const iconButtonVariants = cva(
  "inline-flex items-center justify-center transition-colors duration-[120ms] disabled:opacity-40 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        ghost:
          "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]",
        subtle:
          "border border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[var(--text-primary)] hover:border-[var(--border-default)]",
      },
      size: {
        sm: "w-[24px] h-[24px] rounded-[var(--radius-sm)]",
        md: "w-[28px] h-[28px] rounded-[var(--radius-md)]",
        lg: "w-[32px] h-[32px] rounded-[var(--radius-md)]",
      },
      active: {
        true: "bg-[var(--surface-muted)] text-[var(--text-primary)]",
        false: "",
      },
    },
    defaultVariants: { variant: "ghost", size: "md", active: false },
  }
)

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  "aria-label": string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, active, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(iconButtonVariants({ variant, size, active }), className)}
      {...props}
    />
  )
)
IconButton.displayName = "IconButton"
