"use client"

import { useState } from "react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { Copy, Download, Eye, EyeOff } from "lucide-react"
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
  const [keyRevealed, setKeyRevealed] = useState(false)

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

  const calculationsPerformed = usageData?.pagination.total ?? 0

  const licenseKey = entData?.licenseKey ?? null
  const maskedKey = licenseKey
    ? `${licenseKey.slice(0, 8)}${"⦁".repeat(12)}`
    : null

  const hasActiveEntitlement = activeEntitlements.length > 0

  // Determine the highest tier plan
  const TIER_ORDER = ["pv-layout-pro-plus", "pv-layout-pro", "pv-layout-basic"]
  const highestTierSlug = TIER_ORDER.find((slug) =>
    activeEntitlements.some((e) => e.product === slug),
  )
  const highestTierName = activeEntitlements.find(
    (e) => e.product === highestTierSlug,
  )?.productName
  const isFree = activeEntitlements.length > 0 && !highestTierSlug

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

  async function handleDownload() {
    try {
      const token = await getToken()
      const res = await fetch(
        `${MVP_API_URL}/dashboard/download`,
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
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">
          Overview of your SolarLayout account.
        </p>
      </div>

      {/* License Key Banner */}
      {entLoading ? (
        <Skeleton className="h-12 w-full rounded-lg" />
      ) : licenseKey ? (
        <div className="flex items-center justify-between rounded-lg bg-primary px-5 py-3 text-primary-foreground">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary-foreground/70">
              License Key
            </span>
            <span className="font-mono text-sm">
              {keyRevealed ? licenseKey : maskedKey}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setKeyRevealed(!keyRevealed)}
                    className="text-primary-foreground/70 transition-colors hover:text-primary-foreground"
                    aria-label={keyRevealed ? "Hide license key" : "Show license key"}
                  >
                    {keyRevealed ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {keyRevealed ? "Hide key" : "Show key"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyKey}
                    className="gap-1.5 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Copy license key to clipboard
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-5 py-3 text-center text-sm text-muted-foreground">
          Purchase a plan to get your license key.
        </div>
      )}

      {/* Row 1 — Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Remaining Calculations */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
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

        {/* Calculations Performed */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Calculations Performed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {usageLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : usageError ? (
              <span className="text-2xl font-bold text-foreground">—</span>
            ) : (
              <span
                data-testid="calculations-performed-value"
                className="text-4xl font-bold text-foreground"
              >
                {calculationsPerformed}
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — Plan + Download */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Your Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Your Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : entError ? (
              <span className="text-2xl font-bold text-foreground">—</span>
            ) : highestTierName ? (
              <span className="text-2xl font-bold text-foreground">
                {highestTierName}
              </span>
            ) : isFree ? (
              <div>
                <span className="text-2xl font-bold text-foreground">
                  Free
                </span>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  All Pro Plus features included.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active plan.{" "}
                <Link
                  href="/dashboard/plans"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Buy a plan →
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Download */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Download SolarLayout
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-auto">
            {entLoading ? (
              <Skeleton className="h-9 w-32" />
            ) : hasActiveEntitlement ? (
              <Button
                onClick={handleDownload}
                className="gap-2 bg-accent text-accent-foreground hover:!bg-accent/90"
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
            <CardTitle className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
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
                    <TableHead className="font-mono text-[11px] uppercase tracking-[0.08em]">Feature</TableHead>
                    <TableHead className="font-mono text-[11px] uppercase tracking-[0.08em]">Product</TableHead>
                    <TableHead className="font-mono text-[11px] uppercase tracking-[0.08em]">Date</TableHead>
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
