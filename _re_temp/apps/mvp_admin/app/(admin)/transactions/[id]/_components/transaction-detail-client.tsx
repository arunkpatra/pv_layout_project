"use client"

import Link from "next/link"
import { Badge } from "@renewable-energy/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { useAdminTransaction } from "@/lib/hooks/use-admin-transactions"
import type { TransactionSource } from "@/lib/api"

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

export function TransactionDetailClient({ id }: { id: string }) {
  const { data, isLoading, isError } = useAdminTransaction(id)

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return <div className="p-6 text-destructive">Transaction not found.</div>
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{formatUsdCents(data.amount)}</h1>
        <Badge variant={sourceBadgeVariant(data.source)}>
          {sourceLabel(data.source)}
        </Badge>
        <Badge variant="secondary">{data.status}</Badge>
        <span className="text-sm text-muted-foreground">
          {formatDate(data.purchasedAt)}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href={`/customers/${data.userId}`}
            className="hover:underline"
          >
            {data.userEmail}
          </Link>
          {data.userName && (
            <span className="ml-1 text-muted-foreground">
              — {data.userName}
            </span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href={`/plans/${data.productSlug}`}
            className="hover:underline"
          >
            {data.productName} ({data.productSlug})
          </Link>
        </CardContent>
      </Card>

      {data.source === "MANUAL" && (
        <Card>
          <CardHeader>
            <CardTitle>Manual purchase details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <strong>Method:</strong> {data.paymentMethod ?? "—"}
            </div>
            <div>
              <strong>External reference:</strong>{" "}
              {data.externalReference ?? "—"}
            </div>
            <div>
              <strong>Notes:</strong> {data.notes ?? "—"}
            </div>
            <div>
              <strong>Recorded by:</strong> {data.createdByEmail ?? "—"}
            </div>
          </CardContent>
        </Card>
      )}

      {data.source === "STRIPE" && data.checkoutSessionId && (
        <Card>
          <CardHeader>
            <CardTitle>Stripe details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <strong>Checkout session ID:</strong>{" "}
              <code>{data.checkoutSessionId}</code>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
