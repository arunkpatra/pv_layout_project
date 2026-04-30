/**
 * RenameProjectDialog — modal for renaming a backend-persisted project.
 *
 * Surface-agnostic. Mounted by RecentsView (per-card menu) and TabsBar
 * (per-tab context menu). Both surfaces own their own dialog state.
 *
 * Validation mirrors backend B13's `.strict().refine()` shape:
 *   - trimmed length 1..200 chars
 *   - must differ from the current name
 *
 * Submitting state + error message come from the parent (the
 * useRenameProjectMutation result). Esc / Cancel / outside-click dismiss.
 */
import { useEffect, useState, type FormEvent } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from "@solarlayout/ui-desktop"

const MAX_NAME_LEN = 200

export interface RenameProjectDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** Project being renamed. May be null when the dialog is closed. */
  project: { id: string; name: string } | null
  /** Called with the new trimmed name on submit. */
  onSubmit: (newName: string) => void
  /** Mutation in flight. Disables the input + Save button. */
  busy?: boolean
  /** External error (from the mutation). Shown inline. */
  error?: string | null
}

export function RenameProjectDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
  busy = false,
  error,
}: RenameProjectDialogProps) {
  const [value, setValue] = useState("")

  // Re-prime the input every time the dialog opens for a (potentially
  // different) project. Resetting on close would briefly show empty
  // during the close animation; resetting on open is simpler + correct.
  useEffect(() => {
    if (open && project) setValue(project.name)
  }, [open, project])

  const trimmed = value.trim()
  const tooLong = trimmed.length > MAX_NAME_LEN
  const empty = trimmed.length === 0
  const unchanged = project ? trimmed === project.name : false
  const invalid = empty || tooLong || unchanged
  const canSubmit = !invalid && !busy

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogTitle className="text-[16px] font-semibold text-[var(--text-primary)]">
          Rename project
        </DialogTitle>

        <DialogDescription className="text-[13px] text-[var(--text-secondary)] leading-normal mt-[8px]">
          {project ? (
            <>
              Rename <span className="font-medium">{project.name}</span> to a
              new name. Up to {MAX_NAME_LEN} characters.
            </>
          ) : (
            <>Rename this project. Up to {MAX_NAME_LEN} characters.</>
          )}
        </DialogDescription>

        <form
          onSubmit={handleSubmit}
          className="mt-[16px] flex flex-col gap-[12px]"
        >
          <div className="flex flex-col gap-[6px]">
            <Label
              htmlFor="rename-project-input"
              className="text-[12px] text-[var(--text-secondary)]"
            >
              New name
            </Label>
            <Input
              id="rename-project-input"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              maxLength={MAX_NAME_LEN + 50}
            />
            {tooLong && (
              <p className="text-[12px] text-[var(--error-default)]">
                Name must be {MAX_NAME_LEN} characters or fewer.
              </p>
            )}
            {error && !tooLong && (
              <p className="text-[12px] text-[var(--error-default)]">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-[8px] mt-[8px]">
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
              type="submit"
              variant="primary"
              size="md"
              disabled={!canSubmit}
            >
              {busy ? "Renaming…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
