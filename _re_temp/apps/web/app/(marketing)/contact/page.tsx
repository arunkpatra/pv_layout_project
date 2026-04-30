import { ContactForm } from "./contact-form"
import {
  Mail,
  Clock,
  MapPin,
} from "lucide-react"

export const metadata = {
  title: "Contact — SolarDesign",
}

const contactDetails = [
  {
    icon: Mail,
    label: "Email",
    value: "sales@solardesign.in",
    note: "Enterprise enquiries, integration requirements, custom DISCOM formats",
  },
  {
    icon: Mail,
    label: "Support",
    value: "support@solardesign.in",
    note: "Platform issues, billing queries, account management",
  },
  {
    icon: Clock,
    label: "Response time",
    value: "One business day",
    note: "Monday to Friday, Indian business hours (IST)",
  },
  {
    icon: MapPin,
    label: "Office",
    value: "Bengaluru, Karnataka",
    note: "India",
  },
]

export default function ContactPage() {
  return (
    <>
      <section className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="max-w-xl text-4xl font-bold tracking-tight">
          Contact us
        </h1>
        <p className="max-w-lg text-lg text-muted-foreground">
          For Enterprise enquiries, integration requirements, or questions about
          the platform. We respond within one business day.
        </p>
      </section>

      <section className="mx-auto w-full max-w-5xl gap-12 px-6 pb-20 md:grid md:grid-cols-[1fr_320px]">
        {/* Form */}
        <div>
          <h2 className="mb-6 text-lg font-semibold">Send a message</h2>
          <ContactForm />
        </div>

        {/* Contact details */}
        <div className="mt-10 md:mt-0">
          <h2 className="mb-6 text-lg font-semibold">Contact details</h2>
          <div className="flex flex-col gap-6">
            {contactDetails.map((item) => (
              <div key={item.label} className="flex gap-3">
                <item.icon
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-sm font-medium">{item.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 border-t pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Start without talking to us
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              The Professional plan is free for 14 days — no credit card required.
              Run a full project before committing to a subscription.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
