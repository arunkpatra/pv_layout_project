import type { Metadata } from "next"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { BarChart3 } from "lucide-react"

export const metadata: Metadata = { title: "Usage" }

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Usage
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your calculation usage history.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Usage history</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Coming soon — usage history will appear here once you start
            generating layouts.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
