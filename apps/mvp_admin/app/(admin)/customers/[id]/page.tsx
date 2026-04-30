export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { CustomerDetailClient } from "./_components/customer-detail-client"

export const metadata: Metadata = { title: "Customer" }

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string }>
}) {
  const { id } = await params
  const { filter: filterParam } = await searchParams
  const filter = filterParam === "all" ? "all" : "active"

  const { sessionClaims } = await auth()
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined
  const roles = Array.isArray(meta?.["roles"])
    ? (meta!["roles"] as string[])
    : []
  if (!roles.includes("ADMIN") && !roles.includes("OPS"))
    redirect("/dashboard")

  return <CustomerDetailClient customerId={id} filter={filter} />
}
