"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  useAdminProducts,
  useAdminProductsSummary,
} from "@/lib/hooks/use-admin-products"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renewable-energy/ui/components/table"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"

function formatCurrency(usd: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(usd)
}

export function ProductsPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))

  const { data, isLoading, error } = useAdminProducts({ page, pageSize: 20 })
  const { data: summary } = useAdminProductsSummary()

  const totalRevenue = summary?.totalRevenueUsd ?? 0
  const totalPurchases = summary?.totalPurchases ?? 0
  const totalActiveEntitlements = summary?.activeEntitlements ?? 0

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Purchases</p>
          <p className="mt-1 text-2xl font-semibold">{totalPurchases}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Active Entitlements</p>
          <p className="mt-1 text-2xl font-semibold">{totalActiveEntitlements}</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {!data || data.data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No plans found.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Total Revenue</TableHead>
                <TableHead>Purchases</TableHead>
                <TableHead>Active Entitlements</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((product) => (
                <TableRow
                  key={product.slug}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/plans/${product.slug}`)}
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.slug}
                    </p>
                  </TableCell>
                  <TableCell>
                    {product.isFree
                      ? "Free"
                      : formatCurrency(product.priceAmount / 100)}
                  </TableCell>
                  <TableCell>{formatCurrency(product.totalRevenueUsd)}</TableCell>
                  <TableCell>{product.purchaseCount}</TableCell>
                  <TableCell>{product.activeEntitlementCount}</TableCell>
                  <TableCell>
                    <Badge
                      variant={product.active ? "default" : "outline"}
                      className="text-xs"
                    >
                      {product.active ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.pagination.page} of {data.pagination.totalPages} —{" "}
            {data.pagination.total} total
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => router.push(`/plans?page=${page - 1}`)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.pagination.totalPages}
              onClick={() => router.push(`/plans?page=${page + 1}`)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
