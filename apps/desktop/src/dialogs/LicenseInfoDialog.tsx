/**
 * LicenseInfoDialog — read-only modal showing current account + plans.
 *
 * Populated from the current entitlements (no network call). Offers:
 *   - Change Key: swaps to a new key via LicenseKeyDialog in "change" mode.
 *   - Clear License: removes the keyring entry; caller triggers app reload.
 *   - Close: dismisses.
 */
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Separator,
} from "@solarlayout/ui"
import type { Entitlements } from "@solarlayout/entitlements-client"

export interface LicenseInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entitlements: Entitlements
  onChangeKey: () => void
  onClearLicense: () => void
}

export function LicenseInfoDialog({
  open,
  onOpenChange,
  entitlements,
  onChangeKey,
  onClearLicense,
}: LicenseInfoDialogProps) {
  const { user, plans, remainingCalculations, totalCalculations } = entitlements
  const usedPct =
    totalCalculations > 0
      ? Math.round(((totalCalculations - remainingCalculations) / totalCalculations) * 100)
      : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogTitle className="text-[16px] font-semibold text-[var(--text-primary)]">
          Account &amp; license
        </DialogTitle>
        <DialogDescription className="sr-only">
          Your current account, active plans, and calculation quota.
        </DialogDescription>

        {/* Account */}
        <section className="mt-[16px] flex flex-col gap-[4px]">
          <h3 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-muted)] font-medium">
            Account
          </h3>
          <div className="flex flex-col gap-[2px]">
            <div className="text-[14px] text-[var(--text-primary)] font-medium">
              {user.name ?? "—"}
            </div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {user.email ?? "—"}
            </div>
          </div>
        </section>

        <Separator className="my-[16px]" />

        {/* Quota aggregate */}
        <section className="flex flex-col gap-[8px]">
          <h3 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-muted)] font-medium">
            Calculations
          </h3>
          <div className="flex items-baseline justify-between">
            <div className="text-[20px] font-semibold text-[var(--text-primary)] tabular-nums">
              {remainingCalculations.toLocaleString()}{" "}
              <span className="text-[13px] font-normal text-[var(--text-muted)]">
                of {totalCalculations.toLocaleString()} remaining
              </span>
            </div>
          </div>
          <div
            className="h-[6px] w-full rounded-[var(--radius-sm)] bg-[var(--surface-muted)] overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={usedPct}
          >
            <div
              className="h-full bg-[var(--accent-default)]"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </section>

        <Separator className="my-[16px]" />

        {/* Plans */}
        <section className="flex flex-col gap-[10px]">
          <h3 className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-muted)] font-medium">
            Plans
          </h3>
          {plans.length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">
              No active plans.
            </p>
          ) : (
            plans.map((plan, idx) => (
              <article
                key={`${plan.planName}-${idx}`}
                className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-[12px] py-[10px] flex flex-col gap-[6px]"
              >
                <div className="flex items-baseline justify-between gap-[8px]">
                  <span className="text-[14px] font-medium text-[var(--text-primary)]">
                    {plan.planName}
                  </span>
                  <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                    {plan.remainingCalculations}/{plan.totalCalculations}
                  </span>
                </div>
                {plan.features.length > 0 && (
                  <div className="flex flex-wrap gap-[4px]">
                    {plan.features.map((f) => (
                      <span
                        key={f}
                        className="text-[11px] px-[6px] py-[1px] rounded-[var(--radius-sm)] bg-[var(--surface-muted)] text-[var(--text-secondary)]"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </section>

        <div className="flex items-center justify-between gap-[8px] mt-[20px]">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClearLicense}
          >
            Clear license
          </Button>
          <div className="flex items-center gap-[8px]">
            <Button
              type="button"
              variant="subtle"
              size="md"
              onClick={onChangeKey}
            >
              Change key
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
