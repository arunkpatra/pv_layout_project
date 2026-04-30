"use client"

import * as React from "react"
import { Suspense } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@renewable-energy/ui/components/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renewable-energy/ui/components/select"

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50]
const LOCALSTORAGE_KEY = "re_page_size"

export function getPageNumbers(
  page: number,
  totalPages: number,
): (number | "ellipsis")[] {
  if (totalPages <= 0) return []
  if (totalPages === 1) return [1]

  const shown = new Set<number>()
  shown.add(1)
  shown.add(totalPages)
  for (let i = Math.max(1, page - 1); i <= Math.min(totalPages, page + 1); i++) {
    shown.add(i)
  }

  const sorted = Array.from(shown).sort((a, b) => a - b)
  const result: (number | "ellipsis")[] = []
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]!)
    const next = sorted[i + 1]
    if (next !== undefined && next - sorted[i]! > 1) {
      result.push("ellipsis")
    }
  }
  return result
}

type PaginationControlsProps = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  pageSizeOptions?: number[]
}

function PaginationControlsInner({
  page,
  pageSize,
  total,
  totalPages,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationControlsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // On first mount: sync localStorage page size preference into URL if absent
  React.useEffect(() => {
    if (searchParams.get("pageSize") === null) {
      const stored = localStorage.getItem(LOCALSTORAGE_KEY)
      if (stored !== null && pageSizeOptions.includes(Number(stored))) {
        const params = new URLSearchParams(searchParams.toString())
        params.set("pageSize", stored)
        params.set("page", "1")
        router.replace(`${pathname}?${params.toString()}`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showPageNav = totalPages > 1

  function makePageHref(targetPage: number): string {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(targetPage))
    return `${pathname}?${params.toString()}`
  }

  function handlePageSizeChange(value: string) {
    localStorage.setItem(LOCALSTORAGE_KEY, value)
    const params = new URLSearchParams(searchParams.toString())
    params.set("pageSize", value)
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  const pageNumbers = getPageNumbers(page, totalPages)
  const isPrevDisabled = page <= 1
  const isNextDisabled = page >= totalPages

  return (
    <div className="flex items-center justify-between gap-4 py-4">
      {showPageNav ? (
        <Pagination className="flex-1 justify-start">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={isPrevDisabled ? undefined : makePageHref(page - 1)}
                aria-disabled={isPrevDisabled}
                className={
                  isPrevDisabled ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
            {pageNumbers.map((item, idx) =>
              item === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${idx}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href={makePageHref(item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={isNextDisabled ? undefined : makePageHref(page + 1)}
                aria-disabled={isNextDisabled}
                className={
                  isNextDisabled ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap shrink-0">
        <span>Per page:</span>
        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="w-20 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs">({total} total)</span>
      </div>
    </div>
  )
}

export function PaginationControls(props: PaginationControlsProps) {
  return (
    <Suspense>
      <PaginationControlsInner {...props} />
    </Suspense>
  )
}
