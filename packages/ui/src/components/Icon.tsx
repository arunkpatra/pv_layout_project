import type { SVGAttributes } from "react"
import { cn } from "../lib/cn"

/**
 * Lucide sun — the placeholder brand mark.
 *
 * Exact path copy of the reference logo at
 * reference_screenshots_for_UX_dsktop/reference_logo/logo.svg and of
 * the icon shipped by the Tauri bundle since S5. Drop-in swap in S13.6
 * for the real brand mark.
 */
export function SunMark({ className, ...props }: SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  )
}
