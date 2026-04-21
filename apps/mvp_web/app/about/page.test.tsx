import { test, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import AboutPage from "./page"

test("renders page heading", () => {
  render(<AboutPage />)
  const headings = screen.getAllByRole("heading", {
    level: 1,
    name: /Built by Solar Industry Veterans/i,
  })
  expect(headings.length).toBeGreaterThanOrEqual(1)
})

test("renders body text", () => {
  render(<AboutPage />)
  expect(
    screen.getAllByText(
      /deep roots in the solar and renewable energy/i
    ).length
  ).toBeGreaterThanOrEqual(1)
})

test("renders mission statement", () => {
  render(<AboutPage />)
  const missionHeadings = screen.getAllByRole("heading", {
    level: 2,
    name: /Our Mission/i,
  })
  expect(missionHeadings.length).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(
      /powerful, automated layout design tools/i
    ).length
  ).toBeGreaterThanOrEqual(1)
})
