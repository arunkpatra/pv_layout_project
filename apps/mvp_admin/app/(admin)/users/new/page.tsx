export const dynamic = "force-dynamic"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { NewUserForm } from "./_components/new-user-form"

export const metadata: Metadata = { title: "New User" }

export default async function NewUserPage() {
  const { sessionClaims } = await auth()
  const meta = sessionClaims?.metadata as Record<string, unknown> | undefined
  const roles = Array.isArray(meta?.["roles"])
    ? (meta!["roles"] as string[])
    : []
  if (!roles.includes("ADMIN")) redirect("/dashboard")

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        New User
      </h1>
      <NewUserForm />
    </div>
  )
}
