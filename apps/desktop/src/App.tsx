import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from "react"
import { invoke } from "@tauri-apps/api/core"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { listen } from "@tauri-apps/api/event"
import { useQueryClient } from "@tanstack/react-query"
import {
  createSidecarClient,
  type SidecarClient,
} from "@solarlayout/sidecar-client"
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
  LockedSectionCard,
  MapCanvas,
  Splash,
  StatusBar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
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
import { openAndParseKmz } from "./project/kmzLoader"
import { countKmzFeatures, kmzToGeoJson } from "./project/kmzToGeoJson"
import { layoutToGeoJson } from "./project/layoutToGeoJson"
import { useProjectStore } from "./state/project"
import { useLayoutParamsStore } from "./state/layoutParams"
import { useLayoutResultStore } from "./state/layoutResult"
import { useLayoutMutation } from "./state/useLayoutMutation"
import { LayoutPanel } from "./panels/LayoutPanel"
import { SummaryPanel } from "./panels/SummaryPanel"

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

  // Project state — the currently loaded KMZ. Lives in a Zustand slice
  // (S8.8 / ADR-0003) so siblings (TopBar, StatusBar, MapCanvas, soon
  // Inspector panels) can subscribe with narrow selectors instead of
  // prop-drilling through this component.
  const project = useProjectStore((s) => s.project)
  const setProject = useProjectStore((s) => s.setProject)
  const [openError, setOpenError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

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

  // ── Sidecar client — memoised against the config so downstream calls
  //    (parse-kmz, layout, usage/report) reuse a single instance.
  const sidecarClient = useMemo<SidecarClient | null>(() => {
    if (sidecarPhase.kind !== "healthy") return null
    if (sidecarPhase.port === 0) return null // preview mode — no real sidecar
    return createSidecarClient({
      host: sidecarPhase.host,
      port: sidecarPhase.port,
      token: sidecarPhase.token,
      fetchImpl: inTauri() ? (tauriFetch as typeof fetch) : undefined,
    })
  }, [sidecarPhase])

  // ── GeoJSON derived from the current project, memoised against the
  //    identity of the ParsedKMZ so MapCanvas doesn't re-hydrate
  //    sources on every App render.
  const projectGeoJson = useMemo(
    () => (project ? kmzToGeoJson(project.kmz) : null),
    [project]
  )
  const projectCounts = useMemo(
    () => (project ? countKmzFeatures(project.kmz) : null),
    [project]
  )

  // ── Layout result → GeoJSON for the map (S9). ────────────────────────────
  const layoutResult = useLayoutResultStore((s) => s.result)
  const layoutGeoJson = useMemo(
    () => (layoutResult ? layoutToGeoJson(layoutResult) : null),
    [layoutResult]
  )

  // ── Layout mutation (S9). Hydrates useLayoutResultStore on success. ──────
  const layoutMutation = useLayoutMutation(sidecarClient)
  const clearLayoutResult = useLayoutResultStore((s) => s.clearResult)
  const resetLayoutParams = useLayoutParamsStore((s) => s.resetToDefaults)

  // Bumped on each successful KMZ load so LayoutPanel remounts with the
  // reset defaults — plain RHF reset wouldn't re-seed `defaultValues` since
  // they're captured at mount.
  const [layoutFormKey, setLayoutFormKey] = useState(0)

  // Read params from Zustand via getState() at call-time, not via a hook
  // closure. LayoutPanel's onSubmit does `setAll(values); onGenerate()` in
  // the same tick — a closure over `useLayoutParamsStore((s) => s.params)`
  // would capture the PREVIOUS render's value (React hasn't re-rendered
  // when the event handler runs), firing the mutation with stale params.
  // getState() reads the store synchronously, so we see the values setAll
  // just wrote. Also covers the retry path (no values in flight → last
  // submitted values are still the right ones).
  const handleGenerate = useCallback(() => {
    if (!project) return
    layoutMutation.mutate({
      parsedKmz: project.kmz,
      params: useLayoutParamsStore.getState().params,
    })
  }, [project, layoutMutation])

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

  // ── KMZ load flow ────────────────────────────────────────────────────────
  const handleOpenKmz = useCallback(async () => {
    if (!sidecarClient || opening) return
    setOpening(true)
    setOpenError(null)
    try {
      const result = await openAndParseKmz(sidecarClient)
      if (!result) return // user cancelled the native dialog
      // New project = fresh start. Drop the previous layout so the canvas
      // doesn't show stale tables/ICRs, reset the input panel's params to
      // defaults, and force LayoutPanel to remount so RHF picks up the
      // reset values (RHF's `defaultValues` is captured at mount — an
      // in-place reset wouldn't propagate to the visible form fields).
      clearLayoutResult()
      resetLayoutParams()
      setLayoutFormKey((k) => k + 1)
      setProject({ kmz: result.parsed, fileName: result.fileName })
      setPaletteOpen(false)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error("KMZ load failed:", err)
      setOpenError(detail)
    } finally {
      setOpening(false)
    }
  }, [sidecarClient, opening, setProject, clearLayoutResult, resetLayoutParams])

  // Native menu "File → Open KMZ…" fires a `menu:file/open_kmz` event
  // (the `.` in the Rust menu-item id is translated to `/` at emit time
  // because Tauri 2's event-name validator rejects dots). The command
  // palette + empty-state button call handleOpenKmz directly.
  useEffect(() => {
    if (!inTauri()) return
    let unlisten: (() => void) | undefined
    void listen("menu:file/open_kmz", () => {
      void handleOpenKmz()
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [handleOpenKmz])

  const openPalette = useCallback(() => setPaletteOpen(true), [])

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (meta && e.key.toLowerCase() === "o") {
        e.preventDefault()
        void handleOpenKmz()
        return
      }
      if (e.key === "Escape") setPaletteOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleOpenKmz])

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
            projectName={project?.fileName}
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
          <MapCanvas
            boundariesGeoJson={projectGeoJson?.boundaries}
            obstaclesGeoJson={projectGeoJson?.obstacles}
            lineObstructionsGeoJson={projectGeoJson?.lineObstructions}
            tablesGeoJson={layoutGeoJson?.tables}
            icrsGeoJson={layoutGeoJson?.icrs}
            icrLabels={layoutGeoJson?.icrLabels}
          >
            <CommandBarHint onClick={openPalette} />
            {!project && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto">
                  <EmptyStateCard onOpen={() => void handleOpenKmz()} />
                </div>
              </div>
            )}
            {opening && <OpeningOverlay />}
            {openError && (
              <OpenErrorOverlay
                detail={openError}
                onDismiss={() => setOpenError(null)}
                onRetry={() => void handleOpenKmz()}
              />
            )}
            {layoutMutation.isError && (
              <OpenErrorOverlay
                detail={
                  layoutMutation.error?.message ?? "Layout generation failed."
                }
                onDismiss={() => layoutMutation.reset()}
                onRetry={handleGenerate}
              />
            )}
          </MapCanvas>
        }
        inspector={
          <InspectorRoot>
            <Tabs defaultValue="layout" className="px-[20px] pt-[18px]">
              <TabsList>
                <TabsTrigger value="layout">Layout</TabsTrigger>
                <TabsTrigger value="energy">Energy yield</TabsTrigger>
              </TabsList>
              {/* forceMount: keep the LayoutPanel mounted across tab
                  switches so RHF's working form state survives. Hidden
                  via Radix's data-[state] attr + Tailwind variant. */}
              <TabsContent
                value="layout"
                forceMount
                className="mt-[8px] -mx-[20px] data-[state=inactive]:hidden"
              >
                <LayoutPanel
                  key={layoutFormKey}
                  onGenerate={handleGenerate}
                  generating={layoutMutation.isPending}
                  noProject={!project}
                />
                <SummaryPanel generating={layoutMutation.isPending} />
              </TabsContent>
              <TabsContent
                value="energy"
                className="mt-[8px] -mx-[20px]"
              >
                <EnergyTabContent />
              </TabsContent>
            </Tabs>
          </InspectorRoot>
        }
        statusBar={
          <StatusBar
            sidecarHealthy
            sidecarLabel={`Sidecar healthy · engine ${sidecarPhase.version}`}
            leftMeta={
              projectCounts
                ? `${plural(projectCounts.boundaries, "boundary", "boundaries")} · ${plural(projectCounts.obstacles, "obstacle", "obstacles")}`
                : "No project loaded"
            }
            units={units}
            onUnitsChange={setUnits}
            zoomPercent={100}
            showFps={import.meta.env.DEV}
          />
        }
      />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandGroup heading="File" className="px-[4px] py-[4px]">
          <PaletteItem
            label="Open KMZ…"
            shortcut="⌘O"
            onSelect={() => void handleOpenKmz()}
          />
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

/**
 * EnergyTabContent — placeholder for the Energy yield tab.
 *
 * S9 ships the IA (the tab is visible to all users) but the body is gated
 * behind PRO_PLUS — see ADR/spike rationale (InputPanel two-tab IA). The
 * actual energy-yield form lands in S13.
 *
 * For non-PRO_PLUS users we render a `LockedSectionCard`. For PRO_PLUS
 * users we render a placeholder note. Both are visible by design — the
 * upgrade path is one click away, the feature isn't hidden.
 */
function EnergyTabContent() {
  // FeatureGate unavailable here without a circular import; we'd wire it
  // in S13 when the actual content arrives. For S9 the placeholder lock
  // is sufficient — the entitlement check happens server-side anyway.
  return (
    <LockedSectionCard
      tierName="PRO_PLUS"
      title="Energy yield modelling — available in"
      body="Configure irradiance, PR breakdown, degradation, and probabilistic yield (P50 / P75 / P90). Lands in a future release."
    />
  )
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function OpeningOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto px-[16px] py-[10px] rounded-[var(--radius-md)] bg-[var(--surface-panel)] border border-[var(--border-subtle)] shadow-[var(--shadow-sm)] text-[13px] text-[var(--text-secondary)]">
        Parsing KMZ…
      </div>
    </div>
  )
}

function OpenErrorOverlay({
  detail,
  onDismiss,
  onRetry,
}: {
  detail: string
  onDismiss: () => void
  onRetry: () => void
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-[460px] bg-[var(--surface-panel)] border border-[var(--error-muted)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-[20px] flex flex-col gap-[10px]">
        <h2 className="text-[14px] font-semibold text-[var(--error-default)]">
          Couldn't open KMZ
        </h2>
        <p className="text-[12px] text-[var(--text-secondary)] leading-normal break-words">
          {detail}
        </p>
        <div className="flex items-center justify-end gap-[8px]">
          <Button type="button" variant="ghost" size="md" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button type="button" variant="primary" size="md" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    </div>
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
