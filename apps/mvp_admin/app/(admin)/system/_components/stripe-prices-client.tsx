"use client"

import { useState } from "react"
import { Check, X, Pencil } from "lucide-react"
import {
  useStripePrices,
  useUpdateStripePrice,
} from "@/lib/hooks/use-admin-products"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renewable-energy/ui/components/table"
import { Button } from "@renewable-energy/ui/components/button"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { Badge } from "@renewable-energy/ui/components/badge"

export function StripePricesClient() {
  const { data: prices, isLoading, error } = useStripePrices()
  const { mutate, isPending } = useUpdateStripePrice()
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)

  function startEdit(slug: string, currentValue: string) {
    setEditingSlug(slug)
    setEditValue(currentValue)
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingSlug(null)
    setEditValue("")
    setSaveError(null)
  }

  function saveEdit(slug: string) {
    if (!editValue.trim()) return
    setSaveError(null)
    mutate(
      { slug, stripePriceId: editValue.trim() },
      {
        onSuccess: () => {
          setEditingSlug(null)
          setEditValue("")
          setSaveError(null)
        },
        onError: (err) => {
          setSaveError(err.message)
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
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
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Plan</TableHead>
            <TableHead>Stripe Price ID</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prices?.map((price) => (
            <TableRow key={price.slug}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{price.name}</span>
                  {price.isFree && (
                    <Badge variant="secondary" className="text-xs">
                      Free
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {editingSlug === price.slug ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(price.slug)
                      if (e.key === "Escape") cancelEdit()
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    autoFocus
                    disabled={isPending}
                  />
                ) : (
                  <code className="font-mono text-sm text-muted-foreground">
                    {price.stripePriceId}
                  </code>
                )}
              </TableCell>
              <TableCell>
                {editingSlug === price.slug ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-green-600 hover:text-green-700"
                      onClick={() => saveEdit(price.slug)}
                      disabled={isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={cancelEdit}
                      disabled={isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      startEdit(price.slug, price.stripePriceId)
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {saveError && (
        <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {saveError}
        </div>
      )}
    </div>
  )
}
