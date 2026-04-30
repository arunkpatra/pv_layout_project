import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"
import { DialogOverlay } from "./Dialog"

/** Side drawer — Radix Dialog in a panel-layout with side-specific transforms. */
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export const SheetTitle = DialogPrimitive.Title
export const SheetDescription = DialogPrimitive.Description

const sheetVariants = cva(
  "fixed z-50 bg-[var(--surface-panel)] shadow-[var(--shadow-lg)] outline-none flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        left: "inset-y-0 left-0 w-[360px] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left border-r border-[var(--border-subtle)]",
        right:
          "inset-y-0 right-0 w-[360px] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right border-l border-[var(--border-subtle)]",
        top: "inset-x-0 top-0 h-[320px] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top border-b border-[var(--border-subtle)]",
        bottom:
          "inset-x-0 bottom-0 h-[320px] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom border-t border-[var(--border-subtle)]",
      },
    },
    defaultVariants: { side: "right" },
  }
)

interface SheetContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, side, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
SheetContent.displayName = "SheetContent"
