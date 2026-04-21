import type { Metadata } from "next"
import { PricingCards } from "@/components/pricing-cards"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for SolarLayout PV design tools. One-time purchase, usage-based entitlements.",
}

export default function PricingPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Simple, Transparent Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Pay once. Use as many times as your plan allows.
          </p>
        </div>

        <div className="mt-12">
          <PricingCards />
        </div>
      </div>
    </div>
  )
}
