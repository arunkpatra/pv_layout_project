import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { SectionBand } from "@/components/section-band"
import { SectionHead } from "@/components/section-head"

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "From boundary to bankable layout in minutes. Learn how SolarLayout automates PV plant design.",
}

const steps = [
  {
    num: "STEP 01",
    title: "Import your boundary",
    description:
      "Load your site KMZ file. SolarLayout reads all boundary polygons including exclusion zones for obstacles, water bodies, and transmission line corridors. Multiple plant areas in a single KMZ are supported.",
    visual: {
      label: "read",
      type: "kmz",
      rows: [
        { key: "boundary polygons", value: "3" },
        { key: "exclusion polygons", value: "9" },
        { key: "net usable area", value: "184.3 ha" },
        { key: "setbacks applied", value: "tx 35m · road 6m" },
      ],
    },
  },
  {
    num: "STEP 02",
    title: "Configure your parameters",
    description:
      "Input module specifications (dimensions, Wp), MMS table configuration, row pitch, GCR, perimeter road width, and inverter / SMB details. Both string inverter and central inverter topologies are supported.",
    visual: {
      label: "config",
      type: "plant.json",
      rows: [
        { key: "module.dim", value: "2384 × 1303 mm" },
        { key: "module.Wp", value: "555" },
        { key: "mms.config", value: "2H × 28" },
        { key: "row.pitch", value: "4.5 m" },
        { key: "topology", value: "string" },
      ],
    },
  },
  {
    num: "STEP 03",
    title: "Generate your layout",
    description:
      "The application places MMS tables, inverters, lightning arresters, and routes DC and AC cables — all within boundary constraints. ICR buildings are placed and sized automatically at one per 18 MWp.",
    visual: {
      label: "output",
      type: "auto-layout",
      rows: [
        { key: "tables.placed", value: "1,184" },
        { key: "inverters", value: "4" },
        { key: "icr", value: "3" },
        { key: "la.placed", value: "28" },
        { key: "cable.total", value: "24,970 m" },
      ],
    },
  },
  {
    num: "STEP 04",
    title: "Export your results",
    description:
      "Export a full KMZ layout file, DXF drawing, and PDF report with plant capacity, cable quantities, energy yield and generation estimates. Outputs are compatible with AutoCAD, QGIS, and Google Earth Pro.",
    visual: {
      label: "export",
      type: "3 files",
      rows: [
        { key: "layout.kmz", value: "2.4 MB" },
        { key: "layout.dxf", value: "8.1 MB" },
        { key: "report.pdf", value: "1.2 MB · 18 pages" },
      ],
    },
  },
]

const features = [
  {
    title: "KMZ boundary input",
    description:
      "Multiple plant areas, multi-polygon boundaries, exclusion zones.",
  },
  {
    title: "Fixed-tilt MMS tables",
    description:
      "Configurable orientation, modules per table, row pitch, GCR target.",
  },
  {
    title: "String & central inverters",
    description:
      "Both topologies; inverter platform placement and string assignment.",
  },
  {
    title: "Automatic ICR placement",
    description:
      "One ICR per 18 MWp by default; manual override supported.",
  },
  {
    title: "Lightning arrester placement",
    description:
      "Placement and protection-zone calculation per cone-of-protection method.",
  },
  {
    title: "DC string and AC cable routing",
    description:
      "Trench-aware routing with run lengths and quantity measurements.",
  },
  {
    title: "Energy yield analysis",
    description:
      "P50 / P75 / P90 exceedance values, monthly generation, CUF.",
  },
  {
    title: "PDF, KMZ & DXF export",
    description:
      "Drawings, BoQ tables, and yield reports in standard formats.",
  },
]

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        breadcrumb={["SolarLayout", "How it works"]}
        title="From boundary to bankable layout — in minutes."
        description="SolarLayout replaces the manual loop between Google Earth Pro, AutoCAD and PVsyst with a single Windows application that produces a layout, a cable schedule, and a yield report from one KMZ boundary."
      />

      <SectionBand>
        <div className="flex flex-col gap-6">
          {steps.map((step, i) => (
            <div
              key={step.num}
              className={`grid items-start gap-8 py-8 lg:grid-cols-[84px_1fr_1.1fr]${i > 0 ? " border-t border-border" : ""}`}
            >
              <div className="font-mono text-[13px] font-semibold tracking-[0.08em] text-primary">
                {step.num}
              </div>
              <div>
                <h3 className="mb-2 text-[22px] font-semibold tracking-[-0.015em]">
                  {step.title}
                </h3>
                <p className="max-w-[50ch] text-[15px] text-[#374151]">
                  {step.description}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3.5 font-mono text-xs text-muted-foreground">
                <div className="mb-2.5 flex justify-between text-[11px] uppercase tracking-[0.08em] text-[#9CA3AF]">
                  <span>{step.visual.label}</span>
                  <span>{step.visual.type}</span>
                </div>
                {step.visual.rows.map((row) => (
                  <div
                    key={row.key}
                    className="flex justify-between border-b border-dashed border-border py-[5px] last:border-b-0"
                  >
                    <span>{row.key}</span>
                    <span className="text-[#1C1C1C]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionBand>

      <SectionBand muted>
        <SectionHead eyebrow="Capabilities" title="Supported features." />
        <div className="grid overflow-hidden rounded-[var(--radius)] border border-border bg-card sm:grid-cols-2">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`flex items-start gap-3.5 px-[22px] py-[18px]${i < features.length - 2 ? " border-b border-border" : ""}${i % 2 === 0 ? " sm:border-r sm:border-border" : ""}`}
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-[1px] bg-primary" />
              <div>
                <h4 className="mb-1 text-[14.5px] font-semibold">
                  {f.title}
                </h4>
                <p className="text-[13px] leading-[1.5] text-muted-foreground">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </SectionBand>
    </>
  )
}
