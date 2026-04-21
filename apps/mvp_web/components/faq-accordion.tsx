"use client"

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@renewable-energy/ui/components/accordion"

interface FaqItem {
  question: string
  answer: string
}

interface FaqCategory {
  title: string
  items: FaqItem[]
}

const faqData: FaqCategory[] = [
  {
    title: "About the Software",
    items: [
      {
        question: "What is SolarLayout?",
        answer:
          "SolarLayout is a suite of Windows desktop solutions that automate utility-scale fixed-tilt PV solar plant layout design. Upload a KMZ boundary, configure parameters, and get a complete layout with table placement, cable routing, and energy yield.",
      },
      {
        question: "What file format do I need?",
        answer:
          "KMZ (Google Earth). Your site boundary must be drawn as polygons. Exclusion zones for obstacles are also read from the KMZ.",
      },
      {
        question: "Which Windows versions?",
        answer: "Windows 10 or higher.",
      },
      {
        question: "Do I need other software?",
        answer: "No. The solutions are standalone executables.",
      },
      {
        question: "Does it work offline?",
        answer:
          "The layout calculation runs entirely on your machine. An internet connection is required for licence validation.",
      },
    ],
  },
  {
    title: "Products & Downloads",
    items: [
      {
        question: "What's the difference between the three products?",
        answer:
          "Basic: layout only. Pro: layout + cable routing. Pro Plus: layout + cables + energy yield analysis.",
      },
      {
        question: "How do I download?",
        answer:
          "Go to the Products page, click Download on your chosen product, enter your details, and the download starts immediately.",
      },
      {
        question: "Is the software free?",
        answer:
          "We offer trial access. Full access is available through one-time purchase plans.",
      },
      {
        question: "Can I try before I buy?",
        answer: "Yes — trial access is available from the Products page.",
      },
    ],
  },
  {
    title: "Entitlements & Calculations",
    items: [
      {
        question: "What counts as one calculation?",
        answer:
          "Each time you generate a layout from a boundary file counts as one calculation.",
      },
      {
        question: "What happens when I run out?",
        answer:
          "You can purchase a top-up pack at any time at the same per-calculation rate.",
      },
      {
        question: "Can I top up?",
        answer: "Yes. Top-up packs are available from the Pricing page.",
      },
      {
        question: "Is my entitlement tied to one machine?",
        answer:
          "Entitlements are tied to your registered email address, not to a specific machine.",
      },
    ],
  },
  {
    title: "Payments",
    items: [
      {
        question: "How do I purchase?",
        answer:
          "Sign up at dashboard.solarlayout.in to purchase a plan and get your licence key.",
      },
      {
        question: "What payment methods?",
        answer: "We accept major credit and debit cards via Stripe.",
      },
      {
        question: "Will I receive a receipt?",
        answer:
          "Yes, a confirmation email is sent after purchase.",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        question: "How do I contact support?",
        answer: "Email support@solarlayout.in or use the Contact page.",
      },
      {
        question: "What if the software crashes?",
        answer:
          "Contact support with your KMZ file and a description of the issue. We will investigate and respond within 2 business days.",
      },
    ],
  },
]

export function FaqAccordion() {
  return (
    <div className="space-y-10">
      {faqData.map((category) => (
        <section key={category.title}>
          <h2 className="mb-4 text-xl font-semibold tracking-tight text-foreground">
            {category.title}
          </h2>
          <Accordion type="multiple">
            {category.items.map((item) => (
              <AccordionItem key={item.question} value={item.question}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground">{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}
    </div>
  )
}
