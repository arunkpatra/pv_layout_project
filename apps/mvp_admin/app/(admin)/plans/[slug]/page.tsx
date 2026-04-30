export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { ProductDetailClient } from "./_components/product-detail-client"

export const metadata: Metadata = { title: "Product" }

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ granularity?: string }>
}) {
  const { slug } = await params
  const { granularity: rawGranularity } = await searchParams
  const granularity =
    rawGranularity === "daily" || rawGranularity === "weekly"
      ? rawGranularity
      : "monthly"

  const { sessionClaims } = await auth()
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined
  const roles = Array.isArray(meta?.["roles"])
    ? (meta!["roles"] as string[])
    : []
  if (!roles.includes("ADMIN") && !roles.includes("OPS"))
    redirect("/dashboard")

  return <ProductDetailClient slug={slug} granularity={granularity} />
}
