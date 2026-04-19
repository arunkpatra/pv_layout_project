"use client"

import { useCurrentUser } from "@/hooks/use-current-user"

export default function Page() {
  const { data: user, isLoading } = useCurrentUser()

  return (
    <div className="grid auto-rows-min gap-4 md:grid-cols-3">
      <div className="col-span-3 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
        {isLoading ? "Loading…" : user ? `Signed in as ${user.name}` : null}
      </div>
      <div className="aspect-video rounded-xl bg-muted/50" />
      <div className="aspect-video rounded-xl bg-muted/50" />
      <div className="aspect-video rounded-xl bg-muted/50" />
      <div className="col-span-3 min-h-96 rounded-xl bg-muted/50" />
    </div>
  )
}
