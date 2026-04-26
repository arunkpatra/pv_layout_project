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

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}))

import HomePage from "./page"

test("renders hero heading", () => {
  render(<HomePage />)
  expect(
    screen.getByRole("heading", { level: 1 })
  ).toBeInTheDocument()
})

test("renders Explore Products CTA", () => {
  render(<HomePage />)
  const links = screen.getAllByRole("link", {
    name: /Explore Products/i,
  })
  expect(links.length).toBeGreaterThanOrEqual(1)
})

test("renders Features Overview section with all three plans", () => {
  render(<HomePage />)
  expect(
    screen.getAllByText(/PV Layout · Basic/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/PV Layout · Pro$/i).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText(/PV Layout · Pro Plus/i).length
  ).toBeGreaterThanOrEqual(1)
})

test("renders How It Works summary steps", () => {
  render(<HomePage />)
  const upload = screen.getAllByText("Import boundary")
  expect(upload.length).toBeGreaterThanOrEqual(1)
  const params = screen.getAllByText("Configure parameters")
  expect(params.length).toBeGreaterThanOrEqual(1)
  const generate = screen.getAllByText("Generate layout")
  expect(generate.length).toBeGreaterThanOrEqual(1)
  const exportRes = screen.getAllByText("Export deliverables")
  expect(exportRes.length).toBeGreaterThanOrEqual(1)
})

test("renders System Requirements section", () => {
  render(<HomePage />)
  const sysReq = screen.getAllByText(/System requirements/i)
  expect(sysReq.length).toBeGreaterThanOrEqual(1)
  const windows = screen.getAllByText(/Windows 10.*or higher/i)
  expect(windows.length).toBeGreaterThanOrEqual(1)
})
