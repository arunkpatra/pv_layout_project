"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { MoreHorizontal, Ban, Pencil } from "lucide-react"
import {
  useAdminCustomer,
  useUpdateEntitlementStatus,
  useUpdateEntitlementUsed,
} from "@/lib/hooks/use-admin-customers"
import { useCustomerTransactions } from "@/lib/hooks/use-admin-transactions"
import type { EntitlementDetail } from "@/lib/api"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@solarlayout/ui/components/dialog"
import { Input } from "@solarlayout/ui/components/input"
import { Label } from "@solarlayout/ui/components/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@solarlayout/ui/components/dropdown-menu"

function formatCurrency(usd: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(usd)
}

function formatUsdCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  })
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
  const { mutate: mutateStatus, isPending: statusPending } =
    useUpdateEntitlementStatus()
  const { mutate: mutateUsed, isPending: usedPending } =
    useUpdateEntitlementUsed()

  const [editOpen, setEditOpen] = useState(false)
  const [usedValue, setUsedValue] = useState(
    String(entitlement.usedCalculations),
  )
  const [editError, setEditError] = useState<string | null>(null)

  const isActive = entitlement.state === "ACTIVE"

  function openEdit() {
    setUsedValue(String(entitlement.usedCalculations))
    setEditError(null)
    setEditOpen(true)
  }

  function handleSaveUsed() {
    const parsed = parseInt(usedValue, 10)
    if (isNaN(parsed) || parsed < 0) {
      setEditError("Enter a valid number (0 or above).")
      return
    }
    setEditError(null)
    mutateUsed(
      {
        entitlementId: entitlement.id,
        usedCalculations: parsed,
        customerId,
      },
      {
        onSuccess: () => {
          setEditOpen(false)
          router.refresh()
        },
        onError: (err) => setEditError(err.message),
      },
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={openEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Plan
          </DropdownMenuItem>
          {entitlement.state !== "EXHAUSTED" && (
            <DropdownMenuItem
              disabled={statusPending}
              onClick={() =>
                mutateStatus(
                  {
                    entitlementId: entitlement.id,
                    status: isActive ? "INACTIVE" : "ACTIVE",
                    customerId,
                  },
                  { onSuccess: () => router.refresh() },
                )
              }
              className={
                isActive
                  ? "text-destructive focus:text-destructive"
                  : ""
              }
            >
              <Ban className="mr-2 h-4 w-4" />
              {isActive ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Plan — {entitlement.productName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total calculations</span>
              <span className="font-semibold">
                {entitlement.totalCalculations}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="used-calcs">Used calculations</Label>
              <Input
                id="used-calcs"
                type="number"
                min={0}
                max={entitlement.totalCalculations}
                value={usedValue}
                onChange={(e) => setUsedValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveUsed()
                }}
              />
              <p className="text-xs text-muted-foreground">
                Remaining will be{" "}
                {Math.max(
                  0,
                  entitlement.totalCalculations -
                    (parseInt(usedValue, 10) || 0),
                )}
              </p>
            </div>
            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveUsed}
                disabled={usedPending}
              >
                {usedPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
  const { data: transactions } = useCustomerTransactions(customerId, 10)

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

      {/* Transactions section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Transactions (most recent 10)
          </h2>
          <Link
            href={`/transactions?email=${encodeURIComponent(data.email)}`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            View all
          </Link>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {!transactions || transactions.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No transactions yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(t.purchasedAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {t.productSlug}
                    </TableCell>
                    <TableCell>
                      {formatUsdCents(t.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.source === "STRIPE"
                            ? "default"
                            : t.source === "MANUAL"
                              ? "secondary"
                              : "outline"
                        }
                        className="text-xs"
                      >
                        {t.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.paymentMethod ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
