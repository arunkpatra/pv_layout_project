import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Separator } from "@renewable-energy/ui/components/separator"
import {
  SolarPanelIcon,
  ChartLineUpIcon,
  BuildingsIcon,
  ArrowRightIcon,
  LightningIcon,
  FactoryIcon,
  MagnifyingGlassIcon,
  FileTextIcon,
  BookOpenIcon,
  VideoIcon,
  ChatCircleIcon,
  CheckIcon,
} from "@phosphor-icons/react/dist/ssr"

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <Badge variant="secondary" className="gap-1.5">
          <LightningIcon weight="fill" className="h-3 w-3" />
          Now in beta
        </Badge>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight">
          Design solar panel layouts
          <br />
          <span className="text-muted-foreground">in minutes, not days.</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          The professional tool for renewable energy companies to plan, design,
          and optimise commercial solar installations — faster and with fewer
          errors.
        </p>
        <div className="flex items-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Get started free
              <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/solutions">See solutions</Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* Solutions */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Built for every part of the solar industry
            </h2>
            <p className="mt-2 text-muted-foreground">
              From single rooftops to utility-scale portfolios — SolarDesign
              fits your workflow.
            </p>
          </div>
          <Link
            href="/solutions"
            className="hidden shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
          >
            See all solutions
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              icon: BuildingsIcon,
              title: "Commercial rooftop",
              description:
                "Handle complex roof geometries, HVAC obstructions, and multi-orientation layouts. Automatic setback enforcement keeps every design code-compliant.",
            },
            {
              icon: FactoryIcon,
              title: "Industrial & warehouse",
              description:
                "Maximise panel density on large flat roofs. Compare south-tilt and east-west configurations side by side with full shading and yield analysis.",
            },
            {
              icon: SolarPanelIcon,
              title: "Ground-mount utility",
              description:
                "Ingest terrain data, model bifacial gains, and produce the P50/P90 yield reports and IFC exports that lenders and EPC teams require.",
            },
          ].map((s) => (
            <div key={s.title} className="flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <s.icon weight="duotone" className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 md:hidden">
          <Button variant="outline" asChild size="sm">
            <Link href="/solutions">
              See all solutions
              <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* Features */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Everything you need — nothing you don&apos;t
            </h2>
            <p className="mt-2 text-muted-foreground">
              Precision tools for design, analysis, collaboration, and delivery.
            </p>
          </div>
          <Link
            href="/features"
            className="hidden shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
          >
            See all features
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {[
            {
              icon: SolarPanelIcon,
              title: "Precision layout editor",
              description:
                "Drag-and-drop panel placement on imported site plans with snap-to-grid alignment. Supports complex multi-pitch roofs, obstacles, exclusion zones, and DXF, PDF, and satellite imagery imports.",
            },
            {
              icon: ChartLineUpIcon,
              title: "Yield modelling & simulation",
              description:
                "Real-time energy yield estimates based on location, tilt, orientation, and shading. Hourly, monthly, and annual production forecasts with P50/P90 outputs — ready for bankable reports.",
            },
            {
              icon: MagnifyingGlassIcon,
              title: "Shading & irradiance analysis",
              description:
                "3D horizon shading from surrounding structures and terrain. Per-panel irradiance heatmaps at any time of year. String-level mismatch analysis to guide inverter and optimiser selection.",
            },
            {
              icon: FileTextIcon,
              title: "Professional report generation",
              description:
                "One-click export of client-ready PDF proposals, material take-offs, and installation drawings. Branded templates, live proposal links — no download required for your clients.",
            },
          ].map((f) => (
            <div key={f.title} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <f.icon weight="duotone" className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 md:hidden">
          <Button variant="outline" asChild size="sm">
            <Link href="/features">
              See all features
              <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* Pricing teaser */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-2 text-muted-foreground">
              Start free. Scale as your team grows. No hidden fees.
            </p>
          </div>
          <Link
            href="/pricing"
            className="hidden shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
          >
            See full pricing
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              name: "Starter",
              price: "Free",
              period: null,
              highlight: false,
              perks: ["1 user", "Up to 3 projects", "Basic layout editor"],
            },
            {
              name: "Professional",
              price: "$49",
              period: "per user / month",
              highlight: true,
              badge: "Most popular",
              perks: [
                "Up to 10 users",
                "Unlimited projects",
                "Yield modelling & simulation",
              ],
            },
            {
              name: "Enterprise",
              price: "Custom",
              period: null,
              highlight: false,
              perks: [
                "Unlimited users",
                "SSO & audit logs",
                "Private cloud deployment",
              ],
            },
          ].map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl border p-6 ${tier.highlight ? "ring-2 ring-primary" : ""}`}
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-semibold">{tier.name}</span>
                {tier.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {tier.badge}
                  </Badge>
                )}
              </div>
              <div className="mb-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{tier.price}</span>
                {tier.period && (
                  <span className="text-xs text-muted-foreground">
                    {tier.period}
                  </span>
                )}
              </div>
              <ul className="mb-6 flex flex-col gap-2">
                {tier.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2 text-sm">
                    <CheckIcon
                      weight="bold"
                      className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
                    />
                    <span className="text-muted-foreground">{perk}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                size="sm"
                variant={tier.highlight ? "default" : "outline"}
                className="w-full"
              >
                <Link href="/pricing">See full plan</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Resources */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Learn and get support
            </h2>
            <p className="mt-2 text-muted-foreground">
              Guides, tutorials, and community to help you move faster.
            </p>
          </div>
          <Link
            href="/resources"
            className="hidden shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
          >
            Browse resources
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              icon: BookOpenIcon,
              title: "Getting started guide",
              description:
                "Set up your first project in minutes. Step-by-step walkthrough from site import to layout export.",
            },
            {
              icon: VideoIcon,
              title: "Video tutorials",
              description:
                "Watch real-world workflows — layout editing, yield simulation, shading analysis, and report generation.",
            },
            {
              icon: ChatCircleIcon,
              title: "Community forum",
              description:
                "Ask questions and share designs with thousands of solar practitioners. Monitored daily by our team.",
            },
          ].map((r) => (
            <div key={r.title} className="flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <r.icon weight="duotone" className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{r.title}</h3>
              <p className="text-sm text-muted-foreground">{r.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 md:hidden">
          <Button variant="outline" asChild size="sm">
            <Link href="/resources">
              Browse resources
              <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* About */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight">
              We&apos;re on a mission to accelerate the solar industry
            </h2>
            <p className="mt-3 text-muted-foreground">
              Founded in 2022 by solar practitioners and engineers, SolarDesign
              is used across 40+ countries to design, analyse, and deliver
              commercial and utility-scale projects. We build tools that put
              more renewable energy in the ground — faster.
            </p>
          </div>
          <Button variant="outline" asChild className="shrink-0">
            <Link href="/about">
              Meet the team
              <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* Final CTA */}
      <section className="flex flex-col items-center gap-4 px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Ready to modernise your workflow?
        </h2>
        <p className="max-w-md text-muted-foreground">
          Join renewable energy teams already using SolarDesign. Free to start
          — no credit card required.
        </p>
        <div className="flex items-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Start designing free
              <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
