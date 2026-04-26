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

test("renders all three plan cards", () => {
  render(<ProductsPage />)
  expect(screen.getAllByText("PV Layout Basic").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("PV Layout Pro").length).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText("PV Layout Pro Plus").length
  ).toBeGreaterThanOrEqual(1)
})

test("renders prices", () => {
  render(<ProductsPage />)
  expect(screen.getAllByText("$1.99").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("$4.99").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("$14.99").length).toBeGreaterThanOrEqual(1)
})

test("renders single download button", () => {
  render(<ProductsPage />)
  const downloadButtons = screen.getAllByRole("button", {
    name: /Download/i,
  })
  expect(downloadButtons).toHaveLength(1)
})

test("renders Buy Now links for each plan", () => {
  render(<ProductsPage />)
  const buyLinks = screen.getAllByRole("link", { name: /Buy Now/i })
  expect(buyLinks.length).toBe(3)
})

test("renders free trial callout", () => {
  render(<ProductsPage />)
  expect(
    screen.getByText(/Free trial included/i)
  ).toBeInTheDocument()
})
