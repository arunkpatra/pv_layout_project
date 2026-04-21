import { test, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import TermsPage from "./page"

test("renders page heading", () => {
  render(<TermsPage />)
  const headings = screen.getAllByRole("heading", {
    level: 1,
    name: /Terms & Conditions/i,
  })
  expect(headings.length).toBeGreaterThanOrEqual(1)
})

test("renders Acceptance of Terms section", () => {
  render(<TermsPage />)
  const sectionHeadings = screen.getAllByRole("heading", {
    level: 2,
    name: /Acceptance of Terms/i,
  })
  expect(sectionHeadings.length).toBeGreaterThanOrEqual(1)
})

test("renders Intellectual Property section", () => {
  render(<TermsPage />)
  const sectionHeadings = screen.getAllByRole("heading", {
    level: 2,
    name: /Intellectual Property/i,
  })
  expect(sectionHeadings.length).toBeGreaterThanOrEqual(1)
})

test("renders Governing Law section with Indian jurisdiction", () => {
  render(<TermsPage />)
  const sectionHeadings = screen.getAllByRole("heading", {
    level: 2,
    name: /Governing Law/i,
  })
  expect(sectionHeadings.length).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/Bangalore, Karnataka, India/i).length
  ).toBeGreaterThanOrEqual(1)
})

test("renders preliminary notice", () => {
  render(<TermsPage />)
  expect(
    screen.getAllByText(/preliminary and subject to legal review/i)
      .length
  ).toBeGreaterThanOrEqual(1)
})

test("renders all key sections", () => {
  render(<TermsPage />)
  const expectedSections = [
    /Acceptance of Terms/i,
    /Description of Service/i,
    /User Registration/i,
    /Limitation of Liability/i,
    /Refund Policy/i,
    /Prohibited Uses/i,
  ]
  for (const pattern of expectedSections) {
    expect(
      screen.getAllByRole("heading", { level: 2, name: pattern })
        .length
    ).toBeGreaterThanOrEqual(1)
  }
})
