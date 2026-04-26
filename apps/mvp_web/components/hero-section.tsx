import Link from "next/link"
import { Eyebrow } from "./eyebrow"
import { SchematicIllustration } from "./schematic-illustration"

export function HeroSection() {
  return (
    <section className="border-b border-border py-16 pb-20">
      <div className="mx-auto grid max-w-[1200px] items-center gap-16 px-6 lg:grid-cols-[1.05fr_1.1fr]">
        {/* Left column */}
        <div>
          <Eyebrow>Utility-scale PV · Windows desktop</Eyebrow>

          <h1 className="mt-[18px] text-[38px] font-bold leading-[1.05] tracking-[-0.025em] sm:text-[56px]">
            From KMZ boundary to{" "}
            <em className="not-italic text-primary">complete layout</em>,
            in minutes.
          </h1>

          <p className="mt-5 max-w-[54ch] text-lg text-[#374151]">
            SolarLayout reads your KMZ boundary, places MMS tables,
            routes cables, positions inverters and estimates energy
            yield — in minutes, not days.
          </p>

          {/* CTA row */}
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Explore products
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="shrink-0"
              >
                <path
                  d="M5.25 3.5L8.75 7L5.25 10.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-[#1C1C1C] transition-colors hover:bg-accent/90"
            >
              Get Free License Key
            </Link>
          </div>

          {/* Meta strip */}
          <dl className="mt-9 grid grid-cols-3 gap-6 border-t border-border pt-5">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Input
              </dt>
              <dd className="mt-1.5 text-lg font-semibold">
                KMZ
                <small className="mt-0.5 block text-[13px] font-normal text-muted-foreground">
                  Boundary + exclusion polygons
                </small>
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Output
              </dt>
              <dd className="mt-1.5 text-lg font-semibold">
                KMZ · DXF · PDF
                <small className="mt-0.5 block text-[13px] font-normal text-muted-foreground">
                  Layout, BoQ, yield report
                </small>
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Topology
              </dt>
              <dd className="mt-1.5 text-lg font-semibold">
                String & Central
                <small className="mt-0.5 block text-[13px] font-normal text-muted-foreground">
                  Fixed-tilt, ICR @ 1/18 MWp
                </small>
              </dd>
            </div>
          </dl>
        </div>

        {/* Right column */}
        <div>
          <SchematicIllustration />
        </div>
      </div>
    </section>
  )
}
