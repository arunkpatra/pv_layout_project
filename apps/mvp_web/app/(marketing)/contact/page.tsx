import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { SectionBand } from "@/components/section-band"
import { ContactInfo } from "@/components/contact-info"
import { ContactForm } from "@/components/contact-form"

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Reach the SolarLayout team for sales, technical, or partnership enquiries.",
}

export default function ContactPage() {
  return (
    <>
      <PageHeader
        breadcrumb={["SolarLayout", "Contact"]}
        title="Contact us."
        description="Reach the SolarLayout team for sales, technical, or partnership enquiries. We respond within two business days."
      />
      <SectionBand>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.2fr]">
          <ContactInfo />
          <ContactForm />
        </div>
      </SectionBand>
    </>
  )
}
