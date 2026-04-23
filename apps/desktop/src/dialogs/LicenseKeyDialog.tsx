/**
 * LicenseKeyDialog — modal for entering a SolarLayout license key.
 *
 * Two modes, distinguished by the `mode` prop:
 *
 *   - "first-launch"  — blocking. No close affordance except successful
 *     save. Shown when no key is stored and the app cannot proceed. The
 *     dimmed overlay carries `data-tauri-drag-region` so the native
 *     window can still be dragged by clicking around the dialog —
 *     otherwise the entire top of the window becomes a dead zone.
 *   - "change"        — invoked from the LicenseInfoDialog or Clear-License
 *     menu follow-up. Dismissible via Cancel.
 *
 * Validates the `sl_live_` prefix client-side. Authoritative validation is
 * the API's 401 — a caller that gets a key from `onSubmit` must then call
 * `/entitlements` and treat an error as "bad key".
 */
import { open as openUrl } from "@tauri-apps/plugin-shell"
import { useState, type FormEvent } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from "@solarlayout/ui"
import { isPlausibleLicenseKey } from "@solarlayout/entitlements-client"

const SIGNUP_URL = "https://solarlayout.in/sign-up"

export interface LicenseKeyDialogProps {
  open: boolean
  mode: "first-launch" | "change"
  /** Submitted key (trimmed). Called on valid-format Save. */
  onSubmit: (key: string) => void
  /** Cancel action for `change` mode. Ignored for `first-launch`. */
  onCancel?: () => void
  /** Async-submit state, from the validation query in the parent. */
  submitting?: boolean
  /** Validation error from the parent (usually a 401 message). */
  errorMessage?: string
}

export function LicenseKeyDialog({
  open,
  mode,
  onSubmit,
  onCancel,
  submitting = false,
  errorMessage,
}: LicenseKeyDialogProps) {
  const [value, setValue] = useState("")
  const [formatError, setFormatError] = useState<string | null>(null)

  const blocking = mode === "first-launch"

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!isPlausibleLicenseKey(trimmed)) {
      setFormatError(
        "License keys start with sl_live_. Please check your key and try again."
      )
      return
    }
    setFormatError(null)
    onSubmit(trimmed)
  }

  const openSignup = () => {
    void openUrl(SIGNUP_URL)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!blocking && !next) onCancel?.()
      }}
    >
      <DialogContent
        className="max-w-[460px]"
        onEscapeKeyDown={blocking ? (e) => e.preventDefault() : undefined}
        onInteractOutside={blocking ? (e) => e.preventDefault() : undefined}
        overlayProps={blocking ? { "data-tauri-drag-region": "" } : undefined}
      >
        <DialogTitle className="text-[16px] font-semibold text-[var(--text-primary)]">
          Enter your SolarLayout license key
        </DialogTitle>

        <DialogDescription className="text-[13px] text-[var(--text-secondary)] leading-normal mt-[8px]">
          Your license key unlocks the app. Keys start with{" "}
          <code className="font-mono text-[12px] text-[var(--text-primary)]">
            sl_live_
          </code>{" "}
          and are stored securely in your OS credential store — never on disk.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-[16px] flex flex-col gap-[12px]">
          <div className="flex flex-col gap-[6px]">
            <Label
              htmlFor="license-key-input"
              className="text-[12px] text-[var(--text-secondary)]"
            >
              License key
            </Label>
            <Input
              id="license-key-input"
              type="password"
              placeholder="sl_live_..."
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                if (formatError) setFormatError(null)
              }}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
            />
            {(formatError || errorMessage) && (
              <p className="text-[12px] text-[var(--error-default)]">
                {formatError ?? errorMessage}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={openSignup}
            className="self-start text-[12px] text-[var(--accent-default)] hover:text-[var(--accent-hover)] underline underline-offset-2"
          >
            Don't have a key? Sign up for free →
          </button>

          <div className="flex items-center justify-end gap-[8px] mt-[8px]">
            {!blocking && (
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={submitting || value.trim().length === 0}
            >
              {submitting ? "Verifying…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
