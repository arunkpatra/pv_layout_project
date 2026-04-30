/**
 * RunsList — P5 Inspector tab. Shows the project's runs as a gallery
 * (grid of tiles, default) or a list (denser rows). Multi-select via
 * checkboxes — drives P8's compare-2-runs flow when it lands. Single-
 * click on a row selects it as the "active run" (drives P7's canvas
 * detail view when it lands; today just updates `selectedRunId` in
 * the slice).
 *
 * Data source: `useProjectStore.runs` (populated by P2 open from B12's
 * embedded `runs[]` and by P6's generate flow's `addRun`). No B15 fetch
 * here at v1 — local state is the source of truth; mutations keep it
 * coherent. If we later need fresher state (e.g. multi-tab S2 races),
 * we can add a `useRunsListQuery` keyed on `["runs", projectId]`.
 *
 * Visual states:
 *   no runs  → empty-state hint ("Generate a layout to see it here")
 *   loaded   → gallery / list per `view` mode
 *
 * The "thumb" in the row spec (each tile) maps to a placeholder icon
 * for v1 — actual rendered-layout previews depend on a server-side
 * thumbnail or client-side canvas → image flow that's not yet built.
 * Tile content for v1: name + type chip ("Layout"/"Energy" derived
 * from `billedFeatureKey`) + relative timestamp.
 *
 * Selection state lives in component-local state (single Set<runId>)
 * and survives Inspector tab switches via the parent's `forceMount`
 * on the TabsContent. Will lift to a slice when P8 (compare) needs
 * cross-component access.
 */
import { useMemo, useState, type JSX } from "react"
import {
  FEATURE_KEYS,
  type FeatureKey,
} from "@solarlayout/entitlements-client"
import { Button, Segmented, SegmentedItem } from "@solarlayout/ui"
import {
  useProjectStore,
  type Run,
  type RunId,
} from "../state/project"

export interface RunsListProps {
  /**
   * Caller-provided handler for deleting one or more runs. Called once
   * per selected run, sequentially. RunsList prompts for confirmation
   * before invoking. App.tsx wires this to `useDeleteRunMutation`.
   */
  onDeleteRuns?: (runIds: RunId[]) => Promise<void>
}

type RunView = "gallery" | "list"

const ENERGY_FEATURES: FeatureKey[] = [
  FEATURE_KEYS.ENERGY_YIELD,
  FEATURE_KEYS.GENERATION_ESTIMATES,
]

function isEnergyRun(billedFeatureKey: string): boolean {
  return (ENERGY_FEATURES as string[]).includes(billedFeatureKey)
}

export function RunsList({ onDeleteRuns }: RunsListProps = {}): JSX.Element {
  const runs = useProjectStore((s) => s.runs)
  const selectedRunId = useProjectStore((s) => s.selectedRunId)
  const selectRun = useProjectStore((s) => s.selectRun)

  const [view, setView] = useState<RunView>("gallery")
  // Multi-select for P8 compare + P9 delete. Local-component for now
  // (lifts to a slice when P8 needs to read it from outside the tab).
  const [multiSelect, setMultiSelect] = useState<Set<RunId>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const handleDeleteSelected = async () => {
    if (!onDeleteRuns) return
    if (multiSelect.size === 0) return
    const ids = Array.from(multiSelect)
    const ok = window.confirm(
      ids.length === 1
        ? `Delete this run?\n\nThe run is soft-deleted server-side. Calc count is preserved (no refund). Cannot be undone from the desktop UI.`
        : `Delete ${ids.length} runs?\n\nEach run is soft-deleted server-side. Calc counts are preserved (no refund). Cannot be undone from the desktop UI.`
    )
    if (!ok) return
    setDeleting(true)
    try {
      await onDeleteRuns(ids)
      // Clear selection — the deleted runs are gone from the slice;
      // surviving selections (if any) wouldn't have hit our deleted
      // ids. Simpler to reset.
      setMultiSelect(new Set())
    } finally {
      setDeleting(false)
    }
  }

  const hasRuns = runs.length > 0

  if (!hasRuns) {
    return (
      <div className="px-[20px] py-[24px]">
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          Generate a layout to see it here. Each click of "Generate Layout"
          creates a saved run with its parameters and result.
        </p>
      </div>
    )
  }

  return (
    <div className="px-[20px] pt-[16px] pb-[24px] flex flex-col gap-[12px]">
      <header className="flex items-center justify-between gap-[8px]">
        <span className="text-[12px] text-[var(--text-secondary)]">
          {runs.length} {runs.length === 1 ? "run" : "runs"}
          {multiSelect.size > 0 && (
            <span className="text-[var(--text-muted)]">
              {" "}· {multiSelect.size} selected
            </span>
          )}
        </span>
        <div className="flex items-center gap-[8px]">
          {multiSelect.size > 0 && onDeleteRuns && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleting}
              onClick={() => void handleDeleteSelected()}
            >
              {deleting ? "Deleting…" : `Delete ${multiSelect.size}`}
            </Button>
          )}
          <Segmented
            value={view}
            onValueChange={(v) => v && setView(v as RunView)}
            aria-label="Runs view mode"
          >
            <SegmentedItem value="gallery">Gallery</SegmentedItem>
            <SegmentedItem value="list">List</SegmentedItem>
          </Segmented>
        </div>
      </header>

      {view === "gallery" ? (
        <RunsGallery
          runs={runs}
          selectedRunId={selectedRunId}
          multiSelect={multiSelect}
          onToggleMulti={(id) => toggleSelection(setMultiSelect, id)}
          onSelect={selectRun}
        />
      ) : (
        <RunsTable
          runs={runs}
          selectedRunId={selectedRunId}
          multiSelect={multiSelect}
          onToggleMulti={(id) => toggleSelection(setMultiSelect, id)}
          onSelect={selectRun}
        />
      )}
    </div>
  )
}

function toggleSelection(
  setMulti: (next: (prev: Set<RunId>) => Set<RunId>) => void,
  id: RunId
): void {
  setMulti((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

interface RunsRowsProps {
  runs: Run[]
  selectedRunId: RunId | null
  multiSelect: Set<RunId>
  onToggleMulti: (id: RunId) => void
  onSelect: (id: RunId | null) => void
}

function RunsGallery({
  runs,
  selectedRunId,
  multiSelect,
  onToggleMulti,
  onSelect,
}: RunsRowsProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-[10px]">
      {runs.map((r) => {
        const checked = multiSelect.has(r.id)
        const isActive = selectedRunId === r.id
        return (
          <div
            key={r.id}
            className={`
              relative
              bg-[var(--surface-panel)]
              border rounded-[var(--radius-md)]
              p-[10px]
              flex flex-col gap-[6px]
              cursor-pointer
              transition-colors duration-[120ms]
              ${isActive ? "border-[var(--accent-default)]" : "border-[var(--border-subtle)]"}
              hover:border-[var(--border-default)]
            `}
            onClick={() => onSelect(r.id)}
            role="button"
            data-active={isActive}
          >
            <div className="flex items-start justify-between gap-[8px]">
              <input
                type="checkbox"
                checked={checked}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleMulti(r.id)}
                aria-label={`Select run ${r.name}`}
                className="mt-[2px] cursor-pointer"
              />
              <RunTypeChip billedFeatureKey={r.billedFeatureKey} />
            </div>
            <ThumbPlaceholder />
            <RunCardMeta run={r} />
          </div>
        )
      })}
    </div>
  )
}

function RunsTable({
  runs,
  selectedRunId,
  multiSelect,
  onToggleMulti,
  onSelect,
}: RunsRowsProps): JSX.Element {
  return (
    <div className="flex flex-col gap-[2px]">
      {runs.map((r) => {
        const checked = multiSelect.has(r.id)
        const isActive = selectedRunId === r.id
        return (
          <div
            key={r.id}
            onClick={() => onSelect(r.id)}
            role="button"
            data-active={isActive}
            className={`
              flex items-center gap-[10px]
              px-[8px] py-[6px]
              rounded-[var(--radius-sm)]
              cursor-pointer
              transition-colors duration-[120ms]
              ${isActive ? "bg-[var(--surface-muted)]" : ""}
              hover:bg-[var(--surface-muted)]
            `}
          >
            <input
              type="checkbox"
              checked={checked}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleMulti(r.id)}
              aria-label={`Select run ${r.name}`}
              className="cursor-pointer"
            />
            <span className="text-[12px] text-[var(--text-primary)] truncate flex-1">
              {r.name}
            </span>
            <RunTypeChip billedFeatureKey={r.billedFeatureKey} />
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              {relativeTimeFrom(r.createdAt)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ThumbPlaceholder(): JSX.Element {
  // V1 placeholder. Real rendered-layout previews depend on a thumbnail
  // pipeline (server-side render or client-side canvas → PNG) — outside
  // P5's scope. Token-driven slot keeps height stable across rows.
  return (
    <div
      aria-hidden="true"
      className="h-[60px] rounded-[var(--radius-sm)] bg-[var(--surface-muted)] border border-[var(--border-subtle)]"
    />
  )
}

function RunTypeChip({
  billedFeatureKey,
}: {
  billedFeatureKey: string
}): JSX.Element {
  const isEnergy = isEnergyRun(billedFeatureKey)
  const label = isEnergy ? "Energy" : "Layout"
  return (
    <span
      className={`
        inline-flex items-center
        px-[6px] py-[1px]
        rounded-[var(--radius-sm)]
        text-[10px] font-medium
        bg-[var(--surface-muted)]
        text-[var(--text-secondary)]
      `}
    >
      {label}
    </span>
  )
}

function RunCardMeta({ run }: { run: Run }): JSX.Element {
  const params = useMemo(
    () => extractParamSummary(run.params),
    [run.params]
  )
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">
        {run.name}
      </span>
      {params && (
        <span className="text-[10px] text-[var(--text-muted)] truncate">
          {params}
        </span>
      )}
      <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
        {relativeTimeFrom(run.createdAt)}
      </span>
    </div>
  )
}

/**
 * Defensive extractor for the wire's `params: unknown`. Returns a short
 * "design type · design mode" label when the shape matches what the
 * desktop's `useGenerateLayoutMutation` writes today (`LayoutParameters`
 * shape from sidecar-client). Returns null otherwise — the row still
 * renders, just without the design summary.
 */
function extractParamSummary(params: unknown): string | null {
  if (typeof params !== "object" || params === null) return null
  const p = params as Record<string, unknown>
  const designType = typeof p.design_type === "string" ? p.design_type : null
  const designMode = typeof p.design_mode === "string" ? p.design_mode : null
  if (!designType && !designMode) return null
  return [designType, designMode].filter(Boolean).join(" · ")
}

function relativeTimeFrom(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const deltaMs = Date.now() - then
  if (deltaMs < 60_000) return "just now"
  if (deltaMs < 3600_000) return `${Math.floor(deltaMs / 60_000)}m ago`
  if (deltaMs < 86_400_000) return `${Math.floor(deltaMs / 3600_000)}h ago`
  if (deltaMs < 7 * 86_400_000) return `${Math.floor(deltaMs / 86_400_000)}d ago`
  return iso.slice(0, 10)
}
