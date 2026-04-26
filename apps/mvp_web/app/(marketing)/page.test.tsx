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
  expect(screen.getAllByText("PV Layout Basic").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("PV Layout Pro").length).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText("PV Layout Pro Plus").length
  ).toBeGreaterThanOrEqual(1)
})

test("renders How It Works summary steps", () => {
  render(<HomePage />)
  const upload = screen.getAllByText("Upload KMZ")
  expect(upload.length).toBeGreaterThanOrEqual(1)
  const params = screen.getAllByText("Enter Parameters")
  expect(params.length).toBeGreaterThanOrEqual(1)
  const generate = screen.getAllByText("Generate Layout")
  expect(generate.length).toBeGreaterThanOrEqual(1)
  const exportRes = screen.getAllByText("Export Results")
  expect(exportRes.length).toBeGreaterThanOrEqual(1)
})

test("renders System Requirements section", () => {
  render(<HomePage />)
  const sysReq = screen.getAllByText("System Requirements")
  expect(sysReq.length).toBeGreaterThanOrEqual(1)
  const windows = screen.getAllByText("Windows 10 or higher")
  expect(windows.length).toBeGreaterThanOrEqual(1)
})
