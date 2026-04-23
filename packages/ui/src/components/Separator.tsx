import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"
import { cn } from "../lib/cn"

export const Separator = forwardRef<
  ElementRef<typeof SeparatorPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "bg-[var(--border-subtle)]",
      orientation === "horizontal" ? "h-[1px] w-full" : "w-[1px] h-full",
      className
    )}
    {...props}
  />
))
Separator.displayName = "Separator"
