import { test, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import FaqPage from "./page"

test("renders page heading", () => {
  render(<FaqPage />)
  const headings = screen.getAllByRole("heading", {
    level: 1,
    name: /Frequently asked questions/i,
  })
  expect(headings.length).toBeGreaterThanOrEqual(1)
})

test("renders all FAQ category headings", () => {
  render(<FaqPage />)
  const categories = [
    /About the software/i,
    /Products & downloads/i,
    /Entitlements & calculations/i,
    /Payments/i,
    /Support/i,
  ]
  for (const category of categories) {
    const matches = screen.getAllByRole("heading", {
      level: 3,
      name: category,
    })
    expect(matches.length).toBeGreaterThanOrEqual(1)
  }
})

test("renders specific questions as summary elements", () => {
  render(<FaqPage />)
  const questions = [
    /What is SolarLayout\?/i,
    /How do I download\?/i,
    /What counts as one calculation\?/i,
    /How do I contact support\?/i,
  ]
  for (const q of questions) {
    const matches = screen.getAllByText(q)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  }
})

test("renders all 18 FAQ items", () => {
  render(<FaqPage />)
  // FAQ uses <details> elements, count them
  const { container } = render(<FaqPage />)
  const details = container.querySelectorAll("details")
  expect(details.length).toBeGreaterThanOrEqual(18)
})
