/**
 * InteractionController — owns MapLibre event attachment for the
 * active editing mode.
 *
 * Responsibilities:
 *   1. Subscribe to `useEditingStateStore` and on mode change, detach
 *      the previous mode's handlers + attach the new mode's.
 *   2. On `styledata` (fires after `map.setStyle()` during theme swap),
 *      re-attach the active mode's handlers. The MapLibre instance
 *      persists across setStyle, but sources + layers are re-created
 *      from the new style JSON; a fresh event binding is the cheapest
 *      way to stay consistent.
 *   3. Detach everything on teardown (new KMZ, component unmount, etc.).
 *
 * Mode routing:
 *   - 'idle' / 'select' / 'awaiting-ack' / 'draw-polygon' / 'draw-line'
 *     → no handlers attached. (S11 ships with drag-icr + draw-rect as
 *     must-haves; polygon + line are stretch — modes exist in the enum
 *     but the handlers aren't wired in this Phase 2.)
 *   - 'drag-icr' → attachIcrDrag
 *   - 'draw-rect' → attachRectDraw
 *
 * 'awaiting-ack' is deliberately a no-op mode: after a commit is
 * dispatched, the user should not be able to start a new interaction
 * until the sidecar responds. Preview stays visible on the canvas
 * (mode modules leave it alone; App.tsx's mutation onSettle clears it).
 */
import type maplibregl from "maplibre-gl"
import type { StoreApi } from "zustand"
import { makeProbe } from "./debug"
import type { EditingMode } from "../state/editingState"
import type { useEditingStateStore } from "../state/editingState"
import type { IcrDragCommit } from "./modes/icrDrag"
import { attachIcrDrag } from "./modes/icrDrag"
import type { RectCommit } from "./modes/rectDraw"
import { attachRectDraw } from "./modes/rectDraw"

type EditingStore = ReturnType<typeof useEditingStateStore.getState>

const log = makeProbe("ctrl")

export interface InteractionControllerOptions {
  onIcrDragCommit: (commit: IcrDragCommit) => void
  onRectCommit: (commit: RectCommit) => void
}

export class InteractionController {
  private map: maplibregl.Map | null = null
  private store: StoreApi<EditingStore> | null = null
  private options: InteractionControllerOptions
  private activeMode: EditingMode = "idle"
  private activeDetach: (() => void) | null = null
  private unsubscribeFromStore: (() => void) | null = null
  private styledataHandler: (() => void) | null = null

  constructor(options: InteractionControllerOptions) {
    this.options = options
  }

  attach(map: maplibregl.Map, store: StoreApi<EditingStore>): void {
    if (this.map) {
      log.error("attach called twice without detach; ignoring")
      return
    }
    log("lifecycle", "attach controller")
    this.map = map
    this.store = store
    this.activeMode = store.getState().mode

    let lastMode: EditingMode = this.activeMode
    this.unsubscribeFromStore = store.subscribe((state) => {
      if (state.mode === lastMode) return
      lastMode = state.mode
      this.setActiveMode(state.mode)
    })

    this.setActiveMode(this.activeMode)

    this.styledataHandler = () => {
      log("lifecycle", "styledata — re-attaching active mode", {
        mode: this.activeMode,
      })
      const current = this.activeMode
      this.detachActiveMode()
      this.setActiveMode(current)
    }
    map.on("styledata", this.styledataHandler)
  }

  detach(): void {
    if (!this.map) return
    log("lifecycle", "detach controller")
    this.detachActiveMode()
    if (this.styledataHandler) {
      this.map.off("styledata", this.styledataHandler)
      this.styledataHandler = null
    }
    this.unsubscribeFromStore?.()
    this.unsubscribeFromStore = null
    this.map = null
    this.store = null
  }

  private setActiveMode(next: EditingMode): void {
    this.detachActiveMode()
    this.activeMode = next
    log("state", "activeMode", { mode: next })
    if (!this.map || !this.store) return
    switch (next) {
      case "drag-icr":
        this.activeDetach = attachIcrDrag({
          map: this.map,
          store: this.store,
          onCommit: this.options.onIcrDragCommit,
        })
        break
      case "draw-rect":
        this.activeDetach = attachRectDraw({
          map: this.map,
          store: this.store,
          onCommit: this.options.onRectCommit,
        })
        break
      case "idle":
      case "awaiting-ack":
      case "select":
      case "draw-polygon":
      case "draw-line":
        // No-op modes. 'awaiting-ack' is deliberately handler-less so
        // the user can't start a new interaction during the sidecar
        // round-trip. polygon + line are future-spike modes.
        this.activeDetach = null
        break
    }
  }

  private detachActiveMode(): void {
    if (!this.activeDetach) return
    try {
      this.activeDetach()
    } catch (err) {
      log.error("active detach threw", { err: String(err) })
    }
    this.activeDetach = null
  }
}
