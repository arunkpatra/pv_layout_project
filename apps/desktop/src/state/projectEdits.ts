/**
 * Desktop-side schema for the Project's `edits` field.
 *
 * Backend stores `edits` as opaque JSON (`unknown` on the wire) — the
 * shape is owned entirely by the desktop. This file is the source of
 * truth for that shape. Bumping `version` requires a migration story for
 * users with on-disk projects in the old shape.
 *
 * v1 carries only obstructions (the user-drawn rectangles / polygons /
 * lines that go through the sidecar's add-road / remove-last-road flow
 * in S11). ICR overrides aren't persisted yet — they reflect into the
 * layout result and are re-derived at run time. D3 (ICR drag-and-drop)
 * adds them when persistence becomes meaningful.
 *
 *   { version: 1, obstructions: [{ roadType, coordsWgs84 }] }
 *
 * The desktop's `editingState.undoStack` is the live state; this schema
 * is what gets serialized to the backend's `edits` column. Round-trip:
 *
 *   undoStack → editsFromUndoStack() → ProjectEdits → PATCH /v2/projects/:id
 *   B12.detail.edits → projectEditsSchema.parse() → applyEditsToSlice()
 */
import { z } from "zod"
import type { CommittedObstruction } from "./editingState"

const lngLatTupleSchema = z.tuple([z.number(), z.number()])

const obstructionSchema = z.object({
  roadType: z.enum(["rectangle", "polygon", "line"]),
  coordsWgs84: z.array(lngLatTupleSchema),
})

export const projectEditsSchema = z.object({
  /** Schema version. Bump only with a migration story. */
  version: z.literal(1),
  obstructions: z.array(obstructionSchema),
})

export type ProjectEdits = z.infer<typeof projectEditsSchema>

/**
 * The "empty" edits payload — what a fresh project carries before the
 * user has done anything. PATCHing this on a brand-new project is a
 * no-op (backend's `edits` defaults to `{}`; this is the canonical
 * "user has touched nothing" representation).
 */
export const EMPTY_EDITS: ProjectEdits = {
  version: 1,
  obstructions: [],
}

/**
 * Serialize the live `editingState.undoStack` into the persistable
 * shape. Drops the `serverAck: true` marker (it's a load-time invariant,
 * not data — every persisted obstruction is by definition ack'd at the
 * moment of save).
 */
export function editsFromUndoStack(
  undoStack: readonly CommittedObstruction[]
): ProjectEdits {
  return {
    version: 1,
    obstructions: undoStack.map((o) => ({
      roadType: o.roadType,
      coordsWgs84: o.coordsWgs84.map(([lng, lat]) => [lng, lat] as [number, number]),
    })),
  }
}

/**
 * Inverse of `editsFromUndoStack` — used by P2 (open-existing-project)
 * to re-hydrate the editingState slice from the backend's `edits`
 * field. Returns null when the wire data doesn't parse (caller should
 * fall back to an empty stack rather than treat this as an error —
 * a corrupted edits column should not block opening the project).
 */
export function undoStackFromEdits(
  raw: unknown
): CommittedObstruction[] | null {
  const parsed = projectEditsSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data.obstructions.map((o) => ({
    roadType: o.roadType,
    coordsWgs84: o.coordsWgs84.map(([lng, lat]) => [lng, lat] as [number, number]),
    serverAck: true as const,
  }))
}
