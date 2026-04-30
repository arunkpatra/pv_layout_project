"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@solarlayout/ui/components/button"
import { Input } from "@solarlayout/ui/components/input"
import { Textarea } from "@solarlayout/ui/components/textarea"
import { Label } from "@solarlayout/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@solarlayout/ui/components/select"
import {
  RadioGroup,
  RadioGroupItem,
} from "@solarlayout/ui/components/radio-group"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@solarlayout/ui/components/dialog"
import {
  useAdminUserSearch,
  type UserSearchResult,
} from "@/lib/hooks/use-admin-user-search"
import { useCreateManualTransaction } from "@/lib/hooks/use-admin-transactions"
import { useAdminProducts } from "@/lib/hooks/use-admin-products"
import type { PaymentMethod } from "@/lib/api"

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
]

function formatUsdCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  })
}

export function NewTransactionForm() {
  const router = useRouter()

  const [emailQuery, setEmailQuery] = React.useState("")
  const [debouncedEmail, setDebouncedEmail] = React.useState("")
  const [selectedUser, setSelectedUser] =
    React.useState<UserSearchResult | null>(null)
  const [productSlug, setProductSlug] = React.useState<string>("")
  const [paymentMethod, setPaymentMethod] =
    React.useState<PaymentMethod>("UPI")
  const [externalReference, setExternalReference] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [purchasedAt, setPurchasedAt] = React.useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  // Debounce email query by 300 ms
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(emailQuery), 300)
    return () => clearTimeout(t)
  }, [emailQuery])

  const { data: userResults, isLoading: searching } =
    useAdminUserSearch(debouncedEmail)

  // Fetch all non-free products — page 1 with a large pageSize so we get them all
  const { data: productsData } = useAdminProducts({ page: 1, pageSize: 100 })
  const products = (productsData?.data ?? []).filter(
    (p) => !p.isFree && p.active,
  )

  const selectedProduct = products.find((p) => p.slug === productSlug) ?? null

  const canSubmit = !!selectedUser && !!selectedProduct && !!paymentMethod

  const create = useCreateManualTransaction()

  function handleSelectUser(user: UserSearchResult) {
    setSelectedUser(user)
    setEmailQuery("")
    setDebouncedEmail("")
  }

  function handleClearUser() {
    setSelectedUser(null)
    setEmailQuery("")
    setDebouncedEmail("")
  }

  async function onConfirm() {
    if (!selectedUser || !selectedProduct) return
    try {
      const result = await create.mutateAsync({
        userId: selectedUser.id,
        productSlug: selectedProduct.slug,
        paymentMethod,
        externalReference: externalReference.trim() || undefined,
        notes: notes.trim() || undefined,
        purchasedAt: new Date(purchasedAt + "T12:00:00Z").toISOString(),
      })
      toast.success("Manual purchase recorded.")
      router.push(`/transactions/${result.transactionId}`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to record purchase.",
      )
    } finally {
      setConfirmOpen(false)
    }
  }

  // Show search results only when we have a query and no user is selected
  const showResults =
    !selectedUser && debouncedEmail.length >= 2 && !searching
  const showSearching = !selectedUser && debouncedEmail.length >= 2 && searching
  const showEmpty =
    showResults && (!userResults || userResults.length === 0)

  // Build confirmation message parts
  const customerDisplay = selectedUser
    ? `${selectedUser.name ? `${selectedUser.name} ` : ""}(${selectedUser.email})`
    : ""
  const methodLabel =
    METHODS.find((m) => m.value === paymentMethod)?.label ?? paymentMethod
  const refDisplay = externalReference.trim()
    ? ` (ref: \`${externalReference.trim()}\`)`
    : ""

  return (
    <div className="max-w-xl space-y-6">
      {/* 1. Customer search */}
      <div className="space-y-2">
        <Label>Customer (search by email) *</Label>

        {selectedUser ? (
          <div className="flex items-center justify-between rounded-lg border border-ring bg-muted/50 px-3 py-2 text-sm">
            <span className="font-medium text-foreground">
              {selectedUser.email}
              {selectedUser.name ? (
                <span className="ml-1 text-muted-foreground">
                  — {selectedUser.name}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={handleClearUser}
              className="ml-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <Input
              placeholder="Type email to search..."
              value={emailQuery}
              onChange={(e) => setEmailQuery(e.target.value)}
              autoComplete="off"
            />

            {showSearching && (
              <div className="mt-1 rounded-lg border border-border bg-popover p-2 text-sm text-muted-foreground">
                Searching…
              </div>
            )}

            {showEmpty && (
              <div className="mt-1 rounded-lg border border-border bg-popover p-3 text-sm text-muted-foreground">
                No customer with that email. Customer must sign up at
                solarlayout.in/sign-up before you can record a purchase.
              </div>
            )}

            {showResults && userResults && userResults.length > 0 && (
              <ul className="mt-1 max-h-60 overflow-auto rounded-lg border border-border bg-popover shadow-sm">
                {userResults.slice(0, 20).map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => handleSelectUser(u)}
                    >
                      <span className="font-medium">{u.email}</span>
                      {u.name ? (
                        <span className="ml-1 text-muted-foreground">
                          — {u.name}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 2. Plan */}
      <div className="space-y-2">
        <Label>Plan *</Label>
        <Select value={productSlug} onValueChange={setProductSlug}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a plan…" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.slug} value={p.slug}>
                {p.name} — {formatUsdCents(p.priceAmount)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 3. Payment method */}
      <div className="space-y-2">
        <Label>Payment method *</Label>
        <RadioGroup
          value={paymentMethod}
          onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
          className="flex flex-wrap gap-4"
        >
          {METHODS.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem value={value} id={`method-${value}`} />
              <label
                htmlFor={`method-${value}`}
                className="cursor-pointer text-sm font-medium"
              >
                {label}
              </label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* 4. External reference */}
      <div className="space-y-2">
        <Label htmlFor="external-reference">External reference</Label>
        <Input
          id="external-reference"
          value={externalReference}
          onChange={(e) => setExternalReference(e.target.value)}
          placeholder="e.g., bank txn ID, UPI ref, cheque #"
        />
      </div>

      {/* 5. Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Optional internal notes"
        />
      </div>

      {/* 6. Purchased at */}
      <div className="space-y-2">
        <Label htmlFor="purchased-at">Purchased at *</Label>
        <Input
          id="purchased-at"
          type="date"
          value={purchasedAt}
          onChange={(e) => setPurchasedAt(e.target.value)}
          className="w-44"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!canSubmit}
        >
          Review &amp; Confirm
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push("/transactions")}
        >
          Cancel
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Confirm manual purchase</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Recording manual purchase:{" "}
            <strong className="text-foreground">{customerDisplay}</strong> buys{" "}
            <strong className="text-foreground">
              {selectedProduct?.name ?? ""}
            </strong>{" "}
            for{" "}
            <strong className="text-foreground">
              {selectedProduct ? formatUsdCents(selectedProduct.priceAmount) : ""}
            </strong>{" "}
            via <strong className="text-foreground">{methodLabel}</strong>
            {refDisplay}.{" "}
            {selectedProduct
              ? `The ${selectedProduct.calculations}-calculation entitlement will activate immediately.`
              : ""}
            {" "}Confirm?
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={create.isPending}>
              {create.isPending ? "Recording…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
