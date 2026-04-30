export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { StripePricesClient } from "./_components/stripe-prices-client"

export const metadata: Metadata = { title: "System" }

export default async function SystemPage() {
  const { sessionClaims } = await auth()
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined
  const roles = Array.isArray(meta?.["roles"])
    ? (meta!["roles"] as string[])
    : []
  if (!roles.includes("ADMIN"))
    redirect("/dashboard")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          System
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          System configuration and settings.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Stripe Price IDs
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage the Stripe price IDs linked to each plan. Click the
            edit icon to update a price ID.
          </p>
        </div>
        <StripePricesClient />
      </section>
    </div>
  )
}
