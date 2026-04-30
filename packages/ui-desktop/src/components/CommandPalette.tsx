import { Command } from "cmdk"
import { Search } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { type ReactNode } from "react"
import { cn } from "../lib/cn"
import { DialogOverlay } from "./Dialog"

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function CommandPalette({ open, onOpenChange, children }: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-[15vh] z-50 -translate-x-1/2 w-full max-w-[560px] bg-[var(--surface-popover)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] outline-none overflow-hidden"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Type to search commands, navigate results with the arrow keys, and
            press Enter to run.
          </DialogPrimitive.Description>
          <Command label="Command Menu" className="bg-transparent">
            <div className="flex items-center gap-[8px] px-[14px] h-[44px] border-b border-[var(--border-subtle)]">
              <Search className="w-[16px] h-[16px] text-[var(--text-muted)]" />
              <Command.Input
                placeholder="Type a command or search…"
                className="flex-1 bg-transparent outline-none text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
              />
            </div>
            <Command.List className="max-h-[360px] overflow-y-auto p-[6px]">
              <Command.Empty className="px-[12px] py-[20px] text-center text-[13px] text-[var(--text-muted)]">
                No results.
              </Command.Empty>
              {children}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export const CommandGroup = Command.Group
export const CommandItem = Command.Item
export const CommandSeparator = Command.Separator
