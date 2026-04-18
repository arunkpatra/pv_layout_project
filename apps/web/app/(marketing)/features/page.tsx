import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { Badge } from "@renewable-energy/ui/components/badge"
import {
  SolarPanelIcon,
  ChartLineUpIcon,
  BuildingsIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  FileTextIcon,
  CloudArrowUpIcon,
  LockKeyIcon,
  CpuIcon,
} from "@phosphor-icons/react/dist/ssr"

const features = [
  {
    icon: SolarPanelIcon,
    badge: "Design",
    title: "Precision layout editor",
    description:
      "Drag-and-drop panel placement on imported site plans. Snap-to-grid alignment with automatic setback and spacing rules. Support for complex multi-pitch roofs, obstacles, and exclusion zones. Works with DXF, PDF, and satellite imagery imports.",
  },
  {
    icon: ChartLineUpIcon,
    badge: "Analysis",
    title: "Yield modelling & simulation",
    description:
      "Real-time energy yield estimates based on location, tilt, orientation, and shading analysis. Compare multiple design scenarios side by side. Hourly, monthly, and annual production forecasts with P50/P90 outputs for bankable reports.",
  },
  {
    icon: MagnifyingGlassIcon,
    badge: "Analysis",
    title: "Shading & irradiance analysis",
    description:
      "3D horizon shading from surrounding structures and terrain. Per-panel irradiance heatmaps at any time of year. String-level mismatch analysis to inform inverter and optimizer selection.",
  },
  {
    icon: BuildingsIcon,
    badge: "Collaboration",
    title: "Multi-user team workspaces",
    description:
      "Invite teammates, assign roles, and collaborate on designs in real time. Role-based access control for owners, editors, and viewers. Comments and annotations tied directly to design elements.",
  },
  {
    icon: FileTextIcon,
    badge: "Output",
    title: "Professional report generation",
    description:
      "One-click export of client-ready PDF proposals, material take-offs, and installation drawings. Branded report templates. Share live proposal links with clients — no download required.",
  },
  {
    icon: CloudArrowUpIcon,
    badge: "Integrations",
    title: "CAD & BIM export",
    description:
      "Export to DXF, DWG, and IFC for seamless handover to structural and electrical engineers. Interoperable with AutoCAD, Revit, and PVsyst. Direct push to project management tools.",
  },
  {
    icon: CpuIcon,
    badge: "Automation",
    title: "Auto-layout optimisation",
    description:
      "Let the engine generate an optimised panel layout for any roof or ground area in seconds. Set constraints — max capacity, target yield, budget — and get multiple layout options ranked by performance.",
  },
  {
    icon: LockKeyIcon,
    badge: "Security",
    title: "Enterprise-grade security",
    description:
      "SOC 2 Type II compliant infrastructure. Data encrypted at rest and in transit. SSO via SAML 2.0. Audit logs for all project activity. Private cloud deployment available for large organisations.",
  },
]

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-6 py-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          Everything you need to design, analyse, and deliver
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          From first sketch to bankable report — SolarDesign has the tools to
          take your projects from concept to construction faster.
        </p>
      </section>

      {/* Features grid */}
      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-20 md:grid-cols-2">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="flex flex-col gap-3 rounded-xl border bg-card p-6 text-card-foreground"
          >
            <div className="flex items-center gap-3">
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
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="text-sm text-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="border-t px-6 py-16 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Ready to see it in action?
        </h2>
        <p className="mb-6 text-muted-foreground">
          Start designing for free — no credit card required.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link href="/dashboard">
              Get started free
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
