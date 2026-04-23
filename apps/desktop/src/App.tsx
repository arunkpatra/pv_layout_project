import { useCallback, useEffect, useState, type JSX } from "react"
import { invoke } from "@tauri-apps/api/core"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { createSidecarClient } from "@solarlayout/sidecar-client"
import {
  AppShell,
  Chip,
  CommandBarHint,
  CommandGroup,
  CommandItem,
  CommandPalette,
  CommandSeparator,
  EmptyStateCard,
  InspectorRoot,
  InspectorSection,
  MapCanvas,
  Splash,
  StatusBar,
  ToolRail,
  TopBar,
  type ToolId,
} from "@solarlayout/ui"

/**
 * S6 shell. Lifecycle:
 *
 *   booting  → <Splash /> with indeterminate progress
 *   healthy  → AppShell: TopBar / ToolRail / MapCanvas (empty card) / Inspector / StatusBar
 *   error    → error card centered on the canvas
 *
 * Business logic (KMZ load, generate, exports, etc.) arrives in S8+.
 */

type Phase =
  | { kind: "booting"; note?: string }
  | { kind: "healthy"; version: string; port: number }
  | { kind: "error"; detail: string }

interface SidecarConfig {
  host: string
  port: number
  token: string
  version: string
}

export function App(): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: "booting" })
  const [activeTool, setActiveTool] = useState<ToolId>("select")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toolRailOpen, setToolRailOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [units, setUnits] = useState<"m" | "ft">("m")

  // Sidecar boot.
  useEffect(() => {
    // Design-preview fallback: when the app is loaded outside the Tauri
    // runtime (e.g. `vite preview` for screenshot-based design reviews),
    // skip sidecar boot and render the healthy shell with mock values.
    const inTauri =
      typeof window !== "undefined" &&
      "__TAURI_INTERNALS__" in window
    if (!inTauri) {
      setPhase({ kind: "healthy", version: "preview", port: 0 })
      return
    }

    // Minimum splash display so a warm-cache boot doesn't flash.
    // Hold the splash long enough for the user to register it; anything
    // faster and the app feels like it opened already-running, which
    // disorients people waiting for the window to settle.
    const MIN_SPLASH_MS = 900
    const bootStart = performance.now()

    let cancelled = false
    ;(async () => {
      try {
        setPhase({ kind: "booting", note: "Starting engine…" })
        const cfg = await invoke<SidecarConfig>("get_sidecar_config")
        if (cancelled) return

        const client = createSidecarClient({
          host: cfg.host,
          port: cfg.port,
          token: cfg.token,
          fetchImpl: tauriFetch as typeof fetch,
        })
        const health = await client.health()
        if (cancelled) return

        const elapsed = performance.now() - bootStart
        const remaining = MIN_SPLASH_MS - elapsed
        if (remaining > 0) {
          await new Promise((r) => setTimeout(r, remaining))
          if (cancelled) return
        }

        setPhase({ kind: "healthy", version: health.version, port: cfg.port })
      } catch (err) {
        if (cancelled) return
        const parts: string[] = []
        if (err instanceof Error) parts.push(err.name, err.message, err.stack ?? "")
        else parts.push(String(err))
        const message = parts.filter(Boolean).join(" | ")
        console.error("Sidecar boot failed:", err)
        setPhase({ kind: "error", detail: message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ⌘K / Ctrl-K global.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      if (e.key === "Escape") setPaletteOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const openPalette = useCallback(() => setPaletteOpen(true), [])

  const booting = phase.kind === "booting"
  const healthy = phase.kind === "healthy"

  return (
    <>
      {booting && (
        <div className="fixed inset-0 z-50">
          <Splash
            statusText={phase.kind === "booting" ? phase.note ?? "Starting engine…" : undefined}
          />
        </div>
      )}

      <AppShell
        toolRailOpen={toolRailOpen}
        inspectorOpen={inspectorOpen}
        topBar={
          <TopBar
            projectName={undefined}
            chip={healthy ? <Chip tone="accent">Pro</Chip> : undefined}
            onCommandPaletteClick={openPalette}
            onToggleToolRail={() => setToolRailOpen((v) => !v)}
            onToggleInspector={() => setInspectorOpen((v) => !v)}
            userInitials="AP"
            userName="Arun Patra"
            userEmail="arun@journium.app"
          />
        }
        toolRail={<ToolRail activeTool={activeTool} onSelect={setActiveTool} />}
        canvas={
          <MapCanvas>
            {healthy && <CommandBarHint onClick={openPalette} />}
            {phase.kind === "error" ? (
              <ErrorCard detail={phase.detail} />
            ) : (
              <EmptyStateCard />
            )}
          </MapCanvas>
        }
        inspector={<InspectorSkeleton />}
        statusBar={
          <StatusBar
            sidecarHealthy={healthy}
            sidecarLabel={
              healthy
                ? `Sidecar healthy · engine ${phase.version}`
                : phase.kind === "error"
                  ? "Sidecar unavailable"
                  : "Sidecar starting…"
            }
            leftMeta={healthy ? "No project loaded" : undefined}
            units={units}
            onUnitsChange={setUnits}
            zoomPercent={healthy ? 100 : undefined}
            showFps={import.meta.env.DEV}
          />
        }
      />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandGroup heading="File" className="px-[4px] py-[4px]">
          <PaletteItem label="Open KMZ…" shortcut="⌘O" />
          <PaletteItem label="Save project" shortcut="⌘S" />
          <PaletteItem label="Export…" shortcut="⌘E" />
        </CommandGroup>
        <CommandSeparator className="my-[4px] h-[1px] bg-[var(--border-subtle)]" />
        <CommandGroup heading="Canvas" className="px-[4px] py-[4px]">
          <PaletteItem label="Generate layout" shortcut="G" />
          <PaletteItem label="Toggle theme" />
          <PaletteItem
            label="Toggle tool rail"
            onSelect={() => setToolRailOpen((v) => !v)}
          />
          <PaletteItem
            label="Toggle inspector"
            onSelect={() => setInspectorOpen((v) => !v)}
          />
        </CommandGroup>
      </CommandPalette>
    </>
  )
}

function PaletteItem({
  label,
  shortcut,
  onSelect,
}: {
  label: string
  shortcut?: string
  onSelect?: () => void
}) {
  return (
    <CommandItem
      className="flex items-center justify-between px-[10px] h-[32px] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)] cursor-pointer data-[selected=true]:bg-[var(--surface-muted)] data-[selected=true]:text-[var(--text-primary)]"
      value={label}
      onSelect={onSelect}
    >
      <span>{label}</span>
      {shortcut && (
        <kbd className="font-mono text-[11px] text-[var(--text-muted)]">{shortcut}</kbd>
      )}
    </CommandItem>
  )
}

function InspectorSkeleton() {
  return (
    <InspectorRoot>
      <InspectorSection title="Layout summary">
        <p className="text-[12px] text-[var(--text-muted)] leading-normal">
          Load a KMZ to generate a layout and see metrics here.
        </p>
      </InspectorSection>
      <InspectorSection title="Area">
        <div className="flex flex-col gap-[8px]">
          <SkeletonBar width="75%" />
          <SkeletonBar width="60%" />
          <SkeletonBar width="80%" />
          <SkeletonBar width="55%" />
        </div>
      </InspectorSection>
      <InspectorSection title="Layers">
        <p className="text-[12px] text-[var(--text-muted)] leading-normal">
          Layers will appear once a layout is generated.
        </p>
      </InspectorSection>
    </InspectorRoot>
  )
}

function SkeletonBar({ width }: { width: string }) {
  return (
    <span
      aria-hidden
      className="block h-[8px] rounded-[var(--radius-sm)] bg-[var(--surface-muted)]"
      style={{ width }}
    />
  )
}

function ErrorCard({ detail }: { detail: string }) {
  return (
    <div className="max-w-[420px] bg-[var(--surface-panel)] border border-[var(--error-muted)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-[20px] flex flex-col gap-[8px]">
      <h2 className="text-[14px] font-semibold text-[var(--error-default)]">Sidecar unavailable</h2>
      <p className="text-[12px] text-[var(--text-secondary)] leading-normal break-words">
        {detail || "The layout engine didn't come up. Check the desktop log and relaunch."}
      </p>
    </div>
  )
}
