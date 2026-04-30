/**
 * useAutoSaveProject — debounced PATCH of `edits` to the backend (B13).
 *
 *   useAutoSaveProject(licenseKey, client, projectId, edits, { debounceMs })
 *      → SaveStatus
 *
 * Behaviour:
 *   - Watches `(projectId, edits)`. On change, schedules a PATCH after
 *     `debounceMs` of idle (default 2000). Subsequent changes within
 *     the debounce window cancel the pending timer and reschedule.
 *   - First mount with non-null edits captures them as the BASELINE —
 *     no save fires (the state was just loaded from B12, no need to
 *     round-trip it back). Only diffs from the baseline trigger.
 *   - Project switch (projectId changes) cancels any pending save +
 *     resets the baseline to whatever edits arrive next. Mid-flight
 *     network calls are NOT cancelled (would require AbortController
 *     plumbing through the client; v1 lets the racing PATCH land —
 *     it's idempotent and the new project has its own baseline so
 *     the late response is harmless).
 *   - Equality: JSON-stringify comparison. Edit shapes are small (a
 *     few obstructions per project at most), so the cost is trivial.
 *
 * Status surface for the UI:
 *   { kind: "idle" }                     — no project / nothing to save
 *   { kind: "saving" }                   — debounce fired; PATCH in flight
 *   { kind: "saved", at: ISO timestamp } — last save succeeded
 *   { kind: "error", error: Error }      — last save failed; banner shows
 *
 * Why an effect, not a TanStack Query mutation:
 *   - The lifecycle is "fire on edits change after debounce", not
 *     "fire on user click". `useMutation` doesn't have a debouncer;
 *     wrapping one in a setTimeout effect ends up being equivalent to
 *     this anyway, with extra ceremony.
 *   - We don't want React Query's retry / cache machinery for a
 *     fire-and-forget save — the user's next edit IS the retry trigger.
 */
import { useEffect, useRef, useState } from "react"
import {
  type EntitlementsClient,
} from "@solarlayout/entitlements-client"
import {
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
} from "./licenseKey"
import type { ProjectEdits } from "../state/projectEdits"

const PREVIEW_KEYS = new Set<string>([
  PREVIEW_LICENSE_KEY,
  PREVIEW_LICENSE_KEY_BASIC,
  PREVIEW_LICENSE_KEY_PRO,
  PREVIEW_LICENSE_KEY_PRO_PLUS,
])

function isPreviewKey(licenseKey: string): boolean {
  return PREVIEW_KEYS.has(licenseKey)
}

const DEFAULT_DEBOUNCE_MS = 2000

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; error: Error }

export interface UseAutoSaveProjectOptions {
  /** Idle window before a PATCH fires. Default 2000ms (2s). */
  debounceMs?: number
}

export function useAutoSaveProject(
  licenseKey: string | null,
  client: EntitlementsClient,
  projectId: string | null,
  edits: ProjectEdits | null,
  options: UseAutoSaveProjectOptions = {}
): SaveStatus {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS

  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" })

  // The serialized snapshot of the last successfully-saved (or
  // baselined-as-loaded) edits. `null` until the first edits arrives.
  const lastSavedRef = useRef<string | null>(null)
  // Tracks which projectId the baseline was captured for. Used to detect
  // project switches without storing projectId in a ref-and-state pair.
  const baselineProjectRef = useRef<string | null>(null)

  // Effect 1 — baseline reset on project switch. Runs BEFORE the save
  // effect (declaration order) so the save effect sees a fresh baseline.
  useEffect(() => {
    if (projectId !== baselineProjectRef.current) {
      lastSavedRef.current = null
      baselineProjectRef.current = projectId
      setStatus({ kind: "idle" })
    }
  }, [projectId])

  // Effect 2 — debounced save. The JSON-string is folded into the
  // dependency array so React re-runs the effect on actual content
  // change (not on every re-render that produces a new edits identity).
  const editsJson = edits === null ? null : JSON.stringify(edits)

  useEffect(() => {
    if (!licenseKey || !projectId) return
    if (isPreviewKey(licenseKey)) return
    if (editsJson === null) return

    if (lastSavedRef.current === null) {
      // First edits seen for this project — capture baseline, no save.
      lastSavedRef.current = editsJson
      return
    }

    if (editsJson === lastSavedRef.current) return // unchanged

    // Schedule the save. The timer + setStatus capture `editsJson`
    // (the value at scheduling time); a later change cancels and
    // reschedules with the newer value. Coalesce, don't queue.
    setStatus({ kind: "saving" })
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        // `edits` here closes over the render-time value paired with
        // editsJson. Safe because deps are aligned.
        await client.patchProjectV2(licenseKey, projectId, {
          edits: edits ?? undefined,
        })
        if (cancelled) return
        lastSavedRef.current = editsJson
        setStatus({ kind: "saved", at: new Date().toISOString() })
      } catch (err) {
        if (cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        setStatus({ kind: "error", error })
      }
    }, debounceMs)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [licenseKey, projectId, editsJson, edits, client, debounceMs])

  return status
}
