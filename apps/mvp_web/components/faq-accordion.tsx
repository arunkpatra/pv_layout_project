"use client"

import { useState } from "react"

const categories = [
  {
    id: "software",
    label: "About the software",
    items: [
      {
        q: "What is SolarLayout?",
        a: "SolarLayout is a suite of Windows desktop solutions that automate utility-scale fixed-tilt PV solar plant layout design. Upload a KMZ boundary, configure parameters, and get a complete layout with table placement, cable routing, and energy yield.",
      },
      {
        q: "What file format do I need?",
        a: "KMZ (Google Earth). Your site boundary must be drawn as polygons. Exclusion zones for obstacles are also read from the KMZ.",
      },
      {
        q: "Which Windows versions?",
        a: "Windows 10 or higher.",
      },
      {
        q: "Do I need other software?",
        a: "No. The solutions are standalone executables.",
      },
      {
        q: "Does it work offline?",
        a: "The layout calculation runs entirely on your machine. An internet connection is required for licence validation.",
      },
    ],
  },
  {
    id: "products",
    label: "Products & downloads",
    items: [
      {
        q: "What's the difference between the three products?",
        a: "Basic: layout only. Pro: layout + cable routing. Pro Plus: layout + cables + energy yield analysis.",
      },
      {
        q: "How do I download?",
        a: "Go to the Products page, click Download on your chosen product, enter your details, and the download starts immediately.",
      },
      {
        q: "Is the software free?",
        a: "We offer trial access. Full access is available through one-time purchase plans.",
      },
      {
        q: "Can I try before I buy?",
        a: "Yes — trial access is available from the Products page.",
      },
    ],
  },
  {
    id: "entitlements",
    label: "Entitlements & calculations",
    items: [
      {
        q: "What counts as one calculation?",
        a: "Each time you generate a layout from a boundary file counts as one calculation.",
      },
      {
        q: "What happens when I run out?",
        a: "You can purchase a top-up pack at any time at the same per-calculation rate.",
      },
      {
        q: "Can I top up?",
        a: "Yes. Top-up packs are available from the Pricing page.",
      },
      {
        q: "Is my entitlement tied to one machine?",
        a: "Entitlements are tied to your registered email address, not to a specific machine.",
      },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    items: [
      {
        q: "How do I purchase?",
        a: "Sign up at dashboard.solarlayout.in to purchase a plan and get your licence key.",
      },
      {
        q: "What payment methods?",
        a: "We accept major credit and debit cards via Stripe.",
      },
      {
        q: "Will I receive a receipt?",
        a: "Yes, a confirmation email is sent after purchase.",
      },
    ],
  },
  {
    id: "support",
    label: "Support",
    items: [
      {
        q: "How do I contact support?",
        a: "Email support@solarlayout.in or use the Contact page.",
      },
      {
        q: "What if the software crashes?",
        a: "Contact support with your KMZ file and a description of the issue. We will investigate and respond within 2 business days.",
      },
    ],
  },
]

export function FaqAccordion() {
  const [activeCategory, setActiveCategory] = useState(categories[0]!.id)

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="sticky top-[84px] hidden self-start lg:block">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveCategory(cat.id)
              document
                .getElementById(`faq-${cat.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors${activeCategory === cat.id ? " bg-secondary font-medium text-primary" : " text-[#374151] hover:bg-secondary hover:text-primary"}`}
          >
            {cat.label}
          </button>
        ))}
      </aside>

      {/* FAQ content */}
      <div>
        {categories.map((cat) => (
          <div key={cat.id} id={`faq-${cat.id}`} className="mb-9">
            <h3 className="mb-3.5 border-b border-border pb-2.5 font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {cat.label}
            </h3>
            {cat.items.map((item) => (
              <details
                key={item.q}
                className="border-b border-border py-4 [&[open]_summary_.plus]:rotate-45"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[15.5px] font-medium [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="plus shrink-0 font-mono text-muted-foreground transition-transform duration-150">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-[64ch] text-[14.5px] text-[#374151]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
