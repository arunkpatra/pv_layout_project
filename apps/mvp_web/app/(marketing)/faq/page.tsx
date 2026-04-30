import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { SectionBand } from "@/components/section-band"
import { FaqAccordion } from "@/components/faq-accordion"

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about SolarLayout PV design solutions.",
}

export default function FaqPage() {
  return (
    <>
      <PageHeader
        breadcrumb={["SolarLayout", "FAQ"]}
        title="Frequently asked questions."
        description="If you do not see your question answered below, contact us at support@solarlayout.in."
      />
      <SectionBand>
        <FaqAccordion />
      </SectionBand>

      {/* Bottom CTA */}
      <SectionBand muted>
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="text-[28px] font-semibold tracking-[-0.015em]">
            Still have questions?
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Contact us
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-[#1C1C1C] transition-colors hover:bg-accent/90"
            >
              Get Free License Key
            </Link>
          </div>
        </div>
      </SectionBand>
    </>
  )
}
