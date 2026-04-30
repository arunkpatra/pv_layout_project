import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { NavMain } from "./nav-main"
import { SidebarProvider } from "@renewable-energy/ui/components/sidebar"
import { TooltipProvider } from "@renewable-energy/ui/components/tooltip"

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>{children}</SidebarProvider>
    </TooltipProvider>
  )
}

describe("NavMain", () => {
  it("does not render expand chevron for items without children", () => {
    const { container } = render(
      <NavMain items={[{ title: "Overview", url: "/overview" }]} />,
      { wrapper }
    )
    expect(
      container.querySelector("svg.transition-transform")
    ).not.toBeInTheDocument()
  })

  it("renders expand chevron for items with children", () => {
    const { container } = render(
      <NavMain
        items={[
          {
            title: "Solar Layout",
            url: "/solar",
            items: [{ title: "Map View", url: "/solar/map" }],
          },
        ]}
      />,
      { wrapper }
    )
    expect(
      container.querySelector("svg.transition-transform")
    ).toBeInTheDocument()
  })
})
