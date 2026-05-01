/**
 * LayoutPanel — InputPanel content for the "Layout" tab in S9.
 *
 * react-hook-form owns the form lifecycle (touched / errors / dirty);
 * the Zustand `layoutParams` slice owns the persisted snapshot.
 * On change (debounced via RHF's onChange mode), the slice is updated
 * so the Generate button + future cloud-sync see the latest values.
 *
 * Visibility rules:
 *   - `tilt_angle` field disabled unless `tiltOverride` is on (the
 *     null/auto case is the default; user opts into manual entry).
 *   - `row_spacing` same as tilt.
 *   - `max_smb_per_central_inv` only visible in `central_inverter` mode.
 *
 * Sections (matching the PyQt5 reference, layout-relevant subset only;
 * energy yield is the S13 panel):
 *   1. Module
 *   2. Table
 *   3. Spacing & tilt
 *   4. Site
 *   5. Inverter sizing
 *
 * Spike 1 Phase 5 layout — pinned action area at the top + collapsible
 * sections. The Generate button (and, in Phase 6, the in-flight
 * progress UI) lives in a `position: sticky; top: 0` band so it's
 * always one click away during iterate-and-rerun work; sections below
 * scroll under it. Each section's expand/collapse state persists per
 * machine via `localStorage` so the user's chosen layout survives
 * reloads. Multi-open by design (not a true accordion).
 */
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useForm, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Button,
  Chip,
  InspectorSection,
  Label,
  NumberInput,
  Segmented,
  SegmentedItem,
  Select,
  SelectItem,
  Switch,
} from "@solarlayout/ui-desktop"
import {
  DEFAULT_LAYOUT_PARAMETERS,
  type LayoutJobState,
  type LayoutParameters,
  type PlotState,
  type PlotStatus,
} from "@solarlayout/sidecar-client"
import { FEATURE_KEYS } from "@solarlayout/entitlements-client"
import { useCurrentLayoutJobStore } from "../state/currentLayoutJob"
import { useLayoutFormStatusStore } from "../state/layoutFormStatus"
import { useLayoutParamsStore } from "../state/layoutParams"
import { layoutParametersSchema } from "../state/layoutParams"
import { useHasFeature } from "../auth/FeatureGate"

interface LayoutPanelProps {
  onGenerate: (params: LayoutParameters) => void
}

export function LayoutPanel({ onGenerate }: LayoutPanelProps) {
  // RHF owns the working form state; Zustand holds the *saved* params
  // (defaults at mount + last-submitted snapshot). Don't auto-sync on
  // every keystroke — `watch()` returns a new object reference per
  // render, so a `useEffect([watch()], setAll)` loops forever:
  // setAll → Zustand notifies → App re-renders → LayoutPanel re-renders
  // → watch() returns a new ref → effect fires again. Sync only on
  // submit. (Future cloud-sync in S12+ serialises the slice; submit-
  // time persistence is enough for that.)
  const params = useLayoutParamsStore((s) => s.params)
  const setAll = useLayoutParamsStore((s) => s.setAll)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LayoutParameters>({
    defaultValues: params,
    resolver: zodResolver(layoutParametersSchema),
    mode: "onChange",
  })

  const designMode = watch("design_mode")
  const tiltOverride = watch("tilt_angle") !== null
  const pitchOverride = watch("row_spacing") !== null
  const enableCableCalc = watch("enable_cable_calc")

  // Belt-and-braces coercion: if the user isn't entitled to cable_routing,
  // force enable_cable_calc to false at submit time regardless of what
  // the form currently holds. Guards against stale persisted params
  // surviving a license downgrade — the UI gate in CableCalcFieldRow
  // handles the steady-state display.
  const hasCableRouting = useHasFeature(FEATURE_KEYS.CABLE_ROUTING)

  // Mirror two pieces of RHF live state up to the layoutFormStatus
  // slice so the PinnedActionArea — which now lives outside the form
  // (rendered in App.tsx alongside the tabs band for sticky-stacking,
  // see SMOKE-LOG.md S3-01b) — can read them without consuming RHF.
  // Booleans are deliberate as deps (object identity changes every
  // render; the booleans only flip on real change).
  const setHasErrors = useLayoutFormStatusStore((s) => s.setHasErrors)
  const setEnableCableCalc = useLayoutFormStatusStore(
    (s) => s.setEnableCableCalc
  )
  const hasErrors = Object.keys(errors).length > 0
  useEffect(() => {
    setHasErrors(hasErrors)
  }, [hasErrors, setHasErrors])
  useEffect(() => {
    setEnableCableCalc(enableCableCalc)
  }, [enableCableCalc, setEnableCableCalc])

  const onSubmit: SubmitHandler<LayoutParameters> = (values) => {
    const coerced: LayoutParameters = hasCableRouting
      ? values
      : { ...values, enable_cable_calc: false }
    setAll(coerced)
    onGenerate(coerced)
  }

  return (
    // `id="layout-form"` so the Generate button (rendered in App.tsx
    // inside the sticky tabs band, NOT inside this <form>) can submit
    // it via `form="layout-form"` on the button. Lift documented in
    // SMOKE-LOG.md S3-01b.
    <form id="layout-form" onSubmit={handleSubmit(onSubmit)}>
      {/* ── Module ──────────────────────────────────────────────────── */}
      <InspectorSection
        title="Module"
        collapsible
        persistKey="layout-panel.section.module"
      >
        <FieldRow label="Length" error={errors.module?.length?.message}>
          <NumberInput
            {...register("module.length", { valueAsNumber: true })}
            suffix="m"
            invalid={!!errors.module?.length}
          />
        </FieldRow>
        <FieldRow label="Width" error={errors.module?.width?.message}>
          <NumberInput
            {...register("module.width", { valueAsNumber: true })}
            suffix="m"
            invalid={!!errors.module?.width}
          />
        </FieldRow>
        <FieldRow label="Wattage" error={errors.module?.wattage?.message}>
          <NumberInput
            {...register("module.wattage", { valueAsNumber: true })}
            suffix="Wp"
            invalid={!!errors.module?.wattage}
          />
        </FieldRow>
      </InspectorSection>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <InspectorSection
        title="Table"
        collapsible
        persistKey="layout-panel.section.table"
      >
        <FieldRow label="Orientation">
          <Segmented
            value={watch("table.orientation")}
            onValueChange={(v) =>
              v && setValue("table.orientation", v as "portrait" | "landscape")
            }
            aria-label="Table orientation"
          >
            <SegmentedItem value="portrait">Portrait</SegmentedItem>
            <SegmentedItem value="landscape">Landscape</SegmentedItem>
          </Segmented>
        </FieldRow>
        <FieldRow
          label="Modules per row"
          error={errors.table?.modules_in_row?.message}
        >
          <NumberInput
            {...register("table.modules_in_row", { valueAsNumber: true })}
            invalid={!!errors.table?.modules_in_row}
          />
        </FieldRow>
        <FieldRow
          label="Rows per table"
          error={errors.table?.rows_per_table?.message}
        >
          <NumberInput
            {...register("table.rows_per_table", { valueAsNumber: true })}
            invalid={!!errors.table?.rows_per_table}
          />
        </FieldRow>
        <FieldRow
          label="Gap between tables"
          error={errors.table_gap_ew?.message}
        >
          <NumberInput
            {...register("table_gap_ew", { valueAsNumber: true })}
            suffix="m"
            invalid={!!errors.table_gap_ew}
          />
        </FieldRow>
      </InspectorSection>

      {/* ── Spacing & tilt ──────────────────────────────────────────── */}
      <InspectorSection
        title="Spacing & tilt"
        collapsible
        persistKey="layout-panel.section.spacing"
      >
        <FieldRow label="Override tilt">
          <Switch
            checked={tiltOverride}
            onCheckedChange={(checked) =>
              setValue(
                "tilt_angle",
                checked ? (params.tilt_angle ?? 20) : null
              )
            }
            aria-label="Override auto-derived tilt"
          />
        </FieldRow>
        {tiltOverride && (
          <FieldRow label="Tilt angle" error={errors.tilt_angle?.message}>
            <NumberInput
              {...register("tilt_angle", { valueAsNumber: true })}
              suffix="°"
              invalid={!!errors.tilt_angle}
            />
          </FieldRow>
        )}
        <FieldRow label="Override row pitch">
          <Switch
            checked={pitchOverride}
            onCheckedChange={(checked) =>
              setValue(
                "row_spacing",
                checked ? (params.row_spacing ?? 7) : null
              )
            }
            aria-label="Override auto-derived row pitch"
          />
        </FieldRow>
        {pitchOverride && (
          <FieldRow label="Row pitch" error={errors.row_spacing?.message}>
            <NumberInput
              {...register("row_spacing", { valueAsNumber: true })}
              suffix="m"
              invalid={!!errors.row_spacing}
            />
          </FieldRow>
        )}
      </InspectorSection>

      {/* ── Site ────────────────────────────────────────────────────── */}
      <InspectorSection
        title="Site"
        collapsible
        persistKey="layout-panel.section.site"
      >
        <FieldRow
          label="Perimeter road width"
          error={errors.perimeter_road_width?.message}
        >
          <NumberInput
            {...register("perimeter_road_width", { valueAsNumber: true })}
            suffix="m"
            invalid={!!errors.perimeter_road_width}
          />
        </FieldRow>
      </InspectorSection>

      {/* ── Inverter sizing ─────────────────────────────────────────── */}
      <InspectorSection
        title="Inverter sizing"
        collapsible
        persistKey="layout-panel.section.inverter"
      >
        <FieldRow label="Design mode">
          <Select
            value={designMode}
            onValueChange={(v) =>
              setValue(
                "design_mode",
                v as "string_inverter" | "central_inverter"
              )
            }
            aria-label="Inverter design mode"
          >
            <SelectItem value="string_inverter">String inverter</SelectItem>
            <SelectItem value="central_inverter">Central inverter</SelectItem>
          </Select>
        </FieldRow>
        <FieldRow
          label={
            designMode === "central_inverter"
              ? "Max strings per SMB"
              : "Max strings per inverter"
          }
          error={errors.max_strings_per_inverter?.message}
        >
          <NumberInput
            {...register("max_strings_per_inverter", { valueAsNumber: true })}
            invalid={!!errors.max_strings_per_inverter}
          />
        </FieldRow>
        {designMode === "central_inverter" && (
          <FieldRow
            label="Max SMB per central inv."
            error={errors.max_smb_per_central_inv?.message}
          >
            <NumberInput
              {...register("max_smb_per_central_inv", { valueAsNumber: true })}
              invalid={!!errors.max_smb_per_central_inv}
            />
          </FieldRow>
        )}
        <CableCalcFieldRow
          checked={watch("enable_cable_calc")}
          onCheckedChange={(checked) => setValue("enable_cable_calc", checked)}
        />
      </InspectorSection>
    </form>
  )
}

/**
 * Two-column row used throughout the panel — label on left, control on
 * right. Matches the PropertyRow visual rhythm but supports an inline
 * error message below.
 */
function FieldRow({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-[4px] py-[6px]">
      <div className="flex items-center justify-between gap-[12px]">
        <Label className="flex-1 truncate">{label}</Label>
        <div className="w-[150px]">{children}</div>
      </div>
      {error && (
        <p className="text-[11px] text-[var(--error-default)] leading-normal pl-[4px]">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * "Calculate cables" row — gated on `CABLE_ROUTING` (Pro-tier). On Basic
 * the switch is disabled and a "Pro" chip appears inline with the label,
 * matching the VisibilitySection pattern. Basic users cannot request
 * cable routing because the `cable_routing` seed feature isn't in their
 * entitlements (ADR-0005 §1).
 */
function CableCalcFieldRow({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
}) {
  const entitled = useHasFeature(FEATURE_KEYS.CABLE_ROUTING)
  return (
    <div className="flex flex-col gap-[4px] py-[6px]">
      <div className="flex items-center justify-between gap-[12px]">
        <div className="flex flex-1 items-center gap-[8px] min-w-0">
          <Label className="truncate">Calculate AC cable trench</Label>
          {!entitled && (
            <Chip
              tone="accent"
              aria-label="Calculate AC cable trench requires Pro"
            >
              Pro
            </Chip>
          )}
        </div>
        <div className="w-[150px] flex justify-end">
          <Switch
            checked={entitled ? checked : false}
            disabled={!entitled}
            onCheckedChange={(next) => {
              if (entitled) onCheckedChange(next)
            }}
            aria-label="Enable cable calculation"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * PinnedActionArea — the sticky band at the top of the LayoutPanel.
 *
 * Three states:
 *   - running: per-plot progress list + Cancel button
 *   - post-run (terminal job snapshot present): summary line + Generate
 *     (with caret-expand on partial outcomes)
 *   - idle (no terminal snapshot): optional pre-flight chip + Generate
 */
/**
 * Rendered by App.tsx INSIDE the shared sticky tabs band — not by
 * LayoutPanel itself. Decoupling is what fixes S3-01b's "scroll-up-
 * before-stick" bug: with both the tabs row and this action area
 * inside one sticky parent, the stack height is self-determined and
 * doesn't depend on hardcoded pixel offsets.
 *
 * Reads RHF live state (`hasErrors`, `enableCableCalc`) from the
 * layoutFormStatus slice that LayoutPanel mirrors into. Receives
 * everything else as direct props from App.tsx (which already owns
 * those values).
 */
export function PinnedActionArea({
  generating,
  boundaryCount,
  onCancel,
}: {
  generating: boolean
  boundaryCount: number | null
  onCancel: () => void
}) {
  const jobState = useCurrentLayoutJobStore((s) => s.jobState)
  const formHasErrors = useLayoutFormStatusStore((s) => s.hasErrors)
  const enableCableCalc = useLayoutFormStatusStore((s) => s.enableCableCalc)
  // Read the entitlement here — `useHasFeature` reads from
  // `<EntitlementsProvider>` which wraps the whole AppShell tree, so
  // this is safe wherever PinnedActionArea renders. Lifting this hook
  // to App.tsx's top level (above the provider's JSX) crashes with
  // "useEntitlementsContext must be used inside <EntitlementsProvider>"
  // on every render — see the post-mortem in commit log.
  const hasCableRouting = useHasFeature(FEATURE_KEYS.CABLE_ROUTING)
  const isInflight =
    jobState !== null &&
    (jobState.status === "queued" || jobState.status === "running")

  return (
    <div
      className="px-[20px] py-[12px] flex flex-col gap-[10px]
        bg-[var(--surface-ground)] border-b border-[var(--border-subtle)]"
    >
      {isInflight ? (
        <RunningPin jobState={jobState} onCancel={onCancel} />
      ) : (
        <IdlePin
          jobState={jobState}
          generating={generating}
          boundaryCount={boundaryCount}
          formHasErrors={formHasErrors}
          showPreflightChip={
            !generating &&
            hasCableRouting &&
            enableCableCalc &&
            (boundaryCount ?? 0) > 1
          }
        />
      )}
    </div>
  )
}

/**
 * Idle / post-run pin — Generate button + optional last-run summary
 * (when a terminal `jobState` is present) + optional pre-flight chip
 * (when entitled + cable_calc=true + multi-plot).
 */
function IdlePin({
  jobState,
  generating,
  boundaryCount,
  formHasErrors,
  showPreflightChip,
}: {
  jobState: LayoutJobState | null
  generating: boolean
  boundaryCount: number | null
  formHasErrors: boolean
  showPreflightChip: boolean
}) {
  const isTerminal =
    jobState !== null &&
    (jobState.status === "done" ||
      jobState.status === "failed" ||
      jobState.status === "cancelled")

  return (
    <>
      {isTerminal && jobState && <PostRunSummary jobState={jobState} />}
      {!isTerminal && showPreflightChip && (
        <PreflightChip boundaryCount={boundaryCount ?? 0} />
      )}
      <Button
        type="submit"
        // The button physically lives outside the LayoutPanel <form>
        // (rendered by App.tsx in the sticky tabs band). HTML5
        // form-association attribute keeps the submit binding intact.
        form="layout-form"
        variant="primary"
        size="md"
        disabled={generating}
        className="w-full"
      >
        {generating ? "Generating…" : "Generate layout"}
      </Button>
      {formHasErrors && (
        <p className="text-[12px] text-[var(--error-default)] leading-normal">
          Fix the validation errors above before generating.
        </p>
      )}
    </>
  )
}

/**
 * In-flight pin — header counter ("Generating layout — 2 of 6 done")
 * plus the per-plot progress list and a Cancel button. Re-renders
 * once a second to keep the running plot's elapsed counter live.
 */
function RunningPin({
  jobState,
  onCancel,
}: {
  jobState: LayoutJobState
  onCancel: () => void
}) {
  // Lightweight 1-Hz tick to keep the live "(1m 14s)" counter ticking
  // between the 2-second poll cadence. Stops automatically when the
  // pin unmounts (job reaches terminal state).
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <>
      <p className="text-[13px] text-[var(--text-primary)] font-medium">
        Generating layout — {jobState.plots_done} of {jobState.plots_total}{" "}
        {jobState.plots_total === 1 ? "boundary" : "boundaries"} done
      </p>
      <PlotList plots={jobState.plots} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="self-center"
      >
        Cancel
      </Button>
    </>
  )
}

/**
 * Terminal-state summary line. Click the caret on a partial/cancelled
 * outcome to reveal the per-plot list with errors inline.
 */
function PostRunSummary({ jobState }: { jobState: LayoutJobState }) {
  const [expanded, setExpanded] = useState(false)
  const elapsed = totalJobElapsed(jobState)
  const elapsedText = elapsed !== null ? ` in ${formatElapsed(elapsed)}` : ""

  // Choose icon + line text + expand-affordance per outcome.
  const isPartial =
    jobState.status === "done" && jobState.plots_failed > 0
  const isCancelled = jobState.status === "cancelled"
  const isFailedJob = jobState.status === "failed"
  const isAllDone =
    jobState.status === "done" && jobState.plots_failed === 0
  const canExpand = isPartial || isCancelled || isFailedJob

  let line: React.ReactNode
  if (isAllDone) {
    line = (
      <span className="flex items-center gap-[6px]">
        <Check className="size-[14px] text-[var(--success-default,#22c55e)] shrink-0" />
        All {jobState.plots_total}{" "}
        {jobState.plots_total === 1 ? "boundary" : "boundaries"} done
        {elapsedText}
      </span>
    )
  } else if (isPartial) {
    line = (
      <span className="flex items-center gap-[6px]">
        <AlertTriangle className="size-[14px] text-[var(--warning-default,#f59e0b)] shrink-0" />
        {jobState.plots_done} of {jobState.plots_total} done{elapsedText} —{" "}
        {summariseFailedNames(jobState.plots)} failed
      </span>
    )
  } else if (isCancelled) {
    line = (
      <span className="flex items-center gap-[6px]">
        <Ban className="size-[14px] text-[var(--text-muted)] shrink-0" />
        Cancelled — {jobState.plots_done} of {jobState.plots_total} done
        before stop
      </span>
    )
  } else {
    line = (
      <span className="flex items-center gap-[6px]">
        <X className="size-[14px] text-[var(--error-default)] shrink-0" />
        Layout failed — see sidecar logs
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center justify-between gap-[8px]">
        <div className="text-[13px] text-[var(--text-primary)] min-w-0 flex-1 truncate">
          {line}
        </div>
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 p-[2px] -m-[2px] rounded-[4px]
              text-[var(--text-muted)] hover:text-[var(--text-primary)]
              hover:bg-[var(--surface-muted)] transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse run details" : "Expand run details"}
          >
            {expanded ? (
              <ChevronDown className="size-[14px]" />
            ) : (
              <ChevronRight className="size-[14px]" />
            )}
          </button>
        )}
      </div>
      {expanded && canExpand && <PlotList plots={jobState.plots} />}
    </div>
  )
}

/**
 * Per-plot status list — boundary name, status icon, elapsed counter
 * (or final elapsed for done plots, or error message for failed).
 * Used in both the running pin and the expanded post-run summary.
 */
function PlotList({ plots }: { plots: PlotState[] }) {
  return (
    <ul className="flex flex-col gap-[2px] -mx-[4px] px-[4px] py-[6px]
      bg-[var(--surface-muted)] rounded-[6px] text-[12px]">
      {plots.map((p) => (
        <li
          key={p.index}
          className="flex items-center gap-[8px] py-[2px] min-w-0"
        >
          <PlotStatusIcon status={p.status} />
          <span
            className="text-[var(--text-primary)] truncate min-w-0 flex-1"
            title={p.name}
          >
            {p.name}
          </span>
          <span className="text-[var(--text-muted)] tabular-nums shrink-0">
            {plotTimingText(p)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function PlotStatusIcon({ status }: { status: PlotStatus }) {
  switch (status) {
    case "running":
      return (
        <Loader2
          className="size-[12px] text-[var(--accent-default)] animate-spin shrink-0"
          aria-label="running"
        />
      )
    case "done":
      return (
        <Check
          className="size-[12px] text-[var(--success-default,#22c55e)] shrink-0"
          aria-label="done"
        />
      )
    case "failed":
      return (
        <X
          className="size-[12px] text-[var(--error-default)] shrink-0"
          aria-label="failed"
        />
      )
    case "cancelled":
      return (
        <Ban
          className="size-[12px] text-[var(--text-muted)] shrink-0"
          aria-label="cancelled"
        />
      )
    case "queued":
    default:
      return (
        <span
          className="inline-block size-[6px] rounded-full bg-[var(--text-muted)] mx-[3px] shrink-0"
          aria-label="queued"
        />
      )
  }
}

function plotTimingText(p: PlotState): string {
  if (p.status === "queued") return "queued"
  if (p.status === "cancelled") return "skipped"
  if (p.status === "failed") {
    return p.error ?? "failed"
  }
  if (p.status === "running" && p.started_at !== null) {
    return `running (${formatElapsed(Date.now() / 1000 - p.started_at)})`
  }
  if (p.status === "done" && p.started_at !== null && p.ended_at !== null) {
    return `done (${formatElapsed(p.ended_at - p.started_at)})`
  }
  return p.status
}

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`
}

function totalJobElapsed(jobState: LayoutJobState): number | null {
  // Sum of per-plot durations isn't right for parallel runs (overlap).
  // Use min(started_at) → max(ended_at) for an honest wall-clock.
  const starts = jobState.plots
    .map((p) => p.started_at)
    .filter((v): v is number => v !== null)
  const ends = jobState.plots
    .map((p) => p.ended_at)
    .filter((v): v is number => v !== null)
  if (starts.length === 0 || ends.length === 0) return null
  return Math.max(...ends) - Math.min(...starts)
}

function summariseFailedNames(plots: PlotState[]): string {
  const failed = plots.filter((p) => p.status === "failed")
  const first = failed[0]
  if (!first) return ""
  if (failed.length === 1) return first.name
  const second = failed[1]
  if (failed.length === 2 && second) return `${first.name} + ${second.name}`
  return `${first.name} + ${failed.length - 1} others`
}

/**
 * Pre-flight expectation chip — shown when entitled + cable_calc=true +
 * multi-plot. Sets expectations before the user clicks Generate. Skips
 * the chip for jobs we expect to finish in <~15 s.
 */
function PreflightChip({ boundaryCount }: { boundaryCount: number }) {
  return (
    <Chip tone="neutral" className="self-start">
      Multi-plot cable calc — {boundaryCount} boundaries.{" "}
      {estimatedTimeRangeText(boundaryCount)}
    </Chip>
  )
}

function estimatedTimeRangeText(boundaryCount: number): string {
  // Heuristic — calibrated against POC numbers from
  // docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md. The
  // bands are intentionally wide because the per-plot time is
  // dominated by the largest plot (Amdahl's Law), not the count.
  if (boundaryCount <= 2) return "Estimated 1–2 min."
  if (boundaryCount <= 4) return "Estimated 2–4 min."
  if (boundaryCount <= 6) return "Estimated 3–8 min."
  return "Estimated 5+ min."
}

/** Re-export so callers can use it for "Reset to defaults" affordances later. */
export { DEFAULT_LAYOUT_PARAMETERS }
