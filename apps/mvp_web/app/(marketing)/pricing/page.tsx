import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { PricingCards } from "@/components/pricing-cards"
import { PageHeader } from "@/components/page-header"
import { SectionBand } from "@/components/section-band"
import { SectionHead } from "@/components/section-head"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for SolarLayout PV design solutions. One-time purchase, usage-based entitlements.",
}

const plans = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    calcs: "5 layout calculations per purchase",
    highlighted: false,
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
    calcs: "10 layout calculations per purchase",
    highlighted: true,
    features: [
      "All Basic features included",
      "AC and DC cable placement with full routing",
      "Cable quantity measurements",
      "ICR building placement (1 per 18 MWp)",
      "KMZ, DXF, and PDF export",
    ],
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    calcs: "50 layout and yield calculations per purchase",
    highlighted: false,
    features: [
      "All Pro features included",
      "Energy yield analysis",
      "P50 / P75 / P90 exceedance values",
      "Plant generation estimates",
      "Complete PDF report with capacity, cables, and yield",
    ],
  },
]

export default function PricingPage() {
  return (
    <>
      <PageHeader
        breadcrumb={["SolarLayout", "Pricing"]}
        title="Simple, transparent pricing."
        description="Pay once. Use as many times as your plan allows. No subscription, no automatic renewals."
      />

      {/* Plan cards */}
      <SectionBand>
        <SectionHead
          eyebrow="01 / Plans"
          title="Choose the right plan for your project."
          description="Pick the depth of automation your project stage needs. Calculations are pooled per purchase."
        />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-[var(--radius)] border border-border bg-card${plan.highlighted ? " border-accent shadow-[0_0_0_1px_var(--accent)_inset]" : ""}`}
            >
              <div className="border-b border-border px-6 pb-[18px] pt-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold tracking-[-0.01em]">
                    {plan.name}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-[5px] text-xs font-semibold${plan.highlighted ? " bg-accent text-[#1C1C1C]" : " bg-primary text-white"}`}
                  >
                    {plan.price}
                  </span>
                </div>
                <div className="mt-2 font-mono text-[13px] text-muted-foreground">
                  {plan.calcs}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3.5 px-6 py-5">
                <ul className="m-0 flex flex-1 list-none flex-col gap-2.5 p-0">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex gap-2.5 text-sm leading-[1.45] text-[#374151]"
                    >
                      <span className="mt-2 h-[5px] w-[5px] shrink-0 rounded-full bg-accent" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-6 pb-6">
                <Button
                  asChild
                  variant={plan.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  <Link href="/dashboard/plans">Buy now</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-6 flex max-w-[640px] flex-wrap items-center justify-center gap-x-4 gap-y-3 rounded-lg border border-[#BBE0CB] bg-[#F0F8F3] px-[18px] py-3.5 text-center text-sm text-[#374151]">
          <span>
            <strong className="text-[#1A5C3A]">Free trial included</strong>
            {" — "}5 full-featured calculations, no credit card required.
          </span>
          <Button
            asChild
            size="lg"
            className="bg-accent text-accent-foreground hover:!bg-accent/90"
          >
            <Link href="/sign-up">Get Free License Key</Link>
          </Button>
        </div>
      </SectionBand>

      {/* Feature comparison table */}
      <SectionBand muted>
        <SectionHead
          eyebrow="02 / Comparison"
          title="Compare plans in detail."
        />
        <PricingCards />
      </SectionBand>
    </>
  )
}
