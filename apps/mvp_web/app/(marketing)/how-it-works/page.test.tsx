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

import HowItWorksPage from "./page"

test("renders page heading", () => {
  render(<HowItWorksPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /From boundary to bankable layout/i,
    })
  ).toBeInTheDocument()
})

test("renders all four steps", () => {
  render(<HowItWorksPage />)
  expect(
    screen.getAllByText(/Import your boundary/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/Configure your parameters/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/Generate your layout/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/Export your results/i).length
  ).toBeGreaterThanOrEqual(1)
})

test("renders step descriptions from PRD", () => {
  render(<HowItWorksPage />)
  expect(
    screen.getAllByText(/Load your site KMZ file/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/Both string inverter and central inverter/i)
      .length
  ).toBeGreaterThanOrEqual(1)
})

test("renders supported features", () => {
  render(<HowItWorksPage />)
  expect(
    screen.getAllByText(/Supported features/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/Multiple plant areas/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/P50 \/ P75 \/ P90 exceedance/i).length
  ).toBeGreaterThanOrEqual(1)
})
