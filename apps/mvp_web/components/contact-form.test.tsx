import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

import { ContactForm } from "./contact-form"
import { toast } from "sonner"

test("renders all form fields", () => {
  render(<ContactForm />)
  expect(
    screen.getAllByPlaceholderText("Enter your full name").length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByPlaceholderText("you@company.com").length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByPlaceholderText("What is this regarding?").length
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByPlaceholderText("Tell us more...").length
  ).toBeGreaterThanOrEqual(1)
})

test("renders Send Message button", () => {
  render(<ContactForm />)
  const buttons = screen.getAllByRole("button", {
    name: /Send Message/i,
  })
  expect(buttons.length).toBeGreaterThanOrEqual(1)
})

test("shows toast on valid submit", async () => {
  const user = userEvent.setup()
  render(<ContactForm />)

  await user.type(
    screen.getAllByPlaceholderText("Enter your full name")[0]!,
    "Test User"
  )
  await user.type(
    screen.getAllByPlaceholderText("you@company.com")[0]!,
    "test@example.com"
  )
  await user.type(
    screen.getAllByPlaceholderText("What is this regarding?")[0]!,
    "Support"
  )
  await user.type(
    screen.getAllByPlaceholderText("Tell us more...")[0]!,
    "I need help with the software."
  )

  const buttons = screen.getAllByRole("button", {
    name: /Send Message/i,
  })
  await user.click(buttons[0]!)

  expect(toast.info).toHaveBeenCalledWith(
    expect.stringContaining("Message sending coming soon")
  )
})
