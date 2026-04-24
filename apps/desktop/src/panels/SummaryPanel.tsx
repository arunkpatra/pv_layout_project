/**
 * SummaryPanel — Layout-tab counts shown after a successful Generate.
 *
 * Subscribes to `useLayoutResultStore` via narrow selectors. Renders a
 * SkeletonGrid while the layout mutation is in flight; renders an
 * informational placeholder if no result is loaded yet.
 *
 * Aggregates across all boundaries when the KMZ has multiple plants.
 */
import {
  InspectorSection,
  PropertyRow,
  StatGrid,
  SummaryStat,
} from "@solarlayout/ui"
import type { LayoutResult } from "@solarlayout/sidecar-client"
import { useLayoutResultStore } from "../state/layoutResult"

interface SummaryPanelProps {
  /** True while the layout mutation is in flight — show skeletons. */
  generating: boolean
}

export function SummaryPanel({ generating }: SummaryPanelProps) {
  const result = useLayoutResultStore((s) => s.result)

  if (generating) {
    return (
      <InspectorSection title="Layout summary">
        <StatGrid>
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </StatGrid>
        <div className="mt-[14px] flex flex-col gap-[6px]">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </InspectorSection>
    )
  }

  if (!result || result.length === 0) {
    return (
      <InspectorSection title="Layout summary">
        <p className="text-[12px] text-[var(--text-muted)] leading-normal">
          Configure parameters above and click Generate to place tables and
          ICRs and see counts here.
        </p>
      </InspectorSection>
    )
  }

  const agg = aggregate(result)

  return (
    <InspectorSection title="Layout summary">
      <StatGrid>
        <SummaryStat label="MWp" value={agg.totalMwp.toFixed(2)} />
        <SummaryStat label="Tables" value={agg.totalTables.toLocaleString()} />
        <SummaryStat label="ICRs" value={agg.totalIcrs.toLocaleString()} />
      </StatGrid>
      <div className="mt-[16px]">
        <PropertyRow
          label="Plant area"
          value={agg.totalAreaAcres.toFixed(2)}
          unit="acres"
        />
        <PropertyRow
          label="Used area"
          value={agg.totalUsedAreaAcres.toFixed(2)}
          unit="acres"
        />
        <PropertyRow
          label="Packing density"
          value={(agg.packingDensity * 100).toFixed(1)}
          unit="%"
        />
        <PropertyRow
          label="Row pitch"
          value={agg.rowPitchM.toFixed(2)}
          unit="m"
        />
        <PropertyRow
          label="Tilt angle"
          value={agg.tiltAngleDeg.toFixed(1)}
          unit="°"
        />
      </div>
    </InspectorSection>
  )
}

function aggregate(results: LayoutResult[]) {
  // Sum counts and area across all boundaries; report the first
  // boundary's row pitch and tilt (the layout engine derives these
  // from latitude — they're constant across boundaries within a plant).
  let totalMwp = 0
  let totalTables = 0
  let totalIcrs = 0
  let totalAreaM2 = 0
  let totalUsedAreaM2 = 0
  for (const r of results) {
    totalMwp += r.total_capacity_mwp
    totalTables += r.placed_tables.length
    totalIcrs += r.placed_icrs.length
    totalAreaM2 += r.total_area_m2
    totalUsedAreaM2 += r.net_layout_area_m2
  }
  const ACRES_PER_M2 = 0.000247105
  return {
    totalMwp,
    totalTables,
    totalIcrs,
    totalAreaAcres: totalAreaM2 * ACRES_PER_M2,
    totalUsedAreaAcres: totalUsedAreaM2 * ACRES_PER_M2,
    packingDensity:
      totalAreaM2 > 0 ? totalUsedAreaM2 / totalAreaM2 : 0,
    rowPitchM: results[0]?.row_pitch_m ?? 0,
    tiltAngleDeg: results[0]?.tilt_angle_deg ?? 0,
  }
}

function SkeletonStat() {
  return (
    <div className="flex flex-col gap-[4px]">
      <span
        aria-hidden
        className="block h-[10px] w-[40%] rounded-[var(--radius-sm)] bg-[var(--surface-muted)]"
      />
      <span
        aria-hidden
        className="block h-[16px] w-[70%] rounded-[var(--radius-sm)] bg-[var(--surface-muted)]"
      />
    </div>
  )
}

function SkeletonRow() {
  return (
    <span
      aria-hidden
      className="block h-[12px] w-full rounded-[var(--radius-sm)] bg-[var(--surface-muted)]"
    />
  )
}
