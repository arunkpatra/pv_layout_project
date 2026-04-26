import Link from "next/link"
import { HeroSection } from "@/components/hero-section"
import { FeaturesOverview } from "@/components/features-overview"
import { HowItWorksSummary } from "@/components/how-it-works-summary"
import { ScreenshotsSection } from "@/components/screenshots-section"
import { SystemRequirements } from "@/components/system-requirements"

export default function HomePage() {
  return (
    <>
      <HeroSection />

      {/* Free license key CTA */}
      <div className="border-b border-accent/30 bg-accent px-6 py-3.5 text-center text-sm text-[#1C1C1C]">
        <strong>Start free</strong> — 5 full-featured calculations, no
        credit card required.{" "}
        <Link
          href="/sign-up"
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
        >
          Get your free license key →
        </Link>
      </div>

      <FeaturesOverview />
      <HowItWorksSummary />
      <ScreenshotsSection />
      <SystemRequirements />
    </>
  )
}
