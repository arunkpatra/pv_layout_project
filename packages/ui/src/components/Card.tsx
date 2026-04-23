import { forwardRef, type HTMLAttributes } from "react"
import { cn } from "../lib/cn"

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)]",
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-[20px] pb-[12px]", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-[20px] py-[12px]", className)} {...props} />
  )
)
CardBody.displayName = "CardBody"

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("px-[20px] py-[12px] border-t border-[var(--border-subtle)]", className)}
      {...props}
    />
  )
)
CardFooter.displayName = "CardFooter"
