import type { Metadata } from "next"
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
    </>
  )
}
