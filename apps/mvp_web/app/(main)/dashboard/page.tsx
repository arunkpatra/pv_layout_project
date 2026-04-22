"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { DownloadCard } from "@/components/download-card"
import Link from "next/link"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

const products = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    calculations: "5 layout calculations per purchase",
    productSlug: "pv-layout-basic" as const,
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    calculations: "10 layout calculations per purchase",
    productSlug: "pv-layout-pro" as const,
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    calculations: "50 layout and yield calculations per purchase",
    productSlug: "pv-layout-pro-plus" as const,
  },
]

interface EntitlementItem {
  product: string
  remainingCalculations: number
}

export default function DashboardPage() {
  const { getToken } = useAuth()
  const [entitlements, setEntitlements] = useState<EntitlementItem[]>([])

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken()
        if (!token) return
        const res = await fetch(`${MVP_API_URL}/billing/entitlements`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success) setEntitlements(data.data.entitlements)
        }
      } catch {
        // silent
      }
    }
    load()
  }, [getToken])

  function getRemainingForProduct(slug: string): number {
    return entitlements
      .filter((e) => e.product === slug)
      .reduce((sum, e) => sum + e.remainingCalculations, 0)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Downloads
        </h1>
        <p className="mt-1 text-muted-foreground">
          Download the SolarLayout desktop application for your plan.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const remaining = getRemainingForProduct(product.productSlug)
          return (
            <div key={product.productSlug} className="space-y-2">
              <DownloadCard
                name={product.name}
                price={product.price}
                calculations={product.calculations}
                productSlug={product.productSlug}
                apiBaseUrl={MVP_API_URL}
                highlighted={product.highlighted}
              />
              <div className="text-center text-sm text-muted-foreground">
                {remaining > 0 ? (
                  <span>{remaining} calculations remaining</span>
                ) : (
                  <Link
                    href={`/dashboard/plan?product=${product.productSlug}`}
                    className="text-primary underline underline-offset-4"
                  >
                    Buy calculations
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
