import { forwardRef, type ButtonHTMLAttributes } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[6px] font-medium whitespace-nowrap transition-colors duration-[120ms] select-none disabled:opacity-40 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent-default)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)]",
        subtle:
          "bg-[var(--surface-panel)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)]",
        ghost:
          "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]",
        destructive:
          "bg-[var(--error-default)] text-[var(--text-on-accent)] hover:brightness-110",
      },
      size: {
        sm: "h-[24px] px-[10px] text-[12px] rounded-[var(--radius-sm)]",
        md: "h-[28px] px-[12px] text-[13px] rounded-[var(--radius-md)]",
        lg: "h-[36px] px-[16px] text-[14px] rounded-[var(--radius-lg)]",
      },
    },
    defaultVariants: { variant: "subtle", size: "md" },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
