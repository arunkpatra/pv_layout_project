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
  expect(downloadButtons).toHaveLength(1)
})
