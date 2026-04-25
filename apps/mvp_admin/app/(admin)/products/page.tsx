export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { ProductsPageClient } from "./_components/products-page-client"

export const metadata: Metadata = { title: "Products" }

export default async function ProductsPage() {
  const { sessionClaims } = await auth()
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined
  const roles = Array.isArray(meta?.["roles"])
    ? (meta!["roles"] as string[])
    : []
  if (!roles.includes("ADMIN") && !roles.includes("OPS"))
    redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Products
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All products with sales revenue and entitlement metrics.
        </p>
      </div>
      <ProductsPageClient />
    </div>
  )
}
