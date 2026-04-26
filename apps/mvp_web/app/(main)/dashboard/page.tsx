"use client"

import { useState } from "react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { Copy, Download } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renewable-energy/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renewable-energy/ui/components/tooltip"
import {
  useEntitlements,
  useUserUsage,
} from "@/components/hooks/use-billing"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export default function DashboardPage() {
  const { getToken } = useAuth()
  const [copied, setCopied] = useState(false)

  const {
    data: entData,
    isLoading: entLoading,
    isError: entError,
  } = useEntitlements()

  const {
    data: usageData,
    isLoading: usageLoading,
    isError: usageError,
  } = useUserUsage(1, 5)

  const activeEntitlements = entData?.entitlements.filter(
    (e) => e.state === "ACTIVE",
  ) ?? []

  const remainingCalculations = activeEntitlements.reduce(
    (sum, e) => sum + e.remainingCalculations,
    0,
  )

  const activeCount = activeEntitlements.length

  const licenseKey = entData?.licenseKey ?? null
  const maskedKey = licenseKey ? `${licenseKey.slice(0, 8)}...` : null

  const firstActiveSlug = activeEntitlements[0]?.product ?? null

  async function handleCopyKey() {
    if (!licenseKey) return
    try {
      if (!navigator.clipboard) return
      await navigator.clipboard.writeText(licenseKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable or permission denied — silently ignore
    }
  }

  async function handleDownload(productSlug: string) {
    try {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/dashboard/download/${productSlug}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        console.error("Download failed:", res.status)
        return
      }
      const { data } = (await res.json()) as { data: { url: string } }
      window.open(data.url, "_blank")
    } catch (err) {
      console.error("Download error:", err)
    }
  }

  const usageRecords = usageData?.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">
          Overview of your SolarLayout account.
        </p>
      </div>

      {/* Row 1 — Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Remaining Calculations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Remaining Calculations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : entError ? (
              <span className="text-2xl font-bold text-foreground">—</span>
            ) : (
              <span
                data-testid="remaining-calculations-value"
                className="text-4xl font-bold text-foreground"
              >
                {remainingCalculations}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Active Entitlements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Entitlements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : entError ? (
              <span className="text-2xl font-bold text-foreground">—</span>
            ) : (
              <span
                data-testid="active-entitlements-value"
                className="text-4xl font-bold text-foreground"
              >
                {activeCount}
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — License key + Download */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* License Key */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your License Key
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : maskedKey ? (
              <div className="flex items-center gap-3">
                <span className="font-mono text-base text-foreground">
                  {maskedKey}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyKey}
                  className="gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Purchase a plan to get your license key.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Download */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Download SolarLayout
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entLoading ? (
              <Skeleton className="h-9 w-32" />
            ) : firstActiveSlug ? (
              <Button
                onClick={() => handleDownload(firstActiveSlug)}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <Button disabled className="gap-2">
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Purchase a plan to download.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Activity
            </CardTitle>
            <Link
              href="/dashboard/usage"
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              View all →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : usageError ? (
            <p className="text-sm text-destructive">
              Failed to load recent activity.
            </p>
          ) : usageRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No calculations run yet. Download the app to get started.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageRecords.map((record) => (
                    <TableRow key={`${record.featureKey}-${record.createdAt}`}>
                      <TableCell className="font-mono text-xs">
                        {record.featureKey}
                      </TableCell>
                      <TableCell>{record.productName}</TableCell>
                      <TableCell>
                        {new Date(record.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
