import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react"
import { ChevronDown } from "lucide-react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { PopoverContent } from "./Popover"
import { cn } from "../lib/cn"

/**
 * Lightweight Select wrapping Radix Popover.
 *
 * Keeps token-driven styling consistent with Input + NumberInput; avoids
 * pulling in @radix-ui/react-select's full positioning engine for the
 * simple desktop-inspector use-case we have today. Swap to RadixSelect in
 * a future spike if we need virtualized long lists or native typeahead.
 */
interface SelectContextValue {
  value: string | undefined
  onValueChange: (v: string) => void
  onClose: () => void
}

const SelectContext = createContext<SelectContextValue | null>(null)

export interface SelectProps {
  value?: string
  onValueChange?: (v: string) => void
  placeholder?: string
  children: ReactNode
  className?: string
  disabled?: boolean
}

export function Select({
  value,
  onValueChange,
  placeholder,
  children,
  className,
  disabled,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const selectedLabel = findSelectedLabel(value, children)

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: (v) => onValueChange?.(v),
        onClose: () => setOpen(false),
      }}
    >
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <SelectTrigger disabled={disabled} className={className}>
            <span
              className={cn(
                "truncate",
                selectedLabel ? "text-[var(--text-primary)]" : "text-[var(--text-placeholder)]"
              )}
            >
              {selectedLabel ?? placeholder ?? "Select…"}
            </span>
            <ChevronDown className="w-[12px] h-[12px] text-[var(--text-muted)] shrink-0" />
          </SelectTrigger>
        </PopoverPrimitive.Trigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-[4px]"
          align="start"
        >
          <div role="listbox">{children}</div>
        </PopoverContent>
      </PopoverPrimitive.Root>
    </SelectContext.Provider>
  )
}

const SelectTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex items-center justify-between gap-[8px] h-[28px] w-full px-[10px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[13px]",
        "hover:border-[var(--border-default)] transition-colors duration-[120ms]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
)
SelectTrigger.displayName = "SelectTrigger"

export interface SelectItemProps {
  value: string
  children: ReactNode
  disabled?: boolean
  className?: string
}

export function SelectItem({ value, children, disabled, className }: SelectItemProps) {
  const ctx = useContext(SelectContext)
  if (!ctx) throw new Error("SelectItem must be a child of Select")
  const isSelected = ctx.value === value
  return (
    <button
      role="option"
      aria-selected={isSelected}
      disabled={disabled}
      type="button"
      onClick={() => {
        ctx.onValueChange(value)
        ctx.onClose()
      }}
      className={cn(
        "flex w-full items-center justify-between h-[28px] px-[10px] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)] cursor-default text-left",
        "hover:bg-[var(--surface-muted)]",
        "data-[selected=true]:bg-[var(--surface-muted)]",
        isSelected && "font-medium",
        "disabled:opacity-40 disabled:pointer-events-none",
        className
      )}
      data-selected={isSelected || undefined}
    >
      {children}
    </button>
  )
}

function findSelectedLabel(value: string | undefined, children: ReactNode): ReactNode | null {
  if (!value) return null
  let result: ReactNode | null = null
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const { props } = child as ReactElement<SelectItemProps>
    if (props.value === value) result = props.children ?? null
  })
  return result
}
