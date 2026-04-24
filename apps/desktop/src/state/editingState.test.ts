/**
 * Unit tests for editingState slice (S11).
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  useEditingStateStore,
  type CommittedObstruction,
  type PendingCommit,
} from "./editingState"

const obs = (
  roadType: CommittedObstruction["roadType"]
): CommittedObstruction => ({
  roadType,
  coordsWgs84: [
    [77.6, 12.9],
    [77.61, 12.9],
    [77.61, 12.91],
    [77.6, 12.91],
    [77.6, 12.9],
  ],
  serverAck: true,
})

describe("useEditingStateStore", () => {
  beforeEach(() => {
    useEditingStateStore.getState().reset()
  })

  it("starts in idle mode with no selection, no pending, empty stack", () => {
    const s = useEditingStateStore.getState()
    expect(s.mode).toBe("idle")
    expect(s.selectedIcrIndex).toBeNull()
    expect(s.pendingCommit).toBeNull()
    expect(s.undoStack).toEqual([])
  })

  it("setMode to a non-awaiting-ack value clears selection + pending", () => {
    const s = useEditingStateStore.getState()
    s.setSelectedIcrIndex(2)
    s.setPendingCommit({
      kind: "icr-drag",
      boundaryName: "b",
      icrIndex: 0,
      newCenter: [0, 0],
    })
    s.setMode("draw-rect")
    const next = useEditingStateStore.getState()
    expect(next.mode).toBe("draw-rect")
    expect(next.selectedIcrIndex).toBeNull()
    expect(next.pendingCommit).toBeNull()
  })

  it("setMode to awaiting-ack preserves pendingCommit, clears selection", () => {
    const s = useEditingStateStore.getState()
    const commit: PendingCommit = {
      kind: "add-road",
      roadType: "rectangle",
      coordsWgs84: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    }
    s.setSelectedIcrIndex(5)
    s.setPendingCommit(commit)
    s.setMode("awaiting-ack")
    const next = useEditingStateStore.getState()
    expect(next.mode).toBe("awaiting-ack")
    expect(next.pendingCommit).toEqual(commit)
    expect(next.selectedIcrIndex).toBeNull()
  })

  it("pushObstruction appends; popLast returns LIFO", () => {
    const s = useEditingStateStore.getState()
    s.pushObstruction(obs("rectangle"))
    s.pushObstruction(obs("polygon"))
    s.pushObstruction(obs("line"))

    expect(s.popLastObstruction()?.roadType).toBe("line")
    expect(s.popLastObstruction()?.roadType).toBe("polygon")
    expect(s.popLastObstruction()?.roadType).toBe("rectangle")
    expect(useEditingStateStore.getState().undoStack).toEqual([])
  })

  it("popLast on empty returns null", () => {
    expect(useEditingStateStore.getState().popLastObstruction()).toBeNull()
  })

  it("clearUndoStack drains the stack", () => {
    const s = useEditingStateStore.getState()
    s.pushObstruction(obs("rectangle"))
    s.pushObstruction(obs("polygon"))
    s.clearUndoStack()
    expect(useEditingStateStore.getState().undoStack).toEqual([])
  })

  it("reset returns to INITIAL from any state", () => {
    const s = useEditingStateStore.getState()
    s.setMode("drag-icr")
    s.setSelectedIcrIndex(3)
    s.setPendingCommit({ kind: "remove-last-road" })
    s.pushObstruction(obs("polygon"))
    s.reset()
    const next = useEditingStateStore.getState()
    expect(next.mode).toBe("idle")
    expect(next.selectedIcrIndex).toBeNull()
    expect(next.pendingCommit).toBeNull()
    expect(next.undoStack).toEqual([])
  })

  it("all mode transitions are allowed (no gating)", () => {
    const modes = [
      "drag-icr",
      "awaiting-ack",
      "idle",
      "draw-rect",
      "draw-polygon",
      "draw-line",
      "select",
    ] as const
    const s = useEditingStateStore.getState()
    for (const m of modes) {
      s.setMode(m)
      expect(useEditingStateStore.getState().mode).toBe(m)
    }
  })
})
