import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "../lib/cn"

export const Label = forwardRef<
  ElementRef<typeof LabelPrimitive.Root>,
  ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-[12px] font-medium text-[var(--text-secondary)] leading-[1.25] select-none",
      className
    )}
    {...props}
  />
))
Label.displayName = "Label"
