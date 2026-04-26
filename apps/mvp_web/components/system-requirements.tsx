import Link from "next/link"
import { SectionBand } from "./section-band"
import { SectionHead } from "./section-head"

const rows = [
  { label: "Operating system", value: "Windows 10 (64-bit) or higher" },
  { label: "RAM", value: "8 GB minimum, 16 GB recommended" },
  {
    label: "Disk space",
    value: "1.2 GB for application, 500 MB working",
  },
  { label: "Display", value: "1920 \u00d7 1080 minimum" },
  { label: "Additional software", value: "None required" },
  {
    label: "Internet connection",
    value: "Required for entitlement validation",
  },
]

export function SystemRequirements() {
  return (
    <SectionBand muted>
      <SectionHead
        eyebrow="04 / Requirements"
        title="System requirements."
        description="SolarLayout is a Windows desktop application. Internet is required for entitlement validation only."
      />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.05fr_1fr]">
        <table
          className="w-full overflow-hidden rounded-[var(--radius)] border border-border bg-card"
          style={{ borderCollapse: "separate", borderSpacing: 0 }}
        >
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label}>
                <th
                  className={`w-[40%] border-border bg-[#FBFCFD] px-[18px] py-3.5 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground${i < rows.length - 1 ? " border-b" : ""}`}
                >
                  {row.label}
                </th>
                <td
                  className={`border-border px-[18px] py-3.5 text-sm${i < rows.length - 1 ? " border-b" : ""}`}
                >
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <h3 className="mb-3 text-lg font-semibold">
            Inputs and outputs
          </h3>
          <p className="mb-4 text-[14.5px] text-muted-foreground">
            SolarLayout reads and writes the file formats already used
            in the standard utility-scale solar workflow.
          </p>
          <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
            <div className="grid grid-cols-2 border-b border-border">
              <div className="border-r border-border px-[18px] py-[14px]">
                <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Reads
                </div>
                <div className="text-[14px]">.kmz</div>
              </div>
              <div className="px-[18px] py-[14px]">
                <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Writes
                </div>
                <div className="text-[14px]">
                  .kmz &middot; .dxf &middot; .pdf
                </div>
              </div>
            </div>
            <div className="px-[18px] py-[14px] font-mono text-[13px] text-muted-foreground">
              compatible with: AutoCAD &middot; QGIS &middot; Google
              Earth Pro
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href="/faq"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-[#1C1C1C] transition-colors hover:bg-accent/90"
        >
          Frequently asked questions
        </Link>
      </div>
    </SectionBand>
  )
}
