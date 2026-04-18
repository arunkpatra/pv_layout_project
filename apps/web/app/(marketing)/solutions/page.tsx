import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import {
  BuildingsIcon,
  FactoryIcon,
  SolarPanelIcon,
  HardHatIcon,
  ArrowRightIcon,
  ChartLineUpIcon,
  LeafIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react/dist/ssr"

const solutions = [
  {
    icon: BuildingsIcon,
    title: "Commercial rooftop",
    tagline: "From feasibility to stamped drawings — in a single project.",
    description:
      "Commercial rooftop projects live and die on the details: setback rules, HVAC clearances, structural load limits, and competing tenant arrangements all constrain your design before a single panel is placed. SolarDesign's precision layout engine understands these constraints natively. Import a site plan, satellite image, or survey DXF, define your exclusion zones once, and the tool enforces them automatically — across every revision.",
    capabilities: [
      "Multi-pitch and mixed-orientation roof support in one project file",
      "Automatic setback and fire-path enforcement per local code profiles",
      "HVAC, skylight, and penetration obstacle modelling with shadow casting",
      "Structural zone overlays to flag areas exceeding allowable dead load",
      "One-click branded proposal with yield estimate, financials, and layout PDF",
    ],
  },
  {
    icon: FactoryIcon,
    title: "Industrial & warehouse",
    tagline: "Maximise density on large flat roofs without leaving yield on the table.",
    description:
      "Industrial rooftops offer scale, but flat-roof design is deceptively complex. Row spacing must balance inter-row shading losses against panel density. East-west configurations reduce structural loading and unlock higher capacity per square metre — but require careful string layout to avoid mismatch losses. SolarDesign models all of this simultaneously, so you can compare south-tilt, east-west, and hybrid configurations side by side before committing to a design.",
    capabilities: [
      "Inter-row shading optimisation with adjustable GCR and tilt angle",
      "East-west ballasted layout generator with automatic row pairing",
      "String-level mismatch analysis to inform inverter and optimiser selection",
      "Roof zone segmentation for phased installations across multiple tenancies",
      "Material take-off with racking, cabling, and inverter quantities",
    ],
  },
  {
    icon: SolarPanelIcon,
    title: "Ground-mount utility",
    tagline: "Design bankable utility-scale arrays from terrain data to IFC handover.",
    description:
      "Utility-scale ground-mount projects demand engineering rigour from the first layout sketch. Terrain slopes affect row spacing, pile depths, cable runs, and ultimately yield. Bifacial gains depend on ground albedo and row height. Tracker geometry changes shadow behaviour entirely. SolarDesign ingests terrain data directly, propagates slope corrections through the design, and produces the P50/P90 yield outputs and CAD-ready deliverables that lenders and EPC teams require.",
    capabilities: [
      "DTM/DSM terrain import with automatic slope correction across rows",
      "Fixed-tilt and single-axis tracker layout modes",
      "Bifacial yield modelling with albedo and rear-irradiance simulation",
      "Pile and post layout export for civil and structural engineering teams",
      "IFC and DXF export compatible with AutoCAD Civil 3D and Revit",
    ],
  },
  {
    icon: HardHatIcon,
    title: "EPC contractors",
    tagline: "One design file. Every deliverable your project needs.",
    description:
      "EPC teams are accountable for what gets built — which means every drawing, take-off, and specification must be traceable to the design. SolarDesign keeps all of that in one place. When the design changes — and it will — material quantities, installation drawings, and client proposals update automatically. No more manually reconciling the layout in one tool, the BoM in a spreadsheet, and the proposal in a slide deck.",
    capabilities: [
      "Automated bill of materials with panel, inverter, racking, and cable quantities",
      "Installation drawing package: string diagrams, mounting layouts, single-line",
      "Version history with change tracking across all project revisions",
      "Client proposal generation with configurable branding and financial inputs",
      "Role-based access so site teams, engineers, and clients see what they need",
    ],
  },
  {
    icon: ChartLineUpIcon,
    title: "Solar consultants",
    tagline: "Produce bankable yield reports and defensible feasibility studies at speed.",
    description:
      "Consulting work is won on credibility and lost on turnaround time. Your clients — whether project developers, lenders, or corporate sustainability teams — need yield estimates they can take to a bank and design options they can compare. SolarDesign's simulation engine uses TMY irradiance data, real panel degradation curves, and validated loss models to produce P50/P90 outputs that meet lender and insurer requirements — and you can run multiple scenarios in the time it used to take to set up one.",
    capabilities: [
      "TMY3 and Meteonorm irradiance data for 200,000+ global locations",
      "P50/P90 generation with configurable uncertainty stacking",
      "Side-by-side scenario comparison across orientation, technology, and capacity",
      "Shading loss breakdown by near and far horizon obstructions",
      "Exportable simulation logs for third-party review and due diligence",
    ],
  },
  {
    icon: LeafIcon,
    title: "Renewable energy developers",
    tagline: "Manage your entire project pipeline — from site selection to financial close.",
    description:
      "Developers operate across dozens of sites simultaneously, each at a different stage of the development cycle. Early-stage sites need quick feasibility layouts to inform land negotiations. Mid-stage sites need detailed designs for grid connection applications. Late-stage sites need investor-grade documentation packages. SolarDesign scales with your pipeline — fast sketch tools for early stage, full simulation and CAD export for late stage, and a shared workspace that keeps your whole team and all your sites in sync.",
    capabilities: [
      "Portfolio dashboard with project status, capacity, and yield across all sites",
      "Rapid feasibility mode: area-based capacity estimate in under two minutes",
      "Grid connection report templates formatted for DNO and TSO submissions",
      "Investor documentation package: yield report, layout drawings, BoM, financials",
      "Multi-team access control with audit log for all project activity",
    ],
  },
]

export default function SolutionsPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          Built for every part of the solar industry
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Whether you design one rooftop a week or manage a portfolio of
          utility-scale sites, SolarDesign adapts to your workflow.
        </p>
      </section>

      {/* Solutions */}
      <section className="mx-auto w-full max-w-4xl divide-y px-6 pb-20">
        {solutions.map((solution) => (
          <div key={solution.title} className="py-14">
            <div className="flex items-start gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <solution.icon
                  weight="duotone"
                  className="h-6 w-6 text-primary"
                />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {solution.title}
                </h2>
                <p className="mt-0.5 text-sm font-medium text-primary">
                  {solution.tagline}
                </p>
              </div>
            </div>

            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              {solution.description}
            </p>

            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {solution.capabilities.map((cap) => (
                <li key={cap} className="flex items-start gap-2 text-sm">
                  <CheckCircleIcon
                    weight="regular"
                    className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
                  />
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="border-t px-6 py-16 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Not sure which solution fits?
        </h2>
        <p className="mb-6 text-muted-foreground">
          Talk to our team — we&apos;ll help you find the right setup.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link href="/dashboard">
              Start free
              <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/about">Talk to us</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
