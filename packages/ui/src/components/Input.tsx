import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "../lib/cn"

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid}
      className={cn(
        "h-[28px] w-full px-[10px] rounded-[var(--radius-md)] border bg-[var(--surface-panel)] text-[13px] text-[var(--text-primary)]",
        "placeholder:text-[var(--text-placeholder)]",
        "transition-colors duration-[120ms]",
        "focus:outline-none focus-visible:border-[var(--border-focus)] focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-0",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        invalid
          ? "border-[var(--error-default)]"
          : "border-[var(--border-subtle)] hover:border-[var(--border-default)]",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"
