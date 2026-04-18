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
import { CheckIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import { cn } from "@renewable-energy/ui/lib/utils"

const tiers = [
  {
    name: "Starter",
    price: "Free",
    period: null,
    description: "For individual designers getting started with solar layout.",
    cta: "Get started free",
    href: "/dashboard",
    highlight: false,
    entitlements: [
      "1 user",
      "Up to 3 active projects",
      "Basic layout editor",
      "Satellite imagery import",
      "PDF report export",
      "Community support",
    ],
  },
  {
    name: "Professional",
    price: "$49",
    period: "per user / month",
    description:
      "For growing teams that need full design, analysis, and collaboration tools.",
    cta: "Start free trial",
    href: "/dashboard",
    highlight: true,
    badge: "Most popular",
    entitlements: [
      "Up to 10 users",
      "Unlimited projects",
      "Precision layout editor",
      "Yield modelling & simulation",
      "Shading & irradiance analysis",
      "Auto-layout optimisation",
      "CAD & BIM export (DXF, IFC)",
      "Branded proposal reports",
      "Version history",
      "Email & chat support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: null,
    description:
      "For large organisations with advanced security and deployment needs.",
    cta: "Contact sales",
    href: "/#about",
    highlight: false,
    entitlements: [
      "Unlimited users",
      "Unlimited projects",
      "All Professional features",
      "SSO via SAML 2.0",
      "Role-based access control",
      "Audit logs",
      "Private cloud deployment",
      "SLA guarantee",
      "Dedicated customer success",
      "Custom integrations",
    ],
  },
]

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          Simple, transparent pricing
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Start free. Scale as your team grows. No hidden fees.
        </p>
      </section>

      {/* Tiers */}
      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-20 md:grid-cols-3">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={cn(
              tier.highlight &&
                "ring-2 ring-primary relative",
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
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{tier.price}</span>
                {tier.period && (
                  <span className="text-xs text-muted-foreground">
                    {tier.period}
                  </span>
                )}
              </div>
              <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {tier.entitlements.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs">
                    <CheckIcon
                      weight="bold"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
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

      {/* FAQ nudge */}
      <section className="border-t px-6 py-16 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Questions about pricing?
        </h2>
        <p className="mb-6 text-muted-foreground">
          All plans include a 14-day free trial. No credit card required to
          start.
        </p>
        <Button variant="outline" asChild>
          <Link href="/about">Talk to us</Link>
        </Button>
      </section>
    </>
  )
}
