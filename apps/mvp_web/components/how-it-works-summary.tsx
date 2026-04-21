import { Upload, Settings, Layout, FileOutput } from "lucide-react"

const steps = [
  {
    icon: Upload,
    title: "Upload KMZ",
    description: "Upload your site boundary file",
  },
  {
    icon: Settings,
    title: "Enter Parameters",
    description: "Configure module and plant specs",
  },
  {
    icon: Layout,
    title: "Generate Layout",
    description: "Software creates your layout automatically",
  },
  {
    icon: FileOutput,
    title: "Export Results",
    description: "Download KMZ, DXF, and PDF reports",
  },
]

export function HowItWorksSummary() {
  return (
    <section className="bg-muted px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How It Works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            From boundary to bankable layout — in minutes.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <step.icon className="h-7 w-7" />
              </div>
              <div className="mt-2 text-sm font-semibold text-accent">
                Step {index + 1}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
