/**
 * CreateProjectModal — staged progress overlay for the C4 new-project
 * flow.
 *
 * Three stages: uploading → creating → parsing. Each row shows pending /
 * active / done / error state. On any error, the modal collapses to an
 * error state with [Cancel] [Try again] buttons. On success (stage 3
 * `done`), the modal pauses 300ms for closure then auto-dismisses.
 *
 * Cold-start latency on first-of-session (Lambda warm-up) is ~1-7s; the
 * staged modal masks the latency by showing explicit per-stage progress
 * with a per-stage elapsed-time readout. See spec
 * `docs/superpowers/specs/2026-05-03-c4-parse-kmz-lambda.md` §Q3 + Q6.
 */
import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, Circle, Loader2 } from "lucide-react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@solarlayout/ui-desktop"

export type CreateProjectStageKind =
  | "idle"
  | "uploading"
  | "creating"
  | "parsing"
  | "done"
  | "error"

export type CreateProjectStage =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "creating" }
  | { kind: "parsing" }
  | { kind: "done" }
  | {
      kind: "error"
      failedAt: "uploading" | "creating" | "parsing"
      /**
       * V2 server-error code (e.g. `"INVALID_KMZ"`, `"INTERNAL_SERVER_ERROR"`)
       * when the failure originated from a typed server response. Drives the
       * `ERROR_COPY` lookup so the modal can render an actionable message;
       * unknown / undefined falls back to the generic copy.
       */
      code?: string
    }

export interface CreateProjectModalProps {
  stage: CreateProjectStage
  onCancel: () => void
  onTryAgain: () => void
  /** Fired ~300ms after the modal reaches the `done` stage. */
  onAutoDismiss: () => void
}

const ROW_LABELS: Record<
  "uploading" | "creating" | "parsing",
  { active: string; done: string }
> = {
  uploading: {
    active: "Uploading boundary file",
    done: "Uploaded boundary file",
  },
  creating: { active: "Creating your project", done: "Created your project" },
  parsing: { active: "Reading boundaries…", done: "Read boundaries" },
}

const HEADER = "Setting up your project"
const GENERIC_ERROR_MESSAGE =
  "Something went wrong setting up your project. Please try again, or contact support if it keeps happening."

/**
 * Code → user-facing copy table for known V2 server error codes. Mirrors
 * the backend's `V2ErrorCode` union (`packages/shared/src/types/api-v2.ts`)
 * — when a new code is added on the backend that should surface a
 * specific message here, add it to this table. Codes not in this table
 * fall back to `GENERIC_ERROR_MESSAGE`. PAYMENT_REQUIRED is handled
 * upstream (App.tsx swaps to the upsell overlay before the error stage
 * fires), so it deliberately isn't in this table.
 */
const ERROR_COPY: Record<string, string> = {
  INVALID_KMZ:
    "This file isn't a valid KMZ. Make sure you're uploading a .kmz exported from your design tool.",
  UNAUTHORIZED:
    "Your session expired. Sign in again to continue.",
  S3_NOT_CONFIGURED:
    "Project storage isn't configured. Contact support.",
  VALIDATION_ERROR:
    "We couldn't process this project's details. Please try again or contact support.",
  NOT_FOUND:
    "The project couldn't be found. It may have been deleted from another window.",
}

function errorMessageFor(stage: CreateProjectStage): string {
  if (stage.kind !== "error") return GENERIC_ERROR_MESSAGE
  if (stage.code && ERROR_COPY[stage.code]) return ERROR_COPY[stage.code]!
  return GENERIC_ERROR_MESSAGE
}

const AUTO_DISMISS_DELAY_MS = 300
const TICK_INTERVAL_MS = 100

const STAGE_ORDER = ["uploading", "creating", "parsing"] as const
type StageName = (typeof STAGE_ORDER)[number]

type RowStatus = "pending" | "active" | "done" | "error"

function statusFor(stage: CreateProjectStage, name: StageName): RowStatus {
  if (stage.kind === "idle") return "pending"
  if (stage.kind === "done") return "done"
  if (stage.kind === "error") {
    if (stage.failedAt === name) return "error"
    return STAGE_ORDER.indexOf(name) < STAGE_ORDER.indexOf(stage.failedAt)
      ? "done"
      : "pending"
  }
  // In-flight: stage.kind is one of the three stage names.
  const currentIdx = STAGE_ORDER.indexOf(stage.kind)
  const sIdx = STAGE_ORDER.indexOf(name)
  if (sIdx < currentIdx) return "done"
  if (sIdx === currentIdx) return "active"
  return "pending"
}

function StatusIcon({ status }: { status: RowStatus }) {
  // 16px icons match the row's 13px text baseline reasonably; the stroke
  // weight (1.75) is the project's design-foundations default for inline
  // glyphs at this size. aria-hidden because the row label conveys
  // semantics; data-status on the <li> is the test/programmatic hook.
  const props = {
    size: 16,
    strokeWidth: 1.75,
    "aria-hidden": true as const,
  }
  if (status === "done") return <Check {...props} />
  if (status === "active") return <Loader2 {...props} className="animate-spin" />
  if (status === "error") return <AlertTriangle {...props} />
  return <Circle {...props} />
}

export function CreateProjectModal({
  stage,
  onCancel,
  onTryAgain,
  onAutoDismiss,
}: CreateProjectModalProps) {
  // Per-stage start + end timestamps for the elapsed-time readout. Refs
  // (not state) — we don't want the timestamps themselves to trigger
  // re-renders; only the ticking `now` does.
  const startsRef = useRef<Partial<Record<StageName, number>>>({})
  const endsRef = useRef<Partial<Record<StageName, number>>>({})
  const [now, setNow] = useState<number>(() => Date.now())

  // Stamp start times when a stage becomes active for the first time;
  // stamp end times when it transitions out of active.
  for (const name of STAGE_ORDER) {
    const status = statusFor(stage, name)
    if (
      (status === "active" || status === "done" || status === "error") &&
      startsRef.current[name] === undefined
    ) {
      startsRef.current[name] = Date.now()
    }
    if (
      (status === "done" || status === "error") &&
      endsRef.current[name] === undefined
    ) {
      endsRef.current[name] = Date.now()
    }
  }

  // Tick at 100ms while a stage is actively in flight (so the elapsed
  // counter updates). Pause when idle / done / error — no ticking
  // needed.
  useEffect(() => {
    if (
      stage.kind === "idle" ||
      stage.kind === "done" ||
      stage.kind === "error"
    ) {
      return
    }
    const interval = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [stage.kind])

  // Auto-dismiss 300ms after `done`.
  useEffect(() => {
    if (stage.kind !== "done") return
    const timer = setTimeout(onAutoDismiss, AUTO_DISMISS_DELAY_MS)
    return () => clearTimeout(timer)
  }, [stage.kind, onAutoDismiss])

  const open = stage.kind !== "idle"
  if (!open) return null

  const isError = stage.kind === "error"

  function elapsedMs(name: StageName): number | null {
    const start = startsRef.current[name]
    if (start === undefined) return null
    const end = endsRef.current[name]
    return (end ?? now) - start
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="max-w-[460px]">
        <DialogTitle className="text-[16px] font-semibold text-(--text-primary)">
          {HEADER}
        </DialogTitle>

        <DialogDescription className="sr-only">
          Three-stage progress: uploading the boundary file, creating the
          project, then reading boundaries.
        </DialogDescription>

        <ul className="mt-[16px] flex flex-col gap-[4px] list-none p-0 m-0">
          {STAGE_ORDER.map((name) => {
            const status = statusFor(stage, name)
            const label =
              status === "done" ? ROW_LABELS[name].done : ROW_LABELS[name].active
            const ms = elapsedMs(name)
            const elapsed =
              ms !== null && status !== "pending"
                ? `${(ms / 1000).toFixed(1)}s`
                : null
            return (
              <li
                key={name}
                data-status={status}
                className={[
                  "flex items-center justify-between py-[8px] text-[13px]",
                  status === "pending"
                    ? "text-(--text-secondary) opacity-50"
                    : "",
                  status === "active" ? "text-(--text-primary)" : "",
                  status === "done" ? "text-(--text-primary)" : "",
                  status === "error" ? "text-(--error-default)" : "",
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-[8px]">
                  <StatusIcon status={status} />
                  <span>{label}</span>
                </span>
                {elapsed !== null && (
                  <span className="text-[12px] text-(--text-tertiary) tabular-nums">
                    {elapsed}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {isError && (
          <p className="mt-[12px] text-[12px] text-(--error-default)">
            {errorMessageFor(stage)}
          </p>
        )}

        <div className="mt-[16px] flex items-center justify-end gap-[8px]">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onCancel}
          >
            Cancel
          </Button>
          {isError && (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={onTryAgain}
            >
              Try again
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
