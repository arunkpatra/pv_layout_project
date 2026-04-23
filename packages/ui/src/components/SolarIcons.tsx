import type { SVGAttributes } from "react"
import { cn } from "../lib/cn"

/**
 * Solar-specific custom icon set — stubs, to be refined in S13.6 (Branding)
 * alongside the real brand mark.
 *
 * All icons follow the same discipline as Lucide:
 *   - 24x24 viewBox
 *   - 2px stroke, round caps + joins
 *   - fill: none by default, color via currentColor
 *   - sized via parent (.w-[16px] or .icon-16 utilities)
 *
 * The inventory matches docs/DESIGN_FOUNDATIONS.md §9.
 */

type IconProps = SVGAttributes<SVGSVGElement>

function Base({ className, ...props }: IconProps) {
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
    />
  )
}

/** Single PV module — rectangle split into 6 cells. */
export function ModuleIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M9 5v14M15 5v14M3 12h18" />
    </Base>
  )
}

/** Module table — stack of modules on a frame, landscape orientation. */
export function TableIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="6" width="18" height="10" rx="1" />
      <path d="M7 16v2M17 16v2M3 11h18" />
    </Base>
  )
}

/** Tracker — table + horizontal axis line + pivot. */
export function TrackerIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="7" width="16" height="9" rx="1" />
      <path d="M2 12h20" />
      <circle cx="12" cy="12" r="1.2" />
    </Base>
  )
}

/** ICR building — house silhouette with power bolt. */
export function IcrIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 10 12 4l8 6v10H4Z" />
      <path d="M13 11h-3l1.5 4H13l-1 3 2-4h-1.5Z" />
    </Base>
  )
}

/** String inverter — rectangle with three connector teeth. */
export function StringInverterIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="6" width="16" height="12" rx="1.5" />
      <path d="M9 18v2M12 18v2M15 18v2" />
      <path d="M8 11h8M8 14h5" />
    </Base>
  )
}

/** Lightning arrester — bolt within dashed circle (coverage radius). */
export function LightningArresterIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
      <path d="M13 5h-3l1.5 5h-1.5l3 4.5V11h1.5Z" />
    </Base>
  )
}

/** DC cable — two connectors joined by a straight line. */
export function CableDcIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="10" width="4" height="4" rx="0.5" />
      <rect x="17" y="10" width="4" height="4" rx="0.5" />
      <path d="M7 12h10" />
      <path d="M5 8v2M5 14v2" />
    </Base>
  )
}

/** AC cable — two connectors joined by a wavy line. */
export function CableAcIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="10" width="4" height="4" rx="0.5" />
      <rect x="17" y="10" width="4" height="4" rx="0.5" />
      <path d="M7 12c1.5-2 3 2 5 0s3.5-2 5 0" />
    </Base>
  )
}
