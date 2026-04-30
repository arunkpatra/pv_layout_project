import { Lock } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../components/Button"

/**
 * LockedSectionCard — affordance shown when a feature is gated by a
 * tier the current user doesn't have. Renders inside the panel where
 * the feature would normally appear (e.g. the Energy Yield tab for
 * non-PRO_PLUS users in S9), making the upgrade path discoverable
 * without hiding the feature's existence.
 *
 * Design: matches EmptyStateCard's tone — small icon, headline, two
 * lines of body, single primary action — but with a lock affordance
 * and an explicit tier name.
 */
export function LockedSectionCard({
  tierName,
  title = "Available in this plan",
  body,
  upgradeLabel = "View plans",
  onUpgrade,
}: {
  /** Plan name shown in the headline, e.g. "PRO_PLUS". */
  tierName: string
  title?: ReactNode
  body?: ReactNode
  upgradeLabel?: string
  onUpgrade?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-[12px] text-center px-[16px] py-[24px]">
      <div className="w-[36px] h-[36px] rounded-[var(--radius-lg)] bg-[var(--accent-muted)] text-[var(--accent-default)] flex items-center justify-center">
        <Lock className="w-[16px] h-[16px]" />
      </div>
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] leading-tight">
        {title}{" "}
        <span className="text-[var(--accent-default)]">{tierName}</span>
      </h3>
      {body && (
        <p className="text-[12px] text-[var(--text-secondary)] leading-normal max-w-[260px]">
          {body}
        </p>
      )}
      {onUpgrade && (
        <Button variant="subtle" size="sm" onClick={onUpgrade} className="mt-[4px]">
          {upgradeLabel}
        </Button>
      )}
    </div>
  )
}
