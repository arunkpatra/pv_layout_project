import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { SectionBand } from "@/components/section-band"

export const metadata: Metadata = {
  title: "About",
  description:
    "Built by solar industry veterans with deep roots in the renewable energy industry.",
}

const stats = [
  { label: "Headquarters", value: "Bangalore, India" },
  { label: "Industry experience", value: "15+ years" },
  { label: "Primary market", value: "Utility-scale (10 MWp+)" },
  { label: "Platform", value: "Windows desktop + web" },
  { label: "Compliance", value: "ALMM · IS 14255 · IS 1554" },
  { label: "Phase", value: "Public beta" },
]

export default function AboutPage() {
  return (
    <>
      <PageHeader
        breadcrumb={["SolarLayout", "About"]}
        title="Built by solar industry veterans."
        description="SolarLayout is built by solar industry veterans with deep experience in utility-scale PV plant development."
      />

      <SectionBand>
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h3 className="mb-3.5 font-mono text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Why we built this
            </h3>
            <div className="space-y-[18px] text-[17px] leading-[1.65] text-[#374151]">
              <p>
                SolarLayout has been developed by a team of experienced
                professionals with deep roots in the solar and renewable
                energy industry. With years of hands-on experience in
                large-scale PV plant development, land acquisition, and
                project engineering, we built the solutions we always
                wished we had.
              </p>
              <p>
                Our mission is to put powerful, automated layout design
                solutions in the hands of every solar professional —
                saving hours of manual work and enabling faster, smarter
                project decisions.
              </p>
            </div>
          </div>

          <div>
            <h3 className="mb-3.5 font-mono text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">
              At a glance
            </h3>
            <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className={`flex items-center justify-between px-[22px] py-[18px] text-sm${i < stats.length - 1 ? " border-b border-border" : ""}`}
                >
                  <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    {stat.label}
                  </span>
                  <span className="font-semibold">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionBand>
    </>
  )
}
