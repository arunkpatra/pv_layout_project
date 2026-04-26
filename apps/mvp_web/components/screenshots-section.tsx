import { SectionBand } from "./section-band"
import { SectionHead } from "./section-head"
import { WindowFrame } from "./window-frame"
import { LayoutCanvasScreenshot } from "./layout-canvas-screenshot"
import { CableScheduleScreenshot } from "./cable-schedule-screenshot"
import { YieldReportScreenshot } from "./yield-report-screenshot"

export function ScreenshotsSection() {
  return (
    <SectionBand>
      <SectionHead
        eyebrow="03 / The application"
        title="A look inside SolarLayout."
        description="Selected views from the Windows desktop application."
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="lg:row-span-2">
          <WindowFrame
            title="SolarLayout — Project: Karnataka_47MW_phase1.slpx"
            caption="Layout canvas — table grid, inverters, exclusions"
            captionMeta="View · Layout/2D"
            className="h-full"
            contentClassName="bg-[linear-gradient(to_right,#FAFBFC_75%,#fff_75%)]"
          >
            <LayoutCanvasScreenshot />
          </WindowFrame>
        </div>
        <div className="flex flex-col gap-5 lg:row-span-2">
          <WindowFrame
            title="BoQ — cable schedule"
            caption="Cable schedule — automatic from layout"
            captionMeta="Pro / Pro Plus"
            className="flex-1"
          >
            <CableScheduleScreenshot />
          </WindowFrame>
          <WindowFrame
            title="Yield report"
            caption="Yield report — P50/P75/P90, monthly generation"
            captionMeta="Pro Plus only"
            className="flex-1"
          >
            <YieldReportScreenshot />
          </WindowFrame>
        </div>
      </div>
    </SectionBand>
  )
}
