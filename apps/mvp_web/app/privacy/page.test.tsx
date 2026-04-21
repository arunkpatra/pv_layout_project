import { test, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import PrivacyPage from "./page"

test("renders page heading", () => {
  render(<PrivacyPage />)
  const headings = screen.getAllByRole("heading", {
    level: 1,
    name: /Privacy Policy/i,
  })
  expect(headings.length).toBeGreaterThanOrEqual(1)
})

test("renders DPDP Act 2023 reference", () => {
  render(<PrivacyPage />)
  expect(
    screen.getAllByText(/DPDP Act.*2023/i).length
  ).toBeGreaterThanOrEqual(1)
})

test("renders Grievance Officer section", () => {
  render(<PrivacyPage />)
  const sectionHeadings = screen.getAllByRole("heading", {
    level: 2,
    name: /Grievance Officer/i,
  })
  expect(sectionHeadings.length).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/Data Protection Officer/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/privacy@solarlayout\.in/i).length
  ).toBeGreaterThanOrEqual(1)
})

test("renders preliminary notice", () => {
  render(<PrivacyPage />)
  expect(
    screen.getAllByText(/preliminary and subject to legal review/i)
      .length
  ).toBeGreaterThanOrEqual(1)
})

test("renders all key sections", () => {
  render(<PrivacyPage />)
  const expectedSections = [
    /Information We Collect/i,
    /Purpose of Collection/i,
    /How We Store Your Data/i,
    /Data Retention/i,
    /Third-Party Sharing/i,
    /Cookies/i,
    /Changes to This Policy/i,
  ]
  for (const pattern of expectedSections) {
    expect(
      screen.getAllByRole("heading", { level: 2, name: pattern })
        .length
    ).toBeGreaterThanOrEqual(1)
  }
})
