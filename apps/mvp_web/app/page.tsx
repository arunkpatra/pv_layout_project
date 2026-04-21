import { HeroSection } from "@/components/hero-section"
import { FeaturesOverview } from "@/components/features-overview"
import { HowItWorksSummary } from "@/components/how-it-works-summary"
import { ScreenshotsSection } from "@/components/screenshots-section"
import { SystemRequirements } from "@/components/system-requirements"

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <FeaturesOverview />
      <HowItWorksSummary />
      <ScreenshotsSection />
      <SystemRequirements />
    </>
  )
}
