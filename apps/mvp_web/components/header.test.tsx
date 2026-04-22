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

vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="signed-in">{children}</div>
  ),
  SignedOut: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="signed-out">{children}</div>
  ),
}))

import { Header } from "./header"

test("renders SolarLayout logo text", () => {
  render(<Header />)
  expect(screen.getByText("SolarLayout")).toBeInTheDocument()
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

test("renders Sign In link for unauthenticated users", () => {
  render(<Header />)
  expect(screen.getByText("Sign In")).toBeInTheDocument()
})

test("renders Dashboard link for authenticated users", () => {
  render(<Header />)
  expect(screen.getByText("Dashboard")).toBeInTheDocument()
})
