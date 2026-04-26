import type { Metadata } from "next"
import { PricingCards } from "@/components/pricing-cards"
import { PageHeader } from "@/components/page-header"
import { SectionBand } from "@/components/section-band"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for SolarLayout PV design solutions. One-time purchase, usage-based entitlements.",
}

export default function PricingPage() {
  return (
    <>
      <PageHeader
        breadcrumb={["SolarLayout", "Pricing"]}
        title="Simple, transparent pricing."
        description="Pay once. Use as many times as your plan allows. No subscription, no automatic renewals."
      />
      <SectionBand>
        <PricingCards />
      </SectionBand>
    </>
  )
}
