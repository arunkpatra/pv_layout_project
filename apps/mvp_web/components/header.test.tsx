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

import { Header } from "./header"

test("renders SolarLayout logo text", () => {
  render(<Header />)
  expect(screen.getByText("SolarLayout")).toBeInTheDocument()
})

test("renders Download Free Trial CTA", () => {
  render(<Header />)
  const ctas = screen.getAllByText("Download Free Trial")
  expect(ctas.length).toBeGreaterThanOrEqual(1)
})

test("renders all desktop navigation links", () => {
  render(<Header />)
  expect(
    screen.getAllByRole("link", { name: "Products" }).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByRole("link", { name: "Pricing" }).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByRole("link", { name: "FAQ" }).length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByRole("link", { name: "Contact" }).length
  ).toBeGreaterThanOrEqual(1)
})
