import type { Metadata } from "next"
import Link from "next/link"
import { Download } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import { DownloadModal } from "@/components/download-modal"

export const metadata: Metadata = {
  title: "Products",
  description:
    "PV Layout — automated solar plant layout design for Windows. Three plans for every stage of utility-scale solar development.",
}

const plans = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    calculations: "5 layout calculations per purchase",
    features: [
      "KMZ boundary input with multiple plant areas",
      "Automatic MMS table placement within boundary",
      "Inverter and lightning arrester placement",
      "Obstruction exclusion (ponds, water bodies, transmission lines)",
      "KMZ and DXF export",
    ],
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    calculations: "10 layout calculations per purchase",
    features: [
      "All Basic features included",
      "AC and DC cable placement with full routing",
      "Cable quantity measurements",
      "ICR building placement (1 per 18 MWp)",
      "KMZ, DXF, and PDF export",
    ],
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    calculations: "50 layout and yield calculations per purchase",
    features: [
      "All Pro features included",
      "Energy yield analysis",
      "P50 / P75 / P90 exceedance values",
      "Plant generation estimates",
      "Complete PDF report with capacity, cables, and yield",
    ],
  },
]

export default function ProductsPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            PV Layout
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            One desktop application, three plans for every stage of
            utility-scale solar PV plant development.
          </p>
        </div>

        {/* Download CTA */}
        <div className="mt-8 flex justify-center">
          <DownloadModal productName="PV Layout">
            <Button
              size="lg"
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Download className="h-5 w-5" />
              Download PV Layout
            </Button>
          </DownloadModal>
        </div>

        {/* Free trial callout */}
        <div className="mx-auto mt-6 max-w-md rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center dark:border-green-900 dark:bg-green-950/20">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Free trial included</strong>
            {" — "}sign up and get 5 full-featured calculations, no credit card
            required.
          </p>
        </div>

        {/* Plan cards */}
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`flex flex-col ${plan.highlighted ? "border-accent ring-2 ring-accent/20" : ""}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    {plan.price}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {plan.calculations}
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
                <Button asChild variant="outline" className="mt-6 w-full">
                  <Link href="/dashboard/plans">Buy Now</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Top-up note */}
        <div className="mt-12 rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-muted-foreground">
            <strong className="text-foreground">
              Need more calculations?
            </strong>{" "}
            Top up anytime at the same rate.
          </p>
        </div>
      </div>
    </div>
  )
}
