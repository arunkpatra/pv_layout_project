"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import {
  useAdminProduct,
  useAdminProductSales,
} from "@/lib/hooks/use-admin-products"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"

const SalesChart = dynamic(
  () => import("./sales-chart").then((m) => m.SalesChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
)

function formatCurrency(usd: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(usd)
}

export function ProductDetailClient({
  slug,
  granularity,
}: {
  slug: string
  granularity: "daily" | "weekly" | "monthly"
}) {
  const {
    data: product,
    isLoading: productLoading,
    error: productError,
  } = useAdminProduct(slug)
  const { data: sales, isLoading: salesLoading } = useAdminProductSales(
    slug,
    granularity,
  )

  if (productLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (productError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {productError.message}
      </div>
    )
  }

  if (!product) return null

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/plans"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Plans
      </Link>

      {/* Summary card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {product.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {product.isFree
                ? "Free"
                : formatCurrency(product.priceAmount / 100)}{" "}
              · {product.calculations} calculations per purchase
            </p>
          </div>
          <Badge
            variant={product.active ? "default" : "outline"}
            className="text-xs"
          >
            {product.active ? "ACTIVE" : "INACTIVE"}
          </Badge>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="mt-1 text-xl font-semibold">
              {formatCurrency(product.totalRevenueUsd)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Total Purchases</p>
            <p className="mt-1 text-xl font-semibold">{product.purchaseCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Active Entitlements</p>
            <p className="mt-1 text-xl font-semibold">
              {product.activeEntitlementCount}
            </p>
          </div>
        </div>
      </div>

      {/* Sales chart */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Sales</h2>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={granularity === "daily" ? "default" : "outline"}
              asChild
            >
              <Link href={`/plans/${slug}?granularity=daily`}>Daily</Link>
            </Button>
            <Button
              size="sm"
              variant={granularity === "weekly" ? "default" : "outline"}
              asChild
            >
              <Link href={`/plans/${slug}?granularity=weekly`}>Weekly</Link>
            </Button>
            <Button
              size="sm"
              variant={granularity === "monthly" ? "default" : "outline"}
              asChild
            >
              <Link href={`/plans/${slug}?granularity=monthly`}>
                Monthly
              </Link>
            </Button>
          </div>
        </div>

        {salesLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <SalesChart data={sales?.data ?? []} />
        )}
      </div>
    </div>
  )
}
