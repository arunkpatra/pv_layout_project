import { motion } from "framer-motion"
import { SunMark } from "../components/Icon"
import { durations, easings } from "../lib/motion"

/**
 * Splash — the cold-start experience during sidecar boot.
 *
 * Matches docs/design/light/splash.html. Progress rail is indeterminate
 * (animated slide) until the parent transitions to the healthy state.
 *
 * `data-tauri-drag-region` on the root — the Splash shows while the
 * TopBar isn't yet mounted (S7 first-launch dialog, sidecar boot).
 * Without it the user has no draggable surface at all. Interactive
 * descendants (buttons / inputs in any child dialog) are excluded by
 * Tauri's native handler.
 */
export function Splash({ statusText = "Starting engine…" }: { statusText?: string }) {
  return (
    <div
      data-tauri-drag-region
      className="absolute inset-0 flex items-center justify-center bg-[var(--surface-ground)]"
    >
      <div className="flex flex-col items-center gap-[14px]">
        <div className="flex items-center gap-[12px] text-[28px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          <span className="w-[28px] h-[28px] flex items-center justify-center text-[var(--accent-default)]">
            <SunMark />
          </span>
          SolarLayout
        </div>

        <p className="text-[12px] text-[var(--text-muted)]">Solar PV plant layout design</p>

        <div className="mt-[8px] flex flex-col items-center gap-[8px]">
          <div className="relative w-[200px] h-[2px] bg-[var(--border-subtle)] rounded-full overflow-hidden">
            <motion.div
              className="absolute top-0 h-full rounded-full bg-[var(--accent-default)]"
              initial={{ left: "-40%", width: "40%" }}
              animate={{ left: "100%" }}
              transition={{
                duration: 1.2,
                ease: easings.standard as unknown as number[],
                repeat: Infinity,
              }}
            />
          </div>
          <motion.p
            className="text-[11px] text-[var(--text-muted)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base }}
          >
            {statusText}
          </motion.p>
        </div>
      </div>
    </div>
  )
}
