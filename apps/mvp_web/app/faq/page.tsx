import type { Metadata } from "next"
import { FaqAccordion } from "@/components/faq-accordion"

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about SolarLayout PV design tools — software, downloads, pricing, entitlements, and support.",
}

export default function FaqPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Frequently Asked Questions
        </h1>

        <div className="mt-10">
          <FaqAccordion />
        </div>
      </div>
    </div>
  )
}
