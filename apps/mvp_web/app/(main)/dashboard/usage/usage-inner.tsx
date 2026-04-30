"use client"

import { useSearchParams, useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@solarlayout/ui/components/card"
import { Button } from "@solarlayout/ui/components/button"
import { Skeleton } from "@solarlayout/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@solarlayout/ui/components/table"
import { useUserUsage } from "@/components/hooks/use-billing"

const PAGE_SIZE = 20

export function UsagePageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const pageParam = searchParams.get("page")
  const parsed = parseInt(pageParam ?? "", 10)
  const page = isNaN(parsed) || parsed < 1 ? 1 : parsed

  const { data, isLoading, isError } = useUserUsage(page, PAGE_SIZE)

  const records = data?.data ?? []
  const pagination = data?.pagination
  const total = pagination?.total ?? 0
  const totalPages = pagination?.totalPages ?? 1

  function goToPage(p: number) {
    router.push(`?page=${p}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-foreground">
          Usage History
        </h1>
        {!isLoading && !isError && (
          <span className="text-sm text-muted-foreground">
            {total} {total === 1 ? "record" : "records"}
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[11px] uppercase tracking-[0.08em]">Calculation History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError ? (
            <p className="text-sm text-destructive">
              Failed to load usage history. Please try again.
            </p>
          ) : isLoading ? (
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
                  {[1, 2, 3].map((i) => (
                    <TableRow key={i} data-testid="skeleton-row">
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No calculations recorded yet. Download the app and run your first
              layout.
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
                  {records.map((record, idx) => (
                    <TableRow
                      key={`${record.featureKey}-${record.createdAt}-${idx}`}
                    >
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

          {/* Pagination */}
          {!isError && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || isLoading}
              >
                ← Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages || isLoading}
              >
                Next →
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
