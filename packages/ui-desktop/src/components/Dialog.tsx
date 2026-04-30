import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { motion } from "framer-motion"
import { cn } from "../lib/cn"
import { dialogOpen } from "../lib/motion"

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = "DialogOverlay"

export interface DialogContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * Props forwarded to the underlying DialogOverlay. Consumers use this
   * to attach `data-tauri-drag-region` when the dialog is meant to be
   * non-dismissible (e.g. first-launch LicenseKeyDialog) — the overlay
   * then lets the user drag the window by clicking the dimmed area
   * around the dialog, instead of the click being a dead zone.
   *
   * Typed as `HTMLAttributes<HTMLDivElement>` so consumers can pass
   * arbitrary `data-*` attributes; Radix's own overlay-specific props
   * (DismissableLayer etc.) rarely need to be overridden from the
   * outside.
   */
  overlayProps?: HTMLAttributes<HTMLDivElement> & {
    [key: `data-${string}`]: string | number | boolean | undefined
  }
}

/**
 * Dialog content with Framer motion applied via the named `dialogOpen`
 * variant from docs/DESIGN_FOUNDATIONS.md §6.3.
 *
 * NOTE: we do NOT `forceMount` the Portal. Radix's default (mount on
 * open, unmount on close) is what we want — without an `AnimatePresence`
 * wrapper, `forceMount` leaves the motion.div stuck in its "enter" state
 * and the dialog becomes a zombie that stays visible after
 * `open={false}`. We lose framer's `exit` animation by not using
 * AnimatePresence, but the overlay's CSS-based fade-out (tailwindcss
 * animate data-state variants) still fires via Radix's built-in
 * presence mechanism.
 */
export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, overlayProps, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay {...overlayProps} />
    <DialogPrimitive.Content ref={ref} asChild {...props}>
      <motion.div
        variants={dialogOpen}
        initial="initial"
        animate="enter"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-[520px] bg-[var(--surface-panel)] rounded-[var(--radius-lg)] p-[24px] shadow-[var(--shadow-lg)] outline-none",
          className
        )}
      >
        {children}
      </motion.div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = "DialogContent"
