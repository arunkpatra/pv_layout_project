"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@renewable-energy/ui/components/alert"
import { Button } from "@renewable-energy/ui/components/button"
import { VersionStatusBadge } from "./version-status-badge"
import { useVersion } from "@/hooks/use-version"
import type { VersionDetail as VersionDetailType } from "@renewable-energy/shared"

// Local type for layout stats — shared type uses `unknown` intentionally
interface LayoutStats {
  total_tables: number
  total_modules: number
  total_capacity_mwp: number
  total_area_acres: number
  num_icrs: number
  num_string_inverters: number
  total_dc_cable_m: number
  total_ac_cable_m: number
  num_las: number
}

const METRIC_LABELS: {
  key: keyof LayoutStats
  label: string
  unit: string
}[] = [
  { key: "total_capacity_mwp", label: "Capacity", unit: "MWp" },
  { key: "total_modules", label: "Modules", unit: "" },
  { key: "total_tables", label: "Tables", unit: "" },
  { key: "total_area_acres", label: "Area", unit: "acres" },
  { key: "num_string_inverters", label: "String inverters", unit: "" },
  { key: "num_icrs", label: "ICRs", unit: "" },
  { key: "num_las", label: "Lightning arresters", unit: "" },
  { key: "total_dc_cable_m", label: "DC cable", unit: "m" },
  { key: "total_ac_cable_m", label: "AC cable", unit: "m" },
]

function calcElapsed(since: string): string {
  const secs = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / 1000),
  )
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function useElapsed(since: string): string {
  const [elapsed, setElapsed] = React.useState(() => calcElapsed(since))
  React.useEffect(() => {
    const id = setInterval(() => setElapsed(calcElapsed(since)), 1000)
    return () => clearInterval(id)
  }, [since])
  return elapsed
}

function ActiveState({ version }: { version: VersionDetailType }) {
  const elapsed = useElapsed(version.createdAt)
  const message =
    version.status === "QUEUED"
      ? "Your run is queued…"
      : "Calculating layout…"
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <VersionStatusBadge status={version.status} />
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">{elapsed}</p>
    </div>
  )
}

function FailedState({
  version,
  projectId,
}: {
  version: VersionDetailType
  projectId: string
}) {
  const errorMessage =
    version.layoutJob?.errorDetail ??
    version.energyJob?.errorDetail ??
    "An unexpected error occurred"
  return (
    <div className="flex flex-col gap-4">
      <VersionStatusBadge status="FAILED" />
      <Alert variant="destructive">
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
      <Button asChild variant="outline" className="self-start">
        <Link href={`/dashboard/projects/${projectId}/new-version`}>
          Start new run
        </Link>
      </Button>
    </div>
  )
}

function CompleteState({ version }: { version: VersionDetailType }) {
  const stats = version.layoutJob?.statsJson as LayoutStats | null
  return (
    <div className="flex flex-col gap-6">
      <VersionStatusBadge status="COMPLETE" />
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {METRIC_LABELS.map(({ key, label, unit }) => (
            <div key={key} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold">
                {stats[key]}
                {unit ? ` ${unit}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function VersionDetail({
  projectId,
  versionId,
}: {
  projectId: string
  versionId: string
}) {
  const { data: version, isLoading, isError } = useVersion(projectId, versionId)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (isError || !version) {
    return (
      <p className="text-sm text-destructive">Failed to load run details.</p>
    )
  }
  if (version.status === "QUEUED" || version.status === "PROCESSING") {
    return <ActiveState version={version} />
  }
  if (version.status === "FAILED") {
    return <FailedState version={version} projectId={projectId} />
  }
  return <CompleteState version={version} />
}
