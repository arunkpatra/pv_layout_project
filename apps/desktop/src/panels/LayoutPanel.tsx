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
 * Generate button at the bottom — wired by App.tsx via `onGenerate`
 * because the mutation lives in the orchestrator, not the panel.
 */
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
  type LayoutParameters,
} from "@solarlayout/sidecar-client"
import { FEATURE_KEYS } from "@solarlayout/entitlements-client"
import { useLayoutParamsStore } from "../state/layoutParams"
import { layoutParametersSchema } from "../state/layoutParams"
import { useHasFeature } from "../auth/FeatureGate"

interface LayoutPanelProps {
  onGenerate: (params: LayoutParameters) => void
  /** True while the layout mutation is in flight. */
  generating: boolean
  /** True when no project is loaded — disables the Generate button. */
  noProject: boolean
}

export function LayoutPanel({
  onGenerate,
  generating,
  noProject,
}: LayoutPanelProps) {
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

  // Belt-and-braces coercion: if the user isn't entitled to cable_routing,
  // force enable_cable_calc to false at submit time regardless of what
  // the form currently holds. Guards against stale persisted params
  // surviving a license downgrade — the UI gate in CableCalcFieldRow
  // handles the steady-state display.
  const hasCableRouting = useHasFeature(FEATURE_KEYS.CABLE_ROUTING)

  const onSubmit: SubmitHandler<LayoutParameters> = (values) => {
    const coerced: LayoutParameters = hasCableRouting
      ? values
      : { ...values, enable_cable_calc: false }
    setAll(coerced)
    onGenerate(coerced)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* ── Module ──────────────────────────────────────────────────── */}
      <InspectorSection title="Module">
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
      <InspectorSection title="Table">
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
      <InspectorSection title="Spacing & tilt">
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
      <InspectorSection title="Site">
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
      <InspectorSection title="Inverter sizing">
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

      {/* ── Generate ────────────────────────────────────────────────── */}
      <div className="px-[20px] py-[16px] flex flex-col gap-[8px]">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={generating || noProject}
          className="w-full"
        >
          {generating
            ? "Generating…"
            : noProject
              ? "Open a KMZ to generate"
              : "Generate layout"}
        </Button>
        {Object.keys(errors).length > 0 && (
          <p className="text-[12px] text-[var(--error-default)] leading-normal">
            Fix the validation errors above before generating.
          </p>
        )}
      </div>
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
          <Label className="truncate">Calculate cables</Label>
          {!entitled && (
            <Chip tone="accent" aria-label="Calculate cables requires Pro">
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

/** Re-export so callers can use it for "Reset to defaults" affordances later. */
export { DEFAULT_LAYOUT_PARAMETERS }
