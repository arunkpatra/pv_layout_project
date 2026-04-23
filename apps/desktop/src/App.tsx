import { useCallback, useEffect, useState, type JSX } from "react"
import { invoke } from "@tauri-apps/api/core"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { useQueryClient } from "@tanstack/react-query"
import { createSidecarClient } from "@solarlayout/sidecar-client"
import type { Entitlements } from "@solarlayout/entitlements-client"
import {
  AppShell,
  Button,
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
import {
  clearLicenseKey,
  getLicenseKey,
  saveLicenseKey,
} from "./auth/licenseKey"
import {
  useEntitlementsQuery,
  useSyncEntitlementsToSidecar,
} from "./auth/useEntitlements"
import { EntitlementsProvider } from "./auth/EntitlementsProvider"
import { LicenseKeyDialog } from "./dialogs/LicenseKeyDialog"
import { LicenseInfoDialog } from "./dialogs/LicenseInfoDialog"

/**
 * App shell orchestrator.
 *
 * State machine (all covered by the S7 Human Gate):
 *
 *   sidecar-booting   → Splash
 *   sidecar-error     → Splash + error detail
 *   no-license        → Splash + blocking LicenseKeyDialog (first-launch)
 *   validating        → Splash "Verifying licence…"
 *   license-error     → Splash + retry surface
 *   ready             → full shell + TopBar chip = plans[0].planName
 *
 * Business logic (KMZ load, generate, exports, etc.) arrives in S8+.
 */

type SidecarPhase =
  | { kind: "booting"; note?: string }
  | { kind: "healthy"; version: string; host: string; port: number; token: string }
  | { kind: "error"; detail: string }

interface SidecarConfig {
  host: string
  port: number
  token: string
  version: string
}

const inTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export function App(): JSX.Element {
  const [sidecarPhase, setSidecarPhase] = useState<SidecarPhase>({ kind: "booting" })
  const [activeTool, setActiveTool] = useState<ToolId>("select")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toolRailOpen, setToolRailOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [units, setUnits] = useState<"m" | "ft">("m")
  const [infoDialogOpen, setInfoDialogOpen] = useState(false)
  const [changeKeyDialogOpen, setChangeKeyDialogOpen] = useState(false)

  // License state — see the "State machine" doc comment at the top.
  const [bootKeyLoaded, setBootKeyLoaded] = useState(false)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const activeKey = pendingKey ?? savedKey

  const queryClient = useQueryClient()

  // ── Sidecar boot ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!inTauri()) {
      // Design-preview fallback (vite preview / headless screenshots).
      setSidecarPhase({
        kind: "healthy",
        version: "preview",
        host: "127.0.0.1",
        port: 0,
        token: "preview",
      })
      return
    }

    const MIN_SPLASH_MS = 900
    const bootStart = performance.now()
    let cancelled = false

    void (async () => {
      try {
        setSidecarPhase({ kind: "booting", note: "Starting engine…" })
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
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
        if (cancelled) return

        setSidecarPhase({
          kind: "healthy",
          version: health.version,
          host: cfg.host,
          port: cfg.port,
          token: cfg.token,
        })
      } catch (err) {
        if (cancelled) return
        const detail =
          err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        console.error("Sidecar boot failed:", err)
        setSidecarPhase({ kind: "error", detail })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // ── Load license key from keyring ONCE sidecar is healthy ────────────────
  useEffect(() => {
    if (sidecarPhase.kind !== "healthy") return
    if (bootKeyLoaded) return
    let cancelled = false
    void (async () => {
      try {
        const key = await getLicenseKey()
        if (cancelled) return
        setSavedKey(key)
      } catch (err) {
        console.warn("keyring read failed:", err)
      } finally {
        if (!cancelled) setBootKeyLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sidecarPhase.kind, bootKeyLoaded])

  // ── Entitlements query ────────────────────────────────────────────────────
  const entQuery = useEntitlementsQuery(activeKey)

  // On successful fetch: if the key was pending (newly entered), promote it
  // to saved + persist to keyring. If the key was already saved, no-op.
  useEffect(() => {
    if (!entQuery.isSuccess) return
    if (pendingKey && pendingKey !== savedKey) {
      void saveLicenseKey(pendingKey).catch((err) =>
        console.error("keyring save failed:", err)
      )
      setSavedKey(pendingKey)
      setPendingKey(null)
      setValidationError(null)
      setChangeKeyDialogOpen(false)
    }
  }, [entQuery.isSuccess, pendingKey, savedKey])

  // On 401: if the key was pending, surface an inline error in the dialog;
  // if the key was the saved one, clear keyring and drop back to no-license.
  useEffect(() => {
    const err = entQuery.error
    if (!err) return
    if (err.status === 401) {
      if (pendingKey) {
        setValidationError(err.message || "License key not recognised.")
        setPendingKey(null)
      } else {
        // Stored key is no good — revoked or server rotated. Clear + restart flow.
        void clearLicenseKey().catch(() => {})
        setSavedKey(null)
        setValidationError(err.message || "Stored license key is no longer valid.")
      }
      queryClient.removeQueries({ queryKey: ["entitlements"] })
    }
  }, [entQuery.error, pendingKey, queryClient])

  // ── Push entitlements to sidecar ─────────────────────────────────────────
  const sidecarEndpoint =
    sidecarPhase.kind === "healthy"
      ? { host: sidecarPhase.host, port: sidecarPhase.port, token: sidecarPhase.token }
      : null
  useSyncEntitlementsToSidecar(entQuery.data, sidecarEndpoint)

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleSubmitKey = useCallback((key: string) => {
    setValidationError(null)
    setPendingKey(key)
  }, [])

  const handleCancelChangeKey = useCallback(() => {
    setChangeKeyDialogOpen(false)
    setPendingKey(null)
    setValidationError(null)
  }, [])

  const handleClearLicense = useCallback(async () => {
    await clearLicenseKey().catch(() => {})
    setSavedKey(null)
    setPendingKey(null)
    setValidationError(null)
    setInfoDialogOpen(false)
    setChangeKeyDialogOpen(false)
    queryClient.removeQueries({ queryKey: ["entitlements"] })
  }, [queryClient])

  const handleRetryEntitlements = useCallback(() => {
    void entQuery.refetch()
  }, [entQuery])

  const openPalette = useCallback(() => setPaletteOpen(true), [])

  // ── ⌘K / Ctrl-K global ───────────────────────────────────────────────────
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

  // ── Render decisions ─────────────────────────────────────────────────────

  // 1) Sidecar not up yet / errored — Splash only.
  if (sidecarPhase.kind !== "healthy") {
    const note =
      sidecarPhase.kind === "booting"
        ? sidecarPhase.note ?? "Starting engine…"
        : "Engine unavailable — relaunch the app."
    return (
      <div className="fixed inset-0 z-50">
        <Splash statusText={note} />
        {sidecarPhase.kind === "error" && (
          <BlockingOverlay title="Engine unavailable" detail={sidecarPhase.detail} />
        )}
      </div>
    )
  }

  // 2) Still reading keyring.
  if (!bootKeyLoaded) {
    return (
      <div className="fixed inset-0 z-50">
        <Splash statusText="Loading…" />
      </div>
    )
  }

  // 3) No license on file AND no in-flight validation → first-launch dialog.
  if (!activeKey) {
    return (
      <div className="fixed inset-0 z-50">
        <Splash statusText="License required" />
        <LicenseKeyDialog
          open
          mode="first-launch"
          onSubmit={handleSubmitKey}
          submitting={entQuery.isFetching}
          errorMessage={validationError ?? undefined}
        />
      </div>
    )
  }

  // 4) Key present — handle the entitlements query's life cycle.
  if (entQuery.isPending || entQuery.isFetching) {
    return (
      <div className="fixed inset-0 z-50">
        <Splash statusText="Verifying licence…" />
        {pendingKey && (
          <LicenseKeyDialog
            open
            mode={changeKeyDialogOpen ? "change" : "first-launch"}
            onSubmit={handleSubmitKey}
            onCancel={handleCancelChangeKey}
            submitting
            errorMessage={validationError ?? undefined}
          />
        )}
      </div>
    )
  }

  if (entQuery.isError) {
    // Non-401 errors: network, 5xx, schema. Don't clear — let user retry.
    return (
      <div className="fixed inset-0 z-50">
        <Splash statusText="Couldn't verify licence" />
        <BlockingOverlay
          title="Couldn't verify licence"
          detail={
            entQuery.error?.message ??
            "We couldn't reach api.solarlayout.in. Check your connection and retry."
          }
          action={{ label: "Retry", onClick: handleRetryEntitlements }}
        />
      </div>
    )
  }

  // 5) Ready — render the full shell with entitlements in context.
  const entitlements = entQuery.data as Entitlements
  const planName = entitlements.plans[0]?.planName ?? "Free"

  return (
    <EntitlementsProvider
      value={{
        entitlements,
        licenseKey: savedKey,
        onClearLicense: handleClearLicense,
        onOpenLicenseInfo: () => setInfoDialogOpen(true),
      }}
    >
      <AppShell
        toolRailOpen={toolRailOpen}
        inspectorOpen={inspectorOpen}
        topBar={
          <TopBar
            projectName={undefined}
            chip={<Chip tone="accent">{planName}</Chip>}
            onCommandPaletteClick={openPalette}
            onToggleToolRail={() => setToolRailOpen((v) => !v)}
            onToggleInspector={() => setInspectorOpen((v) => !v)}
            userInitials={initialsFor(entitlements.user.name) ?? "--"}
            userName={entitlements.user.name ?? undefined}
            userEmail={entitlements.user.email ?? undefined}
            onViewLicense={() => setInfoDialogOpen(true)}
            onClearLicense={() => void handleClearLicense()}
          />
        }
        toolRail={<ToolRail activeTool={activeTool} onSelect={setActiveTool} />}
        canvas={
          <MapCanvas>
            <CommandBarHint onClick={openPalette} />
            <EmptyStateCard />
          </MapCanvas>
        }
        inspector={<InspectorSkeleton />}
        statusBar={
          <StatusBar
            sidecarHealthy
            sidecarLabel={`Sidecar healthy · engine ${sidecarPhase.version}`}
            leftMeta="No project loaded"
            units={units}
            onUnitsChange={setUnits}
            zoomPercent={100}
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
          <PaletteItem
            label="View licence"
            onSelect={() => setInfoDialogOpen(true)}
          />
          <PaletteItem
            label="Clear licence"
            onSelect={() => void handleClearLicense()}
          />
        </CommandGroup>
      </CommandPalette>

      <LicenseInfoDialog
        open={infoDialogOpen}
        onOpenChange={setInfoDialogOpen}
        entitlements={entitlements}
        onChangeKey={() => {
          setInfoDialogOpen(false)
          setChangeKeyDialogOpen(true)
        }}
        onClearLicense={() => void handleClearLicense()}
      />

      <LicenseKeyDialog
        open={changeKeyDialogOpen}
        mode="change"
        onSubmit={handleSubmitKey}
        onCancel={handleCancelChangeKey}
        submitting={!!pendingKey && (entQuery.isFetching || entQuery.isPending)}
        errorMessage={validationError ?? undefined}
      />
    </EntitlementsProvider>
  )
}

function initialsFor(name?: string | null): string | null {
  if (!name) return null
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((p) => p[0]?.toUpperCase() ?? "").join("")
  return letters || null
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

/**
 * Centered error card over the Splash. Used for sidecar-unavailable and
 * entitlements-unreachable surfaces; keeps the user on the Splash (which
 * already makes "the app isn't ready" obvious).
 */
function BlockingOverlay({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-[460px] bg-[var(--surface-panel)] border border-[var(--error-muted)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-[20px] flex flex-col gap-[10px]">
        <h2 className="text-[14px] font-semibold text-[var(--error-default)]">
          {title}
        </h2>
        <p className="text-[12px] text-[var(--text-secondary)] leading-normal break-words">
          {detail}
        </p>
        {action && (
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
