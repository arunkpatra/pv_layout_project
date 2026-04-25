"use client"

import { Suspense, useEffect, useState, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { Check, Loader2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@renewable-energy/ui/components/table"
import { toast } from "sonner"
import { useEntitlements } from "@/components/hooks/use-billing"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

interface Product {
  slug: string
  name: string
  description: string
  priceAmount: number
  priceCurrency: string
  calculations: number
  features: { featureKey: string; label: string }[]
}

export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PlansPageInner />
    </Suspense>
  )
}

function PlansPageInner() {
  const { getToken } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const hasVerified = useRef(false)

  const {
    data: entData,
    isLoading: entLoading,
    refetch: refetchEntitlements,
  } = useEntitlements()

  const sessionId = searchParams.get("session_id")

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${MVP_API_URL}/products`)
        if (res.ok) {
          const data = (await res.json()) as {
            success: boolean
            data: { products: Product[] }
          }
          if (data.success) setProducts(data.data.products)
        }
      } catch (err) {
        console.error("Failed to load products:", err)
      } finally {
        setProductsLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!sessionId || hasVerified.current) return
    hasVerified.current = true

    async function verify() {
      try {
        const token = await getToken()
        const res = await fetch(`${MVP_API_URL}/billing/verify-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId }),
        })
        const data = (await res.json()) as {
          success: boolean
          data: { verified: boolean }
        }
        if (data.success && data.data.verified) {
          toast.success(
            "Purchase successful! Your entitlement has been activated.",
          )
          await refetchEntitlements()
        }
      } catch (err) {
        console.error("Session verification failed:", err)
      }
      router.replace("/dashboard/plans")
    }
    verify()
  }, [sessionId, getToken, router, refetchEntitlements])

  async function handlePurchase(productSlug: string) {
    setCheckoutLoading(productSlug)
    try {
      const token = await getToken()
      const res = await fetch(`${MVP_API_URL}/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product: productSlug }),
      })
      const data = (await res.json()) as {
        success: boolean
        data: { url: string }
      }
      if (data.success && data.data.url) {
        window.location.href = data.data.url
      } else {
        toast.error("Failed to start checkout. Please try again.")
      }
    } catch (err) {
      console.error("Checkout error:", err)
      toast.error("Failed to start checkout. Please try again.")
    } finally {
      setCheckoutLoading(null)
    }
  }

  const stateBadge = (state: "ACTIVE" | "EXHAUSTED" | "DEACTIVATED") => {
    if (state === "ACTIVE")
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
          Active
        </Badge>
      )
    if (state === "EXHAUSTED")
      return (
        <Badge variant="secondary" className="text-muted-foreground">
          Exhausted
        </Badge>
      )
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        Deactivated
      </Badge>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Plans
        </h1>
        <p className="mt-1 text-muted-foreground">
          Purchase calculation packs and view your purchase history.
        </p>
      </div>

      {/* Buy section */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          Buy Calculations
        </h2>
        {productsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.slug} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{product.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-foreground">
                      ${(product.priceAmount / 100).toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {product.calculations} calculations
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <ul className="space-y-1">
                    {product.features.map((f) => (
                      <li
                        key={f.featureKey}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <Check className="h-4 w-4 shrink-0 text-green-600" />
                        {f.label}
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => handlePurchase(product.slug)}
                    disabled={checkoutLoading !== null}
                    className="w-full"
                  >
                    {checkoutLoading === product.slug ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Redirecting…
                      </>
                    ) : (
                      "Purchase"
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Purchase history */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          Your Purchases
        </h2>
        {entLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !entData || entData.entitlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No purchases yet. Buy a pack above to get started.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entData.entitlements.map((ent) => (
                  <TableRow
                    key={ent.id}
                    className={
                      ent.state !== "ACTIVE" ? "opacity-60" : undefined
                    }
                  >
                    <TableCell>{ent.productName}</TableCell>
                    <TableCell>
                      {new Date(ent.purchasedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{ent.totalCalculations}</TableCell>
                    <TableCell>{ent.usedCalculations}</TableCell>
                    <TableCell>{ent.remainingCalculations}</TableCell>
                    <TableCell>{stateBadge(ent.state)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
