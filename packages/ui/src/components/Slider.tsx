import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "../lib/cn"

export const Slider = forwardRef<
  ElementRef<typeof SliderPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center h-[20px]",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative grow h-[3px] rounded-full bg-[var(--surface-muted)]">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-[var(--accent-default)]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block w-[14px] h-[14px] rounded-full bg-[var(--surface-panel)] border border-[var(--border-default)] shadow-[var(--shadow-xs)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
        "hover:border-[var(--border-strong)]",
        "disabled:opacity-40"
      )}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = "Slider"
