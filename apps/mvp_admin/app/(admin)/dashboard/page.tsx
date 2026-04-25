import type { Metadata } from "next"

export const metadata: Metadata = { title: "Dashboard" }

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview metrics and operational summaries will appear here.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/20 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Dashboard content — coming in a later spike.
        </p>
      </div>
    </div>
  )
}
