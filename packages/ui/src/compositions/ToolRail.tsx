import {
  Circle,
  Hand,
  MousePointer2,
  Pencil,
  Ruler,
  Square,
  Zap,
} from "lucide-react"
import { type ComponentType } from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { IconButton } from "../components/IconButton"
import { TooltipContent, TooltipTrigger } from "../components/Tooltip"
import { Separator } from "../components/Separator"
import { cn } from "../lib/cn"

export type ToolId =
  | "select"
  | "pan"
  | "draw-rect"
  | "draw-polygon"
  | "draw-line"
  | "icr"
  | "measure"

interface ToolDef {
  id: ToolId
  label: string
  icon: ComponentType<{ className?: string }>
  shortcut: string
  groupBreakAfter?: boolean
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", icon: MousePointer2, shortcut: "V" },
  { id: "pan", label: "Pan", icon: Hand, shortcut: "H", groupBreakAfter: true },
  { id: "draw-rect", label: "Draw rectangle", icon: Square, shortcut: "R" },
  { id: "draw-polygon", label: "Draw polygon", icon: Pencil, shortcut: "P" },
  {
    id: "draw-line",
    label: "Draw line (TL corridor)",
    icon: Zap,
    shortcut: "L",
    groupBreakAfter: true,
  },
  { id: "icr", label: "ICR placement", icon: Circle, shortcut: "I" },
  { id: "measure", label: "Measure", icon: Ruler, shortcut: "M" },
]

export function ToolRail({
  activeTool,
  onSelect,
}: {
  activeTool?: ToolId
  onSelect?: (id: ToolId) => void
}) {
  return (
    <nav className="h-full flex flex-col items-center pt-[12px] gap-[4px]" aria-label="Tools">
      {TOOLS.map((tool) => (
        <div key={tool.id} className="w-full flex flex-col items-center gap-[4px]">
          <TooltipPrimitive.Root delayDuration={300}>
            <TooltipTrigger asChild>
              <IconButton
                aria-label={tool.label}
                active={activeTool === tool.id}
                onClick={() => onSelect?.(tool.id)}
                size="lg"
              >
                <tool.icon className={cn("w-[18px] h-[18px]")} />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-[8px]">
              {tool.label}
              <span className="text-[var(--text-muted)] text-[11px] font-mono">{tool.shortcut}</span>
            </TooltipContent>
          </TooltipPrimitive.Root>
          {tool.groupBreakAfter && <Separator className="my-[6px] w-[20px]" />}
        </div>
      ))}
    </nav>
  )
}
