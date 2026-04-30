import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight } from "lucide-react"
import { cn } from "../lib/cn"

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export const DropdownMenuGroup = DropdownPrimitive.Group
export const DropdownMenuSub = DropdownPrimitive.Sub
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 6, align = "end", ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        "z-50 min-w-[200px] bg-[var(--surface-popover)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-[4px] outline-none",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
))
DropdownMenuContent.displayName = "DropdownMenuContent"

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      "flex items-center justify-between gap-[12px] h-[28px] px-[10px] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)] cursor-default outline-none",
      "data-[highlighted]:bg-[var(--surface-muted)]",
      "data-[disabled]:opacity-40 data-[disabled]:pointer-events-none",
      inset && "pl-[28px]",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = "DropdownMenuItem"

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof DropdownPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Label
    ref={ref}
    className={cn(
      "px-[10px] pt-[8px] pb-[4px] text-[10px] font-semibold tracking-[0.06em] uppercase text-[var(--text-muted)]",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = "DropdownMenuLabel"

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DropdownPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Separator
    ref={ref}
    className={cn("my-[4px] h-[1px] bg-[var(--border-subtle)]", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = "DropdownMenuSeparator"

export const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("font-mono text-[11px] text-[var(--text-muted)]", className)} {...props} />
)
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export const DropdownMenuCheckboxItem = forwardRef<
  ElementRef<typeof DropdownPrimitive.CheckboxItem>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <DropdownPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex items-center gap-[10px] h-[28px] pl-[28px] pr-[10px] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)] cursor-default outline-none",
      "data-[highlighted]:bg-[var(--surface-muted)] data-[disabled]:opacity-40",
      className
    )}
    {...props}
  >
    <span className="absolute left-[8px] inline-flex w-[14px] h-[14px] items-center justify-center">
      <DropdownPrimitive.ItemIndicator>
        <Check className="w-[12px] h-[12px] text-[var(--accent-default)]" />
      </DropdownPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem"

export const DropdownMenuSubTrigger = forwardRef<
  ElementRef<typeof DropdownPrimitive.SubTrigger>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex items-center justify-between gap-[12px] h-[28px] px-[10px] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)] cursor-default outline-none data-[highlighted]:bg-[var(--surface-muted)]",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="w-[12px] h-[12px] text-[var(--text-muted)]" />
  </DropdownPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger"

export const DropdownMenuSubContent = forwardRef<
  ElementRef<typeof DropdownPrimitive.SubContent>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[180px] bg-[var(--surface-popover)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-[4px] outline-none",
      className
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName = "DropdownMenuSubContent"
