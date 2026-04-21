import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "About",
  description:
    "SolarLayout is built by solar industry veterans with deep experience in utility-scale PV plant development.",
}

export default function AboutPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Built by Solar Industry Veterans
        </h1>

        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
          SolarLayout has been developed by a team of experienced
          professionals with deep roots in the solar and renewable energy
          industry. With years of hands-on experience in large-scale PV
          plant development, land acquisition, and project engineering, we
          built the tools we always wished we had.
        </p>

        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">
          Our Mission
        </h2>

        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Our mission is to put powerful, automated layout design tools in
          the hands of every solar professional — saving hours of manual
          work and enabling faster, smarter project decisions.
        </p>
      </div>
    </div>
  )
}
