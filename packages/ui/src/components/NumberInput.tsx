import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react"
import { cn } from "../lib/cn"

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  invalid?: boolean
  suffix?: ReactNode
}

/**
 * NumberInput with optional unit suffix (e.g. "m", "Wp").
 * Defaults `inputMode="decimal"` and `step="any"` so numeric keypads show
 * on touch devices and small fractional values (pitch, tilt) are accepted.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, invalid, suffix, ...props }, ref) => (
    <div
      className={cn(
        "flex items-stretch h-[28px] w-full rounded-[var(--radius-md)] border bg-[var(--surface-panel)] transition-colors duration-[120ms]",
        "focus-within:ring-2 focus-within:ring-[var(--border-focus)] focus-within:border-[var(--border-focus)]",
        invalid
          ? "border-[var(--error-default)]"
          : "border-[var(--border-subtle)] hover:border-[var(--border-default)]",
        className
      )}
    >
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        step="any"
        aria-invalid={invalid}
        className="flex-1 bg-transparent px-[10px] text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)] tabular-nums disabled:opacity-40 disabled:cursor-not-allowed appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        {...props}
      />
      {suffix && (
        <span className="inline-flex items-center pr-[10px] text-[12px] text-[var(--text-muted)] border-l border-[var(--border-subtle)] pl-[10px]">
          {suffix}
        </span>
      )}
    </div>
  )
)
NumberInput.displayName = "NumberInput"
