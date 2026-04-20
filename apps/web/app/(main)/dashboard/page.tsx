"use client"

import { useBreadcrumbs } from "@/contexts/breadcrumbs-context"
import * as React from "react"

export default function DashboardPage() {
  const { setBreadcrumbs } = useBreadcrumbs()

  React.useEffect(() => {
    setBreadcrumbs([{ label: "Overview" }])
  }, [setBreadcrumbs])

  return (
    <div className="grid auto-rows-min gap-4 md:grid-cols-3">
      <div className="col-span-3 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
        Dashboard overview — stats and quick navigation coming soon.
      </div>
      <div className="aspect-video rounded-xl bg-muted/50" />
      <div className="aspect-video rounded-xl bg-muted/50" />
      <div className="aspect-video rounded-xl bg-muted/50" />
      <div className="col-span-3 min-h-96 rounded-xl bg-muted/50" />
    </div>
  )
}
