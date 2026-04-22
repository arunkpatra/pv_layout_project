import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import PricingPage from "./page"

test("renders page heading", () => {
  render(<PricingPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /Simple, Transparent Pricing/i,
    })
  ).toBeInTheDocument()
})

test("renders all three tier names", () => {
  render(<PricingPage />)
  expect(screen.getAllByText("PV Layout Basic").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("PV Layout Pro").length).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText("PV Layout Pro Plus").length
  ).toBeGreaterThanOrEqual(1)
})

test("renders prices", () => {
  render(<PricingPage />)
  expect(screen.getAllByText("$1.99").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("$4.99").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("$14.99").length).toBeGreaterThanOrEqual(1)
})

test("renders disabled Buy Now buttons without tooltip", () => {
  render(<PricingPage />)
  const buyButtons = screen.getAllByRole("button", { name: /Buy Now/i })
  expect(buyButtons.length).toBeGreaterThanOrEqual(3)
  const disabledButtons = buyButtons.filter(
    (btn) =>
      btn.hasAttribute("disabled") ||
      btn.getAttribute("aria-disabled") === "true"
  )
  expect(disabledButtons.length).toBeGreaterThanOrEqual(3)
  expect(screen.queryByText(/Payment coming soon/i)).not.toBeInTheDocument()
})

test("renders feature comparison table", () => {
  render(<PricingPage />)
  expect(
    screen.getAllByText("Plant Layout (MMS, Inverter, LA)").length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText("Energy Yield Analysis").length
  ).toBeGreaterThanOrEqual(1)
})

test("renders top-up note", () => {
  render(<PricingPage />)
  expect(
    screen.getAllByText(/Need more calculations/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(screen.queryByText(/Phase 2/i)).not.toBeInTheDocument()
})

test("renders sub-heading text", () => {
  render(<PricingPage />)
  expect(
    screen.getAllByText(
      /Pay once\. Use as many times as your plan allows\./i
    ).length
  ).toBeGreaterThanOrEqual(1)
})
