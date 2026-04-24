/**
 * Zod-schema tests for layoutParametersSchema.
 *
 * The schema is the single source of truth for what the InputPanel
 * accepts. These tests pin the contract so future "let's just bump the
 * max" changes can't silently land.
 */
import { describe, it, expect } from "vitest"
import { DEFAULT_LAYOUT_PARAMETERS } from "@solarlayout/sidecar-client"
import { layoutParametersSchema } from "./layoutParams"

describe("layoutParametersSchema", () => {
  it("accepts the sidecar's default values verbatim", () => {
    const result = layoutParametersSchema.safeParse(DEFAULT_LAYOUT_PARAMETERS)
    expect(result.success).toBe(true)
  })

  it("accepts a fully-populated valid params object", () => {
    const valid = {
      ...DEFAULT_LAYOUT_PARAMETERS,
      tilt_angle: 22.0,
      row_spacing: 7.5,
      design_mode: "central_inverter" as const,
      table: {
        modules_in_row: 30,
        rows_per_table: 3,
        orientation: "landscape" as const,
      },
    }
    expect(layoutParametersSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects out-of-range module length", () => {
    const result = layoutParametersSchema.safeParse({
      ...DEFAULT_LAYOUT_PARAMETERS,
      module: { ...DEFAULT_LAYOUT_PARAMETERS.module, length: 0.1 },
    })
    expect(result.success).toBe(false)
  })

  it("rejects out-of-range tilt", () => {
    const result = layoutParametersSchema.safeParse({
      ...DEFAULT_LAYOUT_PARAMETERS,
      tilt_angle: 100, // > 90
    })
    expect(result.success).toBe(false)
  })

  it("accepts null for tilt_angle (auto-derive sentinel)", () => {
    const result = layoutParametersSchema.safeParse({
      ...DEFAULT_LAYOUT_PARAMETERS,
      tilt_angle: null,
    })
    expect(result.success).toBe(true)
  })

  it("accepts null for row_spacing (auto-derive sentinel)", () => {
    const result = layoutParametersSchema.safeParse({
      ...DEFAULT_LAYOUT_PARAMETERS,
      row_spacing: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects fractional integer fields (modules_in_row must be int)", () => {
    const result = layoutParametersSchema.safeParse({
      ...DEFAULT_LAYOUT_PARAMETERS,
      table: {
        ...DEFAULT_LAYOUT_PARAMETERS.table,
        modules_in_row: 28.5,
      },
    })
    expect(result.success).toBe(false)
  })

  it("rejects unknown orientation values", () => {
    const result = layoutParametersSchema.safeParse({
      ...DEFAULT_LAYOUT_PARAMETERS,
      table: {
        ...DEFAULT_LAYOUT_PARAMETERS.table,
        orientation: "diagonal" as never,
      },
    })
    expect(result.success).toBe(false)
  })

  it("rejects unknown design_mode values", () => {
    const result = layoutParametersSchema.safeParse({
      ...DEFAULT_LAYOUT_PARAMETERS,
      design_mode: "micro_inverter" as never,
    })
    expect(result.success).toBe(false)
  })
})
