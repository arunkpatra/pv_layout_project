/**
 * DeleteProjectConfirmDialog — destructive-tone confirm modal for project
 * soft-delete.
 *
 * Surface-agnostic. Mounted by RecentsView (per-card menu) and TabsBar
 * (per-tab context menu). Both surfaces own their own dialog state.
 *
 * Soft-delete is permanent from the desktop UI's perspective: there's no
 * "undo" inside the app (recovery would require admin tooling). The copy
 * makes that explicit so the user understands the cost of clicking
 * Delete.
 *
 * **Type-to-confirm guard.** The user must type the literal word
 * `delete` (case-insensitive) into the input below the warning before
 * the destructive button enables. Standard pattern for irreversible
 * actions where the cost of an accidental click is high — a layout run
 * costs calc-quota + minutes of solver time, so a fat-fingered Delete
 * is expensive.
 *
 * Submitting state + error message come from the parent (the
 * useDeleteProjectMutation result). Esc / Cancel / outside-click dismiss
 * AND reset the input via the parent's onOpenChange-false handler.
 */
import { useEffect, useState } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from "@solarlayout/ui-desktop"

const CONFIRM_PHRASE = "delete"

export interface DeleteProjectConfirmDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** Project being deleted. May be null when the dialog is closed. */
  project: { id: string; name: string } | null
  /** Called when the user confirms the destructive action. */
  onConfirm: () => void
  /** Mutation in flight. Disables both buttons + flips Delete copy. */
  busy?: boolean
  /** External error (from the mutation). Shown inline. */
  error?: string | null
}

export function DeleteProjectConfirmDialog({
  open,
  onOpenChange,
  project,
  onConfirm,
  busy = false,
  error,
}: DeleteProjectConfirmDialogProps) {
  const [confirmValue, setConfirmValue] = useState("")

  // Reset the type-to-confirm input every time the dialog opens. Without
  // this, a previous "delete" typed for a different project would persist
  // and the next open would show Delete enabled by default — defeats the
  // anti-fat-finger purpose.
  useEffect(() => {
    if (open) setConfirmValue("")
  }, [open])

  const phraseMatches =
    confirmValue.trim().toLowerCase() === CONFIRM_PHRASE
  const canConfirm = phraseMatches && !busy

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogTitle className="text-[16px] font-semibold text-[var(--text-primary)]">
          Delete project
        </DialogTitle>

        <DialogDescription className="text-[13px] text-[var(--text-secondary)] leading-normal mt-[8px]">
          {project ? (
            <>
              Delete <span className="font-medium">{project.name}</span>? This
              soft-deletes the project and all its runs. One project quota
              slot is freed. You can&apos;t undo this from inside the app.
            </>
          ) : (
            <>
              This soft-deletes the project and all its runs. One project
              quota slot is freed. You can&apos;t undo this from inside the
              app.
            </>
          )}
        </DialogDescription>

        <div className="mt-[16px] flex flex-col gap-[6px]">
          <Label
            htmlFor="delete-project-confirm-input"
            className="text-[12px] text-[var(--text-secondary)]"
          >
            Type{" "}
            <code className="font-mono text-[12px] text-[var(--text-primary)]">
              {CONFIRM_PHRASE}
            </code>{" "}
            to confirm
          </Label>
          <Input
            id="delete-project-confirm-input"
            type="text"
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            placeholder={CONFIRM_PHRASE}
          />
        </div>

        {error && (
          <p className="text-[12px] text-[var(--error-default)] mt-[12px]">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-[8px] mt-[16px]">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="md"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
