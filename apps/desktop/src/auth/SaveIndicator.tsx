/**
 * SaveIndicator — small status pill that mirrors `useAutoSaveProject`'s
 * `SaveStatus` to a visible UI. Lives over the canvas (top-right
 * corner alongside other transient overlays), token-driven so the
 * dark/light theme treatment stays consistent.
 *
 * Visual states:
 *   idle    → not rendered (avoid noise when nothing is happening)
 *   saving  → "Saving…" with subtle pulse
 *   saved   → "Saved" briefly, then auto-fades to idle after a few
 *             seconds (handled via key-bumping the at timestamp;
 *             parent doesn't have to manage)
 *   error   → "Save failed" + error tone, dismissable
 *
 * This is the P4 baseline. Will be revisited at S3/S4 once the project
 * header gets its proper visual home; the component will likely move
 * into TopBar's chip area then.
 */
import { useEffect, useState, type JSX } from "react"
import type { SaveStatus } from "./useAutoSaveProject"

const SAVED_FADE_MS = 2500

export function SaveIndicator({
  status,
}: {
  status: SaveStatus
}): JSX.Element | null {
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    if (status.kind !== "saved") {
      setShowSaved(false)
      return
    }
    setShowSaved(true)
    const timer = setTimeout(() => setShowSaved(false), SAVED_FADE_MS)
    return () => clearTimeout(timer)
  }, [status])

  if (status.kind === "idle") return null
  if (status.kind === "saved" && !showSaved) return null

  const label =
    status.kind === "saving"
      ? "Saving…"
      : status.kind === "saved"
        ? "Saved"
        : "Save failed"

  const tone =
    status.kind === "error"
      ? "border-[var(--error-muted)] text-[var(--error-default)]"
      : "border-[var(--border-subtle)] text-[var(--text-secondary)]"

  return (
    <div
      className={`absolute top-[16px] right-[16px] pointer-events-auto px-[10px] py-[6px] rounded-[var(--radius-md)] bg-[var(--surface-panel)] border ${tone} shadow-[var(--shadow-sm)] text-[12px] font-medium`}
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  )
}
