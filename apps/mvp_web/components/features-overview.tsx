import Link from "next/link"
import { Layout, Zap, Sun } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"

const plans = [
  {
    name: "PV Layout Basic",
    icon: Layout,
    tagline: "Quick capacity layouts",
    features: [
      "KMZ boundary input with exclusion zones",
      "Automatic MMS table placement",
      "Inverter and lightning arrester placement",
    ],
  },
  {
    name: "PV Layout Pro",
    icon: Zap,
    tagline: "Full cable routing and measurements",
    features: [
      "All Basic features included",
      "AC and DC cable placement",
      "Full cable quantity measurements",
    ],
  },
  {
    name: "PV Layout Pro Plus",
    icon: Sun,
    tagline: "Bankable yield analysis",
    features: [
      "All Pro features included",
      "Energy yield analysis (P50/P75/P90)",
      "Plant generation estimates",
    ],
  },
]

export function FeaturesOverview() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            One Application, Three Plans
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Choose the plan that matches your project stage — from quick
            capacity estimates to detailed bankable layouts with energy yield
            analysis. Free trial included.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} className="flex flex-col">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <plan.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {plan.tagline}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="flex-1 space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link href="/products">View All Plans</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
