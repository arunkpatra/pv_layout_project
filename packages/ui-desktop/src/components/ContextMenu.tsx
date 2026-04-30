/**
 * ContextMenu — right-click menu primitive.
 *
 * Mirrors the surface shape of `DropdownMenu.tsx`: same item /
 * separator / label / sub-menu primitives, same token-driven styling,
 * same animation tokens. The two primitives diverge only on trigger
 * behavior (DropdownMenu opens on click; ContextMenu opens on
 * right-click / long-press). Radix gives us both via parallel
 * `react-dropdown-menu` + `react-context-menu` packages.
 *
 * Used by SP3 to attach Rename / Delete actions to open project tabs
 * via right-click.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"
import * as ContextPrimitive from "@radix-ui/react-context-menu"
import { Check, ChevronRight } from "lucide-react"
import { cn } from "../lib/cn"

export const ContextMenu = ContextPrimitive.Root
export const ContextMenuTrigger = ContextPrimitive.Trigger
export const ContextMenuGroup = ContextPrimitive.Group
export const ContextMenuSub = ContextPrimitive.Sub
export const ContextMenuRadioGroup = ContextPrimitive.RadioGroup

export const ContextMenuContent = forwardRef<
  ElementRef<typeof ContextPrimitive.Content>,
  ComponentPropsWithoutRef<typeof ContextPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Portal>
    <ContextPrimitive.Content
      ref={ref}
      className={cn(
        "z-50 min-w-[180px] bg-[var(--surface-popover)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-[4px] outline-none",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  </ContextPrimitive.Portal>
))
ContextMenuContent.displayName = "ContextMenuContent"

export const ContextMenuItem = forwardRef<
  ElementRef<typeof ContextPrimitive.Item>,
  ComponentPropsWithoutRef<typeof ContextPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <ContextPrimitive.Item
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
ContextMenuItem.displayName = "ContextMenuItem"

export const ContextMenuLabel = forwardRef<
  ElementRef<typeof ContextPrimitive.Label>,
  ComponentPropsWithoutRef<typeof ContextPrimitive.Label>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Label
    ref={ref}
    className={cn(
      "px-[10px] pt-[8px] pb-[4px] text-[10px] font-semibold tracking-[0.06em] uppercase text-[var(--text-muted)]",
      className
    )}
    {...props}
  />
))
ContextMenuLabel.displayName = "ContextMenuLabel"

export const ContextMenuSeparator = forwardRef<
  ElementRef<typeof ContextPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof ContextPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Separator
    ref={ref}
    className={cn("my-[4px] h-[1px] bg-[var(--border-subtle)]", className)}
    {...props}
  />
))
ContextMenuSeparator.displayName = "ContextMenuSeparator"

export const ContextMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn("font-mono text-[11px] text-[var(--text-muted)]", className)}
    {...props}
  />
)
ContextMenuShortcut.displayName = "ContextMenuShortcut"

export const ContextMenuCheckboxItem = forwardRef<
  ElementRef<typeof ContextPrimitive.CheckboxItem>,
  ComponentPropsWithoutRef<typeof ContextPrimitive.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <ContextPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex items-center gap-[10px] h-[28px] pl-[28px] pr-[10px] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)] cursor-default outline-none",
      "data-[highlighted]:bg-[var(--surface-muted)] data-[disabled]:opacity-40",
      className
    )}
    {...props}
  >
    <span className="absolute left-[8px] inline-flex w-[14px] h-[14px] items-center justify-center">
      <ContextPrimitive.ItemIndicator>
        <Check className="w-[12px] h-[12px] text-[var(--accent-default)]" />
      </ContextPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextPrimitive.CheckboxItem>
))
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem"

export const ContextMenuSubTrigger = forwardRef<
  ElementRef<typeof ContextPrimitive.SubTrigger>,
  ComponentPropsWithoutRef<typeof ContextPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <ContextPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex items-center justify-between gap-[12px] h-[28px] px-[10px] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)] cursor-default outline-none data-[highlighted]:bg-[var(--surface-muted)]",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="w-[12px] h-[12px] text-[var(--text-muted)]" />
  </ContextPrimitive.SubTrigger>
))
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger"

export const ContextMenuSubContent = forwardRef<
  ElementRef<typeof ContextPrimitive.SubContent>,
  ComponentPropsWithoutRef<typeof ContextPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[180px] bg-[var(--surface-popover)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-[4px] outline-none",
      className
    )}
    {...props}
  />
))
ContextMenuSubContent.displayName = "ContextMenuSubContent"
