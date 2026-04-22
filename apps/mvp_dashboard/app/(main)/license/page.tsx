import type { Metadata } from "next"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { Key } from "lucide-react"

export const metadata: Metadata = { title: "License" }

export default function LicensePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          License
        </h1>
        <p className="mt-1 text-muted-foreground">Your licence keys.</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Licence keys</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Coming soon — your licence keys will appear here after purchase.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
