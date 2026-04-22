import type { Metadata } from "next"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { CreditCard } from "lucide-react"

export const metadata: Metadata = { title: "Plan" }

export default function PlanPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Plan
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your current plan and entitlements.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Plan details</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Coming soon — purchase a plan from the{" "}
            <a
              href="/pricing"
              className="text-primary underline underline-offset-4"
            >
              Pricing page
            </a>{" "}
            to see your entitlements here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
