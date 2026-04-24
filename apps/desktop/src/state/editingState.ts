/**
 * Editing-state slice — drawing and drag-reposition state for S11.
 *
 * Designed against ADR-0006 (drawing/editing pipeline) and the
 * S10.5 gate memo. Owns:
 *
 *   - `mode`: which interaction is active. Mutually exclusive.
 *     `awaiting-ack` is a dedicated state for "commit dispatched;
 *     waiting for sidecar response" — InteractionController attaches
 *     no handlers in this state, so the user can't re-interact until
 *     the mutation settles.
 *   - `selectedIcrIndex`: which ICR is being dragged.
 *   - `pendingCommit`: the commit payload that's currently in flight.
 *     Null when idle; populated when mode == 'awaiting-ack'. Carries
 *     the final geometry so the preview can stay visible (rendered
 *     via direct setData by the mode module at commit time).
 *   - `undoStack`: LIFO of roads the server has ack'd. Optimistic
 *     pushes never enter the stack; a failed /add-road leaves it
 *     unchanged.
 *
 * The transient per-pixel preview geometry during a drag/draw is NOT
 * held here — mode modules write it directly to MapLibre sources via
 * canvas/preview.ts (S10.5 learning: going through Zustand at 60Hz
 * produces visible jitter). This slice only holds low-frequency
 * semantic state.
 *
 * Invariants (covered by tests):
 *   - `mode === 'idle'` ⇒ `selectedIcrIndex === null` AND
 *     `pendingCommit === null`.
 *   - `setMode` always clears selection and pendingCommit.
 *   - `pushObstruction` requires `serverAck === true`.
 */
import { create } from "zustand"
import { makeProbe } from "../canvas/debug"
import type { LngLat } from "../canvas/coords"

const log = makeProbe("state")

export type EditingMode =
  | "idle"
  | "drag-icr"
  | "draw-rect"
  | "draw-polygon"
  | "draw-line"
  | "select"
  /**
   * Commit has been dispatched; waiting for sidecar ack. The preview
   * stays visible on the canvas (rendered via direct setData by the
   * mode module at commit time). InteractionController attaches no
   * mode handlers in this state. On response, App.tsx transitions
   * back to `idle` (or `mode-failed` toast for errors).
   */
  | "awaiting-ack"

/**
 * A commit that's been dispatched to the sidecar. Held in the store
 * so App.tsx (which owns the mutation hooks) can decide what to do
 * on mutation onSettle: push onto undoStack for ack'd obstructions,
 * clear preview for any kind of commit, reset mode to idle.
 */
export type PendingCommit =
  | {
      kind: "icr-drag"
      boundaryName: string
      icrIndex: number
      newCenter: LngLat
    }
  | {
      kind: "add-road"
      roadType: "rectangle" | "polygon" | "line"
      coordsWgs84: LngLat[]
    }
  | {
      kind: "remove-last-road"
    }

export interface CommittedObstruction {
  roadType: "rectangle" | "polygon" | "line"
  coordsWgs84: LngLat[]
  /** Only server-ack'd obstructions enter the undo stack. */
  serverAck: true
}

interface EditingStateSlice {
  mode: EditingMode
  selectedIcrIndex: number | null
  pendingCommit: PendingCommit | null
  undoStack: CommittedObstruction[]

  setMode: (next: EditingMode) => void
  setSelectedIcrIndex: (idx: number | null) => void
  setPendingCommit: (commit: PendingCommit | null) => void
  pushObstruction: (o: CommittedObstruction) => void
  popLastObstruction: () => CommittedObstruction | null
  clearUndoStack: () => void
  /** Invoked on new KMZ load — mirrors layoutParams / layerVisibility resets. */
  reset: () => void
}

const INITIAL = {
  mode: "idle" as EditingMode,
  selectedIcrIndex: null as number | null,
  pendingCommit: null as PendingCommit | null,
  undoStack: [] as CommittedObstruction[],
}

export const useEditingStateStore = create<EditingStateSlice>()((set, get) => ({
  ...INITIAL,

  setMode: (next) => {
    const prev = get().mode
    log("state", "setMode", { from: prev, to: next })
    // Transitioning INTO awaiting-ack preserves pendingCommit (it was
    // just set in the commit callback). Every other transition clears
    // it alongside selection.
    if (next === "awaiting-ack") {
      set({ mode: next, selectedIcrIndex: null })
    } else {
      set({
        mode: next,
        selectedIcrIndex: null,
        pendingCommit: null,
      })
    }
  },

  setSelectedIcrIndex: (idx) => {
    log("state", "setSelectedIcrIndex", { idx })
    set({ selectedIcrIndex: idx })
  },

  setPendingCommit: (commit) => {
    log("state", "setPendingCommit", { kind: commit?.kind ?? null })
    set({ pendingCommit: commit })
  },

  pushObstruction: (o) => {
    const depth = get().undoStack.length + 1
    log("state", "pushObstruction", { roadType: o.roadType, depth })
    set((state) => ({ undoStack: [...state.undoStack, o] }))
  },

  popLastObstruction: () => {
    const stack = get().undoStack
    if (stack.length === 0) {
      log("state", "popLastObstruction noop", { depth: 0 })
      return null
    }
    const last = stack[stack.length - 1]!
    set({ undoStack: stack.slice(0, -1) })
    log("state", "popLastObstruction", {
      roadType: last.roadType,
      depth: stack.length - 1,
    })
    return last
  },

  clearUndoStack: () => {
    const depth = get().undoStack.length
    log("state", "clearUndoStack", { prevDepth: depth })
    set({ undoStack: [] })
  },

  reset: () => {
    log("lifecycle", "reset")
    set({ ...INITIAL })
  },
}))
