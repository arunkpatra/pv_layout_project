import { Upload, Settings, Layout, FileOutput } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"

const steps = [
  {
    icon: Upload,
    title: "Import Your Boundary",
    description:
      "Load your site KMZ file. SolarLayout automatically reads all boundary polygons, including exclusion zones for obstacles, water bodies, and transmission line corridors.",
  },
  {
    icon: Settings,
    title: "Configure Your Parameters",
    description:
      "Input your module specifications (dimensions, wattage), MMS table configuration, row pitch, GCR, perimeter road width, and inverter/SMB details. Both string inverter and central inverter topologies are supported.",
  },
  {
    icon: Layout,
    title: "Generate Your Layout",
    description:
      "The software automatically places MMS tables, inverters, lightning arresters, and routes DC/AC cables — all within your boundary constraints. ICR buildings are placed and sized automatically.",
  },
  {
    icon: FileOutput,
    title: "Export Your Results",
    description:
      "Export a full KMZ layout file, DXF drawing, and PDF report with plant capacity, cable quantities, energy yield, and generation estimates.",
  },
]

export function StepByStep() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {steps.map((step, index) => (
        <Card key={step.title}>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <step.icon className="h-6 w-6" />
              </div>
              <div>
                <span className="text-sm font-semibold text-accent">
                  Step {index + 1}
                </span>
                <CardTitle className="text-lg">{step.title}</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{step.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
