export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          System
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          System configuration and settings.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center text-sm text-muted-foreground">
        Coming soon.
      </div>
    </div>
  )
}
