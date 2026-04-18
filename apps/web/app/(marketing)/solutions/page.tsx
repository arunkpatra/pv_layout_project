import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import {
  BuildingsIcon,
  FactoryIcon,
  SolarPanelIcon,
  HardHatIcon,
  ArrowRightIcon,
  ChartLineUpIcon,
} from "@phosphor-icons/react/dist/ssr"

const solutions = [
  {
    icon: BuildingsIcon,
    title: "Commercial rooftop",
    description:
      "Design layouts for office buildings, shopping centres, and multi-tenancy properties. Handle complex roof geometries, obstructions, and multiple orientations in a single project.",
  },
  {
    icon: FactoryIcon,
    title: "Industrial & warehouse",
    description:
      "Optimise large flat-roof installations for maximum panel density. Automatic row spacing calculations for east-west and south-facing configurations.",
  },
  {
    icon: SolarPanelIcon,
    title: "Ground-mount utility",
    description:
      "Plan utility-scale ground-mount arrays with terrain import, pile layout, and cable run optimisation. Export to IFC and CAD formats.",
  },
  {
    icon: HardHatIcon,
    title: "EPC contractors",
    description:
      "Streamline design-to-installation handover. Generate material take-offs, installation drawings, and client proposals from a single design.",
  },
  {
    icon: ChartLineUpIcon,
    title: "Solar consultants",
    description:
      "Run yield simulations and shade analysis for feasibility studies. Compare multiple design scenarios and present bankable reports to stakeholders.",
  },
  {
    icon: BuildingsIcon,
    title: "Renewable energy developers",
    description:
      "Manage a portfolio of sites from one workspace. Track project status, assign teams, and maintain version history across all your developments.",
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

      {/* Solutions grid */}
      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-20 md:grid-cols-2 lg:grid-cols-3">
        {solutions.map((solution) => (
          <div
            key={solution.title}
            className="flex flex-col gap-3 rounded-xl border bg-card p-6 text-card-foreground"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <solution.icon
                weight="duotone"
                className="h-5 w-5 text-primary"
              />
            </div>
            <h3 className="font-semibold">{solution.title}</h3>
            <p className="text-sm text-muted-foreground">
              {solution.description}
            </p>
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
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
