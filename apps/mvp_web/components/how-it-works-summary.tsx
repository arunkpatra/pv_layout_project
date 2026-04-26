import Link from "next/link"
import { Upload, Server, Activity, Download } from "lucide-react"
import { SectionBand } from "./section-band"
import { SectionHead } from "./section-head"

const steps = [
  {
    icon: Upload,
    label: "Step 01",
    title: "Import boundary",
    description: "Upload your site boundary file",
  },
  {
    icon: Server,
    label: "Step 02",
    title: "Configure parameters",
    description: "Configure module and plant specs",
  },
  {
    icon: Activity,
    label: "Step 03",
    title: "Generate layout",
    description: "Software creates your layout automatically",
  },
  {
    icon: Download,
    label: "Step 04",
    title: "Export deliverables",
    description: "Download KMZ, DXF, and PDF reports",
  },
]

export function HowItWorksSummary() {
  return (
    <SectionBand muted>
      <SectionHead
        eyebrow="02 / Pipeline"
        title="From boundary to deliverable."
        description="Four steps. No re-keying coordinates between Google Earth, AutoCAD and PVsyst."
      />

      <div className="grid overflow-hidden rounded-[var(--radius)] border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <div
            key={step.label}
            className="flex flex-col gap-2.5 border-b border-border p-6 sm:border-r sm:[&:nth-child(2)]:border-r-0 lg:border-b-0 lg:border-r lg:[&:nth-child(2)]:border-r lg:last:border-r-0"
          >
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-[#FBFCFD] text-primary">
              <step.icon className="h-[18px] w-[18px]" />
            </div>

            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {step.label}
            </span>

            <h4 className="text-base font-semibold">{step.title}</h4>

            <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
              {step.description}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href="/how-it-works"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-[#1C1C1C] transition-colors hover:bg-accent/90"
        >
          Read the workflow →
        </Link>
      </div>
    </SectionBand>
  )
}
