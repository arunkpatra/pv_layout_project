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
    screen.getByRole("heading", { level: 1, name: /Our Products/i })
  ).toBeInTheDocument()
})

test("renders all three product cards", () => {
  render(<ProductsPage />)
  const basic = screen.getAllByText("PV Layout Basic")
  expect(basic.length).toBeGreaterThanOrEqual(1)
  const pro = screen.getAllByText("PV Layout Pro")
  expect(pro.length).toBeGreaterThanOrEqual(1)
  const proPlus = screen.getAllByText("PV Layout Pro Plus")
  expect(proPlus.length).toBeGreaterThanOrEqual(1)
})

test("renders prices", () => {
  render(<ProductsPage />)
  const price1 = screen.getAllByText("$1.99")
  expect(price1.length).toBeGreaterThanOrEqual(1)
  const price2 = screen.getAllByText("$4.99")
  expect(price2.length).toBeGreaterThanOrEqual(1)
  const price3 = screen.getAllByText("$14.99")
  expect(price3.length).toBeGreaterThanOrEqual(1)
})

test("renders download buttons", () => {
  render(<ProductsPage />)
  const downloadButtons = screen.getAllByRole("button", {
    name: /Download/i,
  })
  expect(downloadButtons.length).toBeGreaterThanOrEqual(3)
})
