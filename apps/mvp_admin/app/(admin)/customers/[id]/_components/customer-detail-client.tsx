"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { MoreHorizontal, Ban, Pencil } from "lucide-react"
import {
  useAdminCustomer,
  useUpdateEntitlementStatus,
} from "@/lib/hooks/use-admin-customers"
import type { EntitlementDetail } from "@/lib/api"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renewable-energy/ui/components/dropdown-menu"

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

function StateBadge({ state }: { state: EntitlementDetail["state"] }) {
  if (state === "ACTIVE")
    return (
      <Badge className="text-xs bg-green-100 text-green-800 border-green-200">
        ACTIVE
      </Badge>
    )
  if (state === "EXHAUSTED")
    return (
      <Badge variant="secondary" className="text-xs">
        EXHAUSTED
      </Badge>
    )
  return (
    <Badge variant="destructive" className="text-xs">
      DEACTIVATED
    </Badge>
  )
}

function EntitlementActions({
  entitlement,
  customerId,
}: {
  entitlement: EntitlementDetail
  customerId: string
}) {
  const router = useRouter()
  const { mutate, isPending } = useUpdateEntitlementStatus()

  const isActive = entitlement.state === "ACTIVE"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled>
          <Pencil className="mr-2 h-4 w-4" />
          Edit Plan
        </DropdownMenuItem>
        {entitlement.state !== "EXHAUSTED" && (
          <DropdownMenuItem
            disabled={isPending}
            onClick={() =>
              mutate(
                {
                  entitlementId: entitlement.id,
                  status: isActive ? "INACTIVE" : "ACTIVE",
                  customerId,
                },
                { onSuccess: () => router.refresh() },
              )
            }
            className={isActive ? "text-destructive focus:text-destructive" : ""}
          >
            <Ban className="mr-2 h-4 w-4" />
            {isActive ? "Deactivate" : "Reactivate"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function CustomerDetailClient({
  customerId,
  filter,
}: {
  customerId: string
  filter: "active" | "all"
}) {
  const { data, isLoading, error } = useAdminCustomer(customerId, filter)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
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

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/customers"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Customers
      </Link>

      {/* Header card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {data.name ?? data.email}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{data.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Joined {formatDate(data.createdAt)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge
              variant={data.status === "ACTIVE" ? "default" : "outline"}
              className="text-xs"
            >
              {data.status}
            </Badge>
            <p className="text-sm font-medium">
              {formatCurrency(data.totalSpendUsd)} total spend
            </p>
          </div>
        </div>
      </div>

      {/* Entitlements section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Plans
          </h2>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={filter === "active" ? "default" : "outline"}
              asChild
            >
              <Link href={`/customers/${customerId}?filter=active`}>Active</Link>
            </Button>
            <Button
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              asChild
            >
              <Link href={`/customers/${customerId}?filter=all`}>All</Link>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {data.entitlements.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No entitlements found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entitlements.map((ent) => (
                  <TableRow key={ent.id}>
                    <TableCell className="font-medium">
                      {ent.productName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(ent.purchasedAt)}
                    </TableCell>
                    <TableCell>{ent.totalCalculations}</TableCell>
                    <TableCell>{ent.usedCalculations}</TableCell>
                    <TableCell>{ent.remainingCalculations}</TableCell>
                    <TableCell>
                      <StateBadge state={ent.state} />
                    </TableCell>
                    <TableCell>
                      <EntitlementActions
                        entitlement={ent}
                        customerId={customerId}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
