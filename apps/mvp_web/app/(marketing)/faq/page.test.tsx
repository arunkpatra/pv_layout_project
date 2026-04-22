import { test, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import FaqPage from "./page"

test("renders page heading", () => {
  render(<FaqPage />)
  const headings = screen.getAllByRole("heading", {
    level: 1,
    name: /Frequently Asked Questions/i,
  })
  expect(headings.length).toBeGreaterThanOrEqual(1)
})

test("renders all FAQ category headings", () => {
  render(<FaqPage />)
  const categories = [
    "About the Software",
    "Products & Downloads",
    "Entitlements & Calculations",
    "Payments",
    "Support",
  ]
  for (const category of categories) {
    const matches = screen.getAllByRole("heading", {
      level: 2,
      name: category,
    })
    expect(matches.length).toBeGreaterThanOrEqual(1)
  }
})

test("renders specific questions as accordion triggers", () => {
  render(<FaqPage />)
  const questions = [
    /What is SolarLayout\?/i,
    /How do I download\?/i,
    /What counts as one calculation\?/i,
    /How do I contact support\?/i,
  ]
  for (const q of questions) {
    const buttons = screen.getAllByRole("button", { name: q })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  }
})

test("renders all 18 FAQ items", () => {
  render(<FaqPage />)
  const triggers = screen.getAllByRole("button")
  expect(triggers.length).toBeGreaterThanOrEqual(18)
})
