import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@renewable-energy/ui/components/card"
import { CheckIcon, ArrowRightIcon, StarIcon, MinusIcon } from "@phosphor-icons/react/dist/ssr"
import { cn } from "@renewable-energy/ui/lib/utils"

const tiers = [
  {
    name: "Starter",
    price: "Free",
    period: null,
    description:
      "Import site boundaries, run basic layouts, and evaluate the platform on real projects. No time limit. No credit card.",
    cta: "Create a free account",
    href: "/dashboard",
    highlight: false,
    entitlements: [
      "1 user",
      "Up to 3 active projects",
      "KMZ / KML site boundary import",
      "Shadow-free area calculation",
      "Basic DC layout editor (fixed tilt)",
      "Preliminary capacity estimate",
      "Community support",
    ],
  },
  {
    name: "Professional",
    price: "₹1,50,000",
    period: "per user / year · billed annually · ex-GST",
    description:
      "Unlocks the full pre-bid to DPR workflow — simulation, SLD, cable schedule, ALMM library, and lender-ready exports.",
    cta: "Upgrade to Professional",
    href: "/dashboard",
    highlight: true,
    badge: "Most popular",
    entitlements: [
      "Up to 10 users",
      "Unlimited projects",
      "CUF and P50/P75/P90 yield simulation",
      "TMY data: Meteonorm, NASA POWER, Solargis",
      "DC layout: fixed tilt and single-axis tracker",
      "AC yard design and evacuation line",
      "DISCOM-compliant SLD auto-generation",
      "IS 732 / IS 1255 cable schedule",
      "ALMM-compliant module and inverter library",
      "BoM and BoQ auto-generation",
      "Lender-ready DPR export (IREDA / PFC format)",
      "Multi-scenario comparison",
      "Cloud collaboration and version history",
      "Email and chat support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: null,
    description:
      "For large IPPs and EPC organisations with multi-team access, data residency, and compliance requirements.",
    cta: "Talk to us",
    href: "/about",
    highlight: false,
    entitlements: [
      "Unlimited users",
      "Unlimited projects",
      "All Professional features",
      "SSO via SAML 2.0",
      "Role-based access control",
      "Audit logs for all project activity",
      "Private cloud / on-premise deployment",
      "Custom ALMM and DISCOM format integrations",
      "SLA guarantee",
      "Dedicated customer success manager",
      "INR invoicing with GST compliance",
    ],
  },
]

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          Three plans. No hidden charges.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          The free plan lets you evaluate the platform on real projects with no
          time limit. Professional unlocks simulation, SLD generation, ALMM
          compliance, and lender-ready exports. All plans invoiced in INR.
        </p>
      </section>

      {/* Founding customer banner */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-10">
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4">
          <StarIcon
            weight="duotone"
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
          />
          <div>
            <p className="text-sm font-semibold">
              Founding customer programme — beta pricing
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Professional plan at{" "}
              <span className="font-medium text-foreground">
                ₹75,000/user/year
              </span>{" "}
              (50% off list) for the first cohort of customers. 12-month
              lock-in. Includes direct access to the product team and input
              into the roadmap.{" "}
              <Link href="/about" className="underline underline-offset-2 hover:text-foreground">
                Contact us to apply.
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Tiers */}
      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-20 md:grid-cols-3">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={cn(
              "flex flex-col",
              tier.highlight && "relative ring-2 ring-primary",
            )}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{tier.name}</CardTitle>
                {tier.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {tier.badge}
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-3xl font-bold">{tier.price}</span>
                {tier.period && (
                  <span className="text-xs leading-snug text-muted-foreground">
                    {tier.period}
                  </span>
                )}
              </div>
              <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="flex flex-col gap-2">
                {tier.entitlements.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs">
                    <CheckIcon
                      weight="bold"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                asChild
                className="w-full"
                variant={tier.highlight ? "default" : "outline"}
              >
                <Link href={tier.href}>
                  {tier.cta}
                  <ArrowRightIcon className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </section>

      {/* Context */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-20">
        <h2 className="mb-6 text-xl font-bold tracking-tight">
          How Professional pricing compares
        </h2>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium">Tool</th>
                <th className="px-4 py-3 text-left font-medium">
                  Cost / user / year
                </th>
                <th className="px-4 py-3 text-left font-medium">Covers</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-4 py-3 text-muted-foreground">PVsyst 8</td>
                <td className="px-4 py-3 text-muted-foreground">
                  ~₹67,000
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  Yield simulation only
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-muted-foreground">
                  AutoCAD (full)
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  ~₹1,21,000
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  Drafting only — no solar intelligence
                </td>
              </tr>
              <tr className="bg-muted/20">
                <td className="px-4 py-3 font-medium text-muted-foreground">
                  PVsyst + AutoCAD + Excel
                </td>
                <td className="px-4 py-3 font-medium text-muted-foreground">
                  ~₹2,00,000+
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  Fragmented — no data linkage between tools
                </td>
              </tr>
              <tr className="bg-primary/5">
                <td className="px-4 py-3 font-semibold">
                  SolarDesign Professional
                </td>
                <td className="px-4 py-3 font-semibold">₹1,50,000</td>
                <td className="px-4 py-3 text-muted-foreground">
                  Full pre-bid to DPR — KMZ, simulation, layout, SLD, cable
                  schedule, ALMM, BoM, DPR
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Feature comparison table */}
      <section className="mx-auto w-full max-w-4xl px-6 pb-20">
        <h2 className="mb-8 text-2xl font-bold tracking-tight">
          Feature comparison
        </h2>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium">Feature</th>
                <th className="px-4 py-3 text-center font-medium">Free</th>
                <th className="px-4 py-3 text-center font-medium">Professional</th>
                <th className="px-4 py-3 text-center font-medium">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                { group: "Site Input" },
                { feature: "KMZ / KML site boundary import", free: true, pro: true, ent: true },
                { feature: "Shadow-free area calculation", free: true, pro: true, ent: true },
                { feature: "Preliminary capacity estimate (MW DC/AC)", free: true, pro: true, ent: true },
                { feature: "Terrain / DEM import and slope analysis", free: false, pro: true, ent: true },
                { feature: "DXF boundary import", free: false, pro: true, ent: true },
                { group: "DC Layout" },
                { feature: "Basic layout editor — fixed tilt (manual)", free: true, pro: true, ent: true },
                { feature: "Auto-layout generation — fixed tilt", free: false, pro: true, ent: true },
                { feature: "Single-axis tracker layout", free: false, pro: true, ent: true },
                { feature: "Inter-row pitch / GCR optimisation", free: false, pro: true, ent: true },
                { feature: "Bifacial module support", free: false, pro: true, ent: true },
                { feature: "Stringing schedule and combiner layout", free: false, pro: true, ent: true },
                { group: "AC Yard Design" },
                { feature: "IVT placement and AC yard layout", free: false, pro: true, ent: true },
                { feature: "Main step-up transformer sizing (33–220 kV)", free: false, pro: true, ent: true },
                { feature: "Evacuation line routing", free: false, pro: true, ent: true },
                { group: "Simulation" },
                { feature: "CUF (Capacity Utilisation Factor)", free: false, pro: true, ent: true },
                { feature: "P50 / P75 / P90 annual yield", free: false, pro: true, ent: true },
                { feature: "PR (Performance Ratio) and loss breakdown", free: false, pro: true, ent: true },
                { feature: "TMY data — Meteonorm, NASA POWER, Solargis", free: false, pro: true, ent: true },
                { feature: "Near / far horizon and inter-row shading", free: false, pro: true, ent: true },
                { feature: "Multi-scenario comparison", free: false, pro: true, ent: true },
                { group: "Electrical Design" },
                { feature: "DISCOM-compliant SLD (DC and AC)", free: false, pro: true, ent: true },
                { feature: "IS 732 / IS 1255 cable schedule", free: false, pro: true, ent: true },
                { feature: "ALMM-compliant module and inverter library", free: false, pro: true, ent: true },
                { group: "Outputs and Exports" },
                { feature: "BoM (Bill of Materials) — auto-generated", free: false, pro: true, ent: true },
                { feature: "BoQ (Bill of Quantities) — civil works", free: false, pro: true, ent: true },
                { feature: "Pre-bid feasibility package export", free: false, pro: true, ent: true },
                { feature: "Lender-ready DPR export (IREDA / PFC format)", free: false, pro: true, ent: true },
                { feature: "DXF and IFC export", free: false, pro: true, ent: true },
                { group: "Collaboration" },
                { feature: "Users", free: "1", pro: "Up to 10", ent: "Unlimited" },
                { feature: "Active projects", free: "3", pro: "Unlimited", ent: "Unlimited" },
                { feature: "Version history", free: false, pro: true, ent: true },
                { feature: "Role-based access control", free: false, pro: true, ent: true },
                { feature: "Advanced RBAC (custom roles)", free: false, pro: false, ent: true },
                { group: "Security" },
                { feature: "SSO via SAML 2.0", free: false, pro: false, ent: true },
                { feature: "Audit logs", free: false, pro: false, ent: true },
                { feature: "Private cloud / on-premise deployment", free: false, pro: false, ent: true },
                { feature: "Custom ALMM and DISCOM format integrations", free: false, pro: false, ent: true },
                { group: "Support" },
                { feature: "Community forum", free: true, pro: true, ent: true },
                { feature: "Email and chat support", free: false, pro: true, ent: true },
                { feature: "Dedicated customer success manager", free: false, pro: false, ent: true },
                { feature: "INR invoicing with GST compliance", free: true, pro: true, ent: true },
              ].map((row, i) => {
                if ("group" in row) {
                  return (
                    <tr key={i} className="bg-muted/30">
                      <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {row.group}
                      </td>
                    </tr>
                  )
                }
                const cell = (val: boolean | string) => {
                  if (typeof val === "string") {
                    return <span className="text-xs font-medium">{val}</span>
                  }
                  return val ? (
                    <CheckIcon weight="bold" className="mx-auto h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <MinusIcon weight="bold" className="mx-auto h-4 w-4 text-muted-foreground/40" />
                  )
                }
                return (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">{row.feature}</td>
                    <td className="px-4 py-2.5 text-center">{cell(row.free)}</td>
                    <td className="px-4 py-2.5 text-center">{cell(row.pro)}</td>
                    <td className="px-4 py-2.5 text-center">{cell(row.ent)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ nudge */}
      <section className="border-t px-6 py-16 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Questions about pricing?
        </h2>
        <p className="mb-6 text-muted-foreground">
          Start on the free plan — no time limit, no credit card. Upgrade to
          Professional when you need simulation, SLD, ALMM, and DPR export.
          GST invoice issued on activation.
        </p>
        <Button variant="outline" asChild>
          <Link href="/about">Talk to us</Link>
        </Button>
      </section>
    </>
  )
}
