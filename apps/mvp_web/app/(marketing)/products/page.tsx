import type { Metadata } from "next"
import Link from "next/link"
import { Download } from "lucide-react"
import { Button } from "@renewable-energy/ui/components/button"
import { DownloadModal } from "@/components/download-modal"
import { PageHeader } from "@/components/page-header"
import { SectionBand } from "@/components/section-band"
import { SectionHead } from "@/components/section-head"
import { WindowFrame } from "@/components/window-frame"
import { LayoutCanvasScreenshot } from "@/components/layout-canvas-screenshot"
import { CableScheduleScreenshot } from "@/components/cable-schedule-screenshot"
import { YieldReportScreenshot } from "@/components/yield-report-screenshot"

export const metadata: Metadata = {
  title: "Products",
  description:
    "PV Layout — see exactly what the software produces. Sample outputs, deliverables, and supported standards.",
}

const outputFiles = [
  {
    format: "KMZ",
    description: "Layout file for Google Earth Pro. Boundary, tables, inverters, cables — all on one map.",
    compatible: "Google Earth Pro",
  },
  {
    format: "DXF",
    description: "AutoCAD drawing with full layout. Ready for detailed engineering and site handover.",
    compatible: "AutoCAD, QGIS",
  },
  {
    format: "PDF",
    description: "Complete report with plant capacity, cable schedule, bill of quantities, and energy yield.",
    compatible: "Any PDF viewer",
  },
]

const standards = [
  { label: "Cable sizing", value: "IS 14255, IS 1554, IS 7098" },
  { label: "Equipment library", value: "ALMM-aligned modules" },
  { label: "Earthing", value: "IS 3043" },
  { label: "Output formats", value: "KMZ, DXF, PDF" },
  { label: "Inverter topology", value: "String and central" },
  { label: "Yield method", value: "P50 / P75 / P90 exceedance" },
]

export default function ProductsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={["SolarLayout", "Products"]}
        title="PV Layout"
        description="Upload your KMZ boundary. Get a complete plant layout with cables, bill of quantities, and energy yield — in minutes, not days."
      >
        <div>
          <DownloadModal productName="PV Layout">
            <Button
              size="lg"
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Download className="h-5 w-5" />
              Download PV Layout
            </Button>
          </DownloadModal>
        </div>
      </PageHeader>

      {/* The problem — brief */}
      <SectionBand>
        <div className="mx-auto max-w-[720px] text-center">
          <p className="text-lg text-[#374151]">
            Today, a single plant layout needs Google Earth for the
            boundary, AutoCAD for the drawing, and PVsyst for the yield.
            Each tool needs manual data entry. SolarLayout does all three
            from one KMZ file.
          </p>
        </div>
      </SectionBand>

      {/* Sample output — walkthrough */}
      <SectionBand muted>
        <SectionHead
          eyebrow="01 / Sample output"
          title="What you get for a 47 MWp plant."
          description="Below is the actual output for a sample project in Karnataka — boundary to deliverables."
        />

        <div className="space-y-8">
          {/* Layout output */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr]">
            <WindowFrame
              title="Layout output — Karnataka_47MW_phase1.kmz"
              caption="MMS tables, inverters, exclusions, cables"
              captionMeta="All plans"
            >
              <LayoutCanvasScreenshot />
            </WindowFrame>
            <div className="flex flex-col justify-center gap-6">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Capacity", value: "47.2 MWp" },
                  { label: "Tables placed", value: "1,184" },
                  { label: "Inverters", value: "4" },
                  { label: "GCR", value: "0.42" },
                  { label: "ICR buildings", value: "3" },
                  { label: "Lightning arresters", value: "28" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      {stat.label}
                    </div>
                    <div className="mt-1 text-lg font-semibold">
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cable schedule + Yield */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <WindowFrame
              title="Cable schedule"
              caption="Automatic cable routing and quantities"
              captionMeta="Pro / Pro Plus"
            >
              <CableScheduleScreenshot />
            </WindowFrame>
            <WindowFrame
              title="Energy yield report"
              caption="P50 / P75 / P90, monthly generation"
              captionMeta="Pro Plus"
            >
              <YieldReportScreenshot />
            </WindowFrame>
          </div>
        </div>
      </SectionBand>

      {/* Output files */}
      <SectionBand>
        <SectionHead
          eyebrow="02 / Deliverables"
          title="Three files, ready to use."
          description="Every layout run produces these files. No manual formatting needed."
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {outputFiles.map((file) => (
            <div
              key={file.format}
              className="rounded-[var(--radius)] border border-border bg-card p-6"
            >
              <div className="mb-3 inline-block rounded-md bg-primary px-3 py-1 font-mono text-xs font-semibold text-white">
                .{file.format.toLowerCase()}
              </div>
              <p className="text-sm text-[#374151]">{file.description}</p>
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                Opens in: {file.compatible}
              </p>
            </div>
          ))}
        </div>
      </SectionBand>

      {/* Standards & compatibility */}
      <SectionBand muted>
        <SectionHead
          eyebrow="03 / Standards"
          title="Built for the Indian solar market."
          description="Cable sizing, equipment selection, and output formats follow Indian standards."
        />

        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
          {standards.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center justify-between px-[22px] py-[18px] text-sm${i < standards.length - 1 ? " border-b border-border" : ""}`}
            >
              <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {item.label}
              </span>
              <span className="font-semibold">{item.value}</span>
            </div>
          ))}
        </div>
      </SectionBand>

      {/* Bottom CTA */}
      <SectionBand>
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="text-[28px] font-semibold tracking-[-0.015em]">
            Try it free. 5 calculations, no credit card.
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <DownloadModal productName="PV Layout">
              <Button
                size="lg"
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Download className="h-5 w-5" />
                Download PV Layout
              </Button>
            </DownloadModal>
            <Button
              asChild
              size="lg"
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link href="/sign-up">Get Free License Key</Link>
            </Button>
          </div>
        </div>
      </SectionBand>
    </>
  )
}
