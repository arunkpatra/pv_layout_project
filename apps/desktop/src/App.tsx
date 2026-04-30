import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import type { EntitlementSummaryV2 } from "@solarlayout/entitlements-client"
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
  entitlementsClient,
  useEntitlementsQuery,
  useSyncEntitlementsToSidecar,
} from "./auth/useEntitlements"
import { useCreateProjectMutation } from "./auth/useCreateProject"
import { useOpenProjectMutation } from "./auth/useOpenProject"
import { useGenerateLayoutMutation } from "./auth/useGenerateLayout"
import { useRenameProjectMutation } from "./auth/useRenameProject"
import { useDeleteProjectMutation } from "./auth/useDeleteProject"
import { useAutoSaveProject } from "./auth/useAutoSaveProject"
import { SaveIndicator } from "./auth/SaveIndicator"
import { EntitlementsProvider } from "./auth/EntitlementsProvider"
import { EntitlementsError } from "@solarlayout/entitlements-client"
import {
  editsFromUndoStack,
  undoStackFromEdits,
} from "./state/projectEdits"
import { LicenseKeyDialog } from "./dialogs/LicenseKeyDialog"
import { LicenseInfoDialog } from "./dialogs/LicenseInfoDialog"
import { openAndParseKmz } from "./project/kmzLoader"
import { countKmzFeatures, kmzToGeoJson } from "./project/kmzToGeoJson"
import { layoutToGeoJson } from "./project/layoutToGeoJson"
import { useProjectStore } from "./state/project"
import { useLayoutParamsStore } from "./state/layoutParams"
import { useLayoutResultStore } from "./state/layoutResult"
import { useLayerVisibilityStore } from "./state/layerVisibility"
import { useEditingStateStore } from "./state/editingState"
import { useRefreshInvertersMutation } from "./state/useRefreshInvertersMutation"
import { useAddRoadMutation } from "./state/useAddRoadMutation"
import { useRemoveLastRoadMutation } from "./state/useRemoveLastRoadMutation"
import { LayoutPanel } from "./panels/LayoutPanel"
import { SummaryPanel } from "./panels/SummaryPanel"
import { VisibilitySection } from "./panels/VisibilitySection"
import { DrawingToolbar } from "./panels/DrawingToolbar"
import { InteractionController } from "./canvas/InteractionController"
import { clearDrawPreview } from "./canvas/preview"
import type maplibregl from "maplibre-gl"

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
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const setRuns = useProjectStore((s) => s.setRuns)
  const [openError, setOpenError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  // P1 — quota-exceeded modal triggered by 402 PAYMENT_REQUIRED from B11.
  // Holds the human-readable detail from the backend so the modal can
  // surface "3/3" naturally without re-deriving the numbers locally.
  const [upsellDetail, setUpsellDetail] = useState<string | null>(null)

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

  // ── Generate Layout mutation (P6). Replaces the parity-era
  //    sidecar-only mutation that was here through S9–S11. Now goes
  //    through B16 (atomic debit + Run row + presigned uploadUrl) →
  //    sidecar /layout → S3 PUT result JSON → setLayoutResultStore +
  //    addRun + invalidate entitlements. Single user click = 1 calc
  //    debit + 1 persisted Run.
  const generateLayoutMutation = useGenerateLayoutMutation(
    activeKey,
    entitlementsClient,
    sidecarClient,
    {
      fetchImpl: inTauri() ? (tauriFetch as typeof fetch) : undefined,
    }
  )
  // Alias so existing canvas error-overlay branch keeps reading
  // `.isError`/`.error`/`.reset` against the new hook without any other
  // textual change in the JSX below.
  const layoutMutation = generateLayoutMutation
  const clearLayoutResult = useLayoutResultStore((s) => s.clearResult)
  const resetLayoutParams = useLayoutParamsStore((s) => s.resetToDefaults)
  const resetLayerVisibility = useLayerVisibilityStore((s) => s.resetToDefaults)
  const showAcCables = useLayerVisibilityStore((s) => s.showAcCables)
  const showLas = useLayerVisibilityStore((s) => s.showLas)
  const resetEditingState = useEditingStateStore((s) => s.reset)

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
  // Pull currentProject (the backend-persisted project) for the projectId.
  // Generate Layout requires it — without a backend project, B16 has nothing
  // to attach the Run to. P1/P2 always set this on a successful open/create,
  // so in normal use the gate just protects against a not-yet-loaded state.
  const currentProject = useProjectStore((s) => s.currentProject)
  const handleGenerate = useCallback(() => {
    if (!project || !currentProject) return
    generateLayoutMutation.mutate({
      projectId: currentProject.id,
      parsedKmz: project.kmz,
      params: useLayoutParamsStore.getState().params,
    })
  }, [project, currentProject, generateLayoutMutation])

  // Surface the upsell modal on Generate-Layout 402, mirroring the P1
  // upload path. The B16 message contains the human-readable detail
  // (e.g. "No remaining calculations — purchase more at solarlayout.in").
  useEffect(() => {
    const err = generateLayoutMutation.error
    if (
      err instanceof EntitlementsError &&
      err.code === "PAYMENT_REQUIRED"
    ) {
      setUpsellDetail(err.message)
    }
  }, [generateLayoutMutation.error])

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

  // ── P1 — new-project mutation (uploadKmzToS3 + createProjectV2) ──────────
  // Bound to the active license key + module-singleton entitlements client
  // so successful creates invalidate ["entitlements", key] and the quota
  // chip + projectsActive update automatically. Tauri runs use the
  // tauri-plugin-http transport so the S3 PUT bypasses CSP.
  const createProjectMutation = useCreateProjectMutation(
    activeKey,
    entitlementsClient,
    {
      fetchImpl: inTauri() ? (tauriFetch as typeof fetch) : undefined,
    }
  )

  // ── P2 — open-existing-project mutation (B12 + S3 GET) ──────────────────
  // Single round-trip: B12 returns ProjectDetail with embedded
  // kmzDownloadUrl + runs[]; the hook then GETs the KMZ bytes from S3 via
  // the presigned URL. App.tsx orchestrates the sidecar /parse-kmz +
  // state hydration below in handleOpenExistingProject.
  const openProjectMutation = useOpenProjectMutation(
    activeKey,
    entitlementsClient,
    {
      fetchImpl: inTauri() ? (tauriFetch as typeof fetch) : undefined,
    }
  )

  // ── P3 — rename + delete project mutations ──────────────────────────────
  // Both single-attempt (PATCH and DELETE are body-deterministic /
  // idempotent at the wire layer, but no idempotency-key gate; the user
  // retries via the modal). On success: rename spreads into
  // currentProject (preserving B12 fields), delete clears the slice +
  // invalidates entitlements (frees quota).
  const renameProjectMutation = useRenameProjectMutation(
    activeKey,
    entitlementsClient
  )
  const deleteProjectMutation = useDeleteProjectMutation(
    activeKey,
    entitlementsClient
  )

  // ── P4 — auto-save edits (debounced PATCH /v2/projects/:id { edits }) ───
  // Watches the editingState slice's undoStack (the obstructions the user
  // has drawn through the sidecar's add-road / remove-last-road flow) and
  // persists them as the project's `edits` field after 2s of idle. Skips
  // entirely when no project is loaded, no key is signed in, or the key
  // is a preview key (no real backend in preview mode).
  const editingUndoStack = useEditingStateStore((s) => s.undoStack)
  const projectIdForSave = currentProject?.id ?? null
  const currentEdits = useMemo(
    () => (projectIdForSave ? editsFromUndoStack(editingUndoStack) : null),
    [editingUndoStack, projectIdForSave]
  )
  const saveStatus = useAutoSaveProject(
    activeKey,
    entitlementsClient,
    projectIdForSave,
    currentEdits
  )

  // ── KMZ load flow ────────────────────────────────────────────────────────
  // P1 wiring: parse locally for the canvas (existing behaviour) AND
  // upload + create the persisted project via B6 → S3 → B11. The two
  // halves share the same bytes — `openAndParseKmz` returns them so we
  // don't re-read the file from disk for the upload step.
  const handleOpenKmz = useCallback(async () => {
    if (!sidecarClient || opening) return
    setOpening(true)
    setOpenError(null)
    setUpsellDetail(null)
    try {
      const result = await openAndParseKmz(sidecarClient)
      if (!result) return // user cancelled the native dialog
      // New project = fresh start. Drop the previous layout so the canvas
      // doesn't show stale tables/ICRs, reset the input panel's params to
      // defaults, reset visibility toggles to PyQt5 defaults (both off),
      // and force LayoutPanel to remount so RHF picks up the reset values
      // (RHF's `defaultValues` is captured at mount — an in-place reset
      // wouldn't propagate to the visible form fields).
      clearLayoutResult()
      resetLayoutParams()
      resetLayerVisibility()
      resetEditingState()
      setLayoutFormKey((k) => k + 1)

      // Persist via B11 BEFORE touching the parity-era project slice so a
      // 402 (quota exceeded) leaves the canvas in its prior state — no
      // half-loaded "ghost project" if the create fails.
      const projectName = stripKmzExtension(result.fileName)
      try {
        const persisted = await createProjectMutation.mutateAsync({
          bytes: result.bytes,
          name: projectName,
        })
        setCurrentProject(persisted)
      } catch (err) {
        if (err instanceof EntitlementsError && err.code === "PAYMENT_REQUIRED") {
          // Surface upsell modal; leave project state unchanged.
          setUpsellDetail(err.message)
          return
        }
        // Non-quota errors (upload failures, 401, 5xx) flow through the
        // generic open-error overlay below.
        throw err
      }

      setProject({ kmz: result.parsed, fileName: result.fileName })
      setPaletteOpen(false)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error("KMZ load failed:", err)
      setOpenError(detail)
    } finally {
      setOpening(false)
    }
  }, [
    sidecarClient,
    opening,
    setProject,
    setCurrentProject,
    clearLayoutResult,
    resetLayoutParams,
    resetLayerVisibility,
    resetEditingState,
    createProjectMutation,
  ])

  // ── P2 — open-existing-project flow ─────────────────────────────────────
  // Interim entry point: a window.prompt() captures a project ID. The
  // proper recents-grid + tab-aware "Open existing…" UI lands at P3; this
  // is enough to drive the round-trip end-to-end (and validate via the
  // fixture-session smoke). Replace with the recents picker at P3.
  const handleOpenExistingProject = useCallback(async () => {
    if (!sidecarClient || opening) return
    const raw = window.prompt("Project ID:")
    if (!raw) return
    const projectId = raw.trim()
    if (!projectId) return
    setOpening(true)
    setOpenError(null)
    setUpsellDetail(null)
    try {
      const opened = await openProjectMutation.mutateAsync({ projectId })
      // Same reset as new-project — fresh canvas, fresh form, fresh
      // visibility state. Layout result is dropped: open-existing doesn't
      // hydrate a previous layout result yet (P7 will, when the user picks
      // a specific run from the runs list).
      clearLayoutResult()
      resetLayoutParams()
      resetLayerVisibility()
      resetEditingState()
      setLayoutFormKey((k) => k + 1)

      // Parse the downloaded KMZ via the sidecar so the canvas can render.
      // Mirror the kmzLoader.openAndParseKmz flow — same blob/Content-Type,
      // filename derived from the project name.
      const blob = new Blob([opened.bytes as BlobPart], {
        type: "application/vnd.google-earth.kmz",
      })
      const fileName = `${opened.detail.name}.kmz`
      const parsed = await sidecarClient.parseKmz(blob, fileName)

      setCurrentProject(opened.detail)
      setRuns(opened.detail.runs)
      // P4 restore — hydrate the editingState slice's undoStack from
      // `detail.edits` if the desktop schema parses it. Malformed wire
      // data falls back to an empty stack rather than blocking the open.
      const restoredStack = undoStackFromEdits(opened.detail.edits) ?? []
      useEditingStateStore.getState().setUndoStack(restoredStack)
      setProject({ kmz: parsed, fileName })
      setPaletteOpen(false)
    } catch (err) {
      // 404 NOT_FOUND → user-friendly "Project not found"; otherwise pipe
      // through the existing error-overlay surface.
      let detail: string
      if (err instanceof EntitlementsError && err.code === "NOT_FOUND") {
        detail = `Project not found: ${projectId}`
      } else {
        detail = err instanceof Error ? err.message : String(err)
      }
      console.error("open existing project failed:", err)
      setOpenError(detail)
    } finally {
      setOpening(false)
    }
  }, [
    sidecarClient,
    opening,
    openProjectMutation,
    setCurrentProject,
    setRuns,
    setProject,
    clearLayoutResult,
    resetLayoutParams,
    resetLayerVisibility,
    resetEditingState,
  ])

  // ── P3 — rename / delete handlers ───────────────────────────────────────
  // Interim entry points: native window.prompt() / window.confirm() for
  // the rename and delete confirms. Project header inline-rename + Dialog-
  // based confirm modal land alongside S3 (recents view) since the same
  // visual surfaces house both flows.
  const handleRenameProject = useCallback(async () => {
    if (!currentProject) return
    const next = window.prompt("Rename project:", currentProject.name)
    if (next === null) return
    const trimmed = next.trim()
    if (trimmed === "" || trimmed === currentProject.name) return
    setOpenError(null)
    try {
      await renameProjectMutation.mutateAsync({
        projectId: currentProject.id,
        name: trimmed,
      })
      setPaletteOpen(false)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error("rename project failed:", err)
      setOpenError(detail)
    }
  }, [currentProject, renameProjectMutation])

  const handleDeleteProject = useCallback(async () => {
    if (!currentProject) return
    const ok = window.confirm(
      `Delete "${currentProject.name}"?\n\n` +
        `This soft-deletes the project and all its runs. ` +
        `One project quota slot is freed. Cannot be undone from the desktop UI.`
    )
    if (!ok) return
    setOpenError(null)
    try {
      await deleteProjectMutation.mutateAsync({
        projectId: currentProject.id,
      })
      // Reset transient canvas state too — same surface as a fresh session.
      // The hook clears the project slice; these reset everything else
      // so the user lands back on the empty-state EmptyStateCard.
      clearLayoutResult()
      resetLayoutParams()
      resetLayerVisibility()
      resetEditingState()
      setLayoutFormKey((k) => k + 1)
      setPaletteOpen(false)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error("delete project failed:", err)
      setOpenError(detail)
    }
  }, [
    currentProject,
    deleteProjectMutation,
    clearLayoutResult,
    resetLayoutParams,
    resetLayerVisibility,
    resetEditingState,
  ])

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

  // ── S11: interactive ICR drag + obstruction drawing ──────────────────────
  //
  // Lifecycle:
  //   mouseup (commit)           → onCommit callback (below)
  //                                     → setMode('awaiting-ack')
  //                                     → fire mutation; preview STAYS
  //                                       visible on the canvas (mode
  //                                       modules don't clear on commit)
  //   mutation onSuccess         → setLayoutResult(new) (mutation hook)
  //                                     → clearDrawPreview(map)
  //                                     → setMode('idle')
  //                                     → [add-road only] pushObstruction
  //   mutation onError           → setMode('idle'), clearDrawPreview(map),
  //                                no stack mutation (nothing to unwind)
  //
  // Single-boundary assumption: S11 Phase 2 operates on boundaryIndex=0.
  // phaseboundary2.kmz is single-boundary; multi-boundary obstruction
  // propagation (legacy PVlayout_Advance applied roads to ALL
  // boundaries) is deferred — documented in S11 gate memo and picked
  // up in S13.8's parity sweep.
  const refreshInvertersMutation = useRefreshInvertersMutation(sidecarClient)
  const addRoadMutation = useAddRoadMutation(sidecarClient)
  const removeLastRoadMutation = useRemoveLastRoadMutation(sidecarClient)

  const editingSetMode = useEditingStateStore((s) => s.setMode)
  const editingSetPendingCommit = useEditingStateStore(
    (s) => s.setPendingCommit
  )
  const editingPushObstruction = useEditingStateStore(
    (s) => s.pushObstruction
  )
  const editingPopLastObstruction = useEditingStateStore(
    (s) => s.popLastObstruction
  )
  const editingUndoStackDepth = useEditingStateStore(
    (s) => s.undoStack.length
  )

  const interactionMapRef = useRef<maplibregl.Map | null>(null)

  // InteractionController: stable instance across renders. Commit
  // callbacks close over the mutation hooks + store actions; since
  // mutation hooks are stable refs themselves, the closure is safe to
  // hold in a ref-initialised singleton.
  const interactionControllerRef = useRef<InteractionController | null>(null)
  if (interactionControllerRef.current === null) {
    interactionControllerRef.current = new InteractionController({
      onIcrDragCommit: (commit) => {
        // Boundary lookup: find the boundary whose name matches. For
        // S11 Phase 2 with single-boundary phaseboundary2, this is
        // always index 0.
        const results = useLayoutResultStore.getState().result
        if (!results) {
          console.warn("[s11] onIcrDragCommit: no layout result loaded")
          return
        }
        const boundaryIndex = results.findIndex(
          (r) => r.boundary_name === commit.boundaryName
        )
        if (boundaryIndex < 0) {
          console.warn("[s11] onIcrDragCommit: boundary not found", commit)
          return
        }
        editingSetPendingCommit({
          kind: "icr-drag",
          boundaryName: commit.boundaryName,
          icrIndex: commit.icrIndex,
          newCenter: commit.newCenter,
        })
        editingSetMode("awaiting-ack")
        refreshInvertersMutation.mutate(
          {
            boundaryIndex,
            result: results[boundaryIndex]!,
            params: useLayoutParamsStore.getState().params,
            icrOverride: {
              icr_index: commit.icrIndex,
              new_center_wgs84: [commit.newCenter[0], commit.newCenter[1]],
            },
          },
          {
            onSettled: () => {
              const map = interactionMapRef.current
              if (map) clearDrawPreview(map)
              editingSetMode("idle")
            },
          }
        )
      },
      onRectCommit: (commit) => {
        // Apply to first boundary (S11 Phase 2). Multi-boundary
        // broadcast is deferred.
        const results = useLayoutResultStore.getState().result
        if (!results || results.length === 0) {
          console.warn("[s11] onRectCommit: no layout result loaded")
          return
        }
        const boundaryIndex = 0
        editingSetPendingCommit({
          kind: "add-road",
          roadType: "rectangle",
          coordsWgs84: commit.coordsWgs84,
        })
        editingSetMode("awaiting-ack")
        const coordsTuples: [number, number][] = commit.coordsWgs84.map(
          (p) => [p[0], p[1]] as [number, number]
        )
        addRoadMutation.mutate(
          {
            boundaryIndex,
            result: results[boundaryIndex]!,
            params: useLayoutParamsStore.getState().params,
            road: {
              road_type: "rectangle",
              coords_wgs84: coordsTuples,
            },
          },
          {
            onSuccess: () => {
              editingPushObstruction({
                roadType: "rectangle",
                coordsWgs84: commit.coordsWgs84,
                serverAck: true,
              })
            },
            onSettled: () => {
              const map = interactionMapRef.current
              if (map) clearDrawPreview(map)
              editingSetMode("idle")
            },
          }
        )
      },
    })
  }

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    interactionMapRef.current = map
    interactionControllerRef.current?.attach(map, useEditingStateStore)
  }, [])

  useEffect(() => {
    return () => {
      interactionControllerRef.current?.detach()
      interactionMapRef.current = null
    }
  }, [])

  const handleUndoLast = useCallback(() => {
    if (editingUndoStackDepth === 0) return
    const results = useLayoutResultStore.getState().result
    if (!results || results.length === 0) return
    const boundaryIndex = 0
    editingSetMode("awaiting-ack")
    removeLastRoadMutation.mutate(
      {
        boundaryIndex,
        result: results[boundaryIndex]!,
        params: useLayoutParamsStore.getState().params,
      },
      {
        onSuccess: () => {
          editingPopLastObstruction()
        },
        onSettled: () => {
          editingSetMode("idle")
        },
      }
    )
  }, [
    editingUndoStackDepth,
    editingSetMode,
    editingPopLastObstruction,
    removeLastRoadMutation,
  ])

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
  const entitlements = entQuery.data as EntitlementSummaryV2
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
            stringInvertersGeoJson={layoutGeoJson?.stringInverters}
            dcCablesGeoJson={layoutGeoJson?.dcCables}
            acCablesGeoJson={layoutGeoJson?.acCables}
            lasGeoJson={layoutGeoJson?.las}
            laCirclesGeoJson={layoutGeoJson?.laCircles}
            showAcCables={showAcCables}
            showLas={showLas}
            onMapReady={handleMapReady}
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
            {upsellDetail && (
              <UpsellOverlay
                detail={upsellDetail}
                onDismiss={() => setUpsellDetail(null)}
              />
            )}
            {/* P4 — top-right pill mirrors auto-save status. */}
            <SaveIndicator status={saveStatus} />

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
                {layoutResult && <VisibilitySection />}
                {layoutResult && <DrawingToolbar onUndoLast={handleUndoLast} />}
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
          {/* P2 interim — recents UI lands at S3 and replaces this. */}
          <PaletteItem
            label="Open existing project…"
            onSelect={() => void handleOpenExistingProject()}
          />
          {/* P3 — only enabled when a backend-persisted project is loaded. */}
          {currentProject && (
            <>
              <PaletteItem
                label="Rename project…"
                onSelect={() => void handleRenameProject()}
              />
              <PaletteItem
                label="Delete project…"
                onSelect={() => void handleDeleteProject()}
              />
            </>
          )}
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

function stripKmzExtension(fileName: string): string {
  const trimmed = fileName.trim()
  const lower = trimmed.toLowerCase()
  if (lower.endsWith(".kmz")) return trimmed.slice(0, -4)
  if (lower.endsWith(".kml")) return trimmed.slice(0, -4)
  return trimmed
}

/**
 * P1 — quota-exceeded modal. Mirrors `OpenErrorOverlay`'s visual
 * treatment but leans on the warning surface tokens (vs error) since
 * over-quota isn't a failure mode — it's a deliberate ceiling. Tap
 * "Manage projects" to open the project list (P3 lands the actual
 * recents/manage view; for now this is a no-op placeholder so the
 * modal isn't dead-end).
 */
function UpsellOverlay({
  detail,
  onDismiss,
}: {
  detail: string
  onDismiss: () => void
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-[480px] bg-[var(--surface-panel)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-[20px] flex flex-col gap-[10px]">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
          Project quota reached
        </h2>
        <p className="text-[12px] text-[var(--text-secondary)] leading-normal break-words">
          {detail}
        </p>
        <div className="flex items-center justify-end gap-[8px]">
          <Button type="button" variant="ghost" size="md" onClick={onDismiss}>
            Close
          </Button>
        </div>
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
