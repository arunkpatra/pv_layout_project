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
import { open as openExternalUrl } from "@tauri-apps/plugin-shell"
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
  CommandGroup,
  CommandItem,
  CommandPalette,
  CommandSeparator,
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
} from "@solarlayout/ui-desktop"
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
import {
  useGenerateLayoutMutation,
  LayoutJobCancelledError,
} from "./auth/useGenerateLayout"
import { useRenameProjectMutation } from "./auth/useRenameProject"
import { useDeleteProjectMutation } from "./auth/useDeleteProject"
import { useAutoSaveProject } from "./auth/useAutoSaveProject"
import { useProjectsListQuery } from "./auth/useProjectsList"
import { useOpenRunMutation } from "./auth/useOpenRun"
import { useDeleteRunMutation } from "./auth/useDeleteRun"
import { SaveIndicator } from "./auth/SaveIndicator"
import { QuotaIndicator } from "./auth/QuotaIndicator"
import { RecentsView } from "./recents/RecentsView"
import { RunsList } from "./runs/RunsList"
import { TabsBar } from "./tabs/TabsBar"
import { useTabsStore } from "./state/tabs"
import { EntitlementsProvider } from "./auth/EntitlementsProvider"
import { EntitlementsError } from "@solarlayout/entitlements-client"
import {
  editsFromUndoStack,
  undoStackFromEdits,
} from "./state/projectEdits"
import { LicenseKeyDialog } from "./dialogs/LicenseKeyDialog"
import { LicenseInfoDialog } from "./dialogs/LicenseInfoDialog"
import { openAndParseKmz } from "./project/kmzLoader"
import { boundaryGeojsonFromParsed } from "./project/boundaryGeojson"
import { countKmzFeatures, kmzToGeoJson } from "./project/kmzToGeoJson"
import { layoutToGeoJson } from "./project/layoutToGeoJson"
import { useProjectStore } from "./state/project"
import { useCurrentLayoutJobStore } from "./state/currentLayoutJob"
import { useLayoutParamsStore } from "./state/layoutParams"
import { useLayoutResultStore } from "./state/layoutResult"
import { useLayerVisibilityStore } from "./state/layerVisibility"
import { useEditingStateStore } from "./state/editingState"
import { useRefreshInvertersMutation } from "./state/useRefreshInvertersMutation"
import { useAddRoadMutation } from "./state/useAddRoadMutation"
import { useRemoveLastRoadMutation } from "./state/useRemoveLastRoadMutation"
import { LayoutPanel, PinnedActionArea } from "./panels/LayoutPanel"
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

const BUY_MORE_URL = "https://solarlayout.in/pricing"

/**
 * Mask a license key for display in the account dropdown — keeps the
 * `sl_live_` prefix visible (so the user can confirm it's their key)
 * and the last 4 chars (helps identify which key is in use when the
 * user has multiple). Returns undefined when the key is null so the
 * TopBar prop can be passed through verbatim.
 */
function maskLicenseKey(key: string | null): string | undefined {
  if (!key) return undefined
  if (key.length <= 12) return key
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}

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
  const selectRun = useProjectStore((s) => s.selectRun)
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
  // Spike 1 Phase 6 — current async layout-job state. Read by
  // LayoutPanel's pinned area to render running / post-run states;
  // cleared on KMZ load + project switch so a stale "All 6 done in
  // 3m 42s" summary from another project doesn't leak across.
  // Narrow selectors for handleCancelLayout's deps. Reading the full
  // jobState object as a useCallback dep churns every 2 s poll tick
  // (Zustand returns a new object reference on each update); pulling
  // out the two primitives needed for the cancel decision keeps the
  // callback identity stable across polls. PinnedActionArea reads
  // jobState directly via its own slice subscription, so App.tsx
  // doesn't need a top-level reference.
  const currentJobId = useCurrentLayoutJobStore(
    (s) => s.jobState?.job_id ?? null
  )
  const currentJobStatus = useCurrentLayoutJobStore(
    (s) => s.jobState?.status ?? null
  )
  const clearCurrentJobState = useCurrentLayoutJobStore(
    (s) => s.clearJobState
  )
  const resetLayerVisibility = useLayerVisibilityStore((s) => s.resetToDefaults)
  const showAcCables = useLayerVisibilityStore((s) => s.showAcCables)
  const showLas = useLayerVisibilityStore((s) => s.showLas)
  const resetEditingState = useEditingStateStore((s) => s.reset)

  // Bumped on each successful KMZ load so LayoutPanel remounts with the
  // reset defaults — plain RHF reset wouldn't re-seed `defaultValues` since
  // they're captured at mount.
  const [layoutFormKey, setLayoutFormKey] = useState(0)

  // Inspector tab selection lifted to App.tsx so PinnedActionArea (which
  // lives in the sticky tabs band, not inside any TabsContent) can be
  // gated to the Layout tab without duplicating TabsContent value="layout".
  const [inspectorTab, setInspectorTab] = useState("layout")

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
  // TanStack Query guarantees `.mutate` is a stable reference across
  // renders; the parent mutation object is not. Lifting the stable
  // reference (same pattern as `openRunMutate` below) keeps
  // handleGenerate from recreating on every mutation status change.
  const generateLayoutMutate = generateLayoutMutation.mutate
  const handleGenerate = useCallback(() => {
    if (!project || !currentProject) return
    generateLayoutMutate({
      projectId: currentProject.id,
      parsedKmz: project.kmz,
      params: useLayoutParamsStore.getState().params,
    })
  }, [project, currentProject, generateLayoutMutate])

  // Spike 1 Phase 6 — cooperative cancel for the in-flight async layout
  // job. Reads the current job_id from the slice and DELETEs it on the
  // sidecar; the next polling tick observes status=cancelled and the
  // mutation throws LayoutJobCancelledError. No-op when no job is in
  // flight (e.g. user hammers the button).
  const handleCancelLayout = useCallback(() => {
    if (!sidecarClient || !currentJobId) return
    if (currentJobStatus !== "queued" && currentJobStatus !== "running") {
      return
    }
    void sidecarClient.cancelLayoutJob(currentJobId).catch((err) => {
      // Best-effort — if the DELETE itself fails, the polling loop
      // still sees the eventual server state, and the user can click
      // Generate again to start fresh.
      console.warn("[layout] cancelLayoutJob failed:", err)
    })
  }, [sidecarClient, currentJobId, currentJobStatus])

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

  const entQueryRefetch = entQuery.refetch
  const handleRetryEntitlements = useCallback(() => {
    void entQueryRefetch()
  }, [entQueryRefetch])

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
  // state hydration below in handleOpenProjectById.
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

  // ── S3 — recents list query (powers RecentsView when no project loaded) ─
  // Empty for preview keys; refetches naturally when create/rename/delete
  // mutations invalidate the cache (their hooks include
  // ["projects", key] in onSuccess invalidations).
  const projectsListQuery = useProjectsListQuery(activeKey, entitlementsClient)

  // ── P7 — open-run mutation + auto-fetch on selectedRunId change ─────────
  // Fires when the user clicks an older run in the P5 gallery. The
  // dedup is via useLayoutResultStore.resultRunId — when P6 generates
  // a new run, both selectedRunId AND resultRunId update to the same
  // id in onSuccess, so this effect's predicate skips the redundant
  // re-fetch.
  const openRunMutation = useOpenRunMutation(activeKey, entitlementsClient, {
    fetchImpl: inTauri() ? (tauriFetch as typeof fetch) : undefined,
  })
  // P9 — delete run(s) from the gallery's multi-select toolbar.
  const deleteRunMutation = useDeleteRunMutation(activeKey, entitlementsClient)
  const handleDeleteRuns = useCallback(
    async (runIds: string[]) => {
      if (!currentProject) return
      // Sequential — surfaces per-run errors clearly, and B18 is cheap.
      for (const id of runIds) {
        try {
          await deleteRunMutation.mutateAsync({
            projectId: currentProject.id,
            runId: id,
          })
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          console.error(`delete run ${id} failed:`, err)
          setOpenError(detail)
          return // bail on first error; user retries via the same button
        }
      }
    },
    [currentProject, deleteRunMutation]
  )
  const selectedRunId = useProjectStore((s) => s.selectedRunId)
  const resultRunId = useLayoutResultStore((s) => s.resultRunId)
  const openRunMutate = openRunMutation.mutate
  useEffect(() => {
    if (!selectedRunId) return
    if (!currentProject) return
    if (selectedRunId === resultRunId) return // already displayed
    openRunMutate({
      projectId: currentProject.id,
      runId: selectedRunId,
    })
  }, [selectedRunId, currentProject, resultRunId, openRunMutate])

  // ── S2 — multi-tab integration ──────────────────────────────────────────
  // Tab state is metadata-only; the actual project state lives in its
  // existing per-domain slices and is mutated by the open flow below.
  // Switching a tab fires P2's open path (B12 + S3 GET + sidecar parse).
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const tabsOpenTab = useTabsStore((s) => s.openTab)
  const tabsCloseTab = useTabsStore((s) => s.closeTab)
  const tabsSwitchTab = useTabsStore((s) => s.switchTab)
  const tabsUpdateName = useTabsStore((s) => s.updateTabName)
  const tabsGoHome = useTabsStore((s) => s.goHome)

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
      clearCurrentJobState()
      resetLayoutParams()
      resetLayerVisibility()
      resetEditingState()
      setLayoutFormKey((k) => k + 1)

      // Persist via B11 BEFORE touching the parity-era project slice so a
      // 402 (quota exceeded) leaves the canvas in its prior state — no
      // half-loaded "ghost project" if the create fails.
      const projectName = stripKmzExtension(result.fileName)
      let persistedProjectId: string | null = null
      let persistedProjectName: string | null = null
      try {
        const persisted = await createProjectMutation.mutateAsync({
          bytes: result.bytes,
          name: projectName,
          // SP6 / B26 — send the parsed boundary so backend can persist
          // it for the placeholder-fallback render on RecentsView cards.
          // The desktop already has it in memory from sidecar.parseKmz
          // a few lines above; no extra round-trip cost.
          boundaryGeojson: boundaryGeojsonFromParsed(result.parsed),
        })
        setCurrentProject(persisted)
        // S1-12 — A freshly-created project has no runs yet. Explicitly
        // reset the runs slice so a prior project's runs don't leak into
        // the new project's gallery until the next tab-switch round-trip
        // overwrites them via P2's B12 fetch. (B11's ProjectV2Wire
        // intentionally doesn't carry runs[] — only B12 does — so we
        // must set [] here.) `setRuns([])` also drops a stale
        // selectedRunId per the slice's setRuns invariant
        // (state/project.ts:135–138).
        setRuns([])
        persistedProjectId = persisted.id
        persistedProjectName = persisted.name
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
      // S2 — register the just-created project as a tab. openTab dedupes
      // by projectId, so re-opening is a no-op switch.
      if (persistedProjectId && persistedProjectName) {
        tabsOpenTab(persistedProjectId, persistedProjectName)
      }
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
    clearCurrentJobState,
    resetLayoutParams,
    resetLayerVisibility,
    resetEditingState,
    createProjectMutation,
    tabsOpenTab,
  ])

  // ── P2 / S3 — open-existing-project flow ────────────────────────────────
  // The core open-by-ID flow is shared between two entry points:
  //   - S3 recents grid (RecentsView card click — passes the id directly)
  //   - Command Palette's "Open existing project…" item (interim
  //     window.prompt() — kept for power-user keyboard access)
  // Both call `handleOpenProjectById(id)` below; the palette wrapper just
  // captures the id via prompt first.
  const handleOpenProjectById = useCallback(async (projectId: string) => {
    if (!sidecarClient || opening) return
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
      clearCurrentJobState()
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
      // S1-08 — when the project has prior runs, auto-select the most
      // recent so the canvas hydrates with the user's last layout
      // (matches the mental model: opening a project shows the prior
      // work, not blank boundary + manual run pick). P7's selectedRunId
      // effect then fires B17 → S3 GET → setLayoutResult. Fixes both
      // the S2 tab-switch round-trip (transit through a runs-empty
      // project nulls the selection irrecoverably) and the P2 cold-open
      // case where the user previously had to click a run from the
      // gallery to see anything beyond the boundary.
      if (opened.detail.runs.length > 0) {
        const mostRecent = [...opened.detail.runs].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        )[0]!
        selectRun(mostRecent.id)
      }
      // P4 restore — hydrate the editingState slice's undoStack from
      // `detail.edits` if the desktop schema parses it. Malformed wire
      // data falls back to an empty stack rather than blocking the open.
      const restoredStack = undoStackFromEdits(opened.detail.edits) ?? []
      useEditingStateStore.getState().setUndoStack(restoredStack)
      setProject({ kmz: parsed, fileName })
      // S2 — register/activate the tab for this project. Dedup logic
      // makes this a no-op when this open was triggered BY a tab
      // switch (the tab already exists + is active).
      tabsOpenTab(opened.detail.id, opened.detail.name)
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
    selectRun,
    setProject,
    clearLayoutResult,
    clearCurrentJobState,
    resetLayoutParams,
    resetLayerVisibility,
    resetEditingState,
    tabsOpenTab,
  ])

  // ── SP3 — rename / delete handlers shared by Recents card menu + tab
  // right-click context menu. Promise-returning so each surface's local
  // dialog state can track its own busy + error per click. Mutations are
  // App.tsx-owned (the existing pattern); each surface invokes them
  // through these wrappers.
  //
  // Tab title sync (rename): when the renamed project has an open tab,
  // patch the tabs slice so the tab strip reflects the new name.
  // Tab cleanup (delete): folded into useDeleteProjectMutation.onSuccess
  // (closes any tab pointing at the deleted project BEFORE clearAll, so
  // the tab-switch effect doesn't fire B12 against a 404). All this
  // wrapper has to do is reset transient canvas state when the deleted
  // project happened to be currentProject — same shape as the parity
  // post-open reset.
  const handleRecentsRename = useCallback(
    async (projectId: string, newName: string) => {
      await renameProjectMutation.mutateAsync({
        projectId,
        name: newName,
      })
      tabsUpdateName(projectId, newName)
    },
    [renameProjectMutation, tabsUpdateName]
  )

  const handleRecentsDelete = useCallback(
    async (projectId: string) => {
      await deleteProjectMutation.mutateAsync({ projectId })
      // Hook closes any tab carrying this projectId + clears the
      // project slice (when ids match). The transient canvas slices
      // (layout result / layout params / layer visibility / editing
      // state / form key) are App.tsx's responsibility — reset only
      // when the deleted project was the active workspace.
      if (currentProject?.id === projectId) {
        clearLayoutResult()
        resetLayoutParams()
        resetLayerVisibility()
        resetEditingState()
        setLayoutFormKey((k) => k + 1)
      }
    },
    [
      deleteProjectMutation,
      currentProject,
      clearLayoutResult,
      resetLayoutParams,
      resetLayerVisibility,
      resetEditingState,
    ]
  )

  // ── S2 — tab switch effect + close handler ──────────────────────────────
  // When activeTabId changes, sync the project state:
  //   - null → clear all project state (back to recents view)
  //   - new tab pointing at a different project → fire P2's open flow
  //   - new tab matching currentProject → no-op (likely a tab-create
  //     immediately after a successful P1/P2 open; deduped by openTab)
  useEffect(() => {
    if (!activeTabId) {
      if (currentProject) {
        useProjectStore.getState().clearAll()
        clearLayoutResult()
        resetLayoutParams()
        resetLayerVisibility()
        resetEditingState()
        setLayoutFormKey((k) => k + 1)
      }
      return
    }
    const tab = useTabsStore.getState().tabs.find((t) => t.id === activeTabId)
    if (!tab) return
    if (tab.projectId === currentProject?.id) return
    void handleOpenProjectById(tab.projectId)
  }, [
    activeTabId,
    currentProject,
    clearLayoutResult,
    clearCurrentJobState,
    resetLayoutParams,
    resetLayerVisibility,
    resetEditingState,
    handleOpenProjectById,
  ])

  const handleCloseTab = useCallback(
    (tabId: string) => {
      // Warn if closing the active tab while autosave is mid-flight —
      // the 2s pending edits would get lost when the slice resets in
      // the next tick.
      if (
        tabId === activeTabId &&
        saveStatus.kind === "saving"
      ) {
        const ok = window.confirm(
          "Unsaved edits to this project. Close anyway? Edits will save in the background but may be cancelled mid-flight."
        )
        if (!ok) return
      }
      tabsCloseTab(tabId)
    },
    [activeTabId, saveStatus.kind, tabsCloseTab]
  )

  // Native menu "File → Open KMZ…" fires a `menu:file/open_kmz` event
  // (the `.` in the Rust menu-item id is translated to `/` at emit time
  // because Tauri 2's event-name validator rejects dots). The command
  // palette + empty-state button call handleOpenKmz directly.
  //
  // S1-11 — register the listener exactly once for the App's lifetime.
  // The previous effect re-ran on every `handleOpenKmz` change (its
  // useCallback deps shift during normal session work) and Tauri's
  // `listen` returns a Promise — cleanup fired before the prior promise
  // resolved, so old listeners stayed registered. Result: N re-renders
  // since the last successful unregister = N listeners stacked = N file
  // pickers per menu click.
  //
  // The ref pattern decouples the listener from `handleOpenKmz`'s
  // identity: the effect mounts once, the ref always points at the
  // latest `handleOpenKmz`, and the listener invokes through the ref.
  // The `cancelled` flag is belt-and-suspenders for the original race
  // path on mount/unmount.
  const handleOpenKmzRef = useRef(handleOpenKmz)
  useEffect(() => {
    handleOpenKmzRef.current = handleOpenKmz
  }, [handleOpenKmz])

  useEffect(() => {
    if (!inTauri()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen("menu:file/open_kmz", () => {
      void handleOpenKmzRef.current()
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

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
      // S2 — Cmd-T opens a new project (file picker → P1 flow). Synonym
      // with the "+" tab-tile + Cmd-O for now; will diverge if Cmd-O
      // gains an open-existing-project palette in a later S row.
      if (meta && e.key.toLowerCase() === "t") {
        e.preventDefault()
        void handleOpenKmz()
        return
      }
      // S2 — Cmd-W closes the active tab (with the same unsaved-edits
      // warning used by the X button). No-op when no tabs open.
      if (meta && e.key.toLowerCase() === "w") {
        e.preventDefault()
        if (activeTabId) handleCloseTab(activeTabId)
        return
      }
      if (e.key === "Escape") setPaletteOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleOpenKmz, activeTabId, handleCloseTab])

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

  // S4 — account-menu data: masked license key + a compact quota summary
  // node mirroring the QuotaIndicator chip's numbers, plus a Buy more
  // handler that opens the marketing pricing page in an external browser.
  const maskedLicenseKey = maskLicenseKey(savedKey)
  const accountQuotaSummary = (
    <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
      {entitlements.remainingCalculations} calcs ·{" "}
      {entitlements.projectsRemaining} projects remaining
    </span>
  )
  const handleBuyMore = (): void => {
    if (inTauri()) {
      void openExternalUrl(BUY_MORE_URL).catch((err) => {
        console.error("openExternalUrl failed:", err)
      })
    } else if (typeof window !== "undefined") {
      window.open(BUY_MORE_URL, "_blank", "noopener,noreferrer")
    }
  }

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
            chip={<QuotaIndicator entitlements={entitlements} />}
            onCommandPaletteClick={openPalette}
            onToggleToolRail={() => setToolRailOpen((v) => !v)}
            onToggleInspector={
              project ? () => setInspectorOpen((v) => !v) : undefined
            }
            userInitials={initialsFor(entitlements.user.name) ?? "--"}
            userName={entitlements.user.name ?? undefined}
            userEmail={entitlements.user.email ?? undefined}
            maskedLicenseKey={maskedLicenseKey}
            quotaSummary={accountQuotaSummary}
            onViewLicense={() => setInfoDialogOpen(true)}
            onClearLicense={() => void handleClearLicense()}
            onBuyMore={handleBuyMore}
            onHome={tabsGoHome}
          />
        }
        tabsBar={
          <TabsBar
            onSwitch={tabsSwitchTab}
            onClose={handleCloseTab}
            onNewProject={() => void handleOpenKmz()}
            onHome={tabsGoHome}
            onRename={handleRecentsRename}
            onDelete={handleRecentsDelete}
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
            {!project && (
              <RecentsView
                isLoading={projectsListQuery.isLoading}
                isError={projectsListQuery.isError}
                errorMessage={projectsListQuery.error?.message}
                projects={projectsListQuery.data ?? []}
                onOpen={(id) => void handleOpenProjectById(id)}
                onNewProject={() => void handleOpenKmz()}
                onRetry={() => void projectsListQuery.refetch()}
                onRename={handleRecentsRename}
                onDelete={handleRecentsDelete}
              />
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

            {layoutMutation.isError &&
              !(layoutMutation.error instanceof LayoutJobCancelledError) && (
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
          project ? (
            <InspectorRoot>
              {/* Tabs are controlled so PinnedActionArea (which lives
                  in the sticky tabs band, not inside LayoutPanel) can
                  be gated to the Layout tab via a normal conditional,
                  without resorting to two TabsContent siblings sharing
                  the same value. Single sticky parent holds TabsList +
                  PinnedActionArea so height is self-determined; see
                  S3-01b in SMOKE-LOG.md for the original sticky-stack
                  fix this preserves. */}
              <Tabs value={inspectorTab} onValueChange={setInspectorTab}>
                <div className="sticky top-0 z-20 bg-[var(--surface-ground)]">
                  <div className="px-[20px] pt-[12px]">
                    <TabsList>
                      <TabsTrigger value="layout">Layout</TabsTrigger>
                      <TabsTrigger value="energy">Energy yield</TabsTrigger>
                      <TabsTrigger value="runs">Runs</TabsTrigger>
                    </TabsList>
                  </div>
                  {inspectorTab === "layout" && (
                    <>
                      <PinnedActionArea
                        generating={layoutMutation.isPending}
                        boundaryCount={projectCounts?.boundaries ?? null}
                        onCancel={handleCancelLayout}
                      />
                      {/* Layout summary lives inside the sticky parent
                          (alongside tabs + Generate band) so the
                          results stay visible while the user iterates
                          on form parameters below. Collapsible —
                          expanded by default; persistKey survives
                          reload. */}
                      <SummaryPanel generating={layoutMutation.isPending} />
                    </>
                  )}
                </div>
                {/* forceMount + data-[state=inactive]:hidden so RHF
                    state in LayoutPanel survives tab switches. mt-0
                    overrides TabsContent's default mt-[16px] — the
                    first section's own pt is enough breathing room
                    below the sticky tabs band. */}
                <TabsContent
                  value="layout"
                  forceMount
                  className="data-[state=inactive]:hidden mt-0"
                >
                  <LayoutPanel
                    key={layoutFormKey}
                    onGenerate={handleGenerate}
                  />
                  {layoutResult && <VisibilitySection />}
                  {layoutResult && <DrawingToolbar onUndoLast={handleUndoLast} />}
                </TabsContent>
                <TabsContent value="energy">
                  <EnergyTabContent />
                </TabsContent>
                {/* P5 — runs gallery + list, forceMount so multi-select
                    state survives Inspector tab switches. */}
                <TabsContent
                  value="runs"
                  forceMount
                  className="data-[state=inactive]:hidden"
                >
                  <RunsList onDeleteRuns={handleDeleteRuns} />
                </TabsContent>
              </Tabs>
            </InspectorRoot>
          ) : undefined
        }
        statusBar={
          <StatusBar
            sidecarHealthy
            sidecarLabel={`Sidecar healthy · engine ${sidecarPhase.version}`}
            leftMeta={
              projectCounts
                ? [
                    plural(projectCounts.boundaries, "boundary", "boundaries"),
                    plural(projectCounts.obstacles, "obstacle", "obstacles"),
                    projectCounts.lines > 0
                      ? plural(
                          projectCounts.lines,
                          "line obstruction",
                          "line obstructions"
                        )
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
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
        {/* SP3 — Recents quick-switch. Navigation only; rename/delete live
            on the Recents card ⋯ menu and the tab right-click ContextMenu
            (both surfaces have unambiguous "this project" semantics that
            Cmd-K lacks). Replaces the parity-era window.prompt("Project
            ID:") interim and the broken Cmd-K rename/delete items. */}
        {(projectsListQuery.data?.length ?? 0) > 0 && (
          <>
            <CommandSeparator className="my-[4px] h-[1px] bg-[var(--border-subtle)]" />
            <CommandGroup
              heading="Recents"
              className="px-[4px] py-[4px]"
            >
              {(projectsListQuery.data ?? []).slice(0, 8).map((p) => (
                <PaletteItem
                  key={p.id}
                  label={p.name}
                  onSelect={() => {
                    setPaletteOpen(false)
                    void handleOpenProjectById(p.id)
                  }}
                />
              ))}
            </CommandGroup>
          </>
        )}
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
