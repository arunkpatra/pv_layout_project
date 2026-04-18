import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import {
  ArrowRightIcon,
  CheckCircleIcon,
  SolarPanelIcon,
  HardHatIcon,
  ChartLineUpIcon,
  BuildingsIcon,
  LeafIcon,
} from "@phosphor-icons/react/dist/ssr"

const solutions = [
  {
    icon: LeafIcon,
    title: "Independent Power Producers (IPPs) and developers",
    tagline:
      "Manage the full project pipeline — from site KMZ to grid connectivity application.",
    description:
      "IPPs and solar developers in India work simultaneously across multiple sites at different stages of the development cycle. Early-stage sites need a quick capacity and CUF estimate to support land negotiations and bid decisions. Mid-stage sites need a detailed DC/AC layout and P50/P90 simulation for grid connectivity applications. Late-stage sites need a complete DPR for lender financing — IREDA, PFC, SBI Cap, and Axis Bank each have specific format expectations. SolarDesign covers all three stages without switching tools.",
    capabilities: [
      "KMZ import → shadow-free area → capacity estimate in one step",
      "CUF and P50/P75/P90 yield simulation for PPA obligation sizing",
      "Multi-scenario comparison: fixed tilt vs. single-axis tracker, varying DC:AC ratios",
      "DPR export in lender-accepted format (IREDA, PFC, commercial banks)",
      "Portfolio-level project management with version history across all sites",
      "SECI and state DISCOM submission-ready document packages",
    ],
  },
  {
    icon: HardHatIcon,
    title: "EPC contractors",
    tagline:
      "One design file. Every statutory and contractual document your project requires.",
    description:
      "EPC contractors are accountable for what gets built, which means every drawing, cable schedule, and BoM must be traceable to the design. The standard India workflow — PVsyst for simulation, AutoCAD for layout and SLD, Excel for cable schedules and BoM — has no data linkage. Any layout change requires manual updates across all three tools, and inconsistencies between them are a common source of site rework and CEIG inspection failures. SolarDesign keeps the design and all its derived documents in one place. When the layout changes, the SLD, cable schedule, and BoM update automatically.",
    capabilities: [
      "DC and AC layout in the same project file as the simulation",
      "DISCOM-compliant SLD auto-generated from the design — no AutoCAD drafting",
      "DC and AC cable schedules sized to IS 732 / IS 1255 for CEIG inspection",
      "ALMM-compliant module and inverter library — non-listed equipment is flagged",
      "BoM and BoQ update automatically when the layout changes",
      "Role-based access for civil, electrical, and project management teams",
    ],
  },
  {
    icon: ChartLineUpIcon,
    title: "Solar consultants and DPR engineers",
    tagline:
      "Produce bankable P50/P90 reports and defensible feasibility studies.",
    description:
      "Solar consultants and independent DPR engineers are hired by developers and lenders to provide an objective assessment of a project's yield and design quality. Their outputs — P50/P75/P90 simulation, shading analysis, PR, loss breakdown — are the documents that IREDA, PFC, and international lenders use to sanction debt financing. The simulation methodology must be documented and defensible. Consultants also need to run multiple design scenarios quickly, as clients routinely ask to compare fixed tilt vs. single-axis tracker, different module wattage, and varying DC:AC ratios before committing to a design.",
    capabilities: [
      "P50/P75/P90 yield simulation with documented TMY methodology",
      "CUF, PR, and full loss breakdown in lender-accepted format",
      "Multi-scenario comparison across tilt type, inverter type, and DC:AC ratio",
      "Irradiance data from Meteonorm, NASA POWER, and Solargis",
      "Shading analysis: near horizon, far horizon, and inter-row",
      "Simulation report export formatted for IREDA, PFC, and international lender review",
    ],
  },
  {
    icon: SolarPanelIcon,
    title: "Ground-mount utility-scale projects",
    tagline:
      "Design from terrain data through evacuation line — for projects from 10 MW to 500 MW.",
    description:
      "Utility-scale ground-mount projects in India span 10 MW open access installations to 500 MW+ SECI park allocations. The project boundary arrives as a KMZ from the land team. Within it, design engineers must calculate usable shadow-free area, determine optimal row orientation (fixed tilt or single-axis tracker), size the DC and AC electrical systems, and identify the evacuation route to the nearest DISCOM or PGCIL substation. Each of these steps feeds the BD team's bid submission and the lender's DPR. SolarDesign handles the complete workflow from KMZ intake to DPR export.",
    capabilities: [
      "KMZ boundary import with terrain and slope analysis",
      "Shadow-free area calculation for net usable land",
      "Fixed-tilt and single-axis tracker layout modes",
      "Bifacial yield modelling with rear-irradiance and albedo inputs",
      "Evacuation line routing and voltage level selection (33/66/132/220 kV)",
      "IFC and DXF export for structural and civil engineering teams",
    ],
  },
  {
    icon: BuildingsIcon,
    title: "Large C&I and open access projects",
    tagline:
      "Design, simulate, and produce the documentation package for 1 MW to 50 MW installations.",
    description:
      "Large industrial and commercial consumers in India — manufacturing plants, steel mills, cement plants, data centres — are increasingly commissioning captive solar plants (CPP) under the open access framework to reduce power purchase costs and meet RPO/RCO obligations. These projects (1–50 MW) sit below utility-scale in size but share many of the same design requirements: yield simulation for PPA or CPP structuring, SLD for DISCOM connectivity approval, and IS-compliant cable sizing for CEIG inspection. SolarDesign covers this segment without requiring a utility-scale licence.",
    capabilities: [
      "Yield simulation and CUF estimate for CPP and open access structuring",
      "SLD for DISCOM grid connectivity application",
      "IS 732 / IS 1255 cable schedule for CEIG inspection",
      "BoM for procurement and EPC contracting",
      "RPO / RCO compliance documentation",
      "Rooftop and ground-mount layout support",
    ],
  },
]

export default function SolutionsPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          Designed for India&apos;s utility-scale solar sector
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          SolarDesign is built for IPPs, EPC contractors, and solar consultants
          working on greenfield projects from 10 MW to 500 MW. The tool covers
          the full pre-bid to DPR workflow — in the regulatory and compliance
          context that Indian projects require.
        </p>
      </section>

      {/* Solutions */}
      <section className="mx-auto w-full max-w-4xl divide-y px-6 pb-20">
        {solutions.map((solution) => (
          <div key={solution.title} className="py-14">
            <div className="flex items-start gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-primary/10">
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
          Not sure which solution fits your workflow?
        </h2>
        <p className="mb-6 text-muted-foreground">
          Talk to our team. We have worked on EPC projects, yield consulting,
          and grid connection submissions.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link href="/dashboard">
              Create a free account
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
