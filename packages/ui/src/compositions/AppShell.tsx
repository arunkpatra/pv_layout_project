import { motion, AnimatePresence } from "framer-motion"
import type { ReactNode } from "react"
import { durations, easings } from "../lib/motion"
import { cn } from "../lib/cn"

/**
 * AppShell — the canonical layout scaffold.
 *
 * Slots:
 *   topBar     — 44px, project breadcrumb + chips + user menu
 *   tabsBar    — 36px, multi-tab strip below topBar (S2; optional)
 *   toolRail   — 52px left rail (collapsible — width collapses to 0)
 *   canvas     — the protagonist; map or splash/empty state
 *   inspector  — 320px right panel (collapsible — width collapses to 0)
 *   statusBar  — 28px bottom bar
 *
 * Collapse motion uses `motion/sidebar-collapse` (180ms standard) per
 * docs/DESIGN_FOUNDATIONS.md §6.3.
 */
export function AppShell({
  topBar,
  tabsBar,
  toolRail,
  toolRailOpen = true,
  canvas,
  inspector,
  inspectorOpen = true,
  statusBar,
  className,
}: {
  topBar?: ReactNode
  tabsBar?: ReactNode
  toolRail?: ReactNode
  toolRailOpen?: boolean
  canvas: ReactNode
  inspector?: ReactNode
  inspectorOpen?: boolean
  statusBar?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "h-screen w-screen flex flex-col bg-[var(--surface-ground)] text-[var(--text-primary)] overflow-hidden",
        className
      )}
    >
      {topBar && (
        <header
          className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-ground)]"
          style={{ height: "var(--size-topbar, 44px)" }}
        >
          {topBar}
        </header>
      )}

      {tabsBar && (
        <div
          className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-ground)]"
          style={{ height: "var(--size-tabsbar, 36px)" }}
        >
          {tabsBar}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AnimatePresence initial={false} mode="sync">
          {toolRail && toolRailOpen && (
            <motion.aside
              key="tool-rail"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "var(--size-rail, 52px)", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{
                duration: durations.base,
                ease: easings.standard as unknown as number[],
              }}
              className="shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-ground)] overflow-hidden"
            >
              <div style={{ width: "var(--size-rail, 52px)" }} className="h-full">
                {toolRail}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="flex-1 relative overflow-hidden bg-[var(--surface-canvas)]">
          {canvas}
        </main>

        <AnimatePresence initial={false} mode="sync">
          {inspector && inspectorOpen && (
            <motion.aside
              key="inspector"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "var(--size-inspector, 320px)", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{
                duration: durations.base,
                ease: easings.standard as unknown as number[],
              }}
              className="shrink-0 border-l border-[var(--border-subtle)] bg-[var(--surface-ground)] overflow-y-auto overflow-x-hidden"
            >
              <div style={{ width: "var(--size-inspector, 320px)" }}>{inspector}</div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {statusBar && (
        <footer
          className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-ground)] text-[var(--text-muted)] text-[11px]"
          style={{ height: "var(--size-statusbar, 28px)" }}
        >
          {statusBar}
        </footer>
      )}
    </div>
  )
}
