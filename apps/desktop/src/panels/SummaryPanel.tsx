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
import { FEATURE_KEYS } from "@solarlayout/entitlements-client"
import type { LayoutResult } from "@solarlayout/sidecar-client"
import { useLayoutResultStore } from "../state/layoutResult"
import { useHasFeature } from "../auth/FeatureGate"

interface SummaryPanelProps {
  /** True while the layout mutation is in flight — show skeletons. */
  generating: boolean
}

export function SummaryPanel({ generating }: SummaryPanelProps) {
  const result = useLayoutResultStore((s) => s.result)
  // Gating per ADR-0005:
  //   - DC/AC cable length rows → CABLE_MEASUREMENTS (Pro-tier).
  //   - AC capacity (MW) + DC/AC ratio rows → ENERGY_YIELD (Pro-Plus).
  // Inverter capacity (kWp) is ungated — it's computed as part of
  // plant_layout (Basic-tier) regardless of cable_calc state.
  const hasCableMeasurements = useHasFeature(FEATURE_KEYS.CABLE_MEASUREMENTS)
  const hasEnergyYield = useHasFeature(FEATURE_KEYS.ENERGY_YIELD)

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
      <div className="mt-[14px]">
        <StatGrid>
          <SummaryStat
            label="Modules"
            value={agg.totalModules.toLocaleString()}
          />
          <SummaryStat
            label="Inverters"
            value={agg.totalStringInverters.toLocaleString()}
          />
          <SummaryStat
            label="LAs"
            value={agg.totalLas.toLocaleString()}
          />
        </StatGrid>
      </div>
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
        {agg.totalInverterCapacityKwp > 0 && (
          <PropertyRow
            label="Inverter capacity"
            value={agg.totalInverterCapacityKwp.toFixed(2)}
            unit="kWp"
          />
        )}
        {hasCableMeasurements && agg.totalDcCableM > 0 && (
          <PropertyRow
            label="DC cable length"
            value={formatCableLength(agg.totalDcCableM)}
            unit={agg.totalDcCableM >= 1000 ? "km" : "m"}
          />
        )}
        {hasCableMeasurements && agg.totalAcCableM > 0 && (
          <PropertyRow
            label="AC cable length"
            value={formatCableLength(agg.totalAcCableM)}
            unit={agg.totalAcCableM >= 1000 ? "km" : "m"}
          />
        )}
        {hasEnergyYield && agg.plantAcCapacityMw > 0 && (
          <PropertyRow
            label="AC capacity"
            value={agg.plantAcCapacityMw.toFixed(2)}
            unit="MW"
          />
        )}
        {hasEnergyYield && agg.dcAcRatio > 0 && (
          <PropertyRow
            label="DC/AC ratio"
            value={agg.dcAcRatio.toFixed(2)}
          />
        )}
      </div>
    </InspectorSection>
  )
}

function formatCableLength(m: number): string {
  return m >= 1000 ? (m / 1000).toFixed(2) : m.toFixed(0)
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
  let totalModules = 0
  let totalStringInverters = 0
  let totalLas = 0
  let totalDcCableM = 0
  let totalAcCableM = 0
  let totalInverterCapacityKwp = 0
  let plantAcCapacityMw = 0
  for (const r of results) {
    totalMwp += r.total_capacity_mwp
    totalTables += r.placed_tables.length
    totalIcrs += r.placed_icrs.length
    totalAreaM2 += r.total_area_m2
    totalUsedAreaM2 += r.net_layout_area_m2
    totalModules += r.total_modules
    totalStringInverters += r.num_string_inverters
    totalLas += r.num_las
    totalDcCableM += r.total_dc_cable_m
    totalAcCableM += r.total_ac_cable_m
    totalInverterCapacityKwp += r.inverter_capacity_kwp
    plantAcCapacityMw += r.plant_ac_capacity_mw
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
    totalModules,
    totalStringInverters,
    totalLas,
    totalDcCableM,
    totalAcCableM,
    totalInverterCapacityKwp,
    plantAcCapacityMw,
    // dc_ac_ratio is a plant-level invariant (not additive across boundaries)
    // — we report the first boundary's value the same way we do row pitch.
    dcAcRatio: results[0]?.dc_ac_ratio ?? 0,
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
