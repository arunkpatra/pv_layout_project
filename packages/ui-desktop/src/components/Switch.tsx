import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { cn } from "../lib/cn"

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "relative inline-flex items-center shrink-0 h-[20px] w-[34px] rounded-full transition-colors duration-[120ms]",
      "border border-transparent outline-none",
      "data-[state=checked]:bg-[var(--accent-default)] data-[state=unchecked]:bg-[var(--surface-muted)]",
      "disabled:opacity-40 disabled:cursor-not-allowed",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "block w-[14px] h-[14px] rounded-full bg-[var(--surface-panel)] shadow-[var(--shadow-xs)]",
        "transition-transform duration-[120ms]",
        "translate-x-[3px] data-[state=checked]:translate-x-[17px]"
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = "Switch"
