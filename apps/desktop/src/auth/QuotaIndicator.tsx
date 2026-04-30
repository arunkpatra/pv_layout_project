/**
 * QuotaIndicator — P10 persistent banner / chip showing the user's
 * available calcs and projects. Lives in the TopBar's `chip` slot so
 * it's visible across every project view.
 *
 * State mapping (locked with backend 2026-04-30):
 *
 *   licensed=true                               → normal mode
 *      → "{planName} · {remaining}/{total} calcs · {active}/{quota} projects"
 *      → click opens upgrade page (cross-sell: "buy more before you run out")
 *
 *   licensed=false && entitlementsActive=true   → exhausted (out of credits)
 *      → "Out of credits — Buy more"
 *      → click opens upgrade page
 *
 *   licensed=false && entitlementsActive=false  → deactivated
 *      → "Subscription deactivated — Contact support"
 *      → click opens support email
 *
 * Click handler uses `@tauri-apps/plugin-shell`'s `open` (same pattern
 * the LicenseKeyDialog uses for SIGNUP_URL). Outside Tauri we fall
 * back to `window.open` so the design preview stays clickable.
 */
import { type JSX } from "react"
import { Chip } from "@solarlayout/ui-desktop"
import type { EntitlementSummaryV2 } from "@solarlayout/entitlements-client"
import { open as openExternalUrl } from "@tauri-apps/plugin-shell"

const UPGRADE_URL = "https://solarlayout.in/pricing"
const SUPPORT_URL = "mailto:support@solarlayout.in"

const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

type IndicatorState = "normal" | "exhausted" | "deactivated"

function deriveState(ent: EntitlementSummaryV2): IndicatorState {
  if (ent.licensed) return "normal"
  if (ent.entitlementsActive) return "exhausted"
  return "deactivated"
}

export interface QuotaIndicatorProps {
  entitlements: EntitlementSummaryV2
  /** Optional override (tests + future menu surfaces). */
  onClick?: () => void
}

export function QuotaIndicator({
  entitlements,
  onClick,
}: QuotaIndicatorProps): JSX.Element {
  const state = deriveState(entitlements)

  const handleClick = (): void => {
    if (onClick) {
      onClick()
      return
    }
    const target = state === "deactivated" ? SUPPORT_URL : UPGRADE_URL
    if (inTauri()) {
      void openExternalUrl(target).catch((err) => {
        console.error("openExternalUrl failed:", err)
      })
    } else if (typeof window !== "undefined") {
      window.open(target, "_blank", "noopener,noreferrer")
    }
  }

  if (state === "exhausted") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="
          inline-flex items-center gap-[6px]
          px-[8px] py-[2px]
          rounded-[var(--radius-sm)]
          text-[11px] font-medium
          bg-[var(--warning-muted,var(--surface-muted))]
          text-[var(--warning-default,var(--text-primary))]
          border border-[var(--warning-default,var(--border-default))]
          cursor-pointer
          hover:opacity-90
          transition-opacity duration-[120ms]
        "
        aria-label="Out of credits — buy more"
      >
        Out of credits · Buy more
      </button>
    )
  }

  if (state === "deactivated") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="
          inline-flex items-center gap-[6px]
          px-[8px] py-[2px]
          rounded-[var(--radius-sm)]
          text-[11px] font-medium
          bg-[var(--error-muted,var(--surface-muted))]
          text-[var(--error-default,var(--text-primary))]
          border border-[var(--error-default,var(--border-default))]
          cursor-pointer
          hover:opacity-90
          transition-opacity duration-[120ms]
        "
        aria-label="Subscription deactivated — contact support"
      >
        Subscription deactivated · Contact support
      </button>
    )
  }

  // Normal mode — leverages the existing Chip primitive for the plan
  // name; quota numbers go inline as a smaller suffix. The whole thing
  // is a button so click-to-upgrade works.
  const planName = entitlements.plans[0]?.planName ?? "Free"
  const remaining = entitlements.remainingCalculations
  const total = entitlements.totalCalculations
  const projectsActive = entitlements.projectsActive
  const projectQuota = entitlements.projectQuota

  return (
    <button
      type="button"
      onClick={handleClick}
      className="
        inline-flex items-center gap-[6px]
        cursor-pointer
        focus:outline-none
        focus:ring-2 focus:ring-[var(--focus-ring)]
        rounded-[var(--radius-sm)]
      "
      aria-label={`${planName} plan — ${remaining} of ${total} calcs remaining, ${projectsActive} of ${projectQuota} projects active. Click to view plans.`}
    >
      <Chip tone="accent">{planName}</Chip>
      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
        {remaining}/{total} calcs · {projectsActive}/{projectQuota} projects
      </span>
    </button>
  )
}
