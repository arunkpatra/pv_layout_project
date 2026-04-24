/**
 * DrawingToolbar (S11) — mode selector + obstruction undo.
 *
 * Buttons:
 *   - Drag ICR         — enter drag-icr mode (ungated per ADR-0005 §9).
 *   - Draw rectangle   — enter draw-rect mode, gated on
 *                        OBSTRUCTION_EXCLUSION (Basic-tier; all paid
 *                        users have it).
 *   - Undo last        — pop placed_roads[-1] via /remove-road.
 *                        Disabled when undoStack empty or mode is
 *                        awaiting-ack.
 *
 * awaiting-ack visual state: all buttons disabled + subtle "Syncing…"
 * text. User can't start a new interaction while a previous commit is
 * in flight. Mode returns to idle on mutation onSettle (in App.tsx).
 */
import { Button, InspectorSection } from "@solarlayout/ui"
import { FEATURE_KEYS } from "@solarlayout/entitlements-client"
import {
  useEditingStateStore,
  type EditingMode,
} from "../state/editingState"
import { useHasFeature } from "../auth/FeatureGate"

export interface DrawingToolbarProps {
  onUndoLast: () => void
}

export function DrawingToolbar({ onUndoLast }: DrawingToolbarProps) {
  const mode = useEditingStateStore((s) => s.mode)
  const setMode = useEditingStateStore((s) => s.setMode)
  const undoStackDepth = useEditingStateStore((s) => s.undoStack.length)

  const hasObstructionExclusion = useHasFeature(
    FEATURE_KEYS.OBSTRUCTION_EXCLUSION
  )

  const isBusy = mode === "awaiting-ack"

  const toggle = (target: EditingMode) => {
    // Clicking the active mode returns to idle (lets user exit without
    // committing). Clicking any other button switches modes. Guarded
    // during awaiting-ack so the user can't interrupt a round-trip.
    if (isBusy) return
    setMode(mode === target ? "idle" : target)
  }

  return (
    <InspectorSection title="Interaction">
      <div className="flex flex-col gap-[6px]">
        <ModeButton
          label="Drag ICR"
          active={mode === "drag-icr"}
          disabled={isBusy}
          onClick={() => toggle("drag-icr")}
        />
        <DrawRectButton
          active={mode === "draw-rect"}
          entitled={hasObstructionExclusion}
          disabled={isBusy}
          onClick={() => toggle("draw-rect")}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndoLast}
          disabled={isBusy || undoStackDepth === 0}
          aria-label={`Undo last obstruction (${undoStackDepth} on stack)`}
        >
          {undoStackDepth > 0
            ? `Undo last (${undoStackDepth})`
            : "Undo last"}
        </Button>
        {isBusy && (
          <p className="text-[11px] text-[var(--text-muted)] leading-normal mt-[2px]">
            Syncing with engine…
          </p>
        )}
      </div>
    </InspectorSection>
  )
}

function ModeButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant={active ? "primary" : "subtle"}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="justify-start"
    >
      {active ? "• " : ""}
      {label}
    </Button>
  )
}

function DrawRectButton({
  active,
  entitled,
  disabled,
  onClick,
}: {
  active: boolean
  entitled: boolean
  disabled: boolean
  onClick: () => void
}) {
  // obstruction_exclusion is Basic-tier and above per the
  // renewable_energy seed (ADR-0005 §9). Every paid user has it, so
  // the `!entitled` branch is theoretical — defence-in-depth only.
  // When not entitled, render disabled; no tier chip (the upsell path
  // is via the license info dialog, not this button).
  return (
    <Button
      variant={active ? "primary" : "subtle"}
      size="sm"
      onClick={onClick}
      disabled={disabled || !entitled}
      className="justify-start w-full"
      aria-label={
        !entitled
          ? "Draw rectangle — requires an active subscription"
          : undefined
      }
    >
      {active ? "• " : ""}
      Draw rectangle
    </Button>
  )
}
