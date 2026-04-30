/**
 * Schema + serialization tests for the desktop-side `edits` payload.
 * Covers round-trip (undoStack → edits → undoStack), version pinning,
 * and graceful handling of malformed wire data on the read path.
 */
import { describe, it, expect } from "vitest"
import {
  EMPTY_EDITS,
  editsFromUndoStack,
  projectEditsSchema,
  undoStackFromEdits,
} from "./projectEdits"
import type { CommittedObstruction } from "./editingState"

const rectObstruction: CommittedObstruction = {
  roadType: "rectangle",
  coordsWgs84: [
    [77.5, 12.9],
    [77.6, 12.9],
    [77.6, 13.0],
    [77.5, 13.0],
  ],
  serverAck: true,
}

const polyObstruction: CommittedObstruction = {
  roadType: "polygon",
  coordsWgs84: [
    [77.55, 12.95],
    [77.58, 12.96],
    [77.57, 12.99],
  ],
  serverAck: true,
}

describe("projectEditsSchema", () => {
  it("parses the EMPTY_EDITS canonical shape", () => {
    expect(projectEditsSchema.safeParse(EMPTY_EDITS).success).toBe(true)
  })

  it("parses an edits payload with obstructions", () => {
    const r = projectEditsSchema.safeParse({
      version: 1,
      obstructions: [
        { roadType: "rectangle", coordsWgs84: [[77, 12]] },
        { roadType: "line", coordsWgs84: [] },
      ],
    })
    expect(r.success).toBe(true)
  })

  it("rejects a wrong version (forces migration before it lands)", () => {
    const r = projectEditsSchema.safeParse({ version: 2, obstructions: [] })
    expect(r.success).toBe(false)
  })

  it("rejects an unknown roadType", () => {
    const r = projectEditsSchema.safeParse({
      version: 1,
      obstructions: [{ roadType: "spline", coordsWgs84: [] }],
    })
    expect(r.success).toBe(false)
  })

  it("rejects non-tuple coords", () => {
    const r = projectEditsSchema.safeParse({
      version: 1,
      obstructions: [
        {
          roadType: "rectangle",
          coordsWgs84: [{ lng: 77, lat: 12 }],
        },
      ],
    })
    expect(r.success).toBe(false)
  })
})

describe("editsFromUndoStack", () => {
  it("returns EMPTY_EDITS-equivalent for an empty stack", () => {
    const e = editsFromUndoStack([])
    expect(e.version).toBe(1)
    expect(e.obstructions).toEqual([])
  })

  it("preserves obstruction ordering (insertion order — undo stack is LIFO display, FIFO data)", () => {
    const e = editsFromUndoStack([rectObstruction, polyObstruction])
    expect(e.obstructions).toHaveLength(2)
    expect(e.obstructions[0]?.roadType).toBe("rectangle")
    expect(e.obstructions[1]?.roadType).toBe("polygon")
  })

  it("drops the serverAck marker (not data, an invariant)", () => {
    const e = editsFromUndoStack([rectObstruction])
    const obs = e.obstructions[0] as Record<string, unknown>
    expect(obs).not.toHaveProperty("serverAck")
  })

  it("produces a stable JSON string for unchanged input (auto-save dedup relies on this)", () => {
    const a = JSON.stringify(editsFromUndoStack([rectObstruction, polyObstruction]))
    const b = JSON.stringify(editsFromUndoStack([rectObstruction, polyObstruction]))
    expect(a).toBe(b)
  })
})

describe("undoStackFromEdits — read path (P2 restore)", () => {
  it("round-trips through editsFromUndoStack", () => {
    const stack = [rectObstruction, polyObstruction]
    const edits = editsFromUndoStack(stack)
    const restored = undoStackFromEdits(edits)
    expect(restored).not.toBeNull()
    expect(restored).toHaveLength(2)
    expect(restored?.[0]?.roadType).toBe("rectangle")
    expect(restored?.[0]?.coordsWgs84).toEqual(rectObstruction.coordsWgs84)
    expect(restored?.[0]?.serverAck).toBe(true)
  })

  it("returns null on malformed wire data (P2 falls back to empty stack)", () => {
    expect(undoStackFromEdits({ version: 99, obstructions: [] })).toBeNull()
    expect(undoStackFromEdits(null)).toBeNull()
    expect(undoStackFromEdits("not-an-object")).toBeNull()
    expect(undoStackFromEdits({})).toBeNull()
  })

  it("returns empty array for a fresh-project edits payload", () => {
    expect(undoStackFromEdits(EMPTY_EDITS)).toEqual([])
  })
})
