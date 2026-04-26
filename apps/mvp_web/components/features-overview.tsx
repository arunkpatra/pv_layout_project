import Link from "next/link"
import { SectionBand } from "./section-band"
import { SectionHead } from "./section-head"

const plans = [
  {
    tag: "PV Layout · Basic",
    headline: "Boundary → Layout",
    price: "$1.99",
    small: "one-time · 5 calcs",
    calcs: "5 calculations",
    features: [
      "KMZ boundary import with multi-area support",
      "Automatic MMS table placement",
      "Inverter and lightning arrester placement",
      "KMZ + DXF export",
    ],
    highlighted: false,
  },
  {
    tag: "PV Layout · Pro",
    headline: "Layout + Cabling",
    price: "$4.99",
    small: "one-time · 10 calcs",
    calcs: "10 calculations",
    features: [
      "All Basic capabilities included",
      "AC + DC cable routing with quantities",
      "ICR placement at 1 per 18 MWp",
      "KMZ, DXF and PDF report export",
    ],
    highlighted: true,
  },
  {
    tag: "PV Layout · Pro Plus",
    headline: "Layout + Yield",
    price: "$14.99",
    small: "one-time · 50 calcs",
    calcs: "50 calculations",
    features: [
      "All Pro capabilities included",
      "Energy yield analysis",
      "P50 / P75 / P90 exceedance values",
      "Plant generation estimates",
    ],
    highlighted: false,
  },
]

export function FeaturesOverview() {
  return (
    <SectionBand>
      <SectionHead
        eyebrow="01 / Products"
        title="Choose the right plan for your project."
        description="Pick the depth of automation your project stage needs. Calculations are pooled per purchase."
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.tag}
            className={`relative flex flex-col gap-3.5 rounded-[var(--radius)] border border-border bg-card p-6 transition-colors hover:border-[#9CA3AF]${plan.highlighted ? " border-accent shadow-[inset_0_0_0_1px_rgba(245,166,35,0.25)]" : ""}`}
          >
            {plan.highlighted && (
              <span className="absolute right-4 top-4 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-[#1C1C1C]">
                Most used
              </span>
            )}

            <span className="self-start font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {plan.tag}
            </span>

            <h3 className="text-xl tracking-[-0.01em]">{plan.headline}</h3>

            <div className="text-2xl font-bold tracking-[-0.02em]">
              {plan.price}
              <small className="ml-1.5 text-[13px] font-normal text-muted-foreground">
                {plan.small}
              </small>
            </div>

            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex gap-2 text-sm leading-[1.45] text-[#374151]"
                >
                  <span className="mt-[10px] h-px w-3.5 shrink-0 bg-accent" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto flex items-center justify-between border-t border-dashed border-border pt-4">
              <span className="font-mono text-xs text-muted-foreground">
                {plan.calcs}
              </span>
              <Link
                href="/products"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary"
              >
                Learn more →
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-[#1C1C1C] transition-colors hover:bg-accent/90"
        >
          Explore pricing
        </Link>
      </div>
    </SectionBand>
  )
}
