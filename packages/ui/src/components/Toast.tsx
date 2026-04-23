import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react"
import * as ToastPrimitive from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "../lib/cn"

export const ToastProvider = ToastPrimitive.Provider

export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-[40px] right-[16px] z-50 flex flex-col gap-[8px] w-[380px] max-w-[calc(100vw-32px)] outline-none",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = "ToastViewport"

const toastVariants = cva(
  "relative pointer-events-auto flex w-full items-start gap-[12px] p-[14px] pr-[36px] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] bg-[var(--surface-panel)] border",
  {
    variants: {
      tone: {
        neutral: "border-[var(--border-subtle)]",
        success: "border-[var(--success-muted)]",
        warning: "border-[var(--warning-muted)]",
        error: "border-[var(--error-muted)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

interface ToastRootProps
  extends ComponentPropsWithoutRef<typeof ToastPrimitive.Root>,
    VariantProps<typeof toastVariants> {}

export const Toast = forwardRef<ElementRef<typeof ToastPrimitive.Root>, ToastRootProps>(
  ({ className, tone, ...props }, ref) => (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        toastVariants({ tone }),
        "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className
      )}
      {...props}
    />
  )
)
Toast.displayName = "Toast"

export const ToastTitle = forwardRef<
  ElementRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-[13px] font-semibold text-[var(--text-primary)]", className)}
    {...props}
  />
))
ToastTitle.displayName = "ToastTitle"

export const ToastDescription = forwardRef<
  ElementRef<typeof ToastPrimitive.Description>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-[12px] text-[var(--text-secondary)] mt-[2px] leading-normal", className)}
    {...props}
  />
))
ToastDescription.displayName = "ToastDescription"

export const ToastAction = ToastPrimitive.Action

export const ToastClose = forwardRef<
  ElementRef<typeof ToastPrimitive.Close>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "absolute top-[10px] right-[10px] w-[20px] h-[20px] inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)] transition-colors duration-[120ms]",
      className
    )}
    {...props}
  >
    <X className="w-[12px] h-[12px]" />
  </ToastPrimitive.Close>
))
ToastClose.displayName = "ToastClose"
