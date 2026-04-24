/**
 * Layout parameters slice — the form state behind S9's InputPanel.
 *
 * Schema and defaults mirror the sidecar's `LayoutParameters` pydantic
 * model. The slice exists in S8.8 (no UI consumers yet); S9 wires
 * react-hook-form to read defaults from / write back to this slice.
 *
 * Why Zustand here (not local component state)?
 *   - LayoutPanel will be sibling to SummaryPanel (which reads counts
 *     after Generate) and the Generate button itself.
 *   - The params survive panel collapse/expand and tab switches.
 *   - The future "save project to cloud" feature (S12+, ADR-0004) will
 *     serialise the slice directly.
 *
 * Form lifecycle (touched/errors/dirty) lives in react-hook-form, NOT
 * here. RHF's `defaultValues` come from `useLayoutParamsStore.getState()`
 * at form mount; the form's onChange (debounced) calls `setParam` to
 * persist back. Single source of truth, clear ownership.
 */
import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import { z } from "zod"
import {
  DEFAULT_LAYOUT_PARAMETERS,
  type LayoutParameters,
} from "@solarlayout/sidecar-client"

// ─────────────────────────────────────────────────────────────────────
// Zod schema — validation for the InputPanel form.
//
// Min/max ranges mirror the PyQt5 reference (PVlayout_Advance/gui/
// input_panel.py — see SPIKE_PLAN S9 for the field inventory). The
// schema is the single source of truth for what the UI accepts; the
// Zustand slice just persists what passes validation.
// ─────────────────────────────────────────────────────────────────────

export const moduleSpecSchema = z.object({
  length: z.number().min(0.5).max(5.0),
  width: z.number().min(0.5).max(3.0),
  wattage: z.number().min(100).max(1000),
})

export const tableConfigSchema = z.object({
  modules_in_row: z.number().int().min(1).max(100),
  rows_per_table: z.number().int().min(1).max(10),
  orientation: z.enum(["portrait", "landscape"]),
})

export const layoutParametersSchema = z.object({
  design_type: z.literal("fixed_tilt"),
  tilt_angle: z.number().min(0).max(90).nullable(),
  row_spacing: z.number().min(1).max(50).nullable(),
  gcr: z.number().min(0).max(1).nullable(),
  perimeter_road_width: z.number().min(0).max(50),
  module: moduleSpecSchema,
  table: tableConfigSchema,
  table_gap_ew: z.number().min(0).max(20),
  table_gap_ns: z.number().min(0).max(20),
  max_strings_per_inverter: z.number().int().min(1).max(500),
  design_mode: z.enum(["string_inverter", "central_inverter"]),
  max_smb_per_central_inv: z.number().int().min(1).max(200),
  enable_cable_calc: z.boolean(),
})

/** Compile-time check: Zod schema and TS interface stay in sync. */
type _ZodMatchesType = z.infer<typeof layoutParametersSchema> extends LayoutParameters
  ? LayoutParameters extends z.infer<typeof layoutParametersSchema>
    ? true
    : false
  : false
const _zodMatchesType: _ZodMatchesType = true
void _zodMatchesType

interface LayoutParamsState {
  params: LayoutParameters
  /**
   * Replace a single top-level field. Object-typed fields (`module`,
   * `table`) take a fully-merged object — callers spread the existing
   * value when patching one nested field.
   */
  setParam: <K extends keyof LayoutParameters>(
    key: K,
    value: LayoutParameters[K]
  ) => void
  /** Replace the entire params object (used by RHF on form submit). */
  setAll: (params: LayoutParameters) => void
  /** Restore field-level defaults from the sidecar schema. */
  resetToDefaults: () => void
}

export const useLayoutParamsStore = create<LayoutParamsState>()(
  subscribeWithSelector((set) => ({
    params: DEFAULT_LAYOUT_PARAMETERS,
    setParam: (key, value) =>
      set((s) => ({ params: { ...s.params, [key]: value } })),
    setAll: (params) => set({ params }),
    resetToDefaults: () => set({ params: DEFAULT_LAYOUT_PARAMETERS }),
  }))
)
