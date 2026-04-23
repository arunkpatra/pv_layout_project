import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { cn } from "../lib/cn"

/**
 * Segmented control — single-select only (Portrait / Landscape, etc.).
 *
 * We narrow Radix ToggleGroup's discriminated union to the "single" form
 * explicitly. For multi-select chip bars, use Radix ToggleGroup directly.
 */
export interface SegmentedProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  children?: ReactNode
  className?: string
  "aria-label"?: string
}

export const Segmented = forwardRef<
  ElementRef<typeof ToggleGroupPrimitive.Root>,
  SegmentedProps
>(({ className, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    type="single"
    className={cn(
      "inline-flex items-center p-[2px] rounded-[var(--radius-md)] bg-[var(--surface-muted)] gap-[2px]",
      className
    )}
    {...props}
  >
    {children}
  </ToggleGroupPrimitive.Root>
))
Segmented.displayName = "Segmented"

export const SegmentedItem = forwardRef<
  ElementRef<typeof ToggleGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "h-[22px] px-[10px] rounded-[calc(var(--radius-md)-2px)] text-[12px] font-medium text-[var(--text-secondary)]",
      "transition-colors duration-[120ms]",
      "hover:text-[var(--text-primary)]",
      "data-[state=on]:bg-[var(--surface-panel)] data-[state=on]:text-[var(--text-primary)] data-[state=on]:shadow-[var(--shadow-xs)]",
      className
    )}
    {...props}
  />
))
SegmentedItem.displayName = "SegmentedItem"
