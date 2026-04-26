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
      name: /Simple, transparent pricing/i,
    })
  ).toBeInTheDocument()
})

test("renders plan cards with all three tier names", () => {
  render(<PricingPage />)
  expect(
    screen.getAllByText("PV Layout Basic").length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText("PV Layout Pro").length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText("PV Layout Pro Plus").length
  ).toBeGreaterThanOrEqual(1)
})

test("renders prices", () => {
  render(<PricingPage />)
  expect(
    screen.getAllByText(/\$1\.99/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/\$4\.99/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/\$14\.99/i).length
  ).toBeGreaterThanOrEqual(1)
})

test("renders Buy buttons as links to dashboard plan page", () => {
  render(<PricingPage />)
  const buyLinks = screen.getAllByRole("link", { name: /Buy/i })
  expect(buyLinks.length).toBeGreaterThanOrEqual(3)
  expect(buyLinks[0]).toHaveAttribute("href", "/dashboard/plans")
})

test("renders free trial callout", () => {
  render(<PricingPage />)
  expect(
    screen.getByText(/Free trial included/i)
  ).toBeInTheDocument()
})

test("renders feature comparison table", () => {
  render(<PricingPage />)
  expect(
    screen.getAllByText("KMZ boundary input").length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText("Energy yield analysis").length
  ).toBeGreaterThanOrEqual(1)
})

test("renders top-up note", () => {
  render(<PricingPage />)
  expect(
    screen.getAllByText(/Top-ups/i).length
  ).toBeGreaterThanOrEqual(1)
})
