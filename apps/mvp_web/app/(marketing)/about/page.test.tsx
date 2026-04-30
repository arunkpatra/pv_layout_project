import { test, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import AboutPage from "./page"

test("renders page heading", () => {
  render(<AboutPage />)
  const headings = screen.getAllByRole("heading", {
    level: 1,
    name: /Built by solar industry veterans/i,
  })
  expect(headings.length).toBeGreaterThanOrEqual(1)
})

test("renders body text", () => {
  render(<AboutPage />)
  expect(
    screen.getAllByText(/deep roots in the solar and renewable energy/i)
      .length
  ).toBeGreaterThanOrEqual(1)
})

test("renders mission statement", () => {
  render(<AboutPage />)
  const whyHeadings = screen.getAllByRole("heading", {
    level: 3,
    name: /Why we built this/i,
  })
  expect(whyHeadings.length).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/powerful, automated layout design solutions/i)
      .length
  ).toBeGreaterThanOrEqual(1)
})
