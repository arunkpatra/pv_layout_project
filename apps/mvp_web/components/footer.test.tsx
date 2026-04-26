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

import { Footer } from "./footer"

test("renders SolarLayout brand name", () => {
  render(<Footer />)
  expect(screen.getByText("SolarLayout")).toBeInTheDocument()
})

test("renders tagline", () => {
  render(<Footer />)
  const taglines = screen.getAllByText(
    /Utility-scale PV layout, cabling, and yield/i
  )
  expect(taglines.length).toBeGreaterThanOrEqual(1)
})

test("renders legal links", () => {
  render(<Footer />)
  const terms = screen.getAllByRole("link", { name: "Terms & Conditions" })
  expect(terms.length).toBeGreaterThanOrEqual(1)
  const privacy = screen.getAllByRole("link", { name: "Privacy Policy" })
  expect(privacy.length).toBeGreaterThanOrEqual(1)
})

test("renders contact email", () => {
  render(<Footer />)
  const emails = screen.getAllByText("support@solarlayout.in")
  expect(emails.length).toBeGreaterThanOrEqual(1)
})

test("renders location", () => {
  render(<Footer />)
  const locations = screen.getAllByText(/Bangalore, India/i)
  expect(locations.length).toBeGreaterThanOrEqual(1)
})
