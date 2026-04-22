"use client"

import { Suspense, useEffect, useState, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { Check, Loader2, Copy, CheckCheck } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import { toast } from "sonner"

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

interface EntitlementItem {
  product: string
  productName: string
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
  purchasedAt: string
}

export default function PlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PlanPageInner />
    </Suspense>
  )
}

function PlanPageInner() {
  const { getToken } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [products, setProducts] = useState<Product[]>([])
  const [entitlements, setEntitlements] = useState<EntitlementItem[]>([])
  const [licenseKey, setLicenseKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const hasVerified = useRef(false)

  const sessionId = searchParams.get("session_id")

  useEffect(() => {
    async function load() {
      try {
        const [productsRes, entitlementsRes] = await Promise.all([
          fetch(`${MVP_API_URL}/products`),
          (async () => {
            const token = await getToken()
            if (!token) return null
            return fetch(`${MVP_API_URL}/billing/entitlements`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          })(),
        ])

        if (productsRes.ok) {
          const data = await productsRes.json()
          if (data.success) setProducts(data.data.products)
        }

        if (entitlementsRes?.ok) {
          const data = await entitlementsRes.json()
          if (data.success) {
            setEntitlements(data.data.entitlements)
            setLicenseKey(data.data.licenseKey)
          }
        }
      } catch (err) {
        console.error("Failed to load plan data:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getToken])

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
        const data = await res.json()
        if (data.success && data.data.verified) {
          toast.success("Purchase successful! Your entitlement has been activated.")
          const entRes = await fetch(`${MVP_API_URL}/billing/entitlements`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (entRes.ok) {
            const entData = await entRes.json()
            if (entData.success) {
              setEntitlements(entData.data.entitlements)
              setLicenseKey(entData.data.licenseKey)
            }
          }
        }
      } catch (err) {
        console.error("Session verification failed:", err)
      }
      router.replace("/dashboard/plan")
    }
    verify()
  }, [sessionId, getToken, router])

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
      const data = await res.json()
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

  async function copyLicenseKey() {
    if (!licenseKey) return
    await navigator.clipboard.writeText(licenseKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Plan
        </h1>
        <p className="mt-1 text-muted-foreground">
          Purchase calculation packs and manage your entitlements.
        </p>
      </div>

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

      {entitlements.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Your Entitlements
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entitlements.map((ent, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{ent.productName}</CardTitle>
                    {ent.product === "pv-layout-free" && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                        Free
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-foreground">
                    {ent.remainingCalculations}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {ent.totalCalculations} remaining
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Purchased{" "}
                    {new Date(ent.purchasedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {licenseKey && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            License Key
          </h2>
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-3 py-2 text-sm font-mono">
              {licenseKey}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={copyLicenseKey}
              aria-label="Copy license key"
            >
              {copied ? (
                <CheckCheck className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter this key in your SolarLayout desktop application to activate your plan.
          </p>
        </div>
      )}
    </div>
  )
}
