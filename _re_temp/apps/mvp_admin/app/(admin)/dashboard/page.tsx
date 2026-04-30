import type { Metadata } from "next"
import { DashboardClient } from "./_components/dashboard-client"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ granularity?: string }>
}) {
  const { granularity: rawGranularity } = await searchParams
  const granularity =
    rawGranularity === "daily" || rawGranularity === "weekly"
      ? rawGranularity
      : "monthly"

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview metrics for SolarLayout.
        </p>
      </div>
      <DashboardClient granularity={granularity} />
    </div>
  )
}
