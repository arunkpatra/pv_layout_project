import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@renewable-energy/ui/components/card"
import {
  MapPinIcon,
  ChartLineUpIcon,
  SolarPanelIcon,
  FileTextIcon,
  ArrowRightIcon,
  StackIcon,
  TreeStructureIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
  ArrowsClockwiseIcon,
} from "@phosphor-icons/react/dist/ssr"

const features = [
  {
    icon: MapPinIcon,
    badge: "Site Input",
    title: "KMZ / KML site import",
    description:
      "Import the KMZ or KML file from your land or BD team directly into SolarDesign. The site boundary, exclusion zones (roads, water bodies, transmission corridors, forest patches), and terrain data are read automatically. Shadow-free usable area is calculated from the boundary and terrain without manual input. No coordinate re-entry into PVsyst or AutoCAD.",
  },
  {
    icon: ChartLineUpIcon,
    badge: "Simulation",
    title: "CUF and P50/P75/P90 yield simulation",
    description:
      "Energy simulation using TMY irradiance data from Meteonorm, NASA POWER, or Solargis. Outputs CUF (Capacity Utilisation Factor), P50/P75/P90 annual yield, PR (Performance Ratio), and a full loss breakdown — soiling, wiring, inverter, transformer, availability. The simulation methodology is documented for lender technical advisor review. Output meets the standards expected by IREDA, PFC, SBI Cap, and Axis Bank.",
  },
  {
    icon: SolarPanelIcon,
    badge: "Layout",
    title: "DC layout and stringing",
    description:
      "Module row layout within the KMZ site boundary. Fixed-tilt and single-axis tracker configurations. Automated inter-row pitch calculation for a target GCR, with inter-row shading loss feedback. Stringing schedule generated from the layout — modules per string, strings per inverter, combiner box placement. Bifacial yield modelling with rear-irradiance and ground albedo inputs. DC:AC ratio analysis with clipping loss calculation.",
  },
  {
    icon: SolarPanelIcon,
    badge: "Layout",
    title: "AC yard design",
    description:
      "IVT (Inverter Transformer) placement for 400V to 33 kV step-up. Pooling substation design — busbar arrangement, MV switchgear, protection relay coordination. Main step-up transformer sizing for evacuation voltage: 33 kV, 66 kV, 132 kV, or 220 kV. Evacuation line routing from plant boundary to the nearest DISCOM or PGCIL substation. GIS substation support for constrained sites.",
  },
  {
    icon: FileTextIcon,
    badge: "Electrical",
    title: "DISCOM-compliant SLD generation",
    description:
      "Single Line Diagram auto-generated from the DC and AC design — covering both sides of the plant. The SLD is formatted for DISCOM grid connectivity applications. State-specific format variants are supported. No AutoCAD drafting required. Any change to the design — inverter count, transformer rating, protection relay — updates the SLD automatically. Eliminates 2–3 hours of manual drafting per project revision.",
  },
  {
    icon: FileTextIcon,
    badge: "Electrical",
    title: "IS-standard cable schedule",
    description:
      "DC and AC cable schedules generated directly from the design. Cable sizing calculated to IS 732 (electric cables) and IS 1255 (HV cables) — the standards checked by state CEIG inspectors before commissioning approval. String cables, DC combiners, inverter output cables, MV cables to pooling substation, and HV evacuation cables all included. Any layout change updates the schedule automatically — no manual Excel rework.",
  },
  {
    icon: StackIcon,
    badge: "Compliance",
    title: "ALMM-compliant equipment library",
    description:
      "Module and inverter selection from an MNRE ALMM-listed library. The library is updated as the ALMM list changes. Equipment not on the current ALMM list is flagged before it reaches a bid submission — avoiding the disqualification risk that applies to all government-backed projects since April 2024. DC:AC ratio compatibility is validated against the selected inverter's input specifications.",
  },
  {
    icon: TreeStructureIcon,
    badge: "Output",
    title: "BoM and BoQ generation",
    description:
      "Bill of Materials generated directly from the design — modules, inverters, IVTs, main transformer, MV and HV switchgear, cables, mounting structures, earthing and lightning protection. Bill of Quantities for civil works — foundation volumes, control room, inverter platforms, boundary wall, access roads. Both documents update automatically when the design changes. No parallel Excel spreadsheet to maintain.",
  },
  {
    icon: FileTextIcon,
    badge: "Output",
    title: "DPR and pre-bid package export",
    description:
      "Lender-ready Detailed Project Report compiled from the design — site data and KMZ, simulation report with P50/P90, DC and AC layout drawings, SLD, stringing schedule, cable schedule, BoM, BoQ, and evacuation option. Pre-bid feasibility package for BD team submission: capacity (MW DC/AC), CUF estimate, indicative project cost, and evacuation summary. Format aligned with IREDA, PFC, SBI Cap, and Axis Bank technical advisor expectations.",
  },
  {
    icon: ArrowsClockwiseIcon,
    badge: "Analysis",
    title: "Multi-scenario comparison",
    description:
      "Compare design scenarios side by side: fixed tilt vs. single-axis tracker, string inverter vs. central inverter, different module wattage (e.g. 545 Wp vs. 600 Wp bifacial), varying DC:AC ratios (1.2 to 1.4). Each scenario produces its own CUF, P50/P90, PR, and BoM cost estimate. Used by BD teams to decide on the optimal configuration for a bid and by consultants for lender feasibility studies.",
  },
  {
    icon: UsersThreeIcon,
    badge: "Collaboration",
    title: "Cloud-based project access",
    description:
      "Multi-user cloud access for distributed teams. Replaces the PVsyst single-licence bottleneck and the practice of emailing .PVsyst files with version numbers in the filename. Design engineers, electrical engineers, civil engineers, and project managers work on the same project file with role-based permissions. Full version history with change tracking. Comments and annotations attached to design elements.",
  },
  {
    icon: ShieldCheckIcon,
    badge: "Security",
    title: "Enterprise security and deployment",
    description:
      "SOC 2 Type II compliant infrastructure. Data encrypted at rest and in transit. SSO via SAML 2.0 for organisations with centralised identity management. Audit logs for all project activity. Private cloud deployment available for large EPCs and IPPs that require data residency within their own infrastructure.",
  },
]

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          All tools for the pre-bid to DPR workflow
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          KMZ import, CUF simulation, DC/AC layout, DISCOM-compliant SLD, IS-standard
          cable schedule, ALMM equipment library, and lender-ready DPR export —
          in a single platform.
        </p>
      </section>

      {/* Features grid */}
      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-20 md:grid-cols-2">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <div className="mb-1 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon
                    weight="duotone"
                    className="h-5 w-5 text-primary"
                  />
                </div>
                <Badge variant="secondary" className="text-xs">
                  {feature.badge}
                </Badge>
              </div>
              <CardTitle>{feature.title}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      {/* CTA */}
      <section className="border-t px-6 py-16 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Start with a free account
        </h2>
        <p className="mb-6 text-muted-foreground">
          No credit card required. Free plan includes up to 3 active projects
          and basic layout editing.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link href="/dashboard">
              Create a free account
              <ArrowRightIcon className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/solutions">View solutions</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
