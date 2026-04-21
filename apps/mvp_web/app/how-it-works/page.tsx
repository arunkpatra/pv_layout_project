import type { Metadata } from "next"
import { StepByStep } from "@/components/step-by-step"
import { SupportedFeatures } from "@/components/supported-features"

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "From boundary to bankable layout in minutes. Learn how SolarLayout automates PV plant design.",
}

export default function HowItWorksPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How SolarLayout Works
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            From boundary to bankable layout — in minutes.
          </p>
        </div>

        <StepByStep />
        <SupportedFeatures />
      </div>
    </div>
  )
}
