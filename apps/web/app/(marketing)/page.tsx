import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Separator } from "@renewable-energy/ui/components/separator"
import {
  SolarPanelIcon,
  ChartLineUpIcon,
  ArrowRightIcon,
  LightningIcon,
  FileTextIcon,
  MapPinIcon,
  TreeStructureIcon,
  StackIcon,
  CheckIcon,
  UsersThreeIcon,
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
          From KMZ to DPR.
          <br />
          <span className="text-muted-foreground">
            Utility-scale solar design for India.
          </span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          SolarDesign covers the full pre-bid to DPR workflow for greenfield
          solar projects — KMZ import, shadow-free area calculation, DC/AC
          layout, CUF and P50/P90 simulation, SLD generation, and lender-ready
          report export. Built for design engineers and EPC teams working on
          10 MW to 500 MW projects in India.
        </p>
        <div className="flex items-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Create a free account
              <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/solutions">View solutions</Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* Workflow */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mb-10">
          <h2 className="text-2xl font-bold tracking-tight">
            The pre-bid to DPR pipeline
          </h2>
          <p className="mt-2 text-muted-foreground">
            BD teams need a capacity estimate and CUF within 24–48 hours of
            receiving a site KMZ. SolarDesign compresses that cycle.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              step: "01",
              title: "KMZ import and site boundary",
              description:
                "Import the KMZ file from your land or BD team. SolarDesign reads the site boundary, exclusion zones, and terrain. No manual coordinate re-entry.",
            },
            {
              step: "02",
              title: "Shadow-free area and capacity estimate",
              description:
                "Automated shadow-free area calculation from the KMZ boundary and terrain data. Outputs net usable area, estimated MW DC/AC, and indicative CUF — ready for the BD team.",
            },
            {
              step: "03",
              title: "CUF and P50/P90 yield simulation",
              description:
                "Energy simulation using TMY irradiance data. Produces CUF, P50/P75/P90 annual yield, PR, and loss breakdown in a format accepted by IREDA, PFC, and commercial bank technical advisors.",
            },
            {
              step: "04",
              title: "DC and AC layout",
              description:
                "Module row layout within the KMZ boundary — fixed tilt or single-axis tracker, inter-row pitch for target GCR, string layout, IVT placement, and AC yard design.",
            },
            {
              step: "05",
              title: "SLD and cable schedule",
              description:
                "Auto-generated Single Line Diagram in DISCOM-compliant format. DC and AC cable schedules sized to IS 732 / IS 1255. No manual AutoCAD drafting.",
            },
            {
              step: "06",
              title: "BoM, BoQ, and DPR export",
              description:
                "Bill of Materials and Bill of Quantities generated directly from the design. Full DPR export — site data, simulation, drawings, BoM — in lender-ready format.",
            },
          ].map((step) => (
            <div key={step.step} className="flex flex-col gap-3">
              <span className="text-xs font-mono font-semibold text-primary">
                {step.step}
              </span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Who uses it */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Built for utility-scale solar teams
            </h2>
            <p className="mt-2 text-muted-foreground">
              IPPs, EPC contractors, and solar consultants working on greenfield
              projects from 10 MW to 500 MW.
            </p>
          </div>
          <Link
            href="/solutions"
            className="hidden shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
          >
            View all solutions
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              icon: SolarPanelIcon,
              title: "Design engineers",
              description:
                "Replaces the PVsyst + AutoCAD + Excel workflow with a single tool. KMZ in, DPR out — without re-entering data between tools or maintaining parallel spreadsheets.",
            },
            {
              icon: UsersThreeIcon,
              title: "EPC contractors",
              description:
                "Produce DISCOM-compliant SLDs, IS-standard cable schedules, and ALMM-compliant BoMs from the same design file. Design changes update all documents automatically.",
            },
            {
              icon: ChartLineUpIcon,
              title: "Solar consultants",
              description:
                "Run multi-scenario comparisons — fixed tilt vs. tracker, string vs. central inverter, varying DC:AC ratios — and export P50/P90 reports for lender technical due diligence.",
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
              View all solutions
              <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* Core capabilities */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Core design and analysis capabilities
            </h2>
            <p className="mt-2 text-muted-foreground">
              All tools required for the pre-bid to DPR workflow in one
              platform.
            </p>
          </div>
          <Link
            href="/features"
            className="hidden shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
          >
            View all features
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {[
            {
              icon: MapPinIcon,
              title: "KMZ / KML site import",
              description:
                "Import KMZ files directly. Site boundary, exclusion zones, and terrain data are read automatically. Shadow-free usable area is calculated without manual input.",
            },
            {
              icon: ChartLineUpIcon,
              title: "CUF and yield simulation",
              description:
                "Energy simulation with TMY irradiance data. CUF, P50/P75/P90, PR, and full loss breakdown. Supports Meteonorm, NASA POWER, and Solargis data sources. Output meets IREDA and PFC technical advisor standards.",
            },
            {
              icon: TreeStructureIcon,
              title: "DC layout and stringing",
              description:
                "Module row layout for fixed tilt and single-axis tracker configurations. Automated inter-row pitch calculation for target GCR. Stringing schedule and combiner layout generated from the same design.",
            },
            {
              icon: FileTextIcon,
              title: "SLD generation",
              description:
                "Single Line Diagram auto-generated from the DC and AC design. DISCOM-compliant format for grid connectivity application. No AutoCAD drafting required.",
            },
            {
              icon: StackIcon,
              title: "ALMM-compliant equipment library",
              description:
                "Module and inverter selection from an MNRE ALMM-listed library. The library is updated as the ALMM list changes. Non-listed equipment is flagged before it reaches a bid submission.",
            },
            {
              icon: SolarPanelIcon,
              title: "BoM, BoQ, and DPR export",
              description:
                "Bill of Materials and Bill of Quantities update automatically when the design changes. DPR export compiles site data, simulation, layout drawings, and schedules in lender-accepted format.",
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
              View all features
              <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </section>

      <Separator />

      {/* Compliance */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mb-10">
          <h2 className="text-2xl font-bold tracking-tight">
            India regulatory compliance
          </h2>
          <p className="mt-2 text-muted-foreground">
            Design outputs are aligned with the regulatory requirements that
            apply to utility-scale solar projects in India.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "MNRE ALMM-compliant module and inverter library",
            "DISCOM-compliant SLD format for grid connectivity application",
            "IS 732 / IS 1255 cable sizing for CEIG inspection",
            "P50/P90 simulation output for IREDA, PFC, and lender technical advisors",
            "CEA Regulations 2024 design standards",
            "DPR format for SECI and state DISCOM project submissions",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2 text-sm">
              <CheckIcon
                weight="bold"
                className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
              />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Pricing teaser */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Three plans. No hidden charges.
            </h2>
            <p className="mt-2 text-muted-foreground">
              Free to start. Paid plans add simulation, collaboration, and
              export capabilities.
            </p>
          </div>
          <Link
            href="/pricing"
            className="hidden shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
          >
            View full pricing
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
              perks: ["1 user", "Up to 3 active projects", "Basic layout editor"],
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
                "CUF and P50/P90 simulation",
              ],
            },
            {
              name: "Enterprise",
              price: "Custom",
              period: null,
              highlight: false,
              perks: [
                "Unlimited users",
                "SSO and audit logs",
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
                <Link href="/pricing">View full plan</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* About */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight">
              About SolarDesign
            </h2>
            <p className="mt-3 text-muted-foreground">
              SolarDesign was built by solar practitioners and engineers who
              have worked on EPC projects, yield consulting, and grid connection
              submissions. The platform is designed for the Indian utility-scale
              market and is used across greenfield projects from 10 MW to
              500 MW.
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
          Start with a free account
        </h2>
        <p className="max-w-md text-muted-foreground">
          No credit card required. Free plan includes up to 3 active projects
          and basic layout editing.
        </p>
        <div className="flex items-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Create a free account
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
