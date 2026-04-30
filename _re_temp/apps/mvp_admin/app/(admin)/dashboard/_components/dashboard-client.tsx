"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import {
  useAdminDashboardSummary,
  useAdminDashboardTrends,
} from "@/lib/hooks/use-admin-dashboard"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"

const RevenueTrendChart = dynamic(
  () =>
    import("./revenue-trend-chart").then((m) => m.RevenueTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
)

const CustomerTrendChart = dynamic(
  () =>
    import("./customer-trend-chart").then((m) => m.CustomerTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
)

const PurchaseTrendChart = dynamic(
  () =>
    import("./purchase-trend-chart").then((m) => m.PurchaseTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
)

const CalculationTrendChart = dynamic(
  () =>
    import("./calculation-trend-chart").then((m) => m.CalculationTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
)

function formatCurrency(usd: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(usd)
}

export function DashboardClient({
  granularity,
}: {
  granularity: "daily" | "weekly" | "monthly"
}) {
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useAdminDashboardSummary()
  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
  } = useAdminDashboardTrends(granularity)

  return (
    <div className="space-y-6">
      {/* Summary stat cards */}
      {summaryError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {summaryError.message}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            {summaryLoading ? (
              <Skeleton className="mt-1 h-8 w-24" />
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold">
                  {formatCurrency((summary?.totalRevenue ?? 0) / 100)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Stripe {formatCurrency((summary?.totalRevenueStripe ?? 0) / 100)}{" "}
                  · Manual{" "}
                  {formatCurrency((summary?.totalRevenueManual ?? 0) / 100)}
                </p>
              </>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Customers</p>
            {summaryLoading ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-semibold">
                {summary?.totalCustomers ?? 0}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Purchases</p>
            {summaryLoading ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold">
                  {summary?.totalPurchases ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Stripe {summary?.totalPurchasesStripe ?? 0} · Manual{" "}
                  {summary?.totalPurchasesManual ?? 0}
                </p>
              </>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Calculations</p>
            {summaryLoading ? (
              <Skeleton className="mt-1 h-8 w-16" />
            ) : (
              <p className="mt-1 text-2xl font-semibold">
                {summary?.totalCalculations ?? 0}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Granularity toggle */}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={granularity === "daily" ? "default" : "outline"}
          asChild
        >
          <Link href="/dashboard?granularity=daily">Daily</Link>
        </Button>
        <Button
          size="sm"
          variant={granularity === "weekly" ? "default" : "outline"}
          asChild
        >
          <Link href="/dashboard?granularity=weekly">Weekly</Link>
        </Button>
        <Button
          size="sm"
          variant={granularity === "monthly" ? "default" : "outline"}
          asChild
        >
          <Link href="/dashboard?granularity=monthly">Monthly</Link>
        </Button>
      </div>

      {/* Trend charts */}
      {trendsError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {trendsError.message}
        </div>
      ) : trendsLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-6 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-48 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-6 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Revenue over time
            </h2>
            <RevenueTrendChart data={trends ?? []} />
          </div>
          <div className="rounded-lg border border-border bg-card p-6 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              New customers per period
            </h2>
            <CustomerTrendChart data={trends ?? []} />
          </div>
          <div className="rounded-lg border border-border bg-card p-6 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Purchases per period
            </h2>
            <PurchaseTrendChart data={trends ?? []} />
          </div>
          <div className="rounded-lg border border-border bg-card p-6 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Calculations per period
            </h2>
            <CalculationTrendChart data={trends ?? []} />
          </div>
        </div>
      )}
    </div>
  )
}
