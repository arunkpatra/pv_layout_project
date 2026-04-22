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

import ContactPage from "./page"

test("renders page heading", () => {
  render(<ContactPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /Contact Us/i,
    })
  ).toBeInTheDocument()
})

test("renders contact info", () => {
  render(<ContactPage />)
  expect(
    screen.getAllByText("support@solarlayout.in").length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByText("Bangalore, India").length
  ).toBeGreaterThanOrEqual(1)
})

test("renders contact form", () => {
  render(<ContactPage />)
  expect(
    screen.getAllByText("Send us a message").length
  ).toBeGreaterThanOrEqual(1)
  const buttons = screen.getAllByRole("button", {
    name: /Send Message/i,
  })
  expect(buttons.length).toBeGreaterThanOrEqual(1)
})
