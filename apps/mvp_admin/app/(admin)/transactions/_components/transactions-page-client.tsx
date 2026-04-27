"use client"

import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAdminTransactions } from "@/lib/hooks/use-admin-transactions"
import type { TransactionSource } from "@/lib/api"
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
import { Input } from "@renewable-energy/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renewable-energy/ui/components/select"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"

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

function sourceBadgeVariant(
  source: TransactionSource,
): "default" | "secondary" | "outline" {
  if (source === "STRIPE") return "default"
  if (source === "MANUAL") return "secondary"
  return "outline"
}

function sourceLabel(source: TransactionSource) {
  if (source === "FREE_AUTO") return "Free auto-grant"
  return source.charAt(0) + source.slice(1).toLowerCase()
}

export function TransactionsPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const source =
    (searchParams.get("source") as TransactionSource | "ALL" | null) ?? "ALL"
  const email = searchParams.get("email") ?? ""

  const { data, isLoading, isError, error } = useAdminTransactions(
    { source: source === "ALL" ? "ALL" : source, email: email || undefined },
    page,
    20,
  )

  function buildUrl(overrides: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(overrides)) {
      if (v) {
        next.set(k, v)
      } else {
        next.delete(k)
      }
    }
    return `/transactions?${next.toString()}`
  }

  function handleSourceChange(value: string) {
    router.push(buildUrl({ source: value === "ALL" ? "" : value, page: "1" }))
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = new URLSearchParams(searchParams.toString())
    if (e.target.value) {
      next.set("email", e.target.value)
    } else {
      next.delete("email")
    }
    next.set("page", "1")
    router.push(`/transactions?${next.toString()}`)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-56" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {(error as Error)?.message ?? "Failed to load transactions."}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter row + action button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={source} onValueChange={handleSourceChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All sources</SelectItem>
              <SelectItem value="STRIPE">Stripe</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="FREE_AUTO">Free auto-grant</SelectItem>
            </SelectContent>
          </Select>

          <Input
            className="w-56"
            placeholder="Filter by email"
            defaultValue={email}
            onChange={handleEmailChange}
          />
        </div>

        <Button asChild>
          <Link href="/transactions/new">Record manual purchase</Link>
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {!data || data.transactions.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No transactions found.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Recorded by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.transactions.map((tx) => (
                <TableRow key={tx.id} className="hover:bg-muted/50">
                  <TableCell className="text-muted-foreground">
                    {formatDate(tx.purchasedAt)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/customers/${tx.userId}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {tx.userEmail}
                    </Link>
                    {tx.userName && (
                      <span className="block text-xs text-muted-foreground">
                        {tx.userName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/plans/${tx.productSlug}`}
                      className="text-foreground hover:underline"
                    >
                      {tx.productName}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatUsdCents(tx.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={sourceBadgeVariant(tx.source)}
                      className="text-xs"
                    >
                      {sourceLabel(tx.source)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tx.source === "STRIPE"
                      ? "—"
                      : (tx.paymentMethod ?? "—")}
                  </TableCell>
                  <TableCell
                    className="max-w-[160px] truncate text-muted-foreground"
                    title={tx.externalReference ?? undefined}
                  >
                    {tx.source === "STRIPE"
                      ? "—"
                      : tx.externalReference
                        ? tx.externalReference.length > 40
                          ? tx.externalReference.slice(0, 40) + "…"
                          : tx.externalReference
                        : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tx.source === "STRIPE" ? "—" : (tx.createdByEmail ?? "—")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
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
              onClick={() =>
                router.push(buildUrl({ page: String(page - 1) }))
              }
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.pagination.totalPages}
              onClick={() =>
                router.push(buildUrl({ page: String(page + 1) }))
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
