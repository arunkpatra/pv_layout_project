"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useAdminCustomers } from "@/lib/hooks/use-admin-customers"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@solarlayout/ui/components/table"
import { Badge } from "@solarlayout/ui/components/badge"
import { Button } from "@solarlayout/ui/components/button"
import { Skeleton } from "@solarlayout/ui/components/skeleton"

function formatCurrency(usd: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(usd)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function CustomersPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))

  const { data, isLoading, error } = useAdminCustomers({ page, pageSize: 20 })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
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
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {!data || data.data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No customers found.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Total Spend</TableHead>
                <TableHead>Active Entitlements</TableHead>
                <TableHead>Calculations</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/customers/${customer.id}`)}
                >
                  <TableCell className="font-medium text-foreground">
                    {customer.name ?? customer.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(customer.createdAt)}
                  </TableCell>
                  <TableCell>{formatCurrency(customer.totalSpendUsd)}</TableCell>
                  <TableCell>{customer.activeEntitlementCount}</TableCell>
                  <TableCell>{customer.totalCalculations}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        customer.status === "ACTIVE" ? "default" : "outline"
                      }
                      className="text-xs"
                    >
                      {customer.status}
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
              onClick={() => router.push(`/customers?page=${page - 1}`)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.pagination.totalPages}
              onClick={() => router.push(`/customers?page=${page + 1}`)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
