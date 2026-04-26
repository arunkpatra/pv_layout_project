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

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}))

import ProductsPage from "./page"

test("renders page heading", () => {
  render(<ProductsPage />)
  expect(
    screen.getByRole("heading", { level: 1, name: /PV Layout/i })
  ).toBeInTheDocument()
})

test("renders download button", () => {
  render(<ProductsPage />)
  const downloadButtons = screen.getAllByRole("button", {
    name: /Download/i,
  })
  expect(downloadButtons.length).toBeGreaterThanOrEqual(1)
})

test("renders sample output section", () => {
  render(<ProductsPage />)
  expect(
    screen.getByText(/What you get for a 47 MWp plant/i)
  ).toBeInTheDocument()
})

test("renders deliverables section with three file formats", () => {
  render(<ProductsPage />)
  expect(screen.getByText(".kmz")).toBeInTheDocument()
  expect(screen.getByText(".dxf")).toBeInTheDocument()
  expect(screen.getByText(".pdf")).toBeInTheDocument()
})

test("renders standards section", () => {
  render(<ProductsPage />)
  expect(
    screen.getByText(/Built for the Indian solar market/i)
  ).toBeInTheDocument()
})

test("renders bottom CTA", () => {
  render(<ProductsPage />)
  expect(
    screen.getByText(/Try it free/i)
  ).toBeInTheDocument()
})
