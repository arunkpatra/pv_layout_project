export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { NewTransactionForm } from "./_components/new-transaction-form"

export const metadata: Metadata = { title: "Record Manual Purchase" }

export default async function NewTransactionPage() {
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
          Record Manual Purchase
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record a cash, UPI, bank transfer, or other offline purchase for a
          customer.
        </p>
      </div>
      <NewTransactionForm />
    </div>
  )
}
