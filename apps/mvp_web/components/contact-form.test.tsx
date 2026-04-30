import { test, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { ContactForm } from "./contact-form"
import { toast } from "sonner"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

test("renders all form fields", () => {
  render(<ContactForm />)
  expect(
    screen.getAllByPlaceholderText("Enter your full name").length,
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByPlaceholderText("you@company.com").length,
  ).toBeGreaterThanOrEqual(1)
  // Subject is now a <select> dropdown
  expect(
    screen.getAllByText("Subject").length,
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByPlaceholderText("Tell us more...").length,
  ).toBeGreaterThanOrEqual(1)
})

test("renders subject dropdown options", () => {
  render(<ContactForm />)
  const select = screen.getByRole("combobox")
  expect(select).toBeInTheDocument()
  expect(
    screen.getByText("Sales enquiry"),
  ).toBeInTheDocument()
  expect(
    screen.getByText("Technical question"),
  ).toBeInTheDocument()
})

test("renders Send message button", () => {
  render(<ContactForm />)
  const buttons = screen.getAllByRole("button", {
    name: /Send message/i,
  })
  expect(buttons.length).toBeGreaterThanOrEqual(1)
})

test("shows success toast on valid submit", async () => {
  const user = userEvent.setup()

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          message:
            "Thank you for reaching out. We will get back to you within 2 business days.",
        },
      }),
  })

  render(<ContactForm />)

  await user.type(
    screen.getAllByPlaceholderText("Enter your full name")[0]!,
    "Test User",
  )
  await user.type(
    screen.getAllByPlaceholderText("you@company.com")[0]!,
    "test@example.com",
  )
  await user.selectOptions(
    screen.getByRole("combobox"),
    "Sales enquiry",
  )
  await user.type(
    screen.getAllByPlaceholderText("Tell us more...")[0]!,
    "I need help with the software.",
  )

  const buttons = screen.getAllByRole("button", {
    name: /Send message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(toast.success).toHaveBeenCalledWith(
      "Thank you for reaching out. We will get back to you within 2 business days.",
    )
  })
})

test("shows error toast on API failure", async () => {
  const user = userEvent.setup()

  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: () =>
      Promise.resolve({
        success: false,
        error: { message: "Validation failed" },
      }),
  })

  render(<ContactForm />)

  await user.type(
    screen.getAllByPlaceholderText("Enter your full name")[0]!,
    "Test User",
  )
  await user.type(
    screen.getAllByPlaceholderText("you@company.com")[0]!,
    "test@example.com",
  )
  await user.selectOptions(
    screen.getByRole("combobox"),
    "Sales enquiry",
  )
  await user.type(
    screen.getAllByPlaceholderText("Tell us more...")[0]!,
    "I need help.",
  )

  const buttons = screen.getAllByRole("button", {
    name: /Send message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith("Validation failed")
  })
})

test("shows error toast on network failure", async () => {
  const user = userEvent.setup()

  mockFetch.mockRejectedValueOnce(new Error("Network error"))

  render(<ContactForm />)

  await user.type(
    screen.getAllByPlaceholderText("Enter your full name")[0]!,
    "Test User",
  )
  await user.type(
    screen.getAllByPlaceholderText("you@company.com")[0]!,
    "test@example.com",
  )
  await user.selectOptions(
    screen.getByRole("combobox"),
    "Sales enquiry",
  )
  await user.type(
    screen.getAllByPlaceholderText("Tell us more...")[0]!,
    "I need help.",
  )

  const buttons = screen.getAllByRole("button", {
    name: /Send message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to send message. Please try again.",
    )
  })
})

test("clears form fields after successful submit", async () => {
  const user = userEvent.setup()

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { message: "Thank you." },
      }),
  })

  render(<ContactForm />)

  const nameInput = screen.getAllByPlaceholderText(
    "Enter your full name",
  )[0]! as HTMLInputElement
  const emailInput = screen.getAllByPlaceholderText(
    "you@company.com",
  )[0]! as HTMLInputElement
  const subjectSelect = screen.getByRole(
    "combobox",
  ) as HTMLSelectElement
  const messageInput = screen.getAllByPlaceholderText(
    "Tell us more...",
  )[0]! as HTMLTextAreaElement

  await user.type(nameInput, "Test User")
  await user.type(emailInput, "test@example.com")
  await user.selectOptions(subjectSelect, "Sales enquiry")
  await user.type(messageInput, "I need help.")

  const buttons = screen.getAllByRole("button", {
    name: /Send message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(nameInput.value).toBe("")
    expect(emailInput.value).toBe("")
    expect(subjectSelect.value).toBe("")
    expect(messageInput.value).toBe("")
  })
})

test("sends correct payload to API", async () => {
  const user = userEvent.setup()

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { message: "Thank you." },
      }),
  })

  render(<ContactForm />)

  await user.type(
    screen.getAllByPlaceholderText("Enter your full name")[0]!,
    "Test User",
  )
  await user.type(
    screen.getAllByPlaceholderText("you@company.com")[0]!,
    "test@example.com",
  )
  await user.selectOptions(
    screen.getByRole("combobox"),
    "Sales enquiry",
  )
  await user.type(
    screen.getAllByPlaceholderText("Tell us more...")[0]!,
    "I need help with the software.",
  )

  const buttons = screen.getAllByRole("button", {
    name: /Send message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/contact"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: "test@example.com",
          subject: "Sales enquiry",
          message: "I need help with the software.",
        }),
      }),
    )
  })
})
