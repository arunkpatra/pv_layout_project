import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { motion } from "framer-motion"
import { cn } from "../lib/cn"
import { durations, easings } from "../lib/motion"

export const Tabs = TabsPrimitive.Root

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-[16px] border-b border-[var(--border-subtle)]",
      className
    )}
    {...props}
  />
))
TabsList.displayName = "TabsList"

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "h-[32px] text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-[120ms] border-b-2 border-transparent -mb-[1px]",
      "hover:text-[var(--text-primary)]",
      "data-[state=active]:text-[var(--text-primary)] data-[state=active]:border-[var(--text-primary)]",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = "TabsTrigger"

/** Tab content — cross-fade between panels via the tab-switch motion primitive. */
export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-[16px] outline-none", className)} {...props}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: durations.fast,
        ease: easings.standard as unknown as number[],
      }}
    >
      {children}
    </motion.div>
  </TabsPrimitive.Content>
))
TabsContent.displayName = "TabsContent"
